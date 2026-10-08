# A02 商家订单读取与履约编排

日期：2026-10-06。状态：**可离线部分通过，整体 / 实际运营未验收**。当前仍无开发云环境，不新增正式 admin handler 或客户端入口，不改用户确认的 UI。

## 本轮实现

新增 [merchant-order-service.js](../cloudfunctions/_shared/merchant-order-service.js)，复用既定 admin.orders.list / order.get / order.transition 目标契约，API action 与客户端 allowlist 不变。A01 的完整角色 / 门店记录校验提取到 [admin-access-state.js](../cloudfunctions/_shared/admin-access-state.js)，A01 与 A02 共用；保留 D06 身份、所有权和同一授权能力规则。

| 操作 | 可离线行为 | 实际待接入 |
|---|---|---|
| 商家订单列表 | 当前同店 ORDER_OPERATE，跨顾客查询；状态筛选、createdAt / _id 降序与 HMAC 游标；取消 / 退款轴独立摘要 | SDK 有界查询 / 索引、handler、管理页面 / 列表 UI |
| 商家订单详情 | 先读订单头并确定门店，再鉴权后读取关联资料；历史名称 / 规格 / 整数金额 / 时段 / 地址 / 日志投影 | 真实路由守卫、履约联系界面与公开错误映射 |
| ACCEPT | PAID→ACCEPTED，订单 / 日志 / 回执同事务；不更改资源 | 真实并发接单与界面 |
| START_MAKING | ACCEPTED→MAKING，所有确认库存 CONFIRMED→CONSUMED，与订单 / 日志 / 回执原子；SLOT 保持确认 | 真实库存计量、SDK 提交与操作交互 |
| MARK_READY | MAKING→READY，核对已消耗库存及其制作日志，不再消费 | 页面 / 通知或履约流程 |
| START_DELIVERY / COMPLETE_DELIVERY | 在同一 O08 事务内增加严格 A01 scope 校验 / 读集栅栏，复用原配送服务 | E11 / SLOT 正式策略、真实门店配送操作 |
| COMPLETE_PICKUP | 在同一 O07 事务内增加严格 A01 scope 校验 / 读集栅栏，保留原凭证及 HMAC 请求指纹 | E10 / SLOT 正式策略、A03 输入 / 扫码 / 确认交互 |
| REJECT_ORDER | 仅 PAID；同一授权 ORDER_OPERATE + REFUND_APPROVE；取消 / 释放资源 / 原已付剩余退款意图 / 日志 / 回执原子 | 真实审批 / SDK、P06 平台发送与退款结果、门店拒单 UI |

自身订单所有权不替代商家授权。每个请求重读当前 users / admin_roles / 门店头，校验环境、AppID、版本和归档状态。列表不按客户端 ownerId 查询，详情的 storeId 来自可信订单头；未知与无权详情统一 NOT_FOUND，权限失败不读取关联私有记录。直接页面 / 云调用真实拒绝仍须 handler / SDK 验收。

## 读取、权限和隐私

扩展 [order-read-model.js](../cloudfunctions/_shared/order-read-model.js) 内部共享投影，新增 createMerchantOrderReadModel；原顾客工厂和本人查询语义保持。商家工厂本身校验模块内 principal 与严格角色 scope / 时间；不制造顾客 principal 或借订单所有者身份读跨用户资料。服务在当前只读事务中再次核验完整 access 和读快照。

列表必须先 AND 可信 storeId、状态和整个 seek 分支，再排序 / 取 pageSize+1；不能先全表分页再筛选门店。limit 超出、错店 / 错状态 / anchor 范围、无关子记录或不一致详情快照拒绝。游标绑定 environment、AppID / 操作者、admin.orders.list、门店 / 状态及当前 roleId / roleVersion / userVersion；同时间以 _id 稳定排序，跨人 / 门店 / 状态 / 重授权不能复用，期限沿用分页模型。

列表只含必要商品 / 数量 / 预约 / 订单与取消退款摘要，没有联系人、地址、ownerId、平台 ID、付款交易号、资源、原始理由或内部日志。已通过门店权限的详情沿用历史履约所需 contact / DELIVERY 地址与电话；PICKUP 地址始终 null。图片仍走既有历史媒体投影，缺图 null，不从当前目录补写历史商品。

