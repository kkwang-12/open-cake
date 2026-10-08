# V1 接口契约

日期：2026-10-03。当前范围：已有最小云接口、D01–D07 内部工具，以及 D07 目标网络契约。完整目标 action / DTO / 权限 / 幂等 / 错误 / 分页 / 时序见 [API_NETWORK.md](API_NETWORK.md)；只有 user.me/store.health 有最小函数逻辑，目标业务接口尚未开放。

2026-10-04 B06 补充：本机 Checkout 输入仅用于 LOCAL_DRAFT_PREVIEW；内部 `resolveCheckoutSelection` 从可信 Cart 与目录重算选中行金额，不是正式 Quote 或部署 action。所选行版本及订单创建后精准移除 / 去重 / 补偿协议见 [B06-CHECKOUT-SELECTION.md](B06-CHECKOUT-SELECTION.md)。正式购买门禁保持关闭。

X01 补充：本机地址按 AppID 保存 LOCAL_DEVICE 草稿；内部 address-model / address-service 验证可信本人、地址与用户版本、默认指针、原子软删除 / 回执及不可变地址快照。没有云 handler；address.list 签名分页与完整 Profile 读模型仍待接入。当前手工地址 location / 编码为 null，不能作为配送通过证明。详见 [X01-ADDRESSES.md](X01-ADDRESSES.md)。

X02 补充：store-information 仅在 development / shell 展示 USER_CONFIRMED_REFERENCE、CONFIGURATION_PENDING 门店资料；LOCAL_DEVICE 履约 / 联系人草稿不是 Store / Quote DTO。内部 store-fulfillment 接受可信门店 / 已发布配置、当前版本、D06 principal 和配置后的 validatePhone，拒绝停业 / 禁用 / 客户端额外费用字段；自取无需地址且费用 0，配送仍待本人地址 / 位置 / 范围 / 时段核验。始终 checkoutAllowed=false，没有 store.get handler、SDK 或 allowlist 扩展。详见 [X02-STORE-FULFILLMENT.md](X02-STORE-FULFILLMENT.md)。

X03 补充（2026-10-05）：内部 evaluateDeliveryInput 仅接收 ID / 预期版本，可信 principal、快照及精确位置核验适配器由服务端提供；唯一 ACTIVE 20 km / 免费规则与实体版本绑定离线通过。返回 OFFLINE_DELIVERY_EVALUATION / 不可变地址快照 / 绑定摘要，不生成 evaluationId，checkoutAllowed=false，仍需云保存和时段核验。没有 delivery.evaluate handler 或 allowlist 扩展；本机只能显示待核验或地址失效。详见 [X03-DELIVERY-RANGE.md](X03-DELIVERY-RANGE.md)。

X04 补充（2026-10-05）：内部 readAppointmentAvailability 校验可信配置及本人购物袋选择，提前量取正式商品与门店最大值；按所查日期 / 模式读取真实容量记录，缺记录 UNVERIFIED、旧定义 STALE、FULL / CLOSED 均不可选。返回查询日期边界和时段白名单，capacityReserved=false / checkoutAllowed=false，摘要不是预约凭证。无 appointment.list handler 或 allowlist 扩展；本机门店参考只显示待配置说明。详见 [X04-APPOINTMENT-AVAILABILITY.md](X04-APPOINTMENT-AVAILABILITY.md)。

X05 补充（2026-10-05）：内部 quote-model 复用 D07 quote.create 白名单（lineVersion 转内部 expectedLineVersion），从可信商品 / 袋 / 库存 / 时段 / 配送数据重算并捕获 OrderFacts，生成 OFFLINE_QUOTE_PLAN 与待原子保存效果；报价不占资源。时效来自发布 quoteTtlMinutes 且不晚于提前量截止，过期 / 消费 / 事实或资源版本变化拒绝旧报价。公开 OFFLINE_QUOTE_PREVIEW 隐藏资源、袋与评估证据；没有 quote handler、云保存或 allowlist 扩展，checkoutAllowed=false。详见 [X05-TRUSTED-QUOTE.md](X05-TRUSTED-QUOTE.md)。

X06 / X07 补充（2026-10-05）：客户端 confirmation-session 仅准备未来 Quote 确认状态，当前没有网络适配器；ticket 失效阻止旧响应，错误 / 到期清旧报价，拒绝 OFFLINE_* 结果。submission-contract 仅生成不可调用 OFFLINE_ORDER_REQUEST_PLAN：order.create 严格 {quoteId, expectedQuoteVersion, idempotencyKey}；实际保存订单后才可 payment.create / state.get，当前全部保持未接通。未扩展 handler / allowlist。见 [X06 记录](X06-CHECKOUT-CONFIRMATION.md) / [阶段五验收](PHASE-5-REVIEW.md)。

## 已实现的最小云接口

| 云函数 / action | 输入 | 输出与限制 |
|---|---|---|
| user / me | `{ action: 'me', payload: {} }` | development 云端工具已验证；核验本次平台身份，首次事务创建 users，复读不覆盖既有用户；返回可信摘要与 customer，禁用或损坏记录拒绝 |
| store / health | `{ action: 'health', payload: {} }` | development 云端工具已验证；本次平台身份鉴权后返回连通信息；门店业务配置尚未接入 |

响应使用 `{ ok: true, requestId, data }` 或 `{ ok: false, requestId, error: { code, message } }`。身份只取平台上下文，不读取 event.openid / role。开发、测试、生产环境显式隔离。具体实现见阶段一记录。

2026-10-08：SDK 4.0.2 在复用实例上可能保留上一条微信身份，两个入口现将 SDK 元组与 SCF **本次调用第二参数**的身份/namespace 一致性校验；管理端缺当前微信身份时 AUTH_REQUIRED。user.me 并非纯零写读取：仅首次可信身份可创建默认顾客，不返回 Profile、不接受角色提升，不表示隐私同意或电话认证。存储故障返回 INTERNAL_ERROR，禁用/损坏用户返回 AUTH_REQUIRED。真机仍 NOT_RUN，详情见 [阶段二实际补验收](PHASE-2-CLOUD-REVALIDATION-2026-10-08.md)。

## D01 内部纯模型

`planOrderCommand(order, command, actor, args)` 仅接受云端已经取得的订单快照、可信角色、读取的审批记录 / 支付证据摘要，返回 `{ nextOrderStatus, refundCents, requiredEffects }`。

- `order`：符合 DATA_MODEL.md 中 D01 字段约束的持久化状态快照。
- `actor`：内部可信对象；CUSTOMER 的 subjectId 来自身份解析，STORE 的 storeIds 来自实时角色记录，SYSTEM 的 capabilities 由内部处理器固定提供。禁止将客户端提供的同名对象原样传入。
- `args.expectedVersion`：可选的预期版本；数据库事务仍必须检查当前版本。
- `args.review`：取消审批时从数据库读取的 `{ id, orderId, ownerId, status }`；不能信任客户端传来的 PENDING 字符串。
- `args.refundCents`：商家批准的本次退款金额。取消审批可为零；单独退款必须为正安全整数分。
- `args.amountCents / currency`：仅供内部 PAYMENT_CONFIRMED 使用，来自已校验归属、商户、应用、支付单及可信平台结果的证据；前端支付返回不属于这种证据。

完整命令和角色矩阵见 TRANSACTION-RULES.md。模型不调用 SDK、不写库、不发起退款、不核销、不生成假支付成功；`requiredEffects` 必须由对应领域落实。系统能力对象是程序内部隔离约定，真实回调验签和鉴权将在 I03 / D06 / P03 验证。

