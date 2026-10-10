# 正式订单SDK接入约束

本文件维护正式订单事务提供方的技术义务，实施取舍见[ARCHITECTURE](ARCHITECTURE.md)；当前任务、部署和验收结论只查[CURRENT-STATUS](CURRENT-STATUS.md)。接口/字段变化须同步数据字典、契约、独立包及测试，文档方案不等于实现或云端通过。

## 业务安全边界

- [order-document-session.js](../cloudfunctions/_shared/order-document-session.js)将订单服务映射到users、idempotency_records、checkout_quotes、stores、store_config、carts、products、skus、addresses、inventory_resources、slot_inventory、orders、order_items、reservations、order_logs。
- 先验证报价所有权，再沿可信引用加载当前门店/配置、本人购物袋、商品/SKU、库存、时段和配送地址；读取去重，不扫描整个目录或跟随他人报价读取私有数据。
- 订单头/明细、资源预留、reservations、日志、报价消费和幂等回执须同事务；同key同请求返回同订单，同key不同请求拒绝，同报价不同key最多消费一次。
- 提交须防止用户禁用、商品/SKU下架或改价、门店/配置变更、地址/袋变化和报价已消费等关键依赖变化；幂等回放也校验当前身份与所有权。
- 构造要求 `protectReads`、`findOrderByNumber` 及正整数 `maxReadDocuments`；提供方必须兑现保护义务，不能用默认true、事务外查询或重读比较替代。

## 确定性订单文档与不存在状态

- [order-creation-model.js](../cloudfunctions/_shared/order-creation-model.js)已有确定性完整64位十六进制订单ID及 `V1-` 加ID大写的编号生成。正式 `findOrderByNumber` 提供方须严格校验 `V1-[0-9A-F]{64}`，反解到同一orders文档，并核对 `_id` / orderNo 一致性；当前session的宽格式校验不等于已实现该反查。
- 查找在同一事务使用确定性doc，不依赖任意where空结果保护；orders主键显式新增与orderNo唯一索引保留。该映射须约束所有创建、导入和修复入口，单文档不存在只能证明该编号对应主键不存在。
- 不存在的订单/回执须用具备create-if-absent冲突语义的显式新增；主键或唯一冲突使整笔事务回滚。用户/商品/配置等必需依赖缺失直接拒绝，不自动补齐。
- 将来若支持短号或非规范导入编号，须另建同事务唯一映射并明确迁移；不能回退事务外查询或把未知/报错视为空结果。现有session的queryPredicates须由提供方按此受控映射兑现，不直接丢弃断言。

## 已存在关键依赖的真实写保护

- `protectReads(documentSnapshots, conditions, queryPredicates)`在同一SDK事务保护关键已读内容/版本及上述确定性不存在状态直到提交；仅重新读取并比较版本不足。正式SDK提供方尚待接入，附件提出的 `protectExisting` / `createSdkOrderDocumentSession` 不视为已有接口。
- 可选内部 `_transactionFence` 用真实变化的计数写入建立冲突保护；这是候选字段，须先定义字段字典、初始化/旧数据迁移、类型/溢出、输入白名单、DTO排除及全部操作预算。它不能替代业务version/updatedAt，也不能接受客户赋值。更新相同值不能假定已取得有效保护。
- 已有业务写入可承担保护，前提是该写入必然发生且冲突语义经真实验证；仅有库存/时段更新不能保护其余只读依赖。其他关键文档须显式保护，所有会改变依赖或唯一映射的写入口须遵守相同约束。
- 每次SDK重试回调重建session/缓存，重新读取、授权、计价和检查资源；稳定顺序、去重且避免不必要的门店全局锁。用户禁用、商品上下架/价格、配置、地址和袋变化均须与提交交错验证，另评估争用与吞吐成本。
- 幂等回放允许必要的内部保护写入，但不得重复业务消费、资源占用、订单/回执/日志；不能以“回放零业务写入”省掉内部保护预算。
- [原生读取实测](archive/stages/phase-2.md#d04-read-protection-20261009)和[写保护/反例实验](archive/stages/phase-2.md#d04-write-protection-20261009)是所测版本与交错的能力证据。原生只读/空查询失败不阻止验证确定性doc与写保护路线；仍使用谓词的入口必须证明其保护，查询可执行或拒绝均不算保护通过。
- 冲突后的自动终止仅按可识别的冲突类别处理；未知错误仍须清理并拒绝，不能将通用事务终止提示判为成功。一方失败不能跳过另一方清理；须通过新事务真实写入、决策文档锁释放及持久化读回证明生命周期结束。

## 写入与预算

- 资源用版本更新；订单头/明细/预留/日志/回执显式新增；消费报价保留ACTIVE、本人同店、未消费/未过期和版本约束。
- [order-write-budget.js](../cloudfunctions/_shared/order-write-budget.js)现统计业务写入，服务在首个业务写入前检查；正式提供方还须统计实际读取、缺失检查、保护写入、更新/新增、每次重试的操作/字节/耗时及累计重试上限，现有统计不是完整平台预算。
- 保守准入检查必须早于首个实际写入（含保护写入），执行中累计计数；预算不足拒绝且回滚，不留下业务半成品。服务端确定 `maxReadDocuments`、maxWrites/maxPayloadBytes/maxTotalPayloadBytes及重试边界，不接受客户端配置。
- null仅可用于统计，不能作为正式环境无限额默认值。JSON UTF-8字节不等于BSON/协议/索引/原文档体积；平台实际限制须按部署SDK/运行时核实，保留裕量。
- 使用最小及允许的最大购物袋验证完整订单总操作/载荷、保护竞争和重试预算；技术探针的小批写入不能替代完整订单预算验收。

## 正式入口与验收要求

- 入口绑定原生身份、正确EnvId、可信商品图片/配送位置、正式经营配置、部署限额和脱敏错误投影。
- 独立包锁定依赖，隔离资源的规则/索引、原生身份及实验窗口明确；客户端拒绝私有/交易直写。
- 验证自提/配送完整订单多文档读回、真实写保护与确定性唯一性、同key/同报价竞争、最后库存/名额竞争；每个业务及保护写入故障均整笔回滚，重试重新授权且不越预算。
- 提交成功丢响应后原key恢复且无新增副作用；两个用户的所有权、原生网络与真机分别取证。实际order.create/list/detail接入后，按合法请求成功/未授权拒绝更新对应allowlist、能力策略与离线边界，不能直接删去旧门禁断言。
- 整体通过前保留禁止购买/付款的业务门禁；技术探针与本地执行器不替代正式订单验收。
- 具体历史决策/故障与原始证据按[阶段二历史索引](archive/stages/phase-2.md)定位；日志、JSON、截图保留在qa。
