# A06 取消审批 / 退款异常 / 审计读取

2026-10-06。**可离线部分完成，整体真实验收未通过**。37 项专项、受影响组合 212 项通过；内部事务覆盖取消申请、审批、退款额度预留、原号重试及商家财务 / 补偿 / 审计读取。未修改现有 UI；cloudVerified / callable / operationsAllowed / externalRefundExecuted 均 false，没有 SDK / handler / 客户端 allowlist 或资金调用。

实现：[计划 / 校验](../cloudfunctions/_shared/merchant-resolution-model.js)、[事务服务](../cloudfunctions/_shared/merchant-resolution-service.js)、[财务读服务](../cloudfunctions/_shared/merchant-finance-read-service.js)、[测试](../tests/merchant-resolution.test.js)、[组合夹具](../tests/fixtures/merchant-resolution.js)。前置边界见 [A01](A01-ADMIN-AUTHORIZATION.md)、[A02](A02-MERCHANT-ORDERS.md)、[O05](O05-ORDER-CANCELLATION.md)、[P06](P06-REFUND-RECOVERY.md)、[P07](P07-MAINTENANCE-RECONCILIATION.md)。

## 取消申请和审批

O05 已付取消此前只有计划，A06 补齐内部 requestCancellation 对既有 order.cancellation.request 的真实本地适配器保存：本人当前用户 / principal / 订单所有权、订单版本、完整日志 / 付款 / 退款 / 当前请求校验后，原子插入一个 PENDING cancellation_requests、递增订单 version、追加 REQUEST_CANCELLATION 日志、审计和回执。订单 orderStatus 不改变，不退款或释放资源。同订单只能有一个 PENDING，必须保护完整谓词到提交。原因先脱敏，不持久化测试电话。

申请 ID 由环境 / app / order / requestLogId 全元组确定，requestLogId 关联原请求日志，reviewLogId 初始 null；审批一次设置后固定。新增两字段用于严格校验来源与审批历史，旧缺字段离线记录需重建或受控迁移，不能从文案或缺失数据补造已审批事实。

复用 admin.cancellation.review。REJECT 要当前同店 ORDER_OPERATE；APPROVE 要**同一条**当前授权同时有 ORDER_OPERATE + REFUND_APPROVE，不能拼接两条角色。受权用户 / store / role 和完整订单 / review / funds / resources / logs 与负读条件保护到 commit；review 头字段或客户端 decision 不构成授权。

审批读取当前订单，不按申请时状态盲目取消。批准须显式退款整数分，可为 0，不能超过实付减已退减预留；拒绝不得带 refundCents。批准原子写请求 APPROVED / 审批人 / 时间 / 脱敏理由 / 金额 / refundId、订单取消、必要资源解占用、正金额 PENDING / RESERVED 退款意图、最终轴日志、审计与回执。拒绝只记录 REJECTED 和订单版本 / 日志，不改变履约状态、退款或占用。

订单已经履约完成时批准被拒绝，可显式拒绝申请并留下记录。请求不会因商家其他操作静默删除。制作前 CONFIRMED 库存 / SLOT 按原模型释放；已经 CONSUMED 的库存不回补，制作后 SLOT 回补需要注入已确认策略。没有正式策略时拒绝；测试的 RETAIN / RELEASE_UNCONSUMED 不是已发布经营批准。禁约 CLOSED 资源在解占用时保持 CLOSED，不重新开放。

admin.refund.approve 仅需当前同店 REFUND_APPROVE，沿用 V1 STORE_APPROVED_AMOUNT：明确金额批准退款，不改履约状态、商品 / 地址 / 预约历史或占用。同一订单最多一笔未决预算，PENDING / FAILED 期间拒绝另建退款；已确认部分到账后可再批准剩余金额。所有金额从完整 paid payment / refunds / ordered logs 重验，不以 UI 或客户端成功回调为证据。

## 退款异常处理

