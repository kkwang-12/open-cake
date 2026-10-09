# 订单：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [O01-CONTROLLED-ORDER-COMMANDS.md](#o01-controlled-order-commands)
- [O02-ORDER-CREATION.md](#o02-order-creation)
- [O03-ATOMIC-ORDER-TRANSACTION.md](#o03-atomic-order-transaction)
- [O04-ORDER-RECOVERY.md](#o04-order-recovery)
- [O05-ORDER-CANCELLATION.md](#o05-order-cancellation)
- [O06-ORDER-READ.md](#o06-order-read)
- [O07-PICKUP-CREDENTIAL.md](#o07-pickup-credential)
- [O08-ORDER-DELIVERY.md](#o08-order-delivery)
- [PHASE-6-EXECUTION.md](#phase-6-execution)
- [PHASE-6-REVIEW.md](#phase-6-review)

---

<a id="o01-controlled-order-commands"></a>

## 原记录：O01-CONTROLLED-ORDER-COMMANDS.md

<a id="o01-controlled-order-commands--o01冻结状态机与受控订单命令"></a>
# O01：冻结状态机与受控订单命令

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。**离线命令规划与验收通过；正式 handler / 数据库执行 / 核销 / 支付协调仍未接通。** 保留现有 UI 和所有未提交成果。

<a id="o01-controlled-order-commands--范围与编号"></a>
## 范围与编号

原计划 O01 是冻结状态机与受控命令，O06 才是本人订单列表 / 详情。上一轮交接将 O01 写成订单列表，本轮已纠正，未改原计划任务编号。下一项 O02 是订单创建、唯一订单号与不可变快照，资源原子预留和幂等执行分别属于 O03 / O04。

<a id="o01-controlled-order-commands--实现"></a>
## 实现

`cloudfunctions/_shared/order-command-model.js` 的 `planControlledOrderCommand(domain,event,order,principal,roles,context)` 复用 D07 请求白名单、D06 真正签发的 principal 和当前门店授权、D01 冻结状态机。它是内部纯规划工具，没有网络入口或执行器；order.id / review.id 由可信加载器映射数据库 _id。不可把客户端角色、旧订单实体或工具输出作为可信输入。

| API | 内部受控命令 |
|---|---|
| order.cancelUnpaid | CANCEL_UNPAID |
| order.cancellation.request | REQUEST_CANCELLATION |
| order.delivery.confirm | COMPLETE_DELIVERY，仅本人配送中订单 |
| admin.order.transition | ACCEPT / START_MAKING / MARK_READY / START_DELIVERY / COMPLETE_PICKUP / COMPLETE_DELIVERY / REJECT_ORDER |
| admin.cancellation.review | APPROVE_CANCELLATION / REJECT_CANCELLATION，读取当前申请 |
| admin.refund.approve | APPROVE_REFUND |

顾客入口必须本人，商家入口必须当前同店授权；即使商家入口的调用人也是订单所有者，仍必须商家权限。批准取消 / 拒单要求同一授权同时具有 ORDER_OPERATE 和 REFUND_APPROVE，零元取消不绕过审批；售后退款可仅 REFUND_APPROVE。用户入口不接受 PAYMENT_CONFIRMED、SYSTEM 到期动作或 nextStatus、actor、付款金额等额外字段。

自取链：PAID → ACCEPTED → MAKING → READY → COMPLETED。配送链：PAID → ACCEPTED → MAKING → READY → DELIVERING → COMPLETED。未付款不可制作，自取不可进入配送，已完成 / 已取消不可回退或复活；旧 WAIT_DEPOSIT 等不混入 V1。

未付取消须付款 UNPAID / CLOSED；PENDING / EXCEPTION 不能提前释放。已付申请只创建待审申请，保留履约；取消审批读取与订单 / 本人 / 请求 ID 对应的 PENDING 申请，保留申请版本条件。商家拒单补足实付剩余全额退款；制作后的取消不列自动恢复库存；独立售后退款保留履约轴，未决 / 失败退款仍阻止新退款。

<a id="o01-controlled-order-commands--输出与执行边界"></a>
## 输出与执行边界

输出深冻结 OFFLINE_ORDER_COMMAND_PLAN，callable=false、requiresAtomicPersistence=true。仅包含待执行的状态 / 版本 / 时间补丁、订单 / 用户 / 授权 / 申请版本条件、幂等作用域与请求指纹、日志草稿及必须同事务完成的效果。

- 制作要求 CONSUME_STOCK_RESERVATIONS；取消要求 RESOLVE_CANCELLED_RESERVATIONS；具体库存 / 时段处理留 O03 / O05。
- 自取完成必须提供 credential，要求 VERIFY_PICKUP_CREDENTIAL 和 RECORD_FULFILLMENT；凭证有效性、一次核销及限速留 O07。凭证只传内部效果输入，不放日志或公开 DTO。
- 配送完成要求 RECORD_DELIVERY_CONFIRMATION / RECORD_FULFILLMENT；重复执行留事务与幂等层核实。
- 退款列出 CREATE_REFUND_INTENT / ENSURE_FULL_REFUND，不假造退款成功或改资金摘要；实际资金操作留 Payment。
- 各命令均要求 APPLY_ORDER_PATCH、APPEND_ORDER_LOG、SAVE_IDEMPOTENCY_RESULT 原子提交。没有执行这些效果，也没有真实回执重放 / 去重 / 并发验证。

日志草稿只保留白名单 actor / before / 可信服务端 requestId / 审核进度文案。理由必须通过显式同步脱敏器，缺策略或返回未知结果拒绝；测试替身不代表正式理由政策。日志草稿没有 after，也不能直接落库：执行器须完成所有领域效果、校验最终资金与状态，再生成真实 after、完整通用字段并同事务提交。退款后资金轴以最终执行结果为准，不以规划补丁代替。

真实适配必须在同一事务重新加载当前用户 / 角色 / 订单 / 申请和资源，校验所有版本条件，匹配幂等回执；任意效果失败不保存订单、日志或局部资源。缺核销、资源或退款执行器应拒绝执行，不能把 requiredAtomicEffects 清单当成已经成功。计划不直接返回小程序。

<a id="o01-controlled-order-commands--验收"></a>
## 验收

新增 10 项回归，其中参数化矩阵覆盖六个履约命令 × 自取 / 配送有效 V1 状态，共 90 组。权限、完整请求字段、旧状态、版本 / 时钟、取消 / 审批 / 退款、脱敏 / 核销契约与深冻结通过。非法越级不会返回计划，受控测试调用没有日志 / 资源写入，输入记录保持不变；这不等同于真实 SDK 回滚证据。

O01 + D06 + D01 专项 **39/39**、全套 **385/385**，静态检查 **227 个文件**。主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**，新模型仅在服务端目录。本轮没有页面或字体变动，没有新微信 / 真机测试；云 allowlist 仍仅 user.me / store.health。未提交、推送、上传、部署或发布。

---

<a id="o02-order-creation"></a>

## 原记录：O02-ORDER-CREATION.md

<a id="o02-order-creation--o02订单创建与不可变快照"></a>
# O02：订单创建与不可变快照

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。**离线创建模型验收通过，尚未实际保存订单、占用库存 / 时段或开放付款。** 现有 UI 和全部未提交工作保留。

<a id="o02-order-creation--受控创建与现行数据"></a>
## 受控创建与现行数据

`cloudfunctions/_shared/order-creation-model.js` 的 planOrderCreation(state,event,principal,context) 仅接受 D07 order.create 的 quoteId / expectedQuoteVersion / idempotencyKey。价格、身份、地址、时间、订单号及付款状态不接受客户端传入。principal 必须 D06 真正签发；报价、订单回执、门店 / 发布配置、本人袋、目录、地址、库存、时段与上下文均须可信一致读取。工具不能证明记录已持久化；测试以隔离 X05 记录替代读库。

同键裁决后，重新检查本人报价 ID / 版本 / 时间 / ACTIVE / 未消费及同店。复用 X05 重核袋行、规格、留言、当前价格 / 实拍、地址 / 配送范围、预约提前量 / 容量、资源和配置版本。旧报价金额不会默默替换；报价及袋 / SKU 变化返回 QUOTE_CHANGED，要求重新确认。过期、资源不足、范围未核验、无权及配置缺失保留对应领域错误。

仅准备幂等元数据和 CREATE / BUSY / REPLAY 决策，没有回执保存、去重或超时恢复。终态决策不因报价后来过期而重新创建；返回实体前仍须读取并验证当前本人订单，不把 decision 当实际成功。

<a id="o02-order-creation--不可变历史事实"></a>
## 不可变历史事实

有效报价生成 proposedOrder 为 PENDING_PAYMENT / UNPAID / NONE，实付 / 已退 / 退款预算均 0，付款 / 取消 / 完成时间、取消原因与自提凭证初值 null。

- 订单头含交易政策、选中袋证据、门店 / 联系人 / 地址 / 预约 / 费率、订单备注及可信整数金额；自取地址 null，配送保留范围溯源，V1 运费 0。
- proposedItems 独立保存 orderId / position 及商品、SKU、规格、图片、版本、单价、数量、小计、逐行留言，按报价选择顺序排列，排除未选袋行。
- 订单头不另存 items 或可改 id 副本；id=_id 仅临时用于 D01 金额核验。留言与订单备注独立。
- 深复制 / 深冻结保证现行商品、图片、价格、地址、门店、费率、袋及报价修改不改变已生成历史快照；数据库不可变性仍待权限 / 服务验证。

<a id="o02-order-creation--编号截止与原子边界"></a>
## 编号、截止与原子边界

orderId 使用 D04 完整确定性摘要，parts 为 environment / ownerId / ORDER_CREATE / key；明细 ID 为 environment / orderId / lineId。内部 orderNo 为 `V1-` 加完整 64 位大写摘要，不截断、不依赖日期或随机数，不用作授权秘密 / 核销凭证。这是当前实现格式，不是已确认的商家短单号格式。

同键稳定、不同键 / 用户逻辑隔离；**实际唯一性仍依订单 create-if-absent、orderNo 唯一索引 / 事务检查**。唯一冲突必须拒绝或核实回执，不能覆盖。没有实际 SDK 唯一性或并发证据。

付款截止读取发布配置 paymentHoldMinutes，复用 D05，不晚于 startAt − 最大提前量；缺失 / 零值 / 无效参数拒绝，没有默认保留分钟。报价在创建时有效并被消费，付款期限独立，不错误沿用报价 TTL；测试 15 分钟仅 OFFLINE_TEST_ONLY。

输出 OFFLINE_ORDER_CREATION_PLAN，callable / checkoutAllowed / paymentAllowed 均 false，stockReserved / capacityReserved 均 false；含报价消费补丁及用户 / 门店 / 配置 / 地址 / 袋 / 资源版本条件。requiredAtomicEffects 要求同事务重核报价、整单资源预留、订单 / 明细创建、首日志、ACTIVE 报价消费和回执。任意失败不得留下半订单或局部占用，不能单独保存 proposedOrder 就报成功。O03 接资源 / 原子执行；O04 接实际幂等 / 恢复 / 按袋行版本精确同步。本轮没有删除袋、保存日志或生成支付会话。

<a id="o02-order-creation--验收"></a>
## 验收

新增 10 项覆盖双履约、金额 / 完整快照、后续资料修改不变、多行顺序 / 留言 / 未选排除、请求 / 身份、报价过期 / 消费 / 版本 / 篡改、现行资料变化、付款参数 / 提前量截止、编号、回执决策、失败无部分结果，并与 O01 未付取消契约组合。

O02 / X05 / O01 专项 **33/33**、全套 **395/395**、静态 **229 个文件**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只验证离线模型，真实唯一索引 / 事务回滚 / 资源竞争仍待补；没有页面 / 字体变化或本轮微信 / 真机 / 云 SDK 验收，未提交 / 推送 / 上传 / 部署。下一项 **O03 库存与预约名额原子预留、支付截止及事务边界**。

---

<a id="o03-atomic-order-transaction"></a>

## 原记录：O03-ATOMIC-ORDER-TRANSACTION.md

<a id="o03-atomic-order-transaction--o03整单库存--预约预留与原子事务服务"></a>
# O03：整单库存 / 预约预留与原子事务服务

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。用户已确认开发 / 测试云环境尚未开通，并授权恢复离线推进。**内部事务服务及本地适配器验证通过；真实 SDK、数据库保存 / 唯一索引 / 并发仍未验收。** 现有 UI 与未提交成果保留。

<a id="o03-atomic-order-transaction--实现与完整边界"></a>
## 实现与完整边界

`cloudfunctions/_shared/order-transaction-service.js` 的 createOrderTransactionService({runTransaction,now,buildContext,newRequestId}) / execute(event,principal) 通过注入的事务会话执行完整应用流程。当前唯一执行器位于 tests/fixtures/order-transaction.js，使用独立内存数据和可回滚串行事务，没有云 SDK 适配器、handler、小程序调用或正式数据写入。

1. 复用 O02 prepareOrderCreationRequest 解析固定 quoteId / expectedQuoteVersion / key，以 D06 真正签发的 principal 定位请求 / 回执；服务端生成 trace，不采用前端角色或时间。
2. 事务内重读用户，核对当前 ACTIVE、AppID / 环境 / schema / 版本；读取幂等回执，同键终态重放前读取本人订单并匹配确定性 ID / 报价，未决拒绝为 BUSY。
3. 事务内加载报价、本人袋、门店 / 配置、目录、地址、资源，并由可信 buildContext 提供号码 / 备注 / 图片 / 地图及数量政策。复用 O02 / X05 重新核验，不使用事务外的旧创建计划。
4. 从完整重核验的 resourceVersions 生成每种库存及唯一 SLOT 请求，复用 D04 planResourceHolds 整单计算。库存按真实 unitsPerItem × quantity 聚合；每单只占一个时段单位，模式独立 3 / 1。任意不足在写入前拒绝。
5. 检查订单 ID / 编号不存在，并要求适配器保护所有读取依赖到提交；写资源计数 / 版本、全部 HELD 预留、订单头 / 全明细、首日志、ACTIVE 报价消费、成功回执。各写入必须返回受影响数量 1，零行或未知结果抛错，不悄悄成功。
6. 回调返回前再次核对服务端时间，报价过期或付款截止已到则整笔拒绝。runTransaction 必须等待实际提交后才返回；任意异常必须回滚全部已暂存效果。

付款截止读取发布配置并受预约最大提前量边界约束；每条预留 expiresAt 等于订单 paymentDeadlineAt。预留为 HELD，付款 / 制作后的 CONFIRMED / CONSUMED 及到期 / 取消释放留后续任务，不在本轮自动模拟资金成功或恢复已消耗库存。

<a id="o03-atomic-order-transaction--事务会话契约"></a>
## 事务会话契约

| 会话能力 | 必须保证 |
|---|---|
| readUser / readReceipt / readCreationState / readOrder / readOrderByNumber | 读取本环境真实记录，缺记录显式 null，数据来源一致；不得返回客户端实体 |
| assertCreationReads(conditions) | 当前用户、目录、配置、袋、地址、报价、资源读取依赖保护到提交；仅返回 true 不是 SDK 能力证据 |
| updateResource(change,now) | 检查 expectedVersion / 现行状态，更新全部计数与版本 / 时间，不无条件覆盖 |
| insertReservation / insertItem / insertLog / insertReceipt | create-if-absent，追加历史不覆盖，写失败抛错或返回非 1 |
| insertOrder | 同时保护确定性 _id 与唯一 orderNo；实际唯一索引 / 并发支持仍须验证 |
| consumeQuote(consumption,conditions) | 比较本人 / 同店 / ACTIVE / 未消费 / 未过期 / 版本，消费与订单同事务 |

资源请求只使用报价整单所需资源，不把额外库存误纳入 D04 的精确集合。读取与写入条件、索引及权限保护最终依赖实际适配器；普通分步 set、事务回调先返回后保存或缺读依赖保护均不满足本契约。真实 SDK 的重试、事务预算、并发撤销和提交延迟仍须专门验证；回调末尾的时间预检不能代替实际平台提交边界测试。

首次 ORDER_CREATED 日志采用 before=null 表示此前没有订单；after 为真实待付三轴 / 金额 / version=0。后续命令日志 before 仍必填非空交易轴。已在 DATA_MODEL 明确此创建例外，避免虚构此前状态。日志只存可信 actor / trace 和固定进度文案，不存凭证、电话、请求载荷或幂等键。

内部返回 OFFLINE_ORDER_TRANSACTION_RESULT，cloudVerified / checkoutAllowed / paymentAllowed 均 false，CREATED / REPLAY 的 result 只有 entityId / version / errorCode。这些是测试适配器中的事务结果，不是正式网络回执或页面成功提示。未删除袋、创建支付单、调用云或开放购买。

<a id="o03-atomic-order-transaction--本地证据"></a>
## 本地证据

新增 14 项：双履约完整提交、最后库存 / 最后自取或配送名额竞争、独立容量、多资源全有或全无、9 个暂存写位置逐个失败及返回零行回滚、用户停用 / 版本 / 提交前撤销、时间到期 / 付款截止、共享库存单位、同键并发重放与报价只消费一次、编号冲突 / 缺适配器 / 伪造身份拒绝。

测试适配器将请求排队、复制暂存、提交前比较读依赖、拒绝异常后不应用暂存；它验证服务的整单调用 / 失败处理契约，**不证明云平台具有相同串行化、索引或事务行为**。首次专项中一条断言预期过期错误，但报价消费已先推进版本，应返回 QUOTE_CHANGED；按既定版本优先顺序修正断言后重测通过，没有为测试改变业务顺序。

全套 **409/409**；静态 **232 个文件**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只新增服务端模块和测试，UI / 存储数据未操作，没有新微信 / 真机 / 云验收；未提交 / 推送 / 上传 / 部署。下一项 **O04：实际幂等恢复契约、响应丢失重试与购物袋按行版本精确同步**，继续离线；云环境开通后按 [ORDER-CLOUD-ACCEPTANCE.md](../../ORDER-CLOUD-ACCEPTANCE.md) 补真实证据。

---

<a id="o04-order-recovery"></a>

## 原记录：O04-ORDER-RECOVERY.md

<a id="o04-order-recovery--o04订单恢复与购物袋精确同步"></a>
# O04：订单恢复与购物袋精确同步

2026-10-05。完成内部服务与本地内存事务验证；真实 SDK、handler、云持久化和客户端接入尚未实现。用户允许云未开通时继续离线，既有 UI 与全部未提交成果保留。

<a id="o04-order-recovery--恢复边界"></a>
## 恢复边界

`order-recovery-service.js` 的 `createOrderRecoveryService({orderService,cartSyncService})` 先调用 O03 创建服务，再调用独立的袋同步事务。创建结果未知时直接返回错误，不删除袋；调用方必须重用原 quoteId / expectedQuoteVersion / idempotencyKey。相同请求重放原订单及原版本，不重新占用资源；同 key 异参冲突。创建事务已提交而袋同步失败时，返回内部 `cartSynchronization.status=PENDING / errorCode=CART_SYNC_PENDING`，不撤销订单、消费报价或 HELD。权限错误直接拒绝，异常详情不输出。

O02 创建订单时从可信 Cart 捕获不可变内部 `cartRemovalSnapshot`，与 `cartSelectionSnapshot` 的行顺序和版本一一对应。新增字段只属于订单内部恢复证据，不改变 Quote 事实结构或公开 DTO。每行只存 lineId、lineVersion 和 SHA-256 内容摘要；摘要覆盖 lineId / productId / skuId / quantity / cakeMessage / messageFingerprint / normalizationVersion / addedAt，不存另一份明文留言。

同步读取当前本人同店 Cart；只有行 ID、行版本及内容摘要全匹配才整行删除。未选、新增、修改数量 / 留言 / SKU、删除后以新 ID 重加的行保留；不按下单数量扣减已经合并新增数量的行。全局袋版本允许增加，在最新版本条件下保存剩余行；实际删除时袋版本 +1，剩余行版本不变。行 ID 删除后不得复用。同步不读取现行目录价格，不重新计算历史金额。

<a id="o04-order-recovery--袋事务与回执"></a>
## 袋事务与回执

`createOrderCartSyncService({runTransaction,now}).synchronize(orderId,principal)` 要求事务会话提供：

| 方法 | 必须保证 |
|---|---|
| readUser / readOrder / readCart / readReceipt | 同一事务内可信读；不存在返回 null；用户 ACTIVE、AppID / 环境 / 当前用户版本有效，订单及袋属于本人 |
| assertSyncReads | 保护用户、订单、Cart 读依赖直到提交；缺失袋也保护不存在条件，不能只作事务外版本检查 |
| saveCart(nextCart,expectedVersion) | 当前 Cart 条件写，影响数必须为 1；不覆盖并发变更 |
| insertReceipt | create-if-absent 且影响数必须为 1，与袋更新原子提交 |

沿用 `idempotency_records`，内部 command=`order.cart.sync`，key 为 orderId，按环境及 AppID / owner 作用域隔离；请求指纹绑定订单 ID 与不可变移除快照。没有新增集合或公开 action。成功回执仅存 Cart ID / 最终版本 / errorCode=null，不存行留言、内部异常或全量订单。

没有需删除的行也完成成功检查点；袋不存在时版本为 null，不新建袋。同一订单再次同步只返回检查点，不读取或清理后续新行。回执不能在仍允许订单恢复期间独立过期，否则可能重新运行移除；当前 retentionUntil=null，正式保留 / 归档策略须与订单生命周期一起设计。

袋写入或检查点写入失败 / 零行必须全部回滚。当前没有单独持久化 PENDING 作业：已提交订单的不可变快照及尚无成功同步回执构成恢复输入，下一次同请求重试可补偿。后台扫描、调度、失败告警及主动补偿执行器未实现，不能称为自动后台恢复。

<a id="o04-order-recovery--本地验证与下一项"></a>
## 本地验证与下一项

新增 15 项回归：精确移除、多行混合同步、独立袋改动、同版本内容变化防御、删除重加、成功后新增行保护、两处写入失败 / 零行回滚、并发改袋提交冲突、创建及同步响应丢失、服务重建、伪造身份 / 他人订单 / 异参 key、缺袋检查点及同订单并发重放。测试适配器为串行内存事务，非云数据库并发证据。

全套 **424/424**，静态 **235**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。未操作微信、本机 Storage、正式集合、资金或真实库存；未提交 / 推送 / 上传 / 部署。返回 OFFLINE_ORDER_RECOVERY_RESULT，cloudVerified / checkoutAllowed / paymentAllowed 均 false，不作为页面成功提示。

真实 SDK 的读集保护、条件写、回执唯一性、服务崩溃与网络响应丢失、Cart 并发及读回仍按 [真实订单验收](../../ORDER-CLOUD-ACCEPTANCE.md) 待补。客户端原请求 key 的可靠持久保存、未知结果查询、本机袋到正式 Cart 的迁移也待实接；当前不会自动清理本机购物袋。

下一项 **O05 待付取消、到期协调与资源释放**；真实外部支付关单竞争依赖 P04，先做离线领域契约。

---

<a id="o05-order-cancellation"></a>

## 原记录：O05-ORDER-CANCELLATION.md

<a id="o05-order-cancellation--o05取消到期协调与资源释放"></a>
# O05：取消、到期协调与资源释放

2026-10-05。完成可离线部分：待付取消 / 到期内部事务服务及已付取消协调计划。当前仅串行内存适配器，没有真实 SDK、Payment 关单、定时任务部署、审批 / 退款执行器或客户端接口，不判定完整 O05 云验收通过。

<a id="o05-order-cancellation--待付取消与资金边界"></a>
## 待付取消与资金边界

`order-cancellation-service.js` 的 `createOrderCancellationService` 要求注入原子事务、服务端时钟 / requestId、理由脱敏器、固定 AppID / 环境；缺配置拒绝创建。`cancelUnpaid(event,principal)` 复用 D07 的 order.cancelUnpaid，严格接受 orderId / expectedVersion / reason / idempotencyKey，不接受付款状态、金额、角色或资源列表。事务内重读当前 ACTIVE 用户、本人订单、全部支付意图、已消费报价及整单预留 / 资源。

| 当前证据 | 处理 |
|---|---|
| PENDING_PAYMENT + UNPAID，且完整支付意图查询为空 | 可以取消；支付意图不存在条件须保护到提交 |
| PENDING_PAYMENT + CLOSED，且所有支付记录都是有效 CLOSED / UNAPPLIED | 可以取消；验证归属、AppID、整数金额 / 币种、有效截止、closedAt 与事件引用 |
| PENDING / EXCEPTION、已存在任何未决支付意图，或支付结果与订单摘要不一致 | PAYMENT_COORDINATION_REQUIRED，保留订单、资源、报价、日志和回执；列出查询 / 关单或核对动作，不实际调用支付 |
| CLOSED 但没有关闭记录 | 保留占用，要求核对；不能用一个 CLOSED 字段证明关单 |
| 已付款 / 已履约或旧版本 | 本人取消接口拒绝；已付取消走商家审批 |

支付记录必须由可信 Payment 执行器写入，普通客户端无权标记 CLOSED；本服务校验持久化证据结构及关联，不验证外部平台签名或仅凭客户端事件引用判断资金状态。真实查单、关单、事件来源核验及摘要入账属于 P04。外部 API 不放进数据库事务。

等待协调不会写成功 / 永久失败回执，也没有新增持久化关单意图或后台补偿作业。无数据变化时可以重试原请求；Payment 核对更新订单版本后，顾客须重新读取版本再提交取消，不能绕过 expectedVersion。成功提交后响应丢失，同请求 / key 重放原版本结果，不多释放或追加日志；同成功 key 异参冲突。

<a id="o05-order-cancellation--到期入口"></a>
## 到期入口

`expire(orderId,invocation)` 仅内部入口；工厂注入的 verifyExpiryInvocation 必须明确返回 true，未提供则拒绝。正式适配器须验证真实服务端触发身份，不可把客户端 actor / capabilities 当授权。当前测试只使用对象身份校验，未实现真实 SYSTEM 身份工厂或定时扫描部署，不新增公开 action / allowlist。

服务端 now 达到 paymentDeadlineAt 才尝试取消；早于截止或已付 / 已履约 / 已由顾客取消的任务 SKIPPED，不写回执或日志。到期仍遇未知支付状态则等待协调，不能因 TTL 过期释放。成功任务用内部 order.expire / orderId / 截止快照构造回执，重复执行重放；用户与到期同时处理，只能一方改变订单版本。

<a id="o05-order-cancellation--原子释放"></a>
## 原子释放

`order-cancellation-model.js` 的 planCancelledResources 使用已消费报价的不可变聚合需求校验整单预留集合，核对确定性预留 ID、order / store / resource / 数量、当前版本及解析状态、唯一 SLOT 与履约方式。不能只读到部分预留就按完整订单成功。资源计数必须足够且版本不能溢出；关闭销售的资源仍允许合法释放，不重新开放销售。

待付订单的预留必须全部 HELD；一个事务更新全部资源计数、HELD→RELEASED、resolvedAt / resolutionLogId、订单 CANCELLED / 时间 / 脱敏原因 / version+1、最终 before / after 日志及成功回执。任一异常或零行影响数整笔回滚。订单明细、报价消费和购物袋不变；取消不自动把已下单行重新加回袋，也不退实际资金。

事务会话要求：readUser / readOrder / readReceipt / readCancellationState / assertCancellationReads / updateResource / updateReservation / saveOrder / insertLog / insertReceipt。readCancellationState 必须加载全部本单支付意图、已消费报价、所有预留及对应当前资源。assertCancellationReads 保护订单 / 用户 / 报价 / 支付集合与版本 / 预留 / 资源读依赖及支付意图查询为空的条件直到提交，不能只是事务外查询或检查已知 ID。所有写返回影响数 1；条件失败不能忽略。

设 k=不同 STOCK 资源数+1 个 SLOT，基础取消写预算为 **2k+3**（资源 k、预留 k、订单 / 日志 / 回执各 1）；两个资源是 7 次，三个资源是 9 次。真实权限栅栏、SDK 查询 / 重试 / 字节预算额外核验。

<a id="o05-order-cancellation--已付取消拒单与制作后的资源"></a>
## 已付取消、拒单与制作后的资源

planPaidCancellationCoordination 复用 O01 顾客所有权、商家当前同店 ORDER_OPERATE + REFUND_APPROVE、PENDING 申请 / 版本和冻结政策。本人申请只要求创建审批记录，不改变履约和资源；商家批准取消按批准金额生成必需效果，拒绝申请保留履约；PAID 拒单要求剩余全部实付退款，已有成功部分退款只补差额，未决 / 失败退款不能另建预算。

输出仅内部不可执行计划。取消审批记录、资源、订单、正金额退款意图 / 预算、日志、回执必须最终由资金执行器同事务协调；这里没有保存申请 / 审批或退款意图。零退款不创建退款意图，但仍要求商家复合权限及全部非资金原子效果，不能仅把资源提案单独保存。

制作前 CONFIRMED 资源可提案释放；制作后 STOCK 必须 CONSUMED，始终保留已消耗计数，不因退款恢复。未消耗 SLOT 的制作后取消回补规则仍待 E06 / D05：缺明确策略返回 CONFIGURATION_REQUIRED。测试中的 RELEASE_UNCONSUMED / RETAIN 是内部分支输入，**没有发布为经营政策**；后续可信配置加载器须验证适用政策版本。已消耗或已释放记录不再次扣减。迟到款保持取消、登记全额补偿的规则复用 D01，真实入账 / 退款及关单竞争留 P04 / P06。

<a id="o05-order-cancellation--验证与下一步"></a>
## 验证与下一步

新增 20 项：双履约释放、成功响应丢失及重建、7 处异常 / 零行逐一回滚、多资源 9 处写失败、未知 / 已创建支付、关闭证据与版本核对、精确到期、任务重放、顾客与到期竞争、其他订单占用保留、关闭资源释放、缺预留 / 下溢 / 溢出、权限 / 旧版本、支付意图出现 / 用户撤销读依赖冲突、已付申请 / 拒单、制作后库存与时段政策、零退款及只读不可变计划。

全套 **444/444**，静态 **238**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只是本地内存事务与领域计划，未操作本机袋 / UI / 微信 / 真实云 / 资金，未提交 / 推送 / 上传 / 部署；既有未提交改动保留。

下一离线项 **O06 订单列表、分页与详情读模型**。真实 SDK、SYSTEM 触发认证 / 调度、Payment 关闭与迟到款、已付审批 / 退款执行、制作后 SLOT 政策和整阶段门禁继续待补，按 [真实订单验收](../../ORDER-CLOUD-ACCEPTANCE.md) 登记。

---

<a id="o06-order-read"></a>

## 原记录：O06-ORDER-READ.md

<a id="o06-order-read--o06订单列表分页与详情读模型"></a>
# O06：订单列表、分页与详情读模型

2026-10-05。完成可离线读模型 / 内部只读服务，未实现云 handler / SDK 查询、页面列表 / 详情实接或真机验收。当前 Orders 页面仍为原空状态；无真实订单时不注入开发订单。全部既有未提交成果与已确认 UI 保留。

<a id="o06-order-read--请求与分组"></a>
## 请求与分组

复用 order.list / order.get，目标 action 数量仍为 60，客户端 allowlist 仍只有 user.me / store.health。order.list 新增可选 `view: ALL / ACTIVE / CURRENT / PAST / COMPLETED / CANCELLED`，保留既有 `status: 精确订单轴状态`、pageSize / cursor；两种筛选同时提供时取交集。ACTIVE 与 CURRENT 规范化为同一查询；不接受 ownerId、任意排序、skip 或客户端身份。

| 分组 | 履约状态 |
|---|---|
| CURRENT / ACTIVE | PENDING_PAYMENT / PAID / ACCEPTED / MAKING / READY / DELIVERING |
| PAST | COMPLETED / CANCELLED |
| COMPLETED / CANCELLED | 对应单一状态 |
| ALL | 八个合法订单轴状态 |

PAID 显示「待门店接单」，ACCEPTED 显示「门店已接单」，MAKING 才显示「制作中」。支付 / 退款轴独立：完成或取消的订单即使有未决退款仍属于 PAST；配送中部分退款不改配送中。待付超过截止也不由读模型自动改成取消，等待 O05 / P04 的真实处理。

<a id="o06-order-read--历史事实与隐私"></a>
## 历史事实与隐私

createOrderReadModel(records,principal,context,key) 只接收可信一致的有限快照：user / orders / items / logs / cancellations / mediaAssets。身份必须来自 D06，当前用户 ACTIVE、AppID / 环境及版本一致。get 对未知 / 他人订单同样 NOT_FOUND；混合测试快照中的非本人父订单与其子记录不会进入输出。真实 SDK 必须在查询阶段限定本人，不能把全库发到客户端筛选。

详情从订单头及独立 order_items 按 position 连续聚合，校验选中行顺序、整数金额、总额及生命周期时间，复用 D02 白名单捕获事实。不读取当前目录、价格、门店或地址重写历史。公开详情包含历史 store / contact / 本人地址 / appointment / items / orderNote、金额、三轴、生命周期、取消申请摘要 / 退款摘要和公开时间线；不返回 ownerId、报价 / 袋同步证据、资源、角色、付款平台号、事件 / 追踪、内部日志理由或自取凭证 digest。源地址 ID 和历史商品 ID 是允许的引用，不是匿名化承诺。

列表仅保留卡片用的产品名称、封面 / 数量、订单号 / 金额 / 三轴 / 状态文案 / 时间、预约 / 取消 / 退款摘要及不可调用的动作提示，不含联系人、地址、留言、完整明细或日志。退款摘要使用已持久化 refundedCents / refundReservedCents：成功部分 / 全额区分，失败显示「待核实」并保留未决预算，不把受理说成已退款。

图片复用 C01 resolveSnapshotMedia 的 HISTORICAL_ORDER：匹配原 assetId / revision / storageRef / sourceKind，RETIRED 版本仍可读，不跳到新版本；缺失、DRAFT、错引用或未获准云前缀返回 null，仍保留文字与价格。正式媒体来源、文件存在与访问授权须云接入验收；空图片不影响未来页面按既定比例占位。

<a id="o06-order-read--分页与只读服务"></a>
## 分页与只读服务

排序固定 createdAt DESC / _id DESC；默认 20、最大 50，取 pageSize+1 判断 hasMore，游标锚点取最后一个返回项。HMAC 游标绑定环境、AppID / 本人、order.list、规范 view / status、排序及 D07 的 15 分钟技术期限。改变主体 / 查询、篡改或到期拒绝；页大小可以改变。密钥必须服务端配置，不生成临时密钥或进入小程序。

只读服务 createOrderReadService({runReadTransaction,now,context,key}) 每个请求重新校验用户，并要求 readUser / readOrderPage / readOrderDetail / assertReadSnapshot。列表向适配器提供 ownerId、状态集合、固定排序、limit、seek OR 分支；必须将整个 seek OR 与本人 / 状态过滤 AND 后查询，再取限制数量。详情先限定 ownerId / orderId，才读取必要子记录和原图版本。适配器返回他人父记录或超过 limit 时失败，不降级为全库查询。

assertReadSnapshot 必须保护当前用户及本次全部订单、明细、申请、日志、媒体读取到结束，不能只比较一个订单 ID 或事务外查询。服务没有写方法；测试读期间撤销 / 版本改变、混合快照会拒绝结果。真实 SDK 的一致读、读集保护与索引方向 / OR 查询尚未验证。

稳定 seek 解决同时间边界，不提供跨页数据库快照：后续新创建且更靠前的订单在刷新时出现，状态筛选变化可能移出 / 移入；未来客户端须按 orderId 去重并提供刷新，不宣称任何并发变化下均无遗漏。

<a id="o06-order-read--进度与操作提示"></a>
## 进度与操作提示

详情时间线按提交版本排序，同时间也不按随机日志 ID 打乱。要求首次 ORDER_CREATED / before=null / 初始待付轴，随后 before=前条 after，版本连续、时间不倒退、最后 after 与当前订单一致；已知履约命令与前后状态 / 方式匹配。不回传原 publicMessage / reason，而以固定文案及交易轴投影，避免把未经审核字符串作为公开进度。后续 Payment / 退款显式命令须扩展固定文案，未知内部命令保守展示最终履约状态。

可用操作为上下文提示：待付仅去支付 / 取消，过截止不提示去支付；已付可申请取消，已有待审申请则提示待审；DELIVERING / DELIVERY 才有本人确认收货；READY / PICKUP 的凭证入口仍受 O07 未配置限制。所有提示 enabled=false，SERVICE_NOT_CONNECTED / PAYMENT_PENDING / CANCELLATION_PENDING / CONFIGURATION_REQUIRED 明确区分；历史不支持政策仍可看事实，动作列表为空。

返回 OFFLINE_ORDER_PAGE / OFFLINE_ORDER_DETAIL、cloudVerified=false，不是已部署 API DTO。动作提示不代替命令鉴权，不能简单翻 enabled 就开放付款 / 核销。没有凭证生成、订单变更、模拟付款或假成功。

<a id="o06-order-read--验证与下一项"></a>
## 验证与下一项

新增 22 项：八状态 / 两种履约 / 分组、退款独立、同时间分页及末尾锚点、游标签名 / 隔离 / 到期、刷新与新单、本人 / 伪造身份、历史事实、隐私白名单、退役 / 缺失图片、上下文动作 / 超时门禁、未知历史政策、完整日志链 / 状态 / 时间、防止半份明细、严格输入、查询计划及每页当前权限 / 读集、错误适配器、不可变输出 / 密钥副本，以及 O03 实际本地创建 / O05 取消输出兼容。

全套 **466/466**、静态 **242**，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只有本地快照与内存读适配器证据；未改 UI、操作微信 / 真机 / 云 / 资金 / 本机 Storage，未提交 / 推送 / 上传 / 部署。

下一离线项 **O07 自提凭证与核销策略 / 权限 / 防重放模型**。E10 的码形式、有效期和尝试限制尚未确认，不能发布默认经营值；真实 Order 列表 / 详情页面、SDK / A/B / 分页 / 媒体、O05 / P04 资金竞争和阶段整体门禁继续待补，见 [真实订单验收](../../ORDER-CLOUD-ACCEPTANCE.md)。

---

<a id="o07-pickup-credential"></a>

## 原记录：O07-PICKUP-CREDENTIAL.md

<a id="o07-pickup-credential--o07-自提凭证与核销内部事务2026-10-05"></a>
# O07 自提凭证与核销内部事务（2026-10-05）

状态：可离线部分完成。没有云环境、SDK / handler、顾客凭证展示或门店扫码页面实接，不能实际核销。E10 正式码形 / 有效期 / 尝试限制、完成后的 SLOT 政策仍待确认。

<a id="o07-pickup-credential--内部实现"></a>
## 内部实现

`pickup-credential-model` 和 `order-pickup-service` 复用 D07 / D06 / D01 / O01。get 只接受已有 order.pickupCredential.get 的 orderId；complete 只接受 admin.order.transition 的 COMPLETE_PICKUP，维持 60 action 和当前两项客户端 allowlist。身份由可信 principal 提供，事务重新检查 ACTIVE 用户、版本及当前同店 ORDER_OPERATE 角色，顾客本人身份不替代门店权限。

当前引擎仅实现 OPAQUE_TOKEN 候选：HMAC-SHA256 值绑定环境 / AppID / 订单 / 所有人 / 门店 / 政策 / 密钥 ID / 签发与过期时间，不能从公开订单号计算。密钥由服务端显式注入、至少 32 字节，拷贝后保持在闭包中，不进订单或网络 DTO；真实秘密管理与随机密钥来源待部署。持久字段只有另一个域的 HMAC 摘要和受控元数据，不保存明文。本人返回字段仅 orderId / expiresAt / format / value，且必须在事务提交后返回。

这不是已选择的展示码 / 二维码方案，也不支持短数字码适配。政策版本、TTL、每凭证最大错码数、冷却时间、SLOT 完成策略必须显式提供；缺项拒绝构造，不发布默认值。测试夹具的 OFFLINE_TEST_ONLY / 60 秒 / 3 次 / 1 秒与 KEEP_CONFIRMED 均是隔离测试值，不能用作经营配置。

<a id="o07-pickup-credential--签发过期与限速"></a>
## 签发、过期与限速

- 仅本人 READY / PICKUP / PAID 订单可签发。未备妥、配送、取消、完成拒绝；重复 / 并发读取复用已提交的同一有效值，不延长期限、不清错码数。
- 仅过期后允许本人续发，签发时间 / 过期时间变化产生新值；过期边界 now >= expiresAt 拒绝核销。达到错码上限后，同一有效凭证锁定，包括本人重复读取；当前模型过期续发才重置计数，正式续发 / 解锁政策须随 E10 确认。
- 错码数和 nextAttemptAt 持久化在订单凭证内，对该凭证的所有门店操作人共享；新 key、服务重建或换操作人不能绕过冷却 / 上限。格式请求错误、权限 / 旧版本错误不计为已验证错码。
- 实际错码在同事务写计数、订单版本、内部日志与 FAILED 回执后返回内部 REJECTED，不能在事务内抛错撤销计数。同 key 同参失败重放原结果，不重复计数；冷却 / 锁定拒绝无写入。新正确尝试必须重读当前订单版本，并等待冷却。

码密钥可轮换，但必须保留有效凭证所需旧密钥。回执指纹使用独立域的 HMAC，避免未来低熵输入被无密钥 SHA 摘要猜测；fingerprintKeyId 对应密钥须保留并保持稳定，至少覆盖回执允许重试期限。政策版本不匹配、旧密钥缺失或记录损坏均拒绝，不悄悄续发 / 重置或返回假成功。多版本政策加载、正式密钥管理、服务端 API 统一指纹分派与迁移待云接入。

<a id="o07-pickup-credential--完成的原子边界"></a>
## 完成的原子边界

完整可信报价已消费、整单预留 / 资源须与原资源清单一致：每项 STOCK 已 CONSUMED，唯一 PICKUP SLOT 为 CONFIRMED 且 quantity=1，资源归店 / 数量 / 计数 / 版本合法。缺项 / 重复 / 错范围 / 计数不足拒绝。

在明确注入的测试 KEEP_CONFIRMED 策略下，核销记录 usedAt / usedBy、订单 COMPLETED / completedAt / 版本、最终日志和 SUCCEEDED 回执同事务。已消耗库存及 SLOT 计数保持原值，不能借核销再扣库存或恢复名额；这一测试分支不代表正式 SLOT 决策。没有外部调用或支付状态修改。

同 key 同参重放，当前用户 / 门店授权仍须有效，完成订单和 usedBy / completedAt 证据须与回执相容；响应丢失或时间随后过期仍安全重放。不同 key / 旧版本不能二次完成，公开订单号不能代替凭证。回执只保存 entityId / version / errorCode，日志不用调用方 reason / 凭证值；O01 的含明文 effectInput 只在内部检查，不能整体持久化或返回。

签发与实际错码更新订单版本，因此每次追加内部 PICKUP_CREDENTIAL_ISSUED / PICKUP_CREDENTIAL_REJECTED 日志以维持完整提交版本链。O06 验证其只能保持 READY 自提交易轴，并在公开时间线隐藏；完成仍展示固定“已完成自取”。公开详情不输出凭证摘要、尝试计数、密钥 / 角色或原始错误输入。

<a id="o07-pickup-credential--事务适配器义务"></a>
## 事务适配器义务

`runTransaction` 必须提交后才 resolve，失败回滚全部写；条件写必须影响 1 行。会话需要 readUser / readOrder / assertPickupReads / saveOrder / insertLog；门店核销另需 readPickupState / readReceipt / insertReceipt。

readPickupState 在同事务加载当前角色、消费报价、完整预留及资源；assertPickupReads 和真正的事务保护当前用户 / 角色（含撤销、范围、能力）、订单、回执、报价、完整预留 / 资源查询及其为空条件到提交。不能只比较传入版本而忽略实际读集。正式发布政策 / 密钥配置还需要可信加载、版本管理和生效裁决，当前静态注入只用于内部离线执行。

签发基础写为订单 + 日志 2；核销与实际错码为订单 + 日志 + 回执 3；复用 / 重放 / 限速拒绝无写。真实 SDK 权限栅栏、字节 / 重试成本另计。最后服务端时钟复核过期与时间倒退，本地证明不等于 SDK 实际提交时效证明。

<a id="o07-pickup-credential--验证与待补"></a>
## 验证与待补

新增 27 项测试：所有权 / 状态、作用域与摘要、重复签发、两种 key 竞争、一次完成、两种响应丢失、用户 / 角色撤销、共享限速、过期续发、秘密不入库、密钥轮换、损坏证据、所有写位置异常 / 零行回滚、资源变动冲突及 O06 真实本地日志链兼容。PAID / READY 生命周期只在隔离夹具中生成，未模拟真实已付订单。

全套 **493/493**；静态 **246** 个 JS / JSON / WXML 文件；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。首次专项失败来自测试短 key 和不一致交易轴，已修正测试数据并重测；没有绕过契约。

只有串行内存适配器，无真实 SDK 并发 / 持久化、秘密管理、扫码 / 展示交互或微信 / 真机验收。正式失败错误映射也未开放，不能把 OFFLINE_PICKUP_RESULT 的内部错误直接当网络响应；cloudVerified / callable / fulfillmentAllowed 均 false。所有实际用例登记在 [ORDER-CLOUD-ACCEPTANCE.md](../../ORDER-CLOUD-ACCEPTANCE.md)，继续待执行。

未改 UI，保留全部未提交成果，未提交 / 推送 / 上传 / 部署。下一项 **O08 配送更新 / 确认收货与订单域离线验收**，异常配送细则 E11 与阶段六正式门禁仍待补。

---

<a id="o08-order-delivery"></a>

## 原记录：O08-ORDER-DELIVERY.md

<a id="o08-order-delivery--o08-配送更新--确认收货2026-10-05"></a>
# O08 配送更新 / 确认收货（2026-10-05）

状态：可离线部分通过；整体真实订单门禁尚未通过。开发 / 测试云环境未开通，没有 SDK / handler、订单页面实接、真实配送 / 已付 / 微信验收。

<a id="o08-order-delivery--内部配送事务"></a>
## 内部配送事务

新增 order-delivery-service，execute(domain,event,principal) 复用已有 admin.order.transition 的 START_DELIVERY / COMPLETE_DELIVERY 以及 order.delivery.confirm。60 action、普通客户端 allowlist 和已有 UI 均未改。没有骑手调用、自动收货、假支付事件或新增失败配送状态。

START_DELIVERY 仅当前同店 ORDER_OPERATE 角色，从 READY / DELIVERY / PAID 到 DELIVERING。COMPLETE_DELIVERY 仅配送中已付订单，可由本人顾客入口或当前同店 ORDER_OPERATE 商家入口完成；管理员入口始终检查角色，不因订单属于自己而跳过权限。可信 principal 不能由 event 的角色 / 身份替代；当前 ACTIVE 用户与用户版本逐次重读。

订单、最终 before / after 日志、SUCCEEDED 幂等回执同一事务；完成同时写 COMPLETED / completedAt / 版本。日志记录可信 CUSTOMER 或 STORE 操作人和固定文案，构成 RECORD_DELIVERY_CONFIRMATION / RECORD_FULFILLMENT 的履约证据。原 reason 不入日志，不保存未封口的 requiresFinalAfter 或整个命令计划。未处理的新增领域效果必须拒绝，不能只改状态后忽略必需副作用。

付款 / 退款轴和金额、商品明细、联系人 / 地址 / 门店 / 预约快照保持原值；退款进度独立于履约完成。订单已取消、未付、未备妥、未配送、非本人 / 他店或旧版本均拒绝；已付取消仍需 O05 商家审批 / 资金协调，配送服务不替代审批、关单或退款。

<a id="o08-order-delivery--资源与未定政策"></a>
## 资源与未定政策

将 O07 已有的履约资源证据抽到 order-fulfillment-resources，双方式共同检查当前消费报价、完整资源清单 / 预留、门店与模式、预约 slotId、数量与计数。STOCK 必须已 CONSUMED，唯一对应方式 SLOT 必须 CONFIRMED 且 quantity=1；资源销售已关闭不阻止合法已有订单履约。补充报价模式、当前预约 ID / 版本和稠密数据检查，O07 回归继续通过。

开始配送验证上述证据但不修改资源。完成必须显式注入 `{version, slotCompletion:'KEEP_CONFIRMED'}` 的内部测试政策，缺少政策拒绝完成；不自动扣第二次库存、恢复消耗库存或返还名额。KEEP_CONFIRMED 是测试策略，E06 / D05 正式完成 SLOT 政策仍待决定，不用测试策略补正式经营配置。

<a id="o08-order-delivery--幂等和恢复"></a>
## 幂等和恢复

同 key 同参重放原版本结果，提交后响应丢失或服务重建不重复完成；同 key 异参拒绝，不同 key / 操作人竞争只有一次迁移，第二笔旧版本拒绝。重放仍检查当前本人 / 门店授权，并加载对应已提交日志核对 actor、command、前后轴、版本和时间；日志缺失 / 损坏不能返回成功。

已开始配送后，再完成或取消不会让旧开始请求改回 DELIVERING；旧 key 只读返回其历史开始回执。完成回执还要与当前 COMPLETED / completedAt 证据相容。回执只存 entityId / version / errorCode。配送载荷无凭证，沿用标准请求 SHA 摘要；O07 COMPLETE_PICKUP 采用独立稳定 HMAC 域，未来统一 admin 分派必须按命令保持各自指纹规则，不能互换破坏重试。

<a id="o08-order-delivery--联系门店提示"></a>
## 联系门店提示

delivery-support-model 从已授权的历史事实生成详情 deliverySupport；配送为 provider=STORE / windowNature=ESTIMATED，说明“配送由门店自行完成，预约时段为预计配送时间。遇到配送问题，请联系门店。”自取返回 null。仅详情带必要历史门店电话，不向订单列表增加联系人或地址。

联系方式不造号码，缺值为空且 CONFIGURATION_REQUIRED；有历史电话仍为 disabled / SERVICE_NOT_CONNECTED，因为真实订单查询及页面呼叫处理尚未接入。这是未来异常联系路径的内部提示，不是已经拨号或客服开通；正式电话 E04 / 异常配送责任细则 E11 与实机交互仍待补。不猜自动取消 / 重送 / 理赔 / 指定分钟送达规则。

<a id="o08-order-delivery--会话义务与证据"></a>
## 会话义务与证据

runTransaction 提交后才 resolve，任何异常 / 条件写零行全部回滚。需要 readUser / readOrder / readReceipt / readDeliveryState / assertDeliveryReads / saveOrder / insertLog / insertReceipt。readDeliveryState 在同一可信环境事务读取当前角色、消费报价、完整预留 / 资源及本单日志，顾客入口先检查父订单本人权限。

assertDeliveryReads 与真正 SDK 事务必须将用户 / 角色范围和撤销、订单、报价、回执、日志、完整预留 / 资源读集及查询完整性保护到提交；不能只相信传入版本。正式政策加载 / 生效和缓存撤销须真实裁决。基础写 3，实际权限 / 读集栅栏、字节 / 重试成本待 SDK 验证。末尾复核服务端时钟，不以客户端时间补履约日期。

新增 **27 项**，覆盖合法双角色 / 非法矩阵、本人 / 同店隔离、字段注入、完整资源、显式政策、金额 / 快照不变、两种响应丢失、同键 / 异参、并发一次完成、撤销 / 资源 / 报价冲突、所有 3 写位置异常与零行、取消竞争、退款独立、损坏回执日志、双方式历史链和联系门店提示。O07 / O08 专项 **54/54**，全套 **520/520**，静态 **251**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。

首轮取消样例未同步测试时钟，增强时间守卫后另一状态样例缺 completedAt，均修正夹具后重测，未放宽校验。Paid / 接单 / 制作 / 备妥及取消审批结果只在隔离夹具注入：没有真实 Payment、接单 / 制作 / 已付审批执行器或资金写入。取消竞争是本地订单读依赖冲突证明，不是实际退款 / 关单竞争证据。

所有 OFFLINE_DELIVERY_RESULT 的 cloudVerified / callable / fulfillmentAllowed=false；未接网络、微信工具 / 真机或 Storage，没有提交 / 推送 / 上传 / 部署。完整阶段矩阵见 [PHASE-6-REVIEW.md](phase-6.md#phase-6-review)，真实待验见 [ORDER-CLOUD-ACCEPTANCE.md](../../ORDER-CLOUD-ACCEPTANCE.md)。下一项阶段七 **P01 支付接入与配置核查**，先推进可离线边界，真实平台方案 / 商户关联 / 云环境仍待条件。

---

<a id="phase-6-execution"></a>

## 原记录：PHASE-6-EXECUTION.md

<a id="phase-6-execution--阶段六执行记录order"></a>
# 阶段六执行记录：Order

2026-10-05，接 X07 可离线部分。正式 Checkout 云门禁仍待补，继续完成可信内部模型；不能创建假订单、模拟真实已付或开放付款。

用户最新已确认开发 / 测试云环境尚未开通，并授权恢复离线推进。先前要求真实订单保存 / 唯一索引 / 资源占用验收的待补记录保留，不再作为离线任务暂停条件；云开通后按 [ORDER-CLOUD-ACCEPTANCE.md](../../ORDER-CLOUD-ACCEPTANCE.md) 补验收，不能用本地测试替代。

| 任务 | 当前状态 |
|---|---|
| O01 冻结状态机 / 受控命令 | 离线 API 编排、权限 / 版本 / 日志草稿与原子效果契约通过；正式 handler / 执行器待补 |
| O02 订单创建 / 不可变快照 / 唯一编号 | 离线双履约快照 / 现行报价核验 / 确定性编号通过；实际保存 / 唯一索引待补 |
| O03 库存 / 时段原子预留 / 截止 | 内部完整事务服务 / 本地适配器并发竞争与逐写入回滚通过；真实 SDK / 索引 / 并发待云条件 |
| O04 幂等 / 精确袋移除 / 恢复 | 内部响应丢失恢复 / 袋同步与检查点本地通过；真实 SDK / 客户端 / 后台调度待补 |
| O05 取消 / 到期 / 资源释放 | 待付内部事务 / 精确到期 / 整单释放及已付协调计划本地通过；真实关单待 P04、审批资金执行 / 时段政策 / 定时部署待补 |
| O06 订单列表 / 分页 / 详情 | 本人列表 / 稳定分页 / 历史详情与状态 / 退款 / 动作门禁本地通过；SDK / 页面实接待补，现有空状态保留 |
| O07 自提凭证 / 核销 | 显式测试策略下本人签发 / 同店核销、持久限速、幂等与回滚本地通过；E10 / SLOT 策略与正式展示 / SDK 待补 |
| O08 配送确认 / 订单验收 | 同店开始、本人 / 同店确认及日志 / 回执事务、并发 / 取消 / 双方式历史本地通过；正式 SDK / SLOT 政策 / 电话 / E11 与页面待补 |

O01 复用 D01 / D06 / D07，新内部 order-command-model 明确区分顾客与商家入口，拒绝伪造 nextStatus / 身份 / 付款状态；以状态机决定补丁、当前版本条件和资源 / 审批 / 退款 / 核销必需效果，未执行或保存。日志 after 必须由未来事务执行器按最终状态补齐，缺领域效果不能报成功。详情见 [O01-CONTROLLED-ORDER-COMMANDS.md](phase-6.md#o01-controlled-order-commands)。

新增 10 项，六个履约命令的状态 / 方式矩阵覆盖 90 组；O01 / 身份 / 交易专项 39/39、全套 385/385、静态 227，包体源估算仍 1213 / 97 / 45 KiB。UI 和本机数据未操作，所有既有未提交工作保留；没有新微信截图、SDK 或云验收。没有提交 / 推送 / 上传 / 部署。

上一轮把 O01 写为订单列表的交接笔误已纠正；沿用原计划编号，列表属于 O06。阶段六整体门禁尚未通过。

O02 新增 order-creation-model，只接受报价 ID / 版本 / key，复用 X05 现行核验、D02 深冻结事实和 D01 金额约束。双履约待付订单头 / 独立有序明细、商品图片 / 留言 / 地址 / 门店 / 时段 / 费率和整数总额通过；资料变更不改快照。确定性完整编号仍要求真实唯一索引，付款期限读取发布配置，不猜保留分钟。报价消费、资源 / 订单 / 明细 / 日志 / 幂等列为原子效果，尚未执行，不删除袋或调用支付。

O02 新增 10 项，组合专项 33/33、最新全套 395/395、静态 229；包体源估算 1213 / 97 / 45 KiB。没有 UI、微信或实际 SDK 验收，未提交 / 推送 / 上传 / 部署。详见 [O02-ORDER-CREATION.md](phase-6.md#o02-order-creation)。下一项 **O03 库存 / 时段整单原子预留与事务边界**。

O03 新增 order-transaction-service，将事务内当前用户 / 报价 / 目录等读取、整单库存 / 单 SLOT HELD、订单 / 明细 / 首日志 / 报价消费 / 成功回执组合执行。注入本地事务适配器验证最后库存 / 时段竞争、多资源全有或全无、9 个写位置失败 / 零行回滚、用户撤销、报价 / 付款截止及同键重放；没有 SDK 适配器或云 handler。首次创建日志 before=null 的语义已明确。

新增 14 项，最新全套 409/409、静态 232；包体源估算仍 1213 / 97 / 45 KiB。现有 UI 与全部未提交工作保留，云真实保存 / 唯一索引 / 并发待补。没有新微信 / 云验收或提交 / 推送 / 部署。详见 [O03-ATOMIC-ORDER-TRANSACTION.md](phase-6.md#o03-atomic-order-transaction)。下一项 O04 幂等恢复 / 精确袋同步。

O04 新增内部恢复服务及 cartRemovalSnapshot：创建响应丢失以同请求 / key 重放同订单；创建提交后独立袋事务仅删 ID / 版本 / 内容摘要匹配行，并原子保存成功检查点。修改 / 新增行保留，同步失败不回滚已提交订单 / HELD；无检查点与不可变快照可供后续重试补偿，后台调度尚未实现。成功后重放不再删除后续新行，缺袋也完成检查点。

新增 15 项、全套 424/424、静态 235，源包体仍 1213 / 97 / 45 KiB；响应丢失、多行混合、并发改袋、失败 / 零行回滚、归属及重放本地通过。没有 SDK / handler / 客户端实接、微信或真实云验收，未提交 / 推送 / 上传 / 部署。详见 [O04-ORDER-RECOVERY.md](phase-6.md#o04-order-recovery)。下一项 **O05 取消 / 到期协调与资源释放**，继续离线，真实关单竞争待 P04。

O05 内部待付取消 / 到期服务完成无支付意图或全部可信关闭后的整单释放，未知支付保持占用并返回协调要求；全部资源 / 预留 / 订单 / 最终日志 / 回执同事务，重放不重复释放。完整支付查询及其为空的条件须保护到提交，未调用外部支付或部署定时扫描。已付取消 / 拒单仅冻结协调计划；审批 / 退款资金执行待补，制作后库存不恢复，SLOT 回补缺正式策略拒绝自动处理。

新增 20 项，7 写位置异常 / 零行、多资源 9 写失败、支付意图出现 / 撤销读依赖冲突、同键重建及取消 / 到期竞争通过；全套 444/444、静态 238，源包体 1213 / 97 / 45 KiB。未改 UI、未做微信 / 云 / 资金验收，无提交 / 推送 / 上传 / 部署。详见 [O05-ORDER-CANCELLATION.md](phase-6.md#o05-order-cancellation)。下一项 **O06 订单列表 / 分页 / 详情读模型**；真实 O05 关单竞争留 P04，整阶段仍待云门禁。

O06 内部有限快照读模型及只读服务完成本人订单列表 / 详情、CURRENT / PAST / 精确状态交集和退款独立摘要。复用 HMAC CREATED_DESC 分页，每页当前用户检查、适配器按整个 seek AND 本人过滤，一致读保护到结束；历史明细 / 图片版本及完整日志轴链验证，不泄露内部证据。action 数量不变，仅目标 order.list 新增可选 view；所有动作提示禁用，Orders 页面空状态未改。

新增 22 项，全套 466/466、静态 242，包体源估算仍 1213 / 97 / 45 KiB；缺图片空引用、历史政策只读、原子创建 / 取消输出兼容通过。没有 SDK / 页面实接或微信 / 真机 / 云验收，未提交 / 推送 / 上传 / 部署。详见 [O06-ORDER-READ.md](phase-6.md#o06-order-read)。下一离线项 **O07 自提凭证 / 核销策略与权限**；码形 / 有效期 / 尝试限制仍待 E10，整阶段云门禁未通过。

O07 新增内部 pickup-credential-model / order-pickup-service，显式政策及服务端密钥下生成绑定订单 / 身份 / 环境的 HMAC 候选凭证，仅存摘要及元数据。本人 READY / PICKUP / PAID 可取，同店当前 ORDER_OPERATE 才可核销；成功完成 / usedAt / usedBy / 日志 / 回执同事务。错码计数、冷却与 FAILED 回执提交后返回拒绝，重放不重计，换 key / 服务 / 操作人不绕过；明文与原 reason 不进持久结果。

新增 27 项，全套 493/493、静态 246，源包体 1213 / 97 / 45 KiB。两种 key 竞争、两种响应丢失、撤销 / 资源变化冲突、每写异常 / 零行回滚、过期 / 续发 / 旧码、稳定 HMAC 指纹与密钥轮换及 O06 完整私有日志链通过。第一次专项修正测试短 key 和不一致交易轴后重跑。OPAQUE_TOKEN / 60 秒 / 3 次 / 1 秒 / KEEP_CONFIRMED 全为内部测试候选，不是经营决策；E10 / SLOT 政策、真实 SDK / 显示码 / 扫码 / 权限及密钥管理待补。

详见 [O07-PICKUP-CREDENTIAL.md](phase-6.md#o07-pickup-credential)。没有 UI / 微信 / 真机 / 云验收或提交 / 推送 / 上传 / 部署，既有未提交工作保留。下一离线项 **O08 配送更新 / 确认收货与订单域离线验收**，E11 异常细则及阶段六正式门禁仍待补。

O08 新增 order-delivery-service，从当前同店 READY 配送到 DELIVERING，再由本人或当前同店确认 COMPLETED，订单 / 最终日志 / 回执原子提交。只有明确测试 KEEP_CONFIRMED 政策才完成，资源不再扣或自动返还；双方式共享可信预留 / 报价 / 模式 / slotId 校验，O07 回归通过。响应丢失 / 重建、同 key 重放与异参冲突、两种角色竞争只完成一次；历史开始回执不重写已完成 / 已取消状态。重放也验证当前授权及原提交日志证据。

配送详情增加来源于历史事实的预计时段 / 门店自送 / 联系门店内部提示，无真实电话不造号码；当前 UI 未接入，联系和确认均关闭，不创建未定异常状态。27 项新增、专项 54/54、全套 520/520、静态 251，源包体 1213 / 97 / 45 KiB。两处样例时间字段不足修正夹具后通过，真实已付审批 / 关单 / 退款竞争没有因本地取消注入而被宣称通过。

详见 [O08-ORDER-DELIVERY.md](phase-6.md#o08-order-delivery) 和 [PHASE-6-REVIEW.md](phase-6.md#phase-6-review)。O01–O08 可离线范围已推进，整体正式门禁 / SDK / 页面 / E10 / E11 / SLOT 政策仍待补；没有本轮 UI、微信 / 真机 / 云验收或提交 / 推送 / 上传 / 部署，既有未提交工作保留。下一项阶段七 **P01 支付接入 / 配置核查**，先推进可离线边界，实际账号 / 商户关联与真实方案待条件。

---

<a id="phase-6-review"></a>

## 原记录：PHASE-6-REVIEW.md

<a id="phase-6-review--阶段六-order-离线验收2026-10-05"></a>
# 阶段六 Order 离线验收（2026-10-05）

当前分支 codex/ui-refresh-2026-10-05，全部既有未提交代码 / UI 保留。已推进至 O08 可离线部分，**整体正式门禁未通过**，订单创建 / 付款 / 核销 / 配送确认仍未开放。

| 任务 | 本地已验证 | 正式待补 |
|---|---|---|
| O01 状态命令 | 冻结角色 / 版本 / 90 组状态方式矩阵、日志草稿及必需原子效果 | 真实 handler、接单 / 制作 / 备妥执行、可信资金与审批领域效果 |
| O02 创建快照 | 可信报价重核验、双方式订单 / 独立明细、确定性编号与不可变事实 | SDK 保存、编号唯一约束、数据库禁止直接改历史事实 |
| O03 原子预留 | 串行内存整单 HELD、报价消费 / 首日志 / 回执、容量竞争和每写回滚 | SDK / 索引、真实并发、正式库存 / 付款保留 / 预约参数 |
| O04 恢复 / 袋同步 | 创建响应丢失重放、行版本精确删袋、独立检查点 / 重建 | 云 Cart、客户端 key / 查询恢复、后台补偿及 SDK 原子性 |
| O05 取消 / 到期 | 无支付意图或全部可信关闭摘要条件下本地释放、已付协调计划 | P04 可信查 / 关单及迟到款、审批退款执行、正式回补策略 / 定时认证 |
| O06 本人订单读 | HMAC 分页、CURRENT / PAST / 退款、明细与完整日志链、隐私 | 云本人索引查询 / 一致读、媒体真实访问、Orders / Detail 页面实接 |
| O07 自提核销 | 显式候选政策、本人签发 / 同店核销、持久限速、一次完成 / 回滚 | E10 码形 / TTL / 尝试限制 / 续发解锁、正式秘密 / 政策加载、展示 / 扫码 |
| O08 配送完成 | 同店开始、本人或同店完成、日志 / 回执原子写、双方式资源 / 历史兼容 | 正式 SLOT 完成政策、SDK / 当前角色撤销竞争、电话 / 异常 E11 与页面联系门店 |

最新 **520/520 测试通过**，**251 文件静态检查通过**；O08 新增 27，O07 / O08 专项 54/54。主包 / features / legacy 源估算 1213 / 97 / 45 KiB，无本轮小程序 UI 或包体素材变化。来源均为 tests 下的纯模型或串行内存适配器；实际唯一索引 / 并发 / 云持久化仍没有证据。

O03 的本地事务创建输出与 O05 未付取消输出、O07 核销私有事件及 O08 配送日志都兼容 O06 历史读模型。已付 / 接单 / 制作 / 备妥和已付审批生命周期在隔离夹具中构造，不进入 callable 函数，不称为完整真实支付订单闭环。未补齐的资金、资源确认 / 消耗或审批效果不能用纯计划单独应用，也不能以末段 READY 样例验证代替上游执行。

O07 / O08 采用显式测试 KEEP_CONFIRMED 完成策略，不代表正式返还时段决策；付款、报价 TTL、提前量、库存、正式照片、地图、电话等经营缺项仍按 [EXTERNAL-DEPENDENCIES.md](../../EXTERNAL-DEPENDENCIES.md) 登记。无新增骑手或自动收货，未选择 / 部署实际 Payment 方案；内部结果、disabled 动作和联系方式提示均不作为实际业务成功。

真实验收逐条见 [ORDER-CLOUD-ACCEPTANCE.md](../../ORDER-CLOUD-ACCEPTANCE.md)。下一项阶段七 **P01**，可先做支付接入边界 / 配置核查与隔离；实际账号、商户关联、支付路径选择、云连接和受控实付待外部条件。后续不得回退旧定金 / 尾款或增加前端 simulate 付款入口。

本轮未做微信 / 真机 / 云验收，没有提交 / 推送、小程序上传或部署。

---

<a id="order-cloud-acceptance"></a>

## 原技术文档的验收/过程记录：ORDER-CLOUD-ACCEPTANCE.md

# 真实订单保存、唯一索引与资源占用验收

2026-10-05。用户曾要求先完成这三项真实验收；随后明确开发 / 测试云环境尚未开通，授权继续离线推进。**真实验收结果仍为尚未执行，不判定通过；离线任务恢复，不再暂停等待云环境。** 本文保留开通后的实际验收要求。

## 2026-10-08 更新

开发环境存在与关联已由微信 CLI 验证（wx154f791a17268ace / cloudbase-d8gwtxzm64150b7e0），函数列表 total=0。配置/部署交其他窗口，主流程优先补 I03/I07、数据层，再执行本表真实订单验收。见 [配置交接与补验收顺序](phase-2.md#cloud-environment-handoff-2026-10-08)。以下工作区记录保留；环境开通不改变订单验收的 NOT_RUN 状态。

## 当前核查证据

| 核查项 | 工作区事实 | 结论 |
|---|---|---|
| 有效运行配置 | miniprogram/runtime-config.js 为 shell / development，development / test / production 环境 ID 均空；无 config.local.js | 当前项目未配置可调用云环境；不能据此断言用户账号未开通 |
| 云函数 | cloudfunctions 只有 user / store 两个函数；不存在 order 目录；README 记录尚未部署 | 没有真实订单写入入口 |
| 创建模型 | order-creation-model 只输出 OFFLINE_ORDER_CREATION_PLAN，callable=false；未写订单 / 消费报价 / 占资源 | O02 的 395 项通过不能作为真实保存证据 |
| 客户端入口 | services/cloud.js 仅 allowlist user.me / store.health | 未开放订单调用，不能以页面流程验真实订单 |
| 唯一约束 | TRANSACTIONS.md 是索引候选；模型只列 orderNoMustBeAbsent / requiresUniqueOrderNoIndex | 未获得实际索引状态及重复写入拒绝证据 |
| 资源占用 | resource-model 及 O03 内部事务服务 / 串行内存适配器已验证；无订单 SDK 事务执行器 | 仍未验证真实余额、竞争、提交与回滚 |

真实条件核查时只读配置、代码和设计资料，未连接远程账号或修改实际集合。用户随后确认云环境未开通，暂不需要继续请求环境 ID；开通后再补配置及实际连接。O03 后续本地事务测试只操作隔离内存数据，不能记作本表的真实证据。

## 必须先补齐

1. 明确开发 / 测试云环境及可用账号 / 工具连接，实际核实 AppID / 平台身份和数据库权限。环境未提供时不填写猜测值；无需用户提供私钥或 API 密钥。
2. 实现并验证真正的订单云 handler、服务端可信数据加载与 SDK 原子执行，随部署包携带依赖。订单 / 明细 / 全部预留及计数 / 首日志 / 报价消费 / 回执同一事务，不能只落订单头。
3. 验证实际 SDK 的唯一约束和 create-if-absent 语义，创建所需集合 / 索引并读取其真实状态；不把索引设计文件或确定性哈希当数据库约束。
4. 准备可隔离清理的测试门店 / 库存 / 半小时自取与配送资源、可信报价与测试用户。测试经营参数与正式配置分离；不占用门店正式库存、调用真实付款或发布示例商品。

付款保留、报价 TTL、真实地图 / 图片等正式参数仍未齐。可以在明确隔离的真实测试环境验 SDK 持久化与资源事务，但不能因此宣称正式经营链路已通过。此前只有两个最小 handler，完成订单真实验收需要补相关上游读取 / 报价 / 身份能力，不是给现有纯计划加成功标志。

## 真正执行的用例与证据

| 组别 | 用例 | 必须从真实环境读回的证据 |
|---|---|---|
| 保存 | 有效本人报价创建自取 / 配送待付订单，多行快照；修改当前资料后重读历史订单 | 实际函数请求 / 回执、订单头 / 全明细、金额 / 快照、首日志、消费报价及回执；历史事实不变 |
| 权限 / 变化 | B 不能消费 A 报价；过期 / 已消费 / 改价 / 旧版本拒绝 | 固定拒绝结果；无新增订单、日志或资源占用 |
| 唯一性 | 同 key 同参重试；同 key 异参；不同 key 同一 quote；直接制造重复 orderNo | 原订单唯一；参数冲突；报价只消费一次；数据库实际拒绝重复编号，原记录未被覆盖 |
| 最后库存 | 一个库存，两笔不同有效报价同时创建 | 恰一笔成功，另一笔明确失败；库存计数 / 预留 / 订单读回一致，不超卖 |
| 最后名额 | 自取最后一名额、配送最后一名额竞争 | 自取上限 3、配送上限 1，独立计数；两笔竞争仅一成功 |
| 原子回滚 | 在明细、日志、报价或回执写入处受控注入失败 | 订单、行、预留、计数、日志、报价消费和回执均无部分提交；重试不重复占用 |
| 时效 / 恢复 | 保存后响应丢失重试；截止不晚于预约提前量边界 | 回同订单 ID；资源仅占一次；实际 paymentDeadlineAt 合法。到期释放及真实关单竞争另按 O05 / P04 验收 |

记录必须含实际环境 ID、运行时 / SDK、执行时间、索引状态、调用结果及执行前后读回；隐私字段脱敏。清理仅针对本轮明确登记的测试记录及资源，清理后复核，不清空集合或删除正式数据。以上用例目前全部 **待执行**，没有填写虚构证据。

## 继续条件

用户已授权云未开通时继续离线 O03 / 后续任务，不再等待环境信息；真实三项及回滚 / 并发通过后才更新正式云验收状态。O03 409 项通过是本地适配器证据，三项真实状态仍未通过。既有代码和未提交工作保留，没有上传 / 部署。

O04 更新：424 项本地测试及 235 文件静态检查通过，新增响应丢失恢复、袋条件移除 / 检查点原子写与并发改袋回滚。依然只有内存适配器，没有云 handler / SDK，以上真实用例全部待执行。云开通后补验同步前后 Cart / order.cart.sync 回执、原订单与资源读回；注入提交后响应丢失、同订单重复 / 进程重启、修改 / 新加行、缺袋后重建及用户撤销竞争。证明新行保留且占用不增加；后台补偿调度与客户端实接另补，不能称为已自动恢复。下一离线任务 O05，真实关单竞争仍待 P04。

O05 更新：待付取消 / 到期服务及已付协调计划完成内存事务测试，真实验收仍未执行。新增真实待补：关闭记录的可信来源 / 归属与金额、支付意图查询为空期间并发创建、入账 / 用户撤销与取消冲突、整单计数 / 预留 / 订单 / 日志 / 回执一致释放、同任务重复 / 响应丢失、关闭销售资源释放及其他订单占用保留。未知资金仍占用，真实关单 / 迟到款待 P04 / P06；时段回补政策、定时认证 / 部署和审批资金执行另补。下一离线项 O06，不把本地测试当实际退款或云释放证明。

O06 更新：本人列表 / 稳定分页 / 历史详情和只读服务本地通过，当前 Orders 仍为空状态，无 SDK / handler / 页面接入。真实待补：A/B 隔离 / 禁用用户逐页拒绝、索引及整个 seek AND 本人 / 状态过滤、创建时间相同边界与状态变化刷新、订单 / 明细 / 日志 / 申请一致读、用户撤销竞争、历史图片版本访问 / 退役 / 缺失、公开投影及上下文动作门禁；不能以本地快照、人工生命周期样例或 disabled 提示证明真实订单查询 / 付款能力。下一离线项 O07，E10 经营凭证政策未确认前保持关闭。

O07 更新：内部候选凭证 / 核销服务的本地事务与防重放通过，正式 E10 / SLOT 完成策略未确认，展示 / 扫码未接入。真实新增待验：服务端秘密与政策可信加载 / 生效、本人及跨店隔离、签发响应丢失 / 重复读取、过期 / 续发 / 老码、同键和异键核销竞争、角色撤销 / 资源变化冲突、错误计数提交后返回与共享冷却 / 锁定、稳定回执指纹及旧密钥保留、每写失败回滚 / 提交时效、明文不入日志与公开时间线隐私。正式网络拒绝须在事务外转换，不能回滚错码数；测试 KEEP_CONFIRMED 不替代经营策略或实际资源证明。以上全部 **待执行**，最新 493 项本地测试和 246 文件静态检查不能替代 SDK / 真机证据。下一离线项 O08。

O08 更新：内部配送开始 / 本人或同店确认及日志 / 回执本地通过，最新 520 项测试 / 251 文件静态检查。真实待补：当前本人 / 同店授权与撤销冲突、开始 / 完成同键响应丢失、顾客与门店并发仅一次完成、已付审批取消 / 退款实际竞争、完整资源 / 报价读依赖与每写失败回滚、正式完成 SLOT 政策及发布配置生效、详情历史链 / 预计时段 / 真实电话和联系门店实机路径。PAID / READY / 审批取消注入只是隔离夹具，无资金或上游执行器证据；没有展示虚构客服号码或异常配送规则。阶段六真实用例全部仍待执行，矩阵见 [PHASE-6-REVIEW.md](phase-6.md#phase-6-review)。下一项 P01，真实商户关联 / 云 / 单一支付方案仍待条件。

