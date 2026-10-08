# 阶段五 Checkout 离线验收与提交契约

2026-10-05。当前分支 `codex/ui-refresh-2026-10-05`，继续保留用户 UI 和所有未提交工作。阶段五可离线部分已推进至 X07，**整体正式云门禁未通过**；不开放订单或付款。

## 验收矩阵

| 任务 | 已验证 | 待实际验收 |
|---|---|---|
| X01 地址 | 本机 CRUD / 默认 / 共用选择；可信本人 / 地址版本 / 不可变快照离线模型 | 云列表 / 分页、A/B、默认竞争 SDK、地理与号码政策 |
| X02 门店 / 双分支 | 确认参考资料、自取联系人 / 方式持久保存、微信切换；发布配置预检模型 | 正式门店资料 / store.get / 配置发布及实际账号 |
| X03 配送范围 | 本人 / 精确位置绑定 / 20 km 含边界 / 0 费离线；微信待核验 / 地址失效 | 可信地图转换 / 核验 / 持久化和真实范围案例 |
| X04 时段 | 最大提前量、当地日期 / 30 分钟、独立 3 / 1 容量离线；微信待配置 | 正式参数、云可约列表 / 容量、真实预约选择 / 并发 |
| X05 报价 | 可信金额 / 选中袋 / 库存 / 范围 / 时段 / TTL、版本重核验、幂等决策、买方投影 | quote.create / get handler、原子保存 / 回执 / 追踪、SDK 重放 |
| X06 确认 / 输入 | 切换 / 返回 / 保存输入、异步竞争与确认失效；微信实际两种返回路径 | 实际云 Quote 摘要和报价错误 / 过期联调、完整进程重启 / 真机 |
| X07 提交契约 | order / payment 目标字段、未接通门禁、离线双分支正向与失败证据 | 实际订单原子创建 / 消费报价 / 资源占用、支付及整阶段联调 |

详见 X01-ADDRESSES.md、X02-STORE-FULFILLMENT.md、X03-DELIVERY-RANGE.md、X04-APPOINTMENT-AVAILABILITY.md、X05-TRUSTED-QUOTE.md、X06-CHECKOUT-CONFIRMATION.md。双分支正式可信报价是阶段门禁，不能以隔离测试替代。

## X07 提交接口

`miniprogram/features/checkout/submission-contract.js` 仅准备 OFFLINE_ORDER_REQUEST_PLAN，callable=false、checkoutAllowed=false、paymentAllowed=false，没有网络调用或提交按钮接入。

后续 `order.create` 的业务载荷严格为 `{quoteId, expectedQuoteVersion, idempotencyKey}`。不转发客户端单价 / 总额、地址、slotId、角色或付款结果。缺 READY 确认、过期、消费、错误版本及 OFFLINE_* 标记拒绝构造；客户端门禁只是显示 / 请求准备，服务端仍必须重新验证本人、时效、事实及资源，实际事务原子消费报价 / 写订单 / 占库存与时段。

同一确认报价 / 版本的未决或不明结果重试必须复用同键；重新报价确认使用新键。同键同参目标为重放既有结果，同键异参拒绝。当前工具只验证字段与调用约定，不生成或保存键、不做双击网络防重；真实调用器和幂等事务须在 O02–O04 接入，不能仅凭换键重新提交已消费报价。

订单确实保存并获得可信订单 ID / 当前版本后，才可走 `payment.create({orderId, expectedVersion, idempotencyKey})`；付款结果不明通过 `payment.state.get({orderId})` 核对。下单成功不等于付款成功，wx.requestPayment 回调不代替服务端资金结果；真实 Payment 在 P 阶段接入。当前最小云 allowlist 仍只有 user.me / store.health；submissionAvailability 始终关闭，不向页面展示实现细节或假成功。

## 证据与边界

X06 新增 12 项，X07 新增 6 项，当前全套 **375/375**、静态 **225 个文件**通过，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。X07 六项覆盖 exact order payload、缺 / 过期 / 消费 / 离线报价拒绝、重试键约定、未接通门禁与付款顺序、双分支隔离报价及范围 / 提前量 / 配置失败、服务端拒绝客户端额外金额 / 付款字段。

自取 / 配送隔离报价正向、范围边界 / 未定位 / 越界、提前量不足、改价 / 地址 / 配置 / 资源版本失效证据保存在 quote-model、delivery-evaluation、appointment-availability 及 checkout-submission-contract 测试中。10 分钟 TTL、备注 30 字、测试坐标和经营时间参数均不是商家正式配置。没有添加演示报价入口或把开发商品发布在售。

X06 微信实测见独立记录；运行时查询工具异常与恢复经过保留，不称工具零错误。当前所有数据仍是本机草稿或离线计划。正式云、地图、经营参数、SDK、真实 A/B 与真机门禁仍待补。阶段六接续 **O01 冻结状态机与受控命令**；本人订单列表属于 O06，已纠正原交接笔误。后续 O01 离线验收和最新进度见 [PHASE-6-EXECUTION.md](PHASE-6-EXECUTION.md)；阶段五保留云待验收项，不回退旧定金 / 尾款演示。

本轮没有提交 / 推送、腾讯预览上传、部署或发布。
