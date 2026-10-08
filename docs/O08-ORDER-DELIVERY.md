# O08 配送更新 / 确认收货（2026-10-05）

状态：可离线部分通过；整体真实订单门禁尚未通过。开发 / 测试云环境未开通，没有 SDK / handler、订单页面实接、真实配送 / 已付 / 微信验收。

## 内部配送事务

新增 order-delivery-service，execute(domain,event,principal) 复用已有 admin.order.transition 的 START_DELIVERY / COMPLETE_DELIVERY 以及 order.delivery.confirm。60 action、普通客户端 allowlist 和已有 UI 均未改。没有骑手调用、自动收货、假支付事件或新增失败配送状态。

START_DELIVERY 仅当前同店 ORDER_OPERATE 角色，从 READY / DELIVERY / PAID 到 DELIVERING。COMPLETE_DELIVERY 仅配送中已付订单，可由本人顾客入口或当前同店 ORDER_OPERATE 商家入口完成；管理员入口始终检查角色，不因订单属于自己而跳过权限。可信 principal 不能由 event 的角色 / 身份替代；当前 ACTIVE 用户与用户版本逐次重读。

订单、最终 before / after 日志、SUCCEEDED 幂等回执同一事务；完成同时写 COMPLETED / completedAt / 版本。日志记录可信 CUSTOMER 或 STORE 操作人和固定文案，构成 RECORD_DELIVERY_CONFIRMATION / RECORD_FULFILLMENT 的履约证据。原 reason 不入日志，不保存未封口的 requiresFinalAfter 或整个命令计划。未处理的新增领域效果必须拒绝，不能只改状态后忽略必需副作用。

付款 / 退款轴和金额、商品明细、联系人 / 地址 / 门店 / 预约快照保持原值；退款进度独立于履约完成。订单已取消、未付、未备妥、未配送、非本人 / 他店或旧版本均拒绝；已付取消仍需 O05 商家审批 / 资金协调，配送服务不替代审批、关单或退款。

## 资源与未定政策

将 O07 已有的履约资源证据抽到 order-fulfillment-resources，双方式共同检查当前消费报价、完整资源清单 / 预留、门店与模式、预约 slotId、数量与计数。STOCK 必须已 CONSUMED，唯一对应方式 SLOT 必须 CONFIRMED 且 quantity=1；资源销售已关闭不阻止合法已有订单履约。补充报价模式、当前预约 ID / 版本和稠密数据检查，O07 回归继续通过。

开始配送验证上述证据但不修改资源。完成必须显式注入 `{version, slotCompletion:'KEEP_CONFIRMED'}` 的内部测试政策，缺少政策拒绝完成；不自动扣第二次库存、恢复消耗库存或返还名额。KEEP_CONFIRMED 是测试策略，E06 / D05 正式完成 SLOT 政策仍待决定，不用测试策略补正式经营配置。

## 幂等和恢复

同 key 同参重放原版本结果，提交后响应丢失或服务重建不重复完成；同 key 异参拒绝，不同 key / 操作人竞争只有一次迁移，第二笔旧版本拒绝。重放仍检查当前本人 / 门店授权，并加载对应已提交日志核对 actor、command、前后轴、版本和时间；日志缺失 / 损坏不能返回成功。

已开始配送后，再完成或取消不会让旧开始请求改回 DELIVERING；旧 key 只读返回其历史开始回执。完成回执还要与当前 COMPLETED / completedAt 证据相容。回执只存 entityId / version / errorCode。配送载荷无凭证，沿用标准请求 SHA 摘要；O07 COMPLETE_PICKUP 采用独立稳定 HMAC 域，未来统一 admin 分派必须按命令保持各自指纹规则，不能互换破坏重试。

## 联系门店提示

delivery-support-model 从已授权的历史事实生成详情 deliverySupport；配送为 provider=STORE / windowNature=ESTIMATED，说明“配送由门店自行完成，预约时段为预计配送时间。遇到配送问题，请联系门店。”自取返回 null。仅详情带必要历史门店电话，不向订单列表增加联系人或地址。

联系方式不造号码，缺值为空且 CONFIGURATION_REQUIRED；有历史电话仍为 disabled / SERVICE_NOT_CONNECTED，因为真实订单查询及页面呼叫处理尚未接入。这是未来异常联系路径的内部提示，不是已经拨号或客服开通；正式电话 E04 / 异常配送责任细则 E11 与实机交互仍待补。不猜自动取消 / 重送 / 理赔 / 指定分钟送达规则。

## 会话义务与证据

runTransaction 提交后才 resolve，任何异常 / 条件写零行全部回滚。需要 readUser / readOrder / readReceipt / readDeliveryState / assertDeliveryReads / saveOrder / insertLog / insertReceipt。readDeliveryState 在同一可信环境事务读取当前角色、消费报价、完整预留 / 资源及本单日志，顾客入口先检查父订单本人权限。

assertDeliveryReads 与真正 SDK 事务必须将用户 / 角色范围和撤销、订单、报价、回执、日志、完整预留 / 资源读集及查询完整性保护到提交；不能只相信传入版本。正式政策加载 / 生效和缓存撤销须真实裁决。基础写 3，实际权限 / 读集栅栏、字节 / 重试成本待 SDK 验证。末尾复核服务端时钟，不以客户端时间补履约日期。

新增 **27 项**，覆盖合法双角色 / 非法矩阵、本人 / 同店隔离、字段注入、完整资源、显式政策、金额 / 快照不变、两种响应丢失、同键 / 异参、并发一次完成、撤销 / 资源 / 报价冲突、所有 3 写位置异常与零行、取消竞争、退款独立、损坏回执日志、双方式历史链和联系门店提示。O07 / O08 专项 **54/54**，全套 **520/520**，静态 **251**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。

首轮取消样例未同步测试时钟，增强时间守卫后另一状态样例缺 completedAt，均修正夹具后重测，未放宽校验。Paid / 接单 / 制作 / 备妥及取消审批结果只在隔离夹具注入：没有真实 Payment、接单 / 制作 / 已付审批执行器或资金写入。取消竞争是本地订单读依赖冲突证明，不是实际退款 / 关单竞争证据。

所有 OFFLINE_DELIVERY_RESULT 的 cloudVerified / callable / fulfillmentAllowed=false；未接网络、微信工具 / 真机或 Storage，没有提交 / 推送 / 上传 / 部署。完整阶段矩阵见 [PHASE-6-REVIEW.md](PHASE-6-REVIEW.md)，真实待验见 [ORDER-CLOUD-ACCEPTANCE.md](ORDER-CLOUD-ACCEPTANCE.md)。下一项阶段七 **P01 支付接入与配置核查**，先推进可离线边界，真实平台方案 / 商户关联 / 云环境仍待条件。