availableActions 仅表示领域 / 能力候选，全部 enabled=false。待审核取消申请的拒单候选 blockedReason=CANCELLATION_REVIEW_REQUIRED，自提 CONFIGURATION_REQUIRED，其余 SERVICE_NOT_CONNECTED；显示候选不授权后续修改。详情读取不开放购买 / 运营。退款进度与订单状态独立，CANCELLED + PENDING 不伪装已经退钱；专用退款队列 / 审批属于 A06，当前 admin 列表只有既定订单 status 筛选。

## 状态、资源和资金事务

每条修改先验证历史订单 / 明细金额及日志链、已消费 quote、完整支付与退款账本、完整资源 / 预留证据。只能沿既有冻结状态机逐段迁移，不接受 nextStatus / actor / role / 金额 / 其他领域命令。未知政策、缺字段、资金未核实或资源不一致报固定内部错误，不能任意改状态。

已付款需恰好一个同环境已付 APPLIED 原支付，其余全部可信 CLOSED；不把订单头的 PAID 当作唯一资金证据。原资金 / 退款历史保持，已有退款按 P06 账本与原配置复核；新退款也复用 validateLedger 检查审批 / 已退累计 / 未决预算。校验是可信存储资料上的离线业务核验，**不是实际来源认证或新实收**。

制作根据 consumed quote 的聚合 requiredUnits，逐个库存从 confirmedUnits 移到 consumedUnits，预留记录保存同笔 START_MAKING 日志引用 / 时间；slot 不消费或释放。全部库存及订单一起成功或回滚，重复请求不再次消耗。备妥前核验已消耗记录与真实对应制作日志。

拒单只允许尚未接单的 PAID。所有 CONFIRMED 库存 / 预约回释放，历史快照 / 实收保持；有剩余 `paidCents - refundedCents` 时创建确定性退款意图，写 PENDING / RESERVED、原 paymentId、真实受权 ActorRef、审批日志引用和服务器脱敏理由，订单仅增加 refundReservedCents，不增加 refundedCents。已全额退款则只取消 / 释放，结果 CANCELLED_REFUND_ALREADY_SETTLED、refundIntentId=null，不生成新退款。

已有未决 / 失败退款仍占预算，不能再拒单创建一笔。已有 PENDING 顾客取消申请时，新拒单报 CANCELLATION_REVIEW_REQUIRED 且不写入，避免取消请求悬空或假审批；明确取消审批执行器尚待 A06。此限制是未接通审批时的技术边界，不新增退款金额政策。

新退款号由可信 newRefundNumber 生成并符合已有 6–32 位格式；readRefundByNumber 与 insertRefund 必须保证 provider / merchantId / outRefundNo 的唯一性，不能只在客户端或插入前普通查询判空。跨环境共享保护 / 索引仍待真实 SDK；本轮无新增全局唯一数据库或实际平台调用。

own command 回执绑定 environment / [appId,操作者] / admin.order.transition / key，指纹包含完整 payload（包括 command）。重放仍重查当前权限、历史日志、角色 / 用户、原结果与版本 / 时间及退款审批关联；服务重建或后续阶段不重复写入。O07 请求继续用原 HMAC 指纹，不改成 SHA-256，不保存自提明文。O08 保留原指纹与资源 / 完成策略；options 中的原凭证 / 完成配置必须显式提供，缺失不假成功。

ACCEPT / READY 各 3 写；单库存 MAKE 5 写；单库存 + 一个 SLOT 的有退款拒单 8 写。多库存按实际资源数增长。三类记录及所有资源、预留、退款同一事务，任一写异常 / 非 1 行结果拒绝提交；历史订单事实不受当前目录 / 门店配置变化改写。

## 适配器契约和关闭门禁

readAccessState 必须完整、可信地加载当前环境 / 应用的严格角色和门店头，不省略或信任客户端 complete。runReadTransaction / runTransaction 需保护当前用户、角色 / 门店、订单头和所有关联版本、完整子查询 / 不存在记录、资金 / 资源及幂等 / 退款号唯一性，提交冲突重读重验。不能仅 CAS 订单而继续使用旧商家权限。

O07 / O08 新增可选**服务器注入** authorizeMerchant 钩子；A02 自行从已有工厂构造这些服务，在原事务中先加载严格 access、调用 A01 assertAccessReads 后才读关联资源。之后原业务栅栏也必须保护该读集到提交；不能在事务外预检查代替。原服务未注入钩子的历史离线调用保持兼容，A02 路由必须使用已注入版本。

