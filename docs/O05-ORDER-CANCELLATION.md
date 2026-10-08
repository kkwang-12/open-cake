# O05：取消、到期协调与资源释放

2026-10-05。完成可离线部分：待付取消 / 到期内部事务服务及已付取消协调计划。当前仅串行内存适配器，没有真实 SDK、Payment 关单、定时任务部署、审批 / 退款执行器或客户端接口，不判定完整 O05 云验收通过。

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

## 到期入口

`expire(orderId,invocation)` 仅内部入口；工厂注入的 verifyExpiryInvocation 必须明确返回 true，未提供则拒绝。正式适配器须验证真实服务端触发身份，不可把客户端 actor / capabilities 当授权。当前测试只使用对象身份校验，未实现真实 SYSTEM 身份工厂或定时扫描部署，不新增公开 action / allowlist。

服务端 now 达到 paymentDeadlineAt 才尝试取消；早于截止或已付 / 已履约 / 已由顾客取消的任务 SKIPPED，不写回执或日志。到期仍遇未知支付状态则等待协调，不能因 TTL 过期释放。成功任务用内部 order.expire / orderId / 截止快照构造回执，重复执行重放；用户与到期同时处理，只能一方改变订单版本。

## 原子释放

`order-cancellation-model.js` 的 planCancelledResources 使用已消费报价的不可变聚合需求校验整单预留集合，核对确定性预留 ID、order / store / resource / 数量、当前版本及解析状态、唯一 SLOT 与履约方式。不能只读到部分预留就按完整订单成功。资源计数必须足够且版本不能溢出；关闭销售的资源仍允许合法释放，不重新开放销售。

待付订单的预留必须全部 HELD；一个事务更新全部资源计数、HELD→RELEASED、resolvedAt / resolutionLogId、订单 CANCELLED / 时间 / 脱敏原因 / version+1、最终 before / after 日志及成功回执。任一异常或零行影响数整笔回滚。订单明细、报价消费和购物袋不变；取消不自动把已下单行重新加回袋，也不退实际资金。

事务会话要求：readUser / readOrder / readReceipt / readCancellationState / assertCancellationReads / updateResource / updateReservation / saveOrder / insertLog / insertReceipt。readCancellationState 必须加载全部本单支付意图、已消费报价、所有预留及对应当前资源。assertCancellationReads 保护订单 / 用户 / 报价 / 支付集合与版本 / 预留 / 资源读依赖及支付意图查询为空的条件直到提交，不能只是事务外查询或检查已知 ID。所有写返回影响数 1；条件失败不能忽略。

设 k=不同 STOCK 资源数+1 个 SLOT，基础取消写预算为 **2k+3**（资源 k、预留 k、订单 / 日志 / 回执各 1）；两个资源是 7 次，三个资源是 9 次。真实权限栅栏、SDK 查询 / 重试 / 字节预算额外核验。

## 已付取消、拒单与制作后的资源

planPaidCancellationCoordination 复用 O01 顾客所有权、商家当前同店 ORDER_OPERATE + REFUND_APPROVE、PENDING 申请 / 版本和冻结政策。本人申请只要求创建审批记录，不改变履约和资源；商家批准取消按批准金额生成必需效果，拒绝申请保留履约；PAID 拒单要求剩余全部实付退款，已有成功部分退款只补差额，未决 / 失败退款不能另建预算。

输出仅内部不可执行计划。取消审批记录、资源、订单、正金额退款意图 / 预算、日志、回执必须最终由资金执行器同事务协调；这里没有保存申请 / 审批或退款意图。零退款不创建退款意图，但仍要求商家复合权限及全部非资金原子效果，不能仅把资源提案单独保存。

制作前 CONFIRMED 资源可提案释放；制作后 STOCK 必须 CONSUMED，始终保留已消耗计数，不因退款恢复。未消耗 SLOT 的制作后取消回补规则仍待 E06 / D05：缺明确策略返回 CONFIGURATION_REQUIRED。测试中的 RELEASE_UNCONSUMED / RETAIN 是内部分支输入，**没有发布为经营政策**；后续可信配置加载器须验证适用政策版本。已消耗或已释放记录不再次扣减。迟到款保持取消、登记全额补偿的规则复用 D01，真实入账 / 退款及关单竞争留 P04 / P06。

## 验证与下一步

新增 20 项：双履约释放、成功响应丢失及重建、7 处异常 / 零行逐一回滚、多资源 9 处写失败、未知 / 已创建支付、关闭证据与版本核对、精确到期、任务重放、顾客与到期竞争、其他订单占用保留、关闭资源释放、缺预留 / 下溢 / 溢出、权限 / 旧版本、支付意图出现 / 用户撤销读依赖冲突、已付申请 / 拒单、制作后库存与时段政策、零退款及只读不可变计划。

全套 **444/444**，静态 **238**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只是本地内存事务与领域计划，未操作本机袋 / UI / 微信 / 真实云 / 资金，未提交 / 推送 / 上传 / 部署；既有未提交改动保留。

下一离线项 **O06 订单列表、分页与详情读模型**。真实 SDK、SYSTEM 触发认证 / 调度、Payment 关闭与迟到款、已付审批 / 退款执行、制作后 SLOT 政策和整阶段门禁继续待补，按 [真实订单验收](ORDER-CLOUD-ACCEPTANCE.md) 登记。
