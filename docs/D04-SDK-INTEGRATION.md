# 正式订单SDK接入约束

本文件维护正式订单事务提供方的技术义务，实施取舍见[ARCHITECTURE](ARCHITECTURE.md)；当前任务、部署和验收结论只查[CURRENT-STATUS](CURRENT-STATUS.md)。接口/字段变化须同步数据字典、契约、独立包及测试，文档方案不等于实现或云端通过。

## 业务安全边界

- [order-document-session.js](../cloudfunctions/_shared/order-document-session.js)将订单服务映射到users、idempotency_records、checkout_quotes、stores、store_config、carts、products、skus、addresses、inventory_resources、slot_inventory、orders、order_items、reservations、order_logs。
- 先验证报价所有权，再沿可信引用加载当前门店/配置、本人购物袋、商品/SKU、库存、时段和配送地址；读取去重，不扫描整个目录或跟随他人报价读取私有数据。
- 订单头/明细、资源预留、reservations、日志、报价消费和幂等回执须同事务；同key同请求返回同订单，同key不同请求拒绝，同报价不同key最多消费一次。
- 提交须防止用户禁用、商品/SKU下架或改价、门店/配置变更、地址/袋变化和报价已消费等关键依赖变化；幂等回放也校验当前身份与所有权。
- 通用文档session要求 `protectReads`、`findOrderByNumber` 及正整数 `maxReadDocuments`。`order-sdk-session.js` 的 `createSdkOrderService({cloud,settings,limits,buildContext,now,clock,newRequestId})` 为其组合具体SDK提供方；execute(event,nativeContext)在每次SDK回调中重新读取用户并解析当前principal，不接受客户端身份或预算。
- 创建前的 assertCreationReads 条件额外包含 orderId、receiptId、businessWriteBudget（既有measureOrderWrites摘要）。提供方在首个保护写入前合并完整读集、保护写及业务写预算；重放为零业务写预算，但仍计内部保护。buildContext只在已验证报价归属后执行，可通过tx.readContextDocument加载media_assets/location_verifications；这些额外读同样被缓存、计数并保护，禁止在事务回调中调用地图或其他外部网络。

## 确定性订单文档与不存在状态

- [order-creation-model.js](../cloudfunctions/_shared/order-creation-model.js)生成确定性完整64位十六进制订单ID及 `V1-` 加ID大写的编号。SDK提供方通过orderDocumentIdFromNumber严格校验 `V1-[0-9A-F]{64}`，反解为同一orders主键，只读同事务doc并核对 `_id` / orderNo / 归属；原键重放也检查规范编号与预期主键一致，不使用where查询。
- 查找在同一事务使用确定性doc，不依赖任意where空结果保护；orders主键显式新增与orderNo唯一索引保留。该映射须约束所有创建、导入和修复入口，单文档不存在只能证明该编号对应主键不存在。
- 不存在的订单/回执须用具备create-if-absent冲突语义的显式新增；主键或唯一冲突使整笔事务回滚。用户/商品/配置等必需依赖缺失直接拒绝，不自动补齐。
- 将来若支持短号或非规范导入编号，须另建同事务唯一映射并明确迁移；不能回退事务外查询或把未知/报错视为空结果。现有session的queryPredicates须由提供方按此受控映射兑现，不直接丢弃断言。

## 已存在关键依赖的真实写保护

