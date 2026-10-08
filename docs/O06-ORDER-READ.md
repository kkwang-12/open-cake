# O06：订单列表、分页与详情读模型

2026-10-05。完成可离线读模型 / 内部只读服务，未实现云 handler / SDK 查询、页面列表 / 详情实接或真机验收。当前 Orders 页面仍为原空状态；无真实订单时不注入开发订单。全部既有未提交成果与已确认 UI 保留。

## 请求与分组

复用 order.list / order.get，目标 action 数量仍为 60，客户端 allowlist 仍只有 user.me / store.health。order.list 新增可选 `view: ALL / ACTIVE / CURRENT / PAST / COMPLETED / CANCELLED`，保留既有 `status: 精确订单轴状态`、pageSize / cursor；两种筛选同时提供时取交集。ACTIVE 与 CURRENT 规范化为同一查询；不接受 ownerId、任意排序、skip 或客户端身份。

| 分组 | 履约状态 |
|---|---|
| CURRENT / ACTIVE | PENDING_PAYMENT / PAID / ACCEPTED / MAKING / READY / DELIVERING |
| PAST | COMPLETED / CANCELLED |
| COMPLETED / CANCELLED | 对应单一状态 |
| ALL | 八个合法订单轴状态 |

PAID 显示「待门店接单」，ACCEPTED 显示「门店已接单」，MAKING 才显示「制作中」。支付 / 退款轴独立：完成或取消的订单即使有未决退款仍属于 PAST；配送中部分退款不改配送中。待付超过截止也不由读模型自动改成取消，等待 O05 / P04 的真实处理。

## 历史事实与隐私

createOrderReadModel(records,principal,context,key) 只接收可信一致的有限快照：user / orders / items / logs / cancellations / mediaAssets。身份必须来自 D06，当前用户 ACTIVE、AppID / 环境及版本一致。get 对未知 / 他人订单同样 NOT_FOUND；混合测试快照中的非本人父订单与其子记录不会进入输出。真实 SDK 必须在查询阶段限定本人，不能把全库发到客户端筛选。

详情从订单头及独立 order_items 按 position 连续聚合，校验选中行顺序、整数金额、总额及生命周期时间，复用 D02 白名单捕获事实。不读取当前目录、价格、门店或地址重写历史。公开详情包含历史 store / contact / 本人地址 / appointment / items / orderNote、金额、三轴、生命周期、取消申请摘要 / 退款摘要和公开时间线；不返回 ownerId、报价 / 袋同步证据、资源、角色、付款平台号、事件 / 追踪、内部日志理由或自取凭证 digest。源地址 ID 和历史商品 ID 是允许的引用，不是匿名化承诺。

列表仅保留卡片用的产品名称、封面 / 数量、订单号 / 金额 / 三轴 / 状态文案 / 时间、预约 / 取消 / 退款摘要及不可调用的动作提示，不含联系人、地址、留言、完整明细或日志。退款摘要使用已持久化 refundedCents / refundReservedCents：成功部分 / 全额区分，失败显示「待核实」并保留未决预算，不把受理说成已退款。

图片复用 C01 resolveSnapshotMedia 的 HISTORICAL_ORDER：匹配原 assetId / revision / storageRef / sourceKind，RETIRED 版本仍可读，不跳到新版本；缺失、DRAFT、错引用或未获准云前缀返回 null，仍保留文字与价格。正式媒体来源、文件存在与访问授权须云接入验收；空图片不影响未来页面按既定比例占位。

## 分页与只读服务

排序固定 createdAt DESC / _id DESC；默认 20、最大 50，取 pageSize+1 判断 hasMore，游标锚点取最后一个返回项。HMAC 游标绑定环境、AppID / 本人、order.list、规范 view / status、排序及 D07 的 15 分钟技术期限。改变主体 / 查询、篡改或到期拒绝；页大小可以改变。密钥必须服务端配置，不生成临时密钥或进入小程序。

只读服务 createOrderReadService({runReadTransaction,now,context,key}) 每个请求重新校验用户，并要求 readUser / readOrderPage / readOrderDetail / assertReadSnapshot。列表向适配器提供 ownerId、状态集合、固定排序、limit、seek OR 分支；必须将整个 seek OR 与本人 / 状态过滤 AND 后查询，再取限制数量。详情先限定 ownerId / orderId，才读取必要子记录和原图版本。适配器返回他人父记录或超过 limit 时失败，不降级为全库查询。

assertReadSnapshot 必须保护当前用户及本次全部订单、明细、申请、日志、媒体读取到结束，不能只比较一个订单 ID 或事务外查询。服务没有写方法；测试读期间撤销 / 版本改变、混合快照会拒绝结果。真实 SDK 的一致读、读集保护与索引方向 / OR 查询尚未验证。

稳定 seek 解决同时间边界，不提供跨页数据库快照：后续新创建且更靠前的订单在刷新时出现，状态筛选变化可能移出 / 移入；未来客户端须按 orderId 去重并提供刷新，不宣称任何并发变化下均无遗漏。

## 进度与操作提示

详情时间线按提交版本排序，同时间也不按随机日志 ID 打乱。要求首次 ORDER_CREATED / before=null / 初始待付轴，随后 before=前条 after，版本连续、时间不倒退、最后 after 与当前订单一致；已知履约命令与前后状态 / 方式匹配。不回传原 publicMessage / reason，而以固定文案及交易轴投影，避免把未经审核字符串作为公开进度。后续 Payment / 退款显式命令须扩展固定文案，未知内部命令保守展示最终履约状态。

可用操作为上下文提示：待付仅去支付 / 取消，过截止不提示去支付；已付可申请取消，已有待审申请则提示待审；DELIVERING / DELIVERY 才有本人确认收货；READY / PICKUP 的凭证入口仍受 O07 未配置限制。所有提示 enabled=false，SERVICE_NOT_CONNECTED / PAYMENT_PENDING / CANCELLATION_PENDING / CONFIGURATION_REQUIRED 明确区分；历史不支持政策仍可看事实，动作列表为空。

返回 OFFLINE_ORDER_PAGE / OFFLINE_ORDER_DETAIL、cloudVerified=false，不是已部署 API DTO。动作提示不代替命令鉴权，不能简单翻 enabled 就开放付款 / 核销。没有凭证生成、订单变更、模拟付款或假成功。

## 验证与下一项

新增 22 项：八状态 / 两种履约 / 分组、退款独立、同时间分页及末尾锚点、游标签名 / 隔离 / 到期、刷新与新单、本人 / 伪造身份、历史事实、隐私白名单、退役 / 缺失图片、上下文动作 / 超时门禁、未知历史政策、完整日志链 / 状态 / 时间、防止半份明细、严格输入、查询计划及每页当前权限 / 读集、错误适配器、不可变输出 / 密钥副本，以及 O03 实际本地创建 / O05 取消输出兼容。

全套 **466/466**、静态 **242**，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只有本地快照与内存读适配器证据；未改 UI、操作微信 / 真机 / 云 / 资金 / 本机 Storage，未提交 / 推送 / 上传 / 部署。

下一离线项 **O07 自提凭证与核销策略 / 权限 / 防重放模型**。E10 的码形式、有效期和尝试限制尚未确认，不能发布默认经营值；真实 Order 列表 / 详情页面、SDK / A/B / 分页 / 媒体、O05 / P04 资金竞争和阶段整体门禁继续待补，见 [真实订单验收](ORDER-CLOUD-ACCEPTANCE.md)。
