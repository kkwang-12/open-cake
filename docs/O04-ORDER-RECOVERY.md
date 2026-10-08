# O04：订单恢复与购物袋精确同步

2026-10-05。完成内部服务与本地内存事务验证；真实 SDK、handler、云持久化和客户端接入尚未实现。用户允许云未开通时继续离线，既有 UI 与全部未提交成果保留。

## 恢复边界

`order-recovery-service.js` 的 `createOrderRecoveryService({orderService,cartSyncService})` 先调用 O03 创建服务，再调用独立的袋同步事务。创建结果未知时直接返回错误，不删除袋；调用方必须重用原 quoteId / expectedQuoteVersion / idempotencyKey。相同请求重放原订单及原版本，不重新占用资源；同 key 异参冲突。创建事务已提交而袋同步失败时，返回内部 `cartSynchronization.status=PENDING / errorCode=CART_SYNC_PENDING`，不撤销订单、消费报价或 HELD。权限错误直接拒绝，异常详情不输出。

O02 创建订单时从可信 Cart 捕获不可变内部 `cartRemovalSnapshot`，与 `cartSelectionSnapshot` 的行顺序和版本一一对应。新增字段只属于订单内部恢复证据，不改变 Quote 事实结构或公开 DTO。每行只存 lineId、lineVersion 和 SHA-256 内容摘要；摘要覆盖 lineId / productId / skuId / quantity / cakeMessage / messageFingerprint / normalizationVersion / addedAt，不存另一份明文留言。

同步读取当前本人同店 Cart；只有行 ID、行版本及内容摘要全匹配才整行删除。未选、新增、修改数量 / 留言 / SKU、删除后以新 ID 重加的行保留；不按下单数量扣减已经合并新增数量的行。全局袋版本允许增加，在最新版本条件下保存剩余行；实际删除时袋版本 +1，剩余行版本不变。行 ID 删除后不得复用。同步不读取现行目录价格，不重新计算历史金额。

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

## 本地验证与下一项

新增 15 项回归：精确移除、多行混合同步、独立袋改动、同版本内容变化防御、删除重加、成功后新增行保护、两处写入失败 / 零行回滚、并发改袋提交冲突、创建及同步响应丢失、服务重建、伪造身份 / 他人订单 / 异参 key、缺袋检查点及同订单并发重放。测试适配器为串行内存事务，非云数据库并发证据。

全套 **424/424**，静态 **235**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。未操作微信、本机 Storage、正式集合、资金或真实库存；未提交 / 推送 / 上传 / 部署。返回 OFFLINE_ORDER_RECOVERY_RESULT，cloudVerified / checkoutAllowed / paymentAllowed 均 false，不作为页面成功提示。

真实 SDK 的读集保护、条件写、回执唯一性、服务崩溃与网络响应丢失、Cart 并发及读回仍按 [真实订单验收](ORDER-CLOUD-ACCEPTANCE.md) 待补。客户端原请求 key 的可靠持久保存、未知结果查询、本机袋到正式 Cart 的迁移也待实接；当前不会自动清理本机购物袋。

下一项 **O05 待付取消、到期协调与资源释放**；真实外部支付关单竞争依赖 P04，先做离线领域契约。
