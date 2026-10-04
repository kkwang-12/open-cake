# V1 接口契约

日期：2026-10-03。当前范围：已有最小云接口、D01–D07 内部工具，以及 D07 目标网络契约。完整目标 action / DTO / 权限 / 幂等 / 错误 / 分页 / 时序见 [API_NETWORK.md](API_NETWORK.md)；只有 user.me/store.health 有最小函数逻辑，目标业务接口尚未开放。

2026-10-04 B06 补充：本机 Checkout 输入仅用于 LOCAL_DRAFT_PREVIEW；内部 `resolveCheckoutSelection` 从可信 Cart 与目录重算选中行金额，不是正式 Quote 或部署 action。所选行版本及订单创建后精准移除 / 去重 / 补偿协议见 [B06-CHECKOUT-SELECTION.md](B06-CHECKOUT-SELECTION.md)。正式购买门禁保持关闭。

X01 补充：本机地址按 AppID 保存 LOCAL_DEVICE 草稿；内部 address-model / address-service 验证可信本人、地址与用户版本、默认指针、原子软删除 / 回执及不可变地址快照。没有云 handler；address.list 签名分页与完整 Profile 读模型仍待接入。当前手工地址 location / 编码为 null，不能作为配送通过证明。详见 [X01-ADDRESSES.md](X01-ADDRESSES.md)。

X02 补充：store-information 仅在 development / shell 展示 USER_CONFIRMED_REFERENCE、CONFIGURATION_PENDING 门店资料；LOCAL_DEVICE 履约 / 联系人草稿不是 Store / Quote DTO。内部 store-fulfillment 接受可信门店 / 已发布配置、当前版本、D06 principal 和配置后的 validatePhone，拒绝停业 / 禁用 / 客户端额外费用字段；自取无需地址且费用 0，配送仍待本人地址 / 位置 / 范围 / 时段核验。始终 checkoutAllowed=false，没有 store.get handler、SDK 或 allowlist 扩展。详见 [X02-STORE-FULFILLMENT.md](X02-STORE-FULFILLMENT.md)。

## 已实现的最小云接口

| 云函数 / action | 输入 | 输出与限制 |
|---|---|---|
| user / me | `{ action: 'me', payload: {} }` | 当前可信身份摘要与 customer 角色；未部署验证 |
| store / health | `{ action: 'health', payload: {} }` | 已鉴权连通信息；未实现门店配置、业务数据库；未部署验证 |

响应使用 `{ ok: true, requestId, data }` 或 `{ ok: false, requestId, error: { code, message } }`。身份只取平台上下文，不读取 event.openid / role。开发、测试、生产环境显式隔离。具体实现见阶段一记录。

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
| ACTION_CONTRACTS / ApiContractError | 60个目标action元数据及固定INVALID_REQUEST异常；仅两个既有action标本地已有，58个PLANNED |
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