own commands 返回 OFFLINE_MERCHANT_ORDER_RESULT，cloudVerified / callable / operationsAllowed / externalRefundExecuted 全 false。商家读取为 OFFLINE_MERCHANT_ORDER_PAGE / DETAIL，同样不可调用 / 不开放。路由 O07 / O08 保留原 OFFLINE_PICKUP_RESULT / DELIVERY_RESULT 及 fulfillmentAllowed=false。没有 SDK / handler、客户端 admin allowlist、运营 UI 或实际外部退款 / 骑手调用。

## 验证与问题修复

新增 **34 项** A02 专项，受影响组合最终 **142/142**，全套 **800/800**、静态 **292**。主包 / features / legacy 源估算仍 **1239 / 127 / 45 KiB**，本轮不增加客户端包体或分包。最终证据：[全量 TAP](qa/a02-2026-10-06/full-final-v2.tap)、[静态日志](qa/a02-2026-10-06/static-final-v2.txt)、[摘要与指纹](qa/a02-2026-10-06/summary.md)。较早 full-final / static-final 保留终稿资金结果文案区分前的轮次，终稿以 v2 为准。

| 发现 | 修正 / 证据 |
|---|---|
| 只路由 O08 会丢失 A01 新增的严格环境 / 门店校验 | 在原业务事务注入鉴权与完整 access 栅栏，同时用于 O07；[修复前 2 项失败](qa/a02-2026-10-06/boundaries-before.tap) |
| 未授权修改先读关联资金 / 私有资料 | 读取订单头后先鉴权，再读子资料；同上失败证据 |
| 拒单可能留下 PENDING 顾客取消申请 | 明确要求取消审批，整笔不写入；[修复前 1 项失败](qa/a02-2026-10-06/pending-review-before.tap) |
| 已全额退款时结果仍使用“退款预留”名称 | 区分 ALREADY_SETTLED，不创建或宣称新退款；全退 / 部退组合回归通过 |

测试包括双履约完整制作 / 完成链、O07 原 key / HMAC 重放、O08 继续配送、A01 授权与撤销、当前权限 / 跨店 / 当前用户 / 资料隐私、稳定游标 / 重授权、全部写位置异常 / 零行回滚、串行管理员竞争、历史数据 / 资源 / 资金 / 原配置 / 退款号异常、请求重建 / 后续阶段重放、拒单→P06 可信结果→O06 顾客历史、全额 / 部分已退余额及待审取消阻止。都是合成订单 / 身份和串行内存，不是实际并发或实际资金证据。

## 真实验收计划

| ID | 场景 | 状态 |
|---|---|---|
| MR01 | E01 / E12 当前真实商家与普通账号的入口、列表、详情、直调函数 / 直写拒绝 | NOT_RUN |
| MR02 | 同店多顾客 / 他店、稳定分页与电话 / 地址最小读取、撤销即时生效 | NOT_RUN |
| MR03 | 两位管理员同版本接单 / 制作，SDK 只有一次提交，资源计量完整 | NOT_RUN |
| MR04 | 每个真实写位置故障、事务期间撤销 / 禁用 / 店与资源改变，全部回滚 | NOT_RUN |
| MR05 | 已付拒单与操作竞争、剩余款退款意图及唯一号，实际 P06 退款闭环 | NOT_RUN |
| MR06 | 弱网 / 丢响应 / 页面重进原 key 恢复，商品历史与当前目录分离 | NOT_RUN |
| MR07 | E10 / E11 / SLOT 正式策略及真机自提 / 门店配送操作，不接骑手系统 | NOT_RUN |
| MR08 | 待审取消显式审批接线及退款异常运营、审计与公开错误处理 | NOT_RUN |

E01 / E12、E06、E10 / E11 / SLOT、D06 / P08 实际门禁、网络 / UI / SDK 与真实资金仍待补。A02 整体未通过，不声明已具备真实运营能力。本轮没有微信 / 真机 / 云 / 资金 / 对外消息操作，没有提交 / 推送 / 上传 / 部署；全部现有未提交成果保留。

下一项 **A03 自提码输入 / 扫码 / 核销确认的可离线交互契约**。实际凭证策略 / 真机 / 云继续待 E10 等条件，UI 调整按用户已有字体约定处理。