复用既有 admin.refund.retry（输入 refundId / expectedVersion / reason / idempotencyKey），没有新增客户端 SUBMIT / QUERY 选择权。当前同店 REFUND_APPROVE，加载原付款身份 / 归档 profile、完整退款账本、当前退款版本及尝试集合后，在**同一个 A06 事务**内调用 P06 计划：

- 无尝试时登记首个 SUBMIT；可信结果证明 FAILED 且最新尝试也 FAILED 时，才能登记同号 SUBMIT。
- 已发送、未知、已受理或其他未决结果先 QUERY，不另建 refund、不换 outRefundNo、不增额度预留、不放回余额。
- 查询在途且未到注入 queryRetryAfterMs 时不再登记尝试；超时只重查同号，不取得第二次发送权。
- 已 SUCCEEDED 不再发送或记账。P06 接收独立可信结果后才可原子到账，重复结果不重复增加 refundedCents。

新增尝试、商家审计和成功回执原子；查询在途 / 已完成的观察只写审计 / 回执。退款 version 本轮重试不递增，CommandResult.version 是输入时的当前退款 version，区别于批准操作的订单 expectedVersion + 1。尝试 ID 使用环境 / refund / operation / A06 receiptId，保持 P06 连续 sequence；原请求重放验证当前用户 / 角色 / 账本并重现原标识，**transportRequired=false**，丢响应不能触发二次 SUBMIT。新 key 仍由当前 P06 状态决定查询或发送。

没有实际 transportPlan / 钱款执行、平台响应认证或任务发送器。transportRequired 仅表达可信服务端接线需求，运营 / 成功反馈仍关闭；后续发送器须按尝试持久状态处理发送占权、丢响应和查询恢复，不能把接口返回当成已退款。不会人工把 P07 job 标记 DONE / 清租约 / 重置尝试或宣称补偿成功。

## 财务 / 补偿 / 审计读取

refunds.list / refund.get 要 REFUND_APPROVE。完整同店有限快照逐订单校验资金、连续日志、review 来源及退款尝试；不能只看 refund.status 推断资金。退款 DTO 只有订单号 / ID、状态、金额 / 预算、到账时间和白名单尝试摘要，省略电话、地址、付款交易号、平台退款号、profile / 原因全文 / 原始异常；错误只投影已知 REFUND_PROVIDER_FAILED，其余不透传原始字符串。

本轮新增**仅 PLANNED** 的 admin.exceptions.list，REFUND_APPROVE、storeId、CREATED_DESC 分页；目标 registry 现为 **61** 项（2 个最小旧函数、59 个 PLANNED）。此前文档按历史轮次保留 60 项记录，最新契约以 [API_NETWORK](API_NETWORK.md) / registry 为准。allowlist 不变。exceptions.list 校验 P07 job 与当前同店 order / payment / refund、环境 / app / merchant / provider、确定性 ID 和当前实体版本；返回未 DONE 的在途 / 待审任务和租约是否过期，**不返回 leaseToken**，lastOutcome 仅受控枚举。

REFUND_QUERY 指向原退款重试需求，其 enabled=false；付款查询、付款异常和已关闭付款的 ORDER_CANCELLATION_REVIEW 指向 P04 / O05 服务器恢复，无退款动作，不虚构订单已取消。跨店来源、不完整资金、未知任务 / scope / 原始 outcome 被拒绝；不执行补偿、改账或发告警。运行日志 / 告警送达 / 分配负责人 / 人工处置 UI 和真实任务仍待 P07 / A07 接线。

audit.list 单独要求 AUDIT_READ，不因拥有退款权限自动可读审计。校验 scope、storeIds、目标 / 版本、真实 actor、时间和结果，投影动作、当前请求门店、目标版本、脱敏依据和 trace；多店审计不泄露其他 storeIds，原 changes 不直接透出。A01 / A04 / A05 的旧审计没有 outcome 时返回 null，不推断成功；A06 已提交审计显式 SUCCEEDED。网络拒绝 / 失败尝试的固定 code / requestId 记录和实际运营入口仍待 handler，不声称已保存回滚事务的失败审计。