辅助纯函数：`validateTradeSnapshot`、`assertExpectedVersion`、`assertRefundAmount`、`assertPaymentTransition`、`assertRefundTransition`。状态轴同态返回 false，不代表付款 / 退款事件已完成去重；D04 / P03 必须验证事件、业务单号、金额和结果是否一致。

## D01 错误码

| code | 处理 |
|---|---|
| INVALID_TRADE_MODEL | 拒绝无效状态 / 金额 / 快照，不写入 |
| FORBIDDEN | 非本人、非门店权限或无内部资金证据权限，拒绝 |
| INVALID_TRANSITION | 非法跳转、错履约方式、取消 / 完成后复活等，拒绝 |
| PAYMENT_UNRESOLVED | 查单 / 关单确认前保留未决，不提前释放 |
| PAYMENT_AMOUNT_MISMATCH | 隔离资金证据，查单与告警，不直接确认订单 |
| REFUND_AMOUNT_INVALID | 非整数分、负值或单独退款零金额，拒绝 |
| REFUND_EXCEEDS_PAID | 累计成功 + 意图占用 + 新申请超实付，拒绝 |
| REFUND_IN_PROGRESS | 原退款意图未处理完，先查询 / 重试 / 受控处置 |
| INVALID_CANCELLATION_REVIEW | 非本单 / 非本人 / 非待审记录，拒绝 |
| POLICY_VERSION_UNSUPPORTED | 显式处理历史政策兼容，禁止静默套新政策 |
| VERSION_CONFLICT | 刷新当前状态，不能覆盖新写入 |

当前 runtime 只服务 user.me / store.health，没有接入这些错误码；未来交易领域 handler 需映射固定公开消息并保留脱敏 requestId，不暴露错误中的身份 / 支付凭证。

## 后续网络契约必须落实的条件

客户端交易写入提交商品 / SKU / 行 ID、履约选择、必要输入和幂等键，金额与身份不作为权威数据。Order / Payment 应分别持久化意图与处理结果；退款外部调用不能放在数据库事务内。