- `protectReads(documentSnapshots, conditions, queryPredicates)`通过同一SDK事务的protectExisting改变每个已存在依赖的内部计数；不以重读比较替代保护。读集去重并按固定键顺序保护，包含context加载的证明/素材。不存在状态仅允许本次确定性orderId/receiptId，且在回调返回前必须由显式新增兑现；orderNo谓词只允许对应这一主键的规范映射，不允许任意空查询。
- 内部 `_transactionFence` 的唯一字段定义见[公共技术字段](reference/data/transaction-fence.md)。它不替代业务version/updatedAt，不接受业务patch赋值；旧文档缺字段在同一事务中由0初始化为1，非法值与溢出拒绝。不存在 `createSdkOrderDocumentSession` 接口，具体组合入口是createSdkOrderService。
- 已有业务写入可承担保护，前提是该写入必然发生且冲突语义经真实验证；仅有库存/时段更新不能保护其余只读依赖。其他关键文档须显式保护，所有会改变依赖或唯一映射的写入口须遵守相同约束。
- 每次SDK重试回调重建session/缓存，重新读取、授权、计价和检查资源；稳定顺序、去重且避免不必要的门店全局锁。用户禁用、商品上下架/价格、配置、地址和袋变化均须与提交交错验证，另评估争用与吞吐成本。
- 幂等回放允许必要的内部保护写入，但不得重复业务消费、资源占用、订单/回执/日志；不能以“回放零业务写入”省掉内部保护预算。
- [原生读取实测](archive/stages/phase-2.md#d04-read-protection-20261009)和[写保护/反例实验](archive/stages/phase-2.md#d04-write-protection-20261009)是所测版本与交错的能力证据。原生只读/空查询失败不阻止验证确定性doc与写保护路线；仍使用谓词的入口必须证明其保护，查询可执行或拒绝均不算保护通过。
- 冲突后的自动终止仅按可识别的冲突类别处理；未知错误仍须清理并拒绝，不能将通用事务终止提示判为成功。一方失败不能跳过另一方清理；须通过新事务真实写入、决策文档锁释放及持久化读回证明生命周期结束。

## 写入与预算

- 资源用版本更新；订单头/明细/预留/日志/回执显式新增；消费报价保留ACTIVE、本人同店、未消费/未过期和版本约束。
- [order-write-budget.js](../cloudfunctions/_shared/order-write-budget.js)统计业务写入摘要；SDK提供方另统计实际doc读取、保护写、业务更新/新增、UTF-8读写载荷、时间与重试。子文档使用insertNew显式add，不为每个新明细/预留/日志增加一次get；主键冲突仍由SDK的create-if-absent拒绝并回滚。
- 保守准入检查必须早于首个实际写入（含保护写入），执行中累计计数；预算不足拒绝且回滚，不留下业务半成品。服务端确定 `maxReadDocuments`、maxWrites/maxPayloadBytes/maxTotalPayloadBytes及重试边界，不接受客户端配置。
- SDK构造要求完整正整数limits：maxOperations/maxReadDocuments/maxWrites/maxPayloadBytes/maxTotalPayloadBytes/maxAttempts/maxDurationMs，不允许null或缺省无限额；maxOperations不得超过100、maxAttempts最多3、maxDurationMs最多25000。每回调重新建缓存及预算，累计调用和载荷受单次限额×maxAttempts约束，总时间从首次执行开始计。
- [CloudBase官方事务说明](https://docs.cloudbase.net/database/transaction)给出单事务100个操作/30秒限制；提供方按不超过100次文档操作准入，并允许部署配置更低的时间/载荷预算。JSON UTF-8字节不等于BSON/协议/索引体积；调用方仍须留裕量并按实际SDK/运行时做载荷验收。该官方页面与部署SDK能力证据分别记录，不凭文档推断完整云验收。
- 使用最小及允许的最大购物袋验证完整订单总操作/载荷、保护竞争和重试预算；技术探针的小批写入不能替代完整订单预算验收。

## 正式入口与验收要求

- 入口必须通过native-context将原生平台上下文交给SDK服务，绑定正确EnvId、可信商品图片/配送位置、正式经营配置、部署限额和脱敏错误投影。SDK服务保留内部应用结果，不自行新增网络handler、客户端allowlist或购买能力；公开入口只投影正式网络DTO。
- 独立包锁定依赖，隔离资源的规则/索引、原生身份及实验窗口明确；客户端拒绝私有/交易直写。
- 验证自提/配送完整订单多文档读回、真实写保护与确定性唯一性、同key/同报价竞争、最后库存/名额竞争；每个业务及保护写入故障均整笔回滚，重试重新授权且不越预算。
- 提交成功丢响应后原key恢复且无新增副作用；两个用户的所有权、原生网络与真机分别取证。实际order.create/list/detail接入后，按合法请求成功/未授权拒绝更新对应allowlist、能力策略与离线边界，不能直接删去旧门禁断言。
- 整体通过前保留禁止购买/付款的业务门禁；技术探针与本地执行器不替代正式订单验收。
- 具体历史决策/故障与原始证据按[阶段二历史索引](archive/stages/phase-2.md)定位；日志、JSON、截图保留在qa。