分页 HMAC 绑定环境 / app / 当前人员 / grant / 店 / 筛选 / 完整投影修订与过期时刻；授权撤销、筛选或数据变化使旧游标失效。退款 / 审计 / 补偿页无顾客联系方式；确有履约需要的联系方式仍通过已有受权订单详情独立读取。

## 事务与验证边界

写服务适配器要求 readUser / readAccessState / readOrder / readRefundHeader / readResolutionState、receipt / audit / refund-number 读取、assertResolutionReads、insert / saveCancellation、insertRefund / insertAttempt、updateResource / updateReservation、saveOrder / insertLog / insertAudit / insertReceipt。相关集合、唯一号 / 未存在日志 / 回执 / 审计、原付款 profile 和当前权限均须一致并保护至 commit；每写必须恰好 1 行。不能先审批后另开事务预留资金，不能用独立 P06.prepare 绕过原权限事务。

读服务单独 readFinanceState / readScopedAudits / assertFinanceReads；明确 complete=true 的**可信有限快照**，不能接受客户端或把 SDK 分页片段标为完整。生产有界查询、预算、索引、完整谓词与证据一致性尚待真实 SDK。本轮仅串行内存，不能证明实际并发。订单和付款历史投影复用既有服务；没有 UI / Storage 接线。

典型申请 / 退款批准 5 写、两类资源的制作前正金额取消批准 10 写、发送 / 查询尝试 3 写；在途 / 已完成重试观察 2 写。原 key 重放校验原 expectedVersion、log 轴的具体转换、request / intent / attempt 的确定性身份和完整记录链。不能把 self-consistent digest 当成来源证明，已用篡改 effect 和 transition 的负向测试验证。

37 项专项、受影响组合 **212/212**；最终全套 **928/928**、静态 **307**，主包 / features / legacy **1239 / 139 / 45 KiB** 不变。执行前后源码指纹一致，见 [证据](qa/a06-2026-10-06/summary.md)。

失败证据保留：first 27/28，剩余是测试错误地要求回滚 beforeCommit 外部订单版本变化，已改为保留外部变化并断言新退款未提交。replay-before 2 个探针复现新实现未拒绝已改 effect.reviewId 与自洽但错误的原 transition，已加具体操作 / 金额 / 状态绑定。affected-first 204/205 的失败为新增 retry 定义与既有定义重复、计数误期待 62；已移除重复，实际只新增 exceptions.list，61 项。affected-final 209/210 剩余是模拟履约更新未来于夹具时钟，校正测试时间；最终 affected-verified 全通过。复查补齐 P07 的 CLOSED 付款订单任务映射与财务已付来源、原始异常白名单。上述不是云端 / 真机事故。

| 真实用例 | 验收目标 | 当前 |
|---|---|---|
| RF01 | 平台身份、跨店 / 顾客 / 撤销、当前角色直到提交 | NOT_RUN |
| RF02 | SDK 原子审批、唯一 PENDING / 退款号、回滚与订单履约竞争 | NOT_RUN |
| RF03 | 已消费库存 / SLOT 正式回补策略，禁约 / 停业后的历史处置 | NOT_RUN |
| RF04 | 原号退款 / 查单、网络丢响应、回调 / 查询 / 并发重复真实资金 | NOT_RUN |
| RF05 | 归档商户 profile、真实 P07 补偿 / 对账 / 告警和租约竞争 | NOT_RUN |
| RF06 | 微信请求 / 审批 / 退款页、实际提示、分页与日志脱敏 | NOT_RUN |
| RF07 | E01 / E12 / P08 / A07 完整实际运营门禁 | NOT_RUN |

真实资料 / 云 / SDK / 索引 / 资金 / 页面 / 真机及 RF01–RF07 全部待补。没有 Git 提交 / 推送、prepare-cloud、部署或资金 / 对外消息操作，所有既有未提交成果保留。下一项 **A07 Admin 可离线阶段评审及真实运营 / 旧入口退役清单**。