后续 quote → order → payment：先取得可信报价，创建订单时复核报价 / 商品 / 资源并原子预留，再持久化支付意图后调用选定支付方案。客户端支付返回后查询云端状态；后端以可信通知 / 查单同步资金。取消与关单不明确时保持未决，不因前端取消而假装付款已关闭。[微信支付官方实现指引](https://pay.wechatpay.cn/doc/v3/merchant/4012075249)

D07 已在 API_NETWORK.md 逐 action 定义目标身份 / 输入输出 / 分页 / 幂等 / 错误 / 时序及逻辑 action 名称。具体 provider 参数 / 回调格式仍待 E03/P01，未创建云资源，目标协议不是已部署接口。

## D02 内部订单事实工具

`cloudfunctions/_shared/order-facts.js` 为离线服务端纯工具，没有网络 action 或持久化副作用。调用方必须先解析身份、读取可信报价 / 目录 / 地址 / 门店 / 配置，再应用完整业务验证。不能直接捕获客户端提交对象作为可信订单。

| 调用 | 输入 / 输出与边界 |
|---|---|
| calculateOrderAmounts(items, deliveryFeeCents, fulfillment) | 非空行数组（unitPriceCents/quantity，可选 lineTotalCents）、安全整数运费、PICKUP/DELIVERY；返回冻结的 currency/subtotalCents/deliveryFeeCents/totalCents/lineTotalsCents。若输入行带 lineTotalCents 必须匹配；自提运费必须 0 |
| assertOrderAmounts(order, items) | 先 validateTradeSnapshot(order)，再重算行 / 小计 / 运费 / 总额；返回上式金额对象。可能抛 TradeModelError 或 OrderFactsError |
| captureOrderFacts(input) | 根字段、嵌套字段见 DATA_MODEL.md；返回 schemaVersion=1 的 JSON 深复制且深冻结事实（含 items）。移除未知字段，输入 orderNote 省略时为空串，金额按单价 / 数量及 feeCents 生成。输入 items.lineTotalCents 被忽略并重算，与 calculateOrderAmounts 的可选核对不同 |

所有工具同步返回 / 抛错，捕获失败不生成可持久化的部分事实。未知字段的过滤不是整体输入 schema 验证：被丢弃字段不再检查；保留字段拒绝非 JSON 值与循环引用。除上述备注默认外，缺必需事实不从 UI / Demo 补值。captureOrderFacts 对快照只检查已实现的基本结构（如 ID、版本、非空文本、选项、行匹配、金额、门店 / 时区一致和起止先后）；日期合法性、坐标范围、电话、所有权、留言摘要、合法 SKU、正式素材、报价时效及资源可用性均须未来服务验证。

| OrderFactsError.code | 触发 / 调用方处理 |
|---|---|
| INVALID_ORDER_FACTS | 缺基本结构、重复 / 不匹配行、跨店时段、非法保留 JSON 值等；拒绝捕获，重新读取服务端事实，不部分写入 |
| INVALID_ORDER_AMOUNT | 空行、非法单价 / 数量 / 运费 / 履约方式或自提非零运费；拒绝金额 |
| AMOUNT_OVERFLOW | 行乘法、跨行求和或加运费超安全整数；拒绝，不能四舍五入或改浮点写库 |
| ORDER_AMOUNTS_MISMATCH | 行输入金额（calculateOrderAmounts）或订单小计 / 总额（assertOrderAmounts）与重算不符；拒绝并查明可信来源 |

D01 的 INVALID_TRADE_MODEL 等错误可由 assertOrderAmounts 传播，不能统一假装成网络失败。尚未给客户端开放这些错误；未来 handler 映射固定公开消息和脱敏 requestId，不返回完整 input/error stack。Object.freeze 不代表数据库不可变、实际事务、媒体文件保留或用户权限已实现。

## D03 内部目录 / 购物袋模型

目前只供未来服务端调用，未向客户端开放。细则与技术规范版本见 [CATALOG-CART-RULES.md](CATALOG-CART-RULES.md)。

| 工具 | 输入 / 输出 |
|---|---|
| resolveSku(product, skus, selection, requestedSkuId?) | 可信产品及其完整 SKU 配置列表；selection 的 groupCode/optionCode；可选客户端 skuId 作一致性核对。返回冻结的 _id/productId/storeId/version/description/currency/unitPriceCents/minQuantity/maxQuantity/selectedOptions/stockRequirements 白名单；禁止猜规格组合 |
| normalizeCakeMessage(value, policy) | 明确 MessagePolicy 或 null；返回 cakeMessage / normalizationVersion / messageFingerprint。技术版本 unicode-nfc-trim-codepoints-v1；长度按 NFC 后 Unicode 码点 |
| messageFingerprint(cakeMessage, normalizationVersion?) | 完整 SHA-256 JSON 摘要，默认上述技术版本；不验证长度或文本已规范化，不作为鉴权 |
| assertQuantity(quantity, sku, maxQuantityPerLine) | 检查正安全整数、SKU 最低 / 最高数量与门店上限；无返回载荷，失败抛错 |
| aggregateStockRequirements(lines) | 可信 SKU 与正数量；返回按资源排序的 resourceId/requiredUnits，安全整数聚合；不查余额 / 占用，不替代前述商品和数量校验 |
| validateCart(cart) | 验证 schemaVersion=1 的袋头、行、版本、时间、规范留言 / 摘要与唯一身份；返回原对象，不自动改数据 |
| planCartCommand(cart, command, actor, args, context) | ADD/UPDATE/REMOVE；返回冻结 {nextCart,changedLineId,changed}，没有落库副作用。args.expectedVersion 必填；UPDATE/REMOVE 的 expectedLineVersion 必填；context 的身份相关数据 / now / newLineId / 目录 / limits 仅由服务端构造 |

CatalogModelError：INVALID_CATALOG / PRODUCT_UNAVAILABLE / INVALID_SELECTION / SKU_UNAVAILABLE / SKU_SELECTION_MISMATCH / CONFIGURATION_REQUIRED / INVALID_QUANTITY / MESSAGE_NOT_SUPPORTED / INVALID_MESSAGE / NORMALIZATION_UNSUPPORTED / RESOURCE_OVERFLOW。固定消息见 catalog-model.js；INVALID_CATALOG 要检查服务端配置，SKU_UNAVAILABLE 要刷新选项，缺配置不能用演示值补足，溢出不能改浮点继续。

CartModelError：INVALID_CART / FORBIDDEN / VERSION_CONFLICT / LINE_NOT_FOUND / CART_LIMIT_EXCEEDED / INVALID_CART_COMMAND / CONFIGURATION_REQUIRED；planCartCommand 也会传播 CatalogModelError。袋 / 行旧版本刷新后由用户决定重试；ADD 的业务重试必须先查幂等记录，不能机械换新版本再累加。INVALID_CART 包括递增溢出与不支持的旧袋结构 / 规范版本，需要受控修复 / 兼容。

当前本地 guard 的 actor / context 不是网络鉴权方案；后续 B01 / D06 handler 必须从可信身份及实时记录构造。未知客户端金额 / ownerId / role 等不进入 nextCart；删除下架行无需读取目录。新模块还未随独立函数部署，真正接入须打包全部依赖，不能从部署包外 require。

## D04 离线事务准备工具

B01 / B02 已增加离线 `createCartService(...).execute(event, principal)`，复用 D07 cart 请求白名单、D06 principal 和 D03 规则。不是网络 handler，ACTION_CONTRACTS 的 cart 状态仍为 PLANNED。原子 session 接口、返回字段和回执协议见 [B01-B02-CART-SERVICE.md](B01-B02-CART-SERVICE.md)；正式 SDK 适配及部署仍未完成。

详见 [TRANSACTIONS.md](TRANSACTIONS.md)。所有操作同步计算 / 抛错，没有 SDK、锁、事务或网络调用；不能直接对外开放 context/actorScope 等可信参数。

| 工具 | 输入 / 输出与限制 |
|---|---|
| canonicalJSON(value) | 对 JSON 可用值规范对象键顺序，保留数组顺序；不做领域验证 |
| requestFingerprint(payload) | 规范 JSON 的版本化完整 SHA-256；命令 handler 先规范白名单输入 |
| scopedDocumentId(namespace, parts) | 非空 namespace 与非空字符串数组，返回 64 位完整哈希；parts 须含可信 environment |
| idempotencyId(input) | environment/actorScope/command/key 的确定性 _id |
| decideIdempotency(record, request) | request 含上式四字段及 64 位 requestFingerprint；record=null 则 CREATE，IN_PROGRESS 则 BUSY（不因租约过期接管），终态 REPLAY 白名单 CommandResult |
| validateResource(resourceKind, resource) | STOCK/SLOT、资源 ID/门店/version/status 与总量 / 三类占用安全校验；返回可用整数单位，非完整资源发布 / 时间验证器 |
| planResourceHolds(order, requests, resources, context) | order._id/storeId/paymentDeadlineAt；requests=[resourceKind/resourceId/quantity/expectedVersion]；resources=[{resourceKind,resource}]；context.environment/now。返回冻结 resourceChanges/reservations；至少一库存且恰好一时段，不执行计划 |

IdempotencyModelError：INVALID_IDEMPOTENCY_INPUT / INVALID_IDEMPOTENCY_RECORD / IDEMPOTENCY_KEY_REUSED；同键异参不可刷新指纹覆盖，未核实结果不能另开资金意图。

ResourceModelError：INVALID_RESOURCE / INVALID_RESERVATION_PLAN / RESOURCE_SCOPE_MISMATCH / RESOURCE_VERSION_CONFLICT / RESOURCE_UNAVAILABLE。版本冲突须数据库事务重新读取并有限重试，需求不足整单拒绝；不同版本的新事实价格等还须用户重新确认。资源 ID 计算可能传播 IdempotencyModelError。

resourceChanges 只包含资源计数与版本更新，不包含完整资源；reservations 为 DATA_MODEL.md 的通用字段及 orderId/storeId/resourceKind/resourceId/quantity/status/expiresAt/resolvedAt/resolutionLogId 创建载荷。预留 ID 确定性不代表已写入或已去重；真实数据库提交必须原子检查 expectedVersion 并写全部记录。实际 SDK 与并发验收仍待云条件。

## D05 内部履约模型与已确认政策

详见 [FULFILLMENT-RULES.md](FULFILLMENT-RULES.md)。V1_FULFILLMENT_POLICY 固定 08:00–21:00 / Asia/Shanghai、30 分钟、自取 3 / 配送 1 单、ORDER 单位每单 1、门店自行配送 / 预计时间段 / 20km 含边界 / 0 分。用户已确认每天营业；周日历须覆盖周一至周日两模式各 08:00–21:00。预约窗口、提前量与保留时长仍待确认。

| 工具 | 输入 / 输出与限制 |
|---|---|
| localServiceDate(now, timeZone) | 服务端 UTC 毫秒与 Asia/Shanghai，返回合法当地日期；当前仅支持现代中国时区 |
| maximumLeadTimeMinutes(minLeadTimeMinutes, productLeadTimes) | 门店 N 与非空 N 数组；返回最大值；缺值不补默认 |
| buildSlotDefinitions(input) | environment/store(_id/status/timeZone)/fulfillment/serviceDate/timePolicy/productLeadTimes/now；返回冻结时段定义（含 _id、资源定义字段和计算提前量），没有创建资源 / 占用 / 可售承诺 |
| resolveAppointment(input, slot) | 上式输入与真实 slot_inventory；复核全部定义及 OPEN / 余额，返回冻结 appointmentSnapshot 与 slotRequest（SLOT/resourceId/quantity=1/expectedVersion）；必须在实际事务再次检查 |
| paymentDeadlineAt(now, paymentHoldMinutes, appointmentSnapshot) | 正保留分钟数，返回不晚于预约提前量边界的 UTC 毫秒；截止不大于 now 时拒绝 |
| evaluateDeliveryRange(storeLocation, addressLocation, now) | 可信链构造的统一 WGS84 Location，返回冻结 distanceMeters/radiusMeters/boundaryIncluded/feeCents/coordinateSystem/distanceAlgorithmVersion/windowNature/operator；范围外抛错，无定位不放行；字段 source 不是鉴权凭证 |

FulfillmentModelError：INVALID_FULFILLMENT / INVALID_SERVICE_DATE / TIME_ZONE_UNSUPPORTED / INVALID_APPOINTMENT_INPUT / CONFIGURATION_REQUIRED / INVALID_TIME_POLICY / STORE_UNAVAILABLE / APPOINTMENT_OUTSIDE_WINDOW / SLOT_REQUIRED / APPOINTMENT_UNAVAILABLE / SLOT_DEFINITION_MISMATCH / SLOT_FULL_OR_CLOSED / LOCATION_REQUIRED / COORDINATE_SYSTEM_UNSUPPORTED / DELIVERY_OUT_OF_RANGE。同时可能传播 D04 ResourceModelError / IdempotencyModelError；内部计划不修改库存或配置。

捕获订单事实时仍由未来云端服务填配送评估 ID / 指纹 / 规则版本；本工具未生成身份、地理编码结果或配送通过证书。原始高德门店点已登记为 GCJ-02（经度 117.2886、纬度 31.1498）；可信 WGS84 转换 / 核验、提前量 / 窗口与实际地址来源等仍须配置；只有真实云端复核、资源提交后才能表示订单创建成功。客户端预计时间展示不承诺分钟送达，不使用骑手 API。

## D06 内部身份 / 权限工具（离线，未接网络接口）

实现 authorization-model.js；权限方案 v1-access-2026-10-03。可信 SDK 上下文 / 服务配置 / 本环境数据库用户及最新角色是前置条件，不从 event 填这些参数。完整规则见 [AUTHORIZATION-RULES.md](AUTHORIZATION-RULES.md)。当前没有新 action，也未接入现有 user.me / store.health。

| 导出 | 输入 / 返回与边界 |
|---|---|
| CAPABILITIES | 冻结六项技术能力 ORDER_OPERATE / REFUND_APPROVE / CATALOG_WRITE / CONFIG_WRITE / ROLE_MANAGE / AUDIT_READ，不隐含或拼接权限 |
| identityFromPlatform(context,settings) | 校验 SDK OPENID / APPID / ENV 与受控 appId/environment/stage，返回内部 _id/environment/appId/openId；完整 user 元组哈希，不输出客户端 |
| resolveCustomer(context,settings,user) | 用户须匹配平台元组与稳定 _id、schemaVersion=1、有效 version、ACTIVE；返回冻结并在模块内标记的 principal{type,subjectId,environment,appId,userVersion}，不创建用户 |
| requireOwner(principal,record) | 数据库 ownerId 必须匹配 subjectId；返回 CUSTOMER actor，只能用于有 ownerId 的父实体 |
| requireStoreCapability(principal,roles,storeId,requiredCapabilities) | 最新角色须同一条 ACTIVE 记录同时包含主体 / 门店 / 全部能力；返回狭窄 STORE actor 与 grant{roleId,roleVersion,userVersion}；重复角色 ID / 未知能力等拒绝 |
| planUserOrderCommand(order,command,principal,roles,args) | 用户命令先做能力 / 所有权校验，再调用 D01 计划；退款相关复合操作有明确能力要求；拒绝 PAYMENT_CONFIRMED 与未知 / 系统命令，不执行副作用 |
| AuthorizationModelError | code + 固定脱敏消息，不包含原始输入或平台身份 |

D06 自有错误码：

| code | 含义 |
|---|---|
| INVALID_CONFIGURATION | 缺受控 AppID / 环境 / 合法 stage |
| AUTH_REQUIRED | 缺有效平台身份或未由本模块解析的 principal |
| APP_MISMATCH | 可信上下文应用与受控配置不符 |
| ENV_MISMATCH | 可信上下文环境与受控配置不符 |
| USER_NOT_PROVISIONED | users 记录缺失，尚无持久化初始化 |
| INVALID_USER_RECORD | 用户映射 / 稳定主键 / schema / version / status 不合法 |
| USER_DISABLED | 用户已禁用 |
| INVALID_ROLE_RECORD | 角色结构 / 能力 / 撤销时间 / 唯一性不合法 |
| INVALID_AUTHORIZATION_INPUT | 所有权实体 / 门店 / 要求能力输入不合法 |
| FORBIDDEN | 非本人、门店 / 能力不足、角色撤销或用户请求系统命令 |

D01 的版本 / 状态 / 金额等错误继续传播。未来网络 handler 对未找到与无权实体统一公开结果，日志只留 code/requestId/stage，不能回传整个 principal/user/role/error stack。用户和角色版本仅作事务核验输入，仍须真实 SDK 校验读集竞争或受控 CAS；冻结对象与 WeakSet 不等于网络认证、实时撤销已上云或 DB 安全规则已生效。

## D07 内部请求 / 分页 / 开发种子工具（离线）

完整网络目标见 [API_NETWORK.md](API_NETWORK.md)，开发规划见 [DEVELOPMENT-SEED.md](DEVELOPMENT-SEED.md)，阶段评审见 [PHASE-2-REVIEW.md](PHASE-2-REVIEW.md)。不扩展现有客户端 allowlist，不创建新的云函数入口。

| 导出 | 输入 / 返回 / 限制 |
|---|---|
| ACTION_CONTRACTS / ApiContractError | 当前 61 个目标 action 元数据及固定 INVALID_REQUEST 异常；仅两个既有 action 标本地已有，59 个 PLANNED（A06 新增 exceptions.list） |
| getActionContract(domain,action) | 严格匹配完整domain/action，不接受点号拼接伪造domain或原型成员 |
| parseApiRequest(domain,event) | action/payload/requestId?；基础类型、root/payload及部分嵌套白名单 / 条件字段，64KiB技术上限，深复制 / 冻结；不鉴权、派发、执行领域验证或DB写入 |
| publicError(error) | 固定公开code/message白名单，未知内部错误INTERNAL_ERROR；不复制错误原文 / stack |
| PAGE_POLICY / SORTS / PaginationModelError | 默认20/最大50/游标900000ms与固定三类排序；技术值不是经营时限 |
| pageRequest(input?) | pageSize/cursor基础校验，返回冻结规范对象，不接受skip或任意排序 |
| issueCursor(last,context,key,now) | 可信scope/query/sort、至少32字节Buffer密钥与服务端时间，返回HMAC-SHA256签名base64url游标，不查询DB |
| readCursor(cursor,context,key,now) | 核对签名 / scope / 排序 / 时间 / keyId / anchor，返回冻结排序元组，不授予权限 |
| seekConditions(last,sortId) | 返回词典序OR分支，各分支EQ前缀与最终GT/LT；SDK adapter须整体AND可信过滤 |
| SEED_REVISION / DevelopmentSeedError | development-draft-v1-2026-10-03 与固定seed错误；版本不意味着已落库 |
| buildDevelopmentSeedPlan(settings,existing,now) | 显式开发配置和可信三集合快照，返回OFFLINE_PLAN_NOT_APPLIED与CREATE_IF_ABSENT/SKIP_EXISTING；五个草稿，不生成商品、用户、角色、财务数据 |

PaginationModelError：INVALID_PAGE_REQUEST / INVALID_CURSOR_CONTEXT / INVALID_CURSOR_CONFIGURATION / INVALID_CURSOR_ANCHOR / CURSOR_INVALID / CURSOR_EXPIRED。前四为输入 / 可信配置边界，公开映射按API_NETWORK；内部配置损坏不输出敏感key/上下文。IdempotencyModelError仍可能由内部JSON/hash工具传播。

DevelopmentSeedError：SEED_ENVIRONMENT_REJECTED / INVALID_SEED_INPUT / SEED_CONFLICT。CLI仅输出本地JSON，另有OUTPUT_ALREADY_EXISTS / SEED_PLAN_FAILED，不是网络API。完整结构、已有记录保留与未来事务apply要求见开发种子说明。

## C01 内部目录草稿 / 素材工具（本地）

完整输入、输出和错误见 [CATALOG-DRAFTS.md](CATALOG-DRAFTS.md)。新增 catalog-draft-model.js 的 CatalogDraftError / buildCatalogDraftPlan；输入临时示例 / 可信已有记录 / 显式开发配置 / 时间，返回 OFFLINE_PLAN_NOT_APPLIED 与冻结 create-if-absent / skip 操作、三分类和独立审核元数据。没有 apply；不得把 review 或参考图路径作为商品或网络 DTO 字段。

media-model.js 导出 MediaModelError、measureImageBytes、createMediaDraft、validateMediaAsset、planMediaRegistration、projectMediaReference、resolveSnapshotMedia、mediaRetentionDecision。初步签名 / SHA256、DRAFT、同版本不可覆盖、四字段引用、精确历史版本与只读保留决策。无上传 / 完整解码 / 发布 / 删除或用户权限解析。

这些都是可信服务端 / 本地工具契约，不能直接从客户端构造 context、现有记录、发布状态、实拍来源或引用扫描证明。未来 handler 必须 D06 CATALOG_WRITE / 门店 / 实时版本及真实云验证；公开目录仍只读取满足发布条件的在售记录，不公开 DRAFT、完整素材记录或库存需求。60 个目标 action 注册及现有客户端 allowlist 均未改变；新内部未知错误继续通过 D07 固定脱敏，不输出原始输入 / stack。

## C02 内部公开目录读模型（本地）

[CATALOG-READ.md](CATALOG-READ.md) 定义 createCatalogReadModel(records,context,key) 与 categoriesList()/productsList(input,now)。三分类发布过滤、同店ON_SALE / D03合法在售SKU / C01精确已发布实拍引用，公开卡片白名单、当前公开目录摘要绑定HMAC游标、固定排序seek。输出沿用D07 apiVersion / ProductCard / Page形状。

服务端只处理可信一致有限快照，无SDK/平台认证/网络handler；真实适配必须先授权和限定门店、用索引和受控修订/快照语义，验证SDK排序和预算。纯模型不检查实时库存可用量或替代购买重校验。

CatalogReadError：INVALID_CATALOG_SNAPSHOT / INVALID_CATALOG_READ_CONFIGURATION / INVALID_REQUEST / NOT_FOUND；页/游标错误按D07传播和固定脱敏。开发Shop视图不属于正式DTO，使用DEVELOPMENT_EXAMPLE / canPurchase=false与无签名本地标记，不发送给云端。现有两个action及58个PLANNED、cloud allowlist不变；没有新部署目录接口。

## C03 本地商品详情 / 规格补充

createCatalogReadModel 新增 productGet({productId})，沿用 C02 公开条件；返回卡片字段及 images / optionGroups / messagePolicy / minLeadTimeMinutes / skus。SKU 仅含 skuId/version/description/selectedOptions/unitPriceCents/currency/minQuantity/maxQuantity，不公开库存需求。图集按精确已发布实拍版本去重，现行配置提供选项标签；不可公开商品统一 PRODUCT_UNAVAILABLE。

规格纯模型 / 输入输出详见 [SPECIFICATION-RULES.md](SPECIFICATION-RULES.md)。组合匹配、失效清除和版本重确认仅为客户端显示能力；正式价格 / 数量 / 留言 / 库存 / 履约仍须服务端最终验证。开发 Service 只在 development/shell 提供9商品/15规格，未知经营配置仍null、canPurchase=false。不增加 handler、SDK、allowlist 或 action 部署状态。

## C04 本地详情展示 Service

product-detail.js仅在development/shell组合C02卡片与C03配置展示详情，同ID/名称/分类/来源/起价需一致；没有正式API适配，不把展示字段canConfigure当购买授权。当前与旧Home设计预览分来源隔离，旧面包预览价同步用户确认的12元。客户端固定错误新增PRODUCT_UNAVAILABLE，未知错误仍固定脱敏。详见 [PRODUCT-DETAIL.md](PRODUCT-DETAIL.md)；现有cloud allowlist/action部署状态不变。

## 用户指定的商品详情弹层与本机购物袋（2026-10-04）

用户最新指示覆盖原独立规格页交互，详情现在打开当前页底部弹层。新增本机LOCAL_DRAFT袋Service仅development/shell使用，wx Storage写入并读回后才显示成功；重核现行示例SKU/版本/价格/已知数量和留言规则。同SKU/规范留言合并、无云库存占用/身份/订单/结算。checkoutAllowed=false/requiresCloudValidation=true，不属于正式Cart DTO，不发往云端。未确认留言长度仅保本机草稿，无正式有效留言证明。详见 [PRODUCT-DETAIL-REDESIGN.md](PRODUCT-DETAIL-REDESIGN.md)。cloud allowlist、action部署状态及正式D03/D04领域实现不变。

## O01 内部受控订单命令（2026-10-05）

order-command-model 的 planControlledOrderCommand(domain,event,order,principal,roles,context) 复用既定 order.cancelUnpaid / cancellation.request / delivery.confirm 与 admin.order.transition / cancellation.review / refund.approve；不增加 action、handler 或云 allowlist。请求 expectedVersion / idempotencyKey 必须完整，拒绝任意 nextStatus / 角色 / 付款金额；商家接口始终要求当前同店授权，不因订单所有权而退化为顾客权限。

输出仅内部 OFFLINE_ORDER_COMMAND_PLAN、callable=false，包含补丁、版本条件、回执作用域 / 指纹、日志草稿与原子效果；不是真实 CommandResult，不可直接返回小程序或落库。当前申请、时钟、服务端 requestId 和理由脱敏器来自可信加载器；自取凭证仅传内部验证效果，不存日志。资源 / 核销 / 退款完成并校验最终交易轴后才生成日志 after，同事务保存订单 / 日志 / 相关效果及回执；没有执行器或幂等去重实现。错误由现有固定脱敏规则处理，不输出内部 context、凭证或 stack。详见 [O01-CONTROLLED-ORDER-COMMANDS.md](O01-CONTROLLED-ORDER-COMMANDS.md)。

## O02 内部订单创建（2026-10-05）

order-creation-model 的 planOrderCreation(state,event,principal,context) 仅复用既定 order.create。请求业务字段固定 quoteId / expectedQuoteVersion / idempotencyKey；state.quote 与 orderReceipt 必须可信读取，价格 / 身份 / 地址 / 时钟 / 状态不接受客户端输入。复用 X05 重核现行报价，变化要求重新确认；缺付款保留参数拒绝生成计划。

返回 OFFLINE_ORDER_CREATION_PLAN 的订单头 / 独立明细 / 报价消费补丁与原子条件，callable / checkoutAllowed / paymentAllowed 均 false，资源未预留。确定性 ID / 编号不代表实际唯一索引通过。CREATE / BUSY / REPLAY 仅离线裁决；重放实体仍要本人读取，输出不是正式 CommandResult，不得直接返回客户端或单独保存后报成功。实际事务、幂等与袋同步待 O03 / O04，handler / allowlist 不变。详见 [O02-ORDER-CREATION.md](O02-ORDER-CREATION.md)。

## O03 内部事务服务（2026-10-05）

order-transaction-service 的 createOrderTransactionService({runTransaction,now,buildContext,newRequestId}) / execute(event,principal) 仅复用 order.create，事务内当前用户 / 报价 / 目录等重读，整单资源预留、订单 / 全明细 / 首日志 / 报价消费 / 成功回执同原子边界。readCreationState 必须来自同一可信事务，buildContext 提供显式政策与可信验证，不能用前端输入代替。

事务会话的读依赖保护、create-if-absent / 唯一编号、条件资源更新 / ACTIVE 报价消费必须实际实现；各写返回影响数 1，异常 / 零行整笔失败。完整方法契约见 [O03-ATOMIC-ORDER-TRANSACTION.md](O03-ATOMIC-ORDER-TRANSACTION.md)。首次创建日志 before=null，后续命令 before 仍为交易轴。

当前仅本地串行内存适配器；内部 OFFLINE_ORDER_TRANSACTION_RESULT 的 cloudVerified / checkoutAllowed / paymentAllowed 均 false，不是正式网络响应或页面成功提示。没有 handler / SDK 接入、支付 / 袋删除或 allowlist 变更，真实并发与提交时间边界仍待云验收。

## O04 内部恢复与袋同步（2026-10-05）

order-recovery-service 包装 O03 创建及独立袋同步事务。创建未知结果要求重用原请求 / key，不清袋；已提交订单的袋同步失败返回内部 CART_SYNC_PENDING，原订单及占用保留。成功同步检查点与条件删行同事务；只删当前 ID / 行版本 / 内容摘要匹配的行，重放不再操作后续新行。事务会话、数据字段及错误边界见 [O04-ORDER-RECOVERY.md](O04-ORDER-RECOVERY.md)。

order.cart.sync 仅是既有幂等集合的内部检查点命令，不加入 60 个目标 action、公开 API 或 allowlist。OFFLINE_ORDER_RECOVERY_RESULT 的 cloudVerified / checkoutAllowed / paymentAllowed 均 false，不返回页面假成功。当前没有 SDK / handler、后台调度、客户端未知结果查询与 key 持久管理或正式 Cart 迁移。

## O05 内部取消 / 到期协调（2026-10-05）

order-cancellation-service 复用既定 order.cancelUnpaid，输入仍为 orderId / expectedVersion / reason / key，事务内复核当前用户、本人订单、全部支付意图与完整预留。无意图 UNPAID 或全部有效 CLOSED 且摘要一致才原子取消 / 释放；未知支付返回内部 PAYMENT_COORDINATION_REQUIRED，不写成功回执、调用外部关单或解除占用。Payment 更新订单版本后须重读当前版本；成功同键重放原结果。

order.expire 仅内部到期处理器及幂等命令，由注入的真实触发验证器授权；当前只有测试验证器，没有 SYSTEM 云身份 / 调度部署，不增加公开 action / allowlist。已付申请 / 商家审批 / 拒单为不可执行协调计划，退款 / 审批持久执行及 P04 竞争待补。所有内部结果 cloudVerified / checkoutAllowed / paymentAllowed=false，不是正式网络 CommandResult 或客户端成功提示。具体事务会话与证据边界见 [O05-ORDER-CANCELLATION.md](O05-ORDER-CANCELLATION.md)。

## O06 内部订单读模型（2026-10-05）

order-read-model / service 复用 order.list / get，目标 list 增加可选 view，status 仍为精确履约轴；CURRENT / PAST / ALL / COMPLETED / CANCELLED 与退款轴分开。只读服务每次重新检查当前用户，分页计划限定本人 / 状态 / 固定 CREATED_DESC / 整个 seek OR / limit，详情先限定本人父订单再读子记录；读取结束时刷新服务端时钟，并保护所有读取到结束。历史明细、金额、原图 revision 和最终日志轴链校验通过，输出白名单 / 固定文案及 disabled 动作提示，不接当前目录重算事实。

OFFLINE_ORDER_PAGE / OFFLINE_ORDER_DETAIL 的 cloudVerified=false；没有 API handler、实际 SDK / 密钥配置或页面实接。60 action 及 allowlist 不变，不能把动作提示当授权或打开支付 / 核销。真实查询、媒体、A/B 与页面验收待补，详见 [O06-ORDER-READ.md](O06-ORDER-READ.md)。

## O07 内部自提凭证事务（2026-10-05）

order-pickup-service 复用 order.pickupCredential.get 与 admin.order.transition / COMPLETE_PICKUP，无新增 action 或 allowlist。本人 READY / PICKUP / PAID 受控签发；当前同店 ORDER_OPERATE 及版本核销，使用 HMAC 候选凭证，不接受订单号替代。策略 / 密钥必须显式配置，正式 E10 未选，展示 / 扫码、云 handler 和错误映射均待补。

成功核销与实际错码分别原子保存订单 / 最终内部日志 / 成功或失败回执。错码以内部 REJECTED 在提交后返回，正式适配器若转换网络错误必须在事务外处理，避免撤销计数；同 key 同参重放，仍复核当前授权。核销请求指纹为稳定服务端 HMAC 域，未来统一 admin 命令分派须保持该算法和回执密钥一致，不能切回无密钥 SHA 使重试失配。OFFLINE_PICKUP_RESULT 的 cloudVerified / callable / fulfillmentAllowed=false，不是正式网络结果或页面成功提示。内部会话、数据与验收见 [O07-PICKUP-CREDENTIAL.md](O07-PICKUP-CREDENTIAL.md)。

## O08 内部配送事务 / 联系提示（2026-10-05）

order-delivery-service.execute(domain,event,principal) 只复用 admin.order.transition 的 START_DELIVERY / COMPLETE_DELIVERY 和 order.delivery.confirm，60 action / 当前 allowlist 不变。同店当前 ORDER_OPERATE 从 READY 开始；本人或当前同店从 DELIVERING 完成。订单 / 最终日志 / 成功回执原子写，重放验证当前授权与已提交日志；完整资源证据及显式测试完成政策缺失拒绝，不修改付款 / 退款轴或历史事实。

订单详情新增派生 deliverySupport（自取 null，配送 provider=STORE / windowNature=ESTIMATED / 固定说明 / contact），contact 仅历史门店电话和 disabled 的 CONTACT_STORE 提示。缺电话返回 null / CONFIGURATION_REQUIRED；页面未接返回 SERVICE_NOT_CONNECTED。不增加网络 action，也不宣称已拨号或实现未定异常状态。列表不增加电话 / 地址；正式电话和 E11 待补。

OFFLINE_DELIVERY_RESULT 的 cloudVerified / callable / fulfillmentAllowed=false，正式 SDK / handler / 网络错误映射 / 页面对接未完成。配送沿用标准 SHA 请求指纹，核销用 O07 HMAC，未来统一分派必须保持各命令算法稳定。详见 [O08-ORDER-DELIVERY.md](O08-ORDER-DELIVERY.md) / [阶段六矩阵](PHASE-6-REVIEW.md)。

## P01 服务端配置边界（2026-10-05）

OFFLINE_PAYMENT_CONFIGURATION / OFFLINE_PAYMENT_OPERATION_PLAN 不是公开 DTO 或可调用 action。plan(operation, serverNow) 要求当前可信时钟；CREATE 检查受控新付款窗口，既有资金恢复要求加载原支付 / 原授权并禁止新收费，不因窗口到期阻断查单 / 关单 / 退款。配置模型不加载密钥、执行资金操作或返回预支付参数。候选 provider 尚未实际选定，PaymentSession 和通知参数仍待真实 P01；60 action 与 user.me / store.health 客户端 allowlist 不变。见 [P01](P01-PAYMENT-CONFIGURATION.md)。

## P02 内部支付意图事务（2026-10-05）

沿用 payment.create 输入，不新增客户端 action；prepare / claimDispatch 仅服务端离线注入接口。OFFLINE_PAYMENT_INTENT_RESULT 不是 PaymentSession 已部署响应：disposition 为 CREATE_INTENT / REUSE_PREPARED / QUERY_REQUIRED / PAYMENT_COORDINATION_REQUIRED / PREPAY_REQUEST_REQUIRED，state=PENDING_CONFIRMATION、payInvocation=null，callable / paymentAllowed=false。内部发送绑定 / token 禁止进入客户端 DTO、普通日志或幂等回执；回执只代表意图准备。

同键 / 跨 key 重放当前本人未决意图；一旦发送占权提交，任何未知只要求查单，不再次生成单号或发送。实际查单 / 返回短期参数、可信响应 / 关闭后重付与 state.get handler 待 P03 / P04 及真实适配器。订单轴未因意图变 PAID / PENDING，取消仍以完整 payments 为依据。60 action 与 allowlist 不变，见 [P02](P02-PAYMENT-INTENTS.md)。

## P03 内部通知处理（2026-10-05）

payment-notification-model / service 为受信任系统适配器内部接口，不是 registry action / 客户端 DTO。verifyAndNormalize 与 runTransaction 显式注入；客户端 verified / success / role 无权创建来源凭证。来源边界、业务金额 / 归属与时间核验分离，VERIFIED 不表示订单可入账；当前来源夹具不是实际签名 / 解密或平台转发认证。

OFFLINE_PAYMENT_NOTIFICATION_PLAN / RESULT 只表达已提交本地处理结果、disposition / requiresPaymentCoordination 等。cloudVerified / callable / paymentAllowed=false，没有预支付参数或 HTTP 应答；sourceAccepted 不能作为提前 ACK 的依据。异常资金隔离不假报退款，实际来源 / HTTP / SDK / 后续协调待接入。60 action 与 user.me / store.health allowlist 不变，见 [P03](P03-PAYMENT-NOTIFICATIONS.md)。

## P04 内部资金恢复（2026-10-05）

payment-recovery-model / service 的 prepareQuery、prepareClose、acceptResponse、compensateLate 均为系统适配器内部接口，不是新 action。受信任恢复调用 / 响应验证分别注入，结果关联已存请求 / 原绑定 / 单号 / 版本；provider 格式、签名 / 平台链与任务鉴权仍未接入。SUCCESS 共用 P03 QUERY 来源入账，NOTPAY / 关闭 ACK / 未知不开放取消，CLOSED 写摘要后 O05 再取消释放。

OFFLINE_PAYMENT_RECOVERY_RESULT 与 transportPlan 不是客户端 PaymentSession / DTO，执行标记保持 false，无唤起参数。迟到款仅登记全额 PENDING / RESERVED 退款意图与 requiresAlert 需求，不调用退款或发送告警；真实接口与补偿调度待 P06 / P07。60 action 与客户端 allowlist 不变，见 [P04](P04-PAYMENT-RECOVERY.md)。

## P05 客户端支付会话候选契约（2026-10-06）

features/payment/payment-session.js 只生成不可调用 payment.create / state.get 计划，不扩展 action / allowlist。receiveState 的 12 字段归一化摘要是待受信任适配器实接的候选，不是现有已部署 DTO 或资金来源认证；具体字段与状态见 [P05](P05-PAYMENT-SESSION.md)。客户端返回和预支付完成不标付款成功，未决查询仅恢复；已付候选摘要也保持 successPageAllowed=false。本人 / 完整意图 / 原子读集、实际参数、持久请求键和成功页仍待实接，实例内 Map 不代表跨实例幂等。

## P06 内部退款尝试 / 结果（2026-10-06）

refund-service.prepare(refundId, SUBMIT|QUERY, key, invocation) 与 acceptResult(raw) 均为注入服务器内部接口，非可调用 action；未扩展 60 action / 客户端 allowlist。已有获批意图 / 预算与完整日志验证；返回 OFFLINE_REFUND_RESULT，callable / cloudVerified / externalRefundExecuted=false。结果来源认证独立于业务核验；UNKNOWN / ACCEPTED 不作退款成功，FAILED 保留预算，SUCCESS 才原子入账。实际审批、权限 / handler / SDK / 通知 / 查询适配器及平台原号重试能力未接通。见 [P06](P06-REFUND-RECOVERY.md)。

## P07 内部维护 / 对账（2026-10-06）

2026-10-06 顺序复审补充：内部 createRefundService 必填服务器 queryRetryAfterMs 正安全整数，仅允许到期重查原号，不授予 SUBMIT。退款来源证据必填 occurredAtPrecisionMs（1 / 1000）；未知 / 受理带可信平台号时绑定身份，但不表示退款成功。P07 本地 / 平台两侧窗口均必填 environment / appId / merchantId / provider 并一致。没有新增客户端 action 或可调用入口，见 [复审记录](PHASE-7-REVIEW-2026-10-06.md)。

maintenance-service.ensure / claim / acceptOutcome / reconcile 为服务器注入内部接口，不增加 action / allowlist。完整可信快照登记候选，任务版本 / 租约保序；domainHint 不执行资金，RESOLVED 不证明已付款。归一化完整账单经来源适配器再与本地同范围记录比较；报告及告警不改账 / 不发送。OFFLINE_MAINTENANCE_RESULT / OFFLINE_RECONCILIATION_REPORT 的 callable / cloudVerified / moneyAdjusted / messageSent 恒 false；真实触发与领域 / 账单 / 消息适配器尚未接通。见 [P07](P07-MAINTENANCE-RECONCILIATION.md)。

## A01 内部商家权限服务（2026-10-06）

`_shared/admin-access-service.js` 复用 D06 principal 和目标 `admin.role.grant / role.revoke` 的严格输入契约；**不是已实现的网络 API**，ACTION_CONTRACTS 状态与客户端 allowlist 不变。内部 `bootstrap(invocation)` 使用独立受控验证 / 批准资料加载器，不新增普通 bootstrap action；`entrySummary` / `requireCapability` 为当前事务观察，不产生跨事务权限凭证。

角色创建 / 一次撤销、审计与幂等回执同事务；完整用户 / 角色 / 门店读集、空记录唯一性和初始化批准版本 / 期限均须保护到提交。返回 `OFFLINE_ADMIN_ACCESS_RESULT` 或 `OFFLINE_ADMIN_ENTRY_SUMMARY`，所有实际调用 / 入口 / 运营标记 false。当前错误为固定内部 code；未来 handler 需公开错误白名单，不直接暴露缺实体与越权差异或平台资料。

内部新增异常包括 INVALID_ACCESS_STATE、INVALID_BOOTSTRAP_AUTHORIZATION、BOOTSTRAP_AUTHORIZATION_EXPIRED、BOOTSTRAP_ALREADY_USED、ROLE_ALREADY_ACTIVE、UNSUPPORTED_ADMIN_COMMAND；沿用 AUTH_REQUIRED / FORBIDDEN、用户 / 角色 / 幂等校验及 VERSION_CONFLICT。它们未加入网络映射或开放可调用操作。详情 / 字段 / 真实验收见 [A01](A01-ADMIN-AUTHORIZATION.md)。

## A02 内部商家订单编排（2026-10-06）

`merchant-order-service` 只复用目标 admin.orders.list / order.get / order.transition；action 表、handler 和客户端 allowlist 不变。商家查询在完整当前 A01 scope 内投影，列表 cursor 绑定主体 / 门店 / 状态 / 当前 grant。详情确定真实门店后才读取关联资料；无权与不存在为内部 NOT_FOUND，列表不返回电话 / 地址。新增 createMerchantOrderReadModel 是严格当前角色 / 时间校验的内部工厂，不借顾客身份访问资料。

ACCEPT / START_MAKING / MARK_READY / REJECT_ORDER 使用内部事务；确认库存开始制作后移到 consumed，拒单仅创建剩余实付 PENDING / RESERVED 意图。已有 PENDING 顾客取消请求报 CANCELLATION_REVIEW_REQUIRED，待 A06 明确审批，不生成孤立审核。原配置 / 金额 / 状态 / 历史 / 完整读集 / 权限 / 幂等有固定内部校验，不开放真实运营。

O07 / O08 新增服务器可选 authorizeMerchant 钩子；A02 使用原工厂注入它，在同笔业务事务校验严格 access / 用户与 assertAccessReads，原资源栅栏保护到提交。核销 HMAC 指纹、原凭证 / 完成策略和返回类型保持，不能在路由层换 key 或把鉴权搬到事务外。

新增 OFFLINE_MERCHANT_ORDER_PAGE / DETAIL、OFFLINE_MERCHANT_ORDER_RESULT（own commands）；cloudVerified / callable / operationsAllowed 固定 false，own command externalRefundExecuted=false。O07 / O08 保留原 OFFLINE 输出与 fulfillmentAllowed=false。退款结果仅 RESERVED 或此前已 SETTLED，不能当平台退款成功。新增错误 INVALID_MERCHANT_ORDER_STATE、CANCELLATION_REVIEW_REQUIRED、REFUND_NUMBER_CONFLICT 为内部 code，未来公开映射待接入。当前没有可调用接口或页面，详见 [A02](A02-MERCHANT-ORDERS.md)。

## A03 客户端自提会话契约演练（2026-10-06）

pickup-session 只计划既有 admin.order.get / order.transition / COMPLETE_PICKUP，不新增 action、handler 或客户端 allowlist。输入 / 显式同步扫码 codec 只取得内部 orderId 与候选长凭证；先读当前受权同店 READY / PICKUP / PAID 摘要，再显式确认。扫码不自动写订单，摘要不代表凭证有效，最终凭证 / 角色 / 资源 / 版本仍由 A01 / O07 事务核验。

本机 ticket 以对象身份路由，仅供回调，不在网络 event 内。请求计划含敏感原码，不整体 setData / 日志 / 明文 Storage；current 只返回必要白名单摘要。丢响应 / 隐藏后重试原 key / version / 码；新版本读取不生成替代请求。只有原成功回执及相符完成详情可得到演练 COMPLETION_REPORTED，单独完成详情不能归因；真实 successFeedbackAllowed 仍 false。

receiveResult 演练既有 CommandResult {entityId,version,errorCode}：成功及错码写为 expectedVersion+1，锁定 / 冷却无写为 expectedVersion。PICKUP_CREDENTIAL_* 内部结果尚未加入网络公开映射，不直接返回原文。OFFLINE 服务外壳禁止当实际 DTO；只在测试投影协议形状，没有运行时桥接。真实页面 / wx 扫码 / 安全持久恢复 / 政策 / SDK 待补。28 项专项、全套 828/828、静态 294；详见 [A03](A03-PICKUP-SESSION.md)。

## A04 内部商家目录 / 库存维护（2026-10-06）

merchant-catalog-service 复用既有 admin.products.list / product.get / product.save / product.status.set / inventory.list / inventory.setTotal，action / handler / 客户端 allowlist 不变。每次事务加载当前 A01 用户 / 严格 scope / 门店 / 同一 CATALOG_WRITE，再读取同店完整有限目录快照。分页 HMAC 绑定主体 / AppID / 当前 grant / 店 / 条件 / 内容修订；实际有界 SDK 查询及完整性栅栏仍待。

product.save draft 字段及完整 SKU 集合见 [A04](A04-MERCHANT-CATALOG.md)。新实体 ID 绑定环境 / AppID / 店 / 回执；已有父子 expectedVersion、固定分类 / 组合与归档规则云端候选引擎重验。草稿保留未配置 null；ON_SALE 必须真实登记图片、明确 SKU / 经营值和资源。inventory.setTotal 只改总配额，不能低于 held + confirmed + consumed，不改单位 / 状态 / 原占用。

实体 / 变化 SKU、脱敏审计、回执同事务；旧请求重放结果版本绑定原 expectedVersion+1，新建为 0 与确定性 ID，不重应用价格 / 总量。O03 本地真实服务组合拒绝变更后的旧 quote，历史订单 / 预留 / 媒体记录不变。返回 OFFLINE_MERCHANT_CATALOG_RESULT / PRODUCT_PAGE / PRODUCT_DETAIL / INVENTORY_PAGE，cloudVerified / callable / operationsAllowed 全 false。INVALID_CATALOG_STATE / INVALID_CATALOG_DRAFT / IMMUTABLE_CATALOG_FIELD / SKU_REMOVAL_FORBIDDEN 等内部错误未开放网络映射。31 项专项、全套 859/859、静态 298；实际页面 / SDK / 并发 / 资料批准待补。

## A05 内部离线门店 / 配置维护（2026-10-06）

既有 admin.store.update / config.save / config.publish / slot.update 和 store.get / config.get / configs.list / slots.list 由 merchant-store-service 的内部 execute 实现可离线部分，不改变 PLANNED 状态或真实 handler / 客户端 allowlist。所有返回 scope OFFLINE_MERCHANT_*，cloudVerified / callable / operationsAllowed false；CommandResult 仍为 entityId / version / errorCode。当前用户和同店 CONFIG_WRITE 每次重验，跨店拒绝。

ConfigDraft 严格 9 个经营字段：fulfillmentModes、timePolicy、deliveryRules、cartLimits、quoteTtlMinutes、paymentHoldMinutes、slotPolicy、tradePolicyVersion、fulfillmentPolicyVersion；id / 状态 / 序号 / 发布时刻不能由 draft 注入。支持显式未完整草稿，发布须完整且经服务端正式资料验证。已发布记录不能 save，发布 CAS 配置及门店、序号单调，原 key 可重放但不得绕过当前权限。

mapSelectionToken 仅供可信事务适配器绑定当前人员 / 店 / scope / 版本解析，不接受原始 location。地址改变撤销旧定位。store.update 不修改 activeConfigId，配置发布才可原子切换指针。slots.list 返回持久资源事实，缺行不声明可下单；slot.update 不能改时段身份 / 模式 / 计数，V1 容量固定 3 / 1，CLOSED 禁约而非清零。config.get 无 configId 时返回当前发布配置，无配置则 NOT_FOUND，不返回虚构草稿。

StoreDraft / ConfigDraft / SlotResourceList 是白名单投影；ConfigSummaryPage 当前使用相同配置 DTO 的 HMAC 分页，绑定当前人员 / grant / 店 / 内容修订，实际 SDK 有界读取待补。审计保留请求 / 实体 / 关联写入摘要与脱敏信息，不记录完整政策 / 地图 token / 电话。完整说明与 MS01–MS07 见 [A05](A05-MERCHANT-STORE.md)。

## A06 内部取消审批 / 退款恢复 / 财务读取（2026-10-06）

复用既有 order.cancellation.request、admin.cancellation.review / refund.approve / refund.retry / refunds.list / refund.get / audit.list；新增仅 PLANNED 的 admin.exceptions.list（storeId / pageSize / cursor，REFUND_APPROVE，CREATED_DESC），registry 共 61 项 / 59 PLANNED。此前逐轮 60 action 说明是历史记录；当前网络表以 API_NETWORK / registry 为准，真正 callable 仍只有 user.me / store.health 最小边界，客户端 allowlist 不改。

merchant-resolution-service.execute 只接受 3 个 admin 写动作；requestCancellation 只接受本人已付请求。请求 / 审批关联持久 requestLogId / reviewLogId，审批必须当前订单和唯一 pending review，批准复合权限不能拼 grant。CommandResult 在请求 / 审批 / 新预算是订单 expectedVersion+1；retry 没改 refund record version，返回该退款的 expectedVersion，内部附原 disposition / attempt / refund 标识和关闭门禁。重放 transportRequired=false，客户端不能带 operation / 金额 / 下一个状态来选择发送。

retry 仅原号恢复，不增加退款意图 / 预留或证明成功；P06 独立认证来源结果才能入账。仅服务器可使用内部发送需求，真实发送器 / 持久未知恢复 / handler / 页面尚未接入。财务与 P07 异常 DTO 无联系方式 / 交易号 / profile / 租约 / 原始异常，audit 要独立 AUDIT_READ、投影窄店与脱敏标量元信息；缺 outcome 的旧审计返回 null。完整事务 / 读集 / 分页 / 真实门禁见 [A06](A06-MERCHANT-RESOLUTION.md)。
