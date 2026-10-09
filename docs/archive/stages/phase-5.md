# 结算：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [PHASE-5-EXECUTION.md](#phase-5-execution)
- [PHASE-5-REVIEW.md](#phase-5-review)
- [X01-ADDRESSES.md](#x01-addresses)
- [X02-STORE-FULFILLMENT.md](#x02-store-fulfillment)
- [X03-DELIVERY-RANGE.md](#x03-delivery-range)
- [X04-APPOINTMENT-AVAILABILITY.md](#x04-appointment-availability)
- [X05-TRUSTED-QUOTE.md](#x05-trusted-quote)
- [X06-CHECKOUT-CONFIRMATION.md](#x06-checkout-confirmation)

---

<a id="phase-5-execution"></a>

## 原记录：PHASE-5-EXECUTION.md

<a id="phase-5-execution--阶段五执行记录checkout"></a>
# 阶段五执行记录：Checkout

2026-10-04，接 B06。当前只推进本机草稿及离线模型，正式云与真实经营资料仍待补，不开放订单或付款。

| 任务 | 当前状态 |
|---|---|
| X01 地址 CRUD / 默认 / 共用选择 | 本机与微信模拟器链路通过；可信身份 / 默认竞争 / 事务 / 幂等 / 快照模型离线通过；实际云列表分页、A/B、SDK 并发、地理及正式号码政策待补 |
| X02 门店 / 履约配置与自取表单 | 本机参考资料 / 双分支 / 联系人持久保存及微信模拟器通过；可信配置 / 版本 / 停业与自取禁用模型离线通过；正式 store.get / 资料发布 / 云仍待补 |
| X03 配送范围权威校验 | 2026-10-05 离线编排及微信本机待核验 / 地址版本失效通过；正式地图 / 云保存 / 报价待补 |
| X04 预约时段 | 2026-10-05 可信日期 / 提前量 / 时段容量读模型与微信待配置提示通过；正式云查询与预约选择待补 |
| X05 可信报价 | 2026-10-05 离线规划 / 时效 / 重核验 / 公开投影通过；真实云保存 / 幂等 / SDK 验收待补 |
| X06 Checkout 双分支与输入保留 | 本机组合 / 确认生命周期及微信两种返回路径通过；正式 Quote 摘要 / 时段 / 云错误联调待补 |
| X07 提交契约与阶段验收 | 离线请求计划 / 调用顺序 / 阶段矩阵通过；真实整阶段门禁未通过，不开放订单 / 支付 |

X01 新增 19 项，全套 288/288，静态 194；主包 2010 KiB、features 65 KiB。微信真实 CRUD / 默认 / 输入错误 / Checkout 共用选择与版本失效通过，四张截图核对，删除原生确认使用受控回调。本轮测试地址与新建输入键清理，原购物袋完整 JSON 一致；正式云列表和实际账号门禁未通过。详见 [X01-ADDRESSES.md](phase-5.md#x01-addresses)。

X02 新增 13 项，全套 301/301，静态 202；主包 2013 KiB、features 77 KiB、legacy 45 KiB。门店参考资料共用，自取不读取地址，联系人与方式真实写入 / 读回 / 重进恢复，配送共用地址模块及切回自取保留联系人通过；两张截图和 WXML 编译核对。工具超时 / socket hang up 已恢复并重新完整验收，仅清理本轮两键，原购物袋完整 JSON 与存储键一致。SDK 离线日志、真机 / 完整进程重启、正式配置 / 地图 / 云门禁保留。详见 [X02-STORE-FULFILLMENT.md](phase-5.md#x02-store-fulfillment)。

X03 新增 9 项回归，本轮相关 13/13 通过；UI 快照基线全套 335/335、静态 215。可信本人 / 版本 / 唯一有效规则 / 精确位置核验绑定及 20 km 含边界离线通过，不生成评价 ID 或下单许可。微信真实地址保存、选择、重进待核验、编辑失效、重选及自取清状态完整重测通过，两张截图和 WXML 编译核对；首次导航未确认、SDK offline 日志如实保留。测试行清理、modal mock 恢复，原购物袋 JSON、履约输入、核对输入与存储键保留。未改已验收 UI，未上传 / 部署。详见 [X03-DELIVERY-RANGE.md](phase-5.md#x03-delivery-range)。下一项 X04，缺真实提前量和最大预约天数时保持配置待补。

X04 新增 9 项，全套 344/344、静态 218；主包 1213 KiB、features 87 KiB、legacy 45 KiB 源估算。可信购物袋与目录求最大提前量、当地日期边界、时段 / 覆盖、真实容量 3 / 1、满额 / 关闭 / 缺记录 / 旧定义不可选、版本刷新离线通过。微信真实切换和重进保持待配置，无虚假日期 / 名额 / 所选时段，WXML / WXSS 编译通过，原输入 / 购物袋 / 键保留。仅核对页加入按字体规范的预约说明区，不重做 UI。正式提前量 / 最大预约天数 / 云容量尚未具备，X04 整体云验收未完成。详见 [X04-APPOINTMENT-AVAILABILITY.md](phase-5.md#x04-appointment-availability)。下一项 X05。

X05 新增 13 项，全套 357/357、静态 221，主包 / features / legacy 源估算仍 1213 / 87 / 45 KiB。复用 D07 报价白名单、B06 可信选中袋、X02 / X03 / D05 与 D02 捕获，整数金额、共享库存、版本 / 时效 / 配送证据重核验通过。只生成 OFFLINE_QUOTE_PLAN，原子保存 / 幂等回执 / 配送追踪仍待实际 SDK；报价不占资源、不能下单。没有 UI 变更或本轮新微信验收，不将 X04 截图当 X05 云报价验收。详见 [X05-TRUSTED-QUOTE.md](phase-5.md#x05-trusted-quote)。下一项 X06。

X06 本机联系人切换 / 同实例返回保留、关闭实例后恢复已保存输入、竞争清派生状态、确认 ticket / 错误 / 到期失效通过。微信分段实测和数据恢复验证通过，运行时查询异常、恢复和脚本返回路径假设修正如实记录。X07 exact order.create 载荷 / 未接通门禁 / payment 调用顺序与离线阶段证据通过。两项新增 18 项，最终全套 375/375、静态 225；主包 / features / legacy 源估算 1213 / 97 / 45 KiB。本轮无视觉改动或云接入，正式阶段门禁仍待补。详见 [X06-CHECKOUT-CONFIRMATION.md](phase-5.md#x06-checkout-confirmation) / [PHASE-5-REVIEW.md](phase-5.md#phase-5-review)。下一项可离线推进阶段六 O01。

---

<a id="phase-5-review"></a>

## 原记录：PHASE-5-REVIEW.md

<a id="phase-5-review--阶段五-checkout-离线验收与提交契约"></a>
# 阶段五 Checkout 离线验收与提交契约

2026-10-05。当前分支 `codex/ui-refresh-2026-10-05`，继续保留用户 UI 和所有未提交工作。阶段五可离线部分已推进至 X07，**整体正式云门禁未通过**；不开放订单或付款。

<a id="phase-5-review--验收矩阵"></a>
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

<a id="phase-5-review--x07-提交接口"></a>
## X07 提交接口

`miniprogram/features/checkout/submission-contract.js` 仅准备 OFFLINE_ORDER_REQUEST_PLAN，callable=false、checkoutAllowed=false、paymentAllowed=false，没有网络调用或提交按钮接入。

后续 `order.create` 的业务载荷严格为 `{quoteId, expectedQuoteVersion, idempotencyKey}`。不转发客户端单价 / 总额、地址、slotId、角色或付款结果。缺 READY 确认、过期、消费、错误版本及 OFFLINE_* 标记拒绝构造；客户端门禁只是显示 / 请求准备，服务端仍必须重新验证本人、时效、事实及资源，实际事务原子消费报价 / 写订单 / 占库存与时段。

同一确认报价 / 版本的未决或不明结果重试必须复用同键；重新报价确认使用新键。同键同参目标为重放既有结果，同键异参拒绝。当前工具只验证字段与调用约定，不生成或保存键、不做双击网络防重；真实调用器和幂等事务须在 O02–O04 接入，不能仅凭换键重新提交已消费报价。

订单确实保存并获得可信订单 ID / 当前版本后，才可走 `payment.create({orderId, expectedVersion, idempotencyKey})`；付款结果不明通过 `payment.state.get({orderId})` 核对。下单成功不等于付款成功，wx.requestPayment 回调不代替服务端资金结果；真实 Payment 在 P 阶段接入。当前最小云 allowlist 仍只有 user.me / store.health；submissionAvailability 始终关闭，不向页面展示实现细节或假成功。

<a id="phase-5-review--证据与边界"></a>
## 证据与边界

X06 新增 12 项，X07 新增 6 项，当前全套 **375/375**、静态 **225 个文件**通过，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。X07 六项覆盖 exact order payload、缺 / 过期 / 消费 / 离线报价拒绝、重试键约定、未接通门禁与付款顺序、双分支隔离报价及范围 / 提前量 / 配置失败、服务端拒绝客户端额外金额 / 付款字段。

自取 / 配送隔离报价正向、范围边界 / 未定位 / 越界、提前量不足、改价 / 地址 / 配置 / 资源版本失效证据保存在 quote-model、delivery-evaluation、appointment-availability 及 checkout-submission-contract 测试中。10 分钟 TTL、备注 30 字、测试坐标和经营时间参数均不是商家正式配置。没有添加演示报价入口或把开发商品发布在售。

X06 微信实测见独立记录；运行时查询工具异常与恢复经过保留，不称工具零错误。当前所有数据仍是本机草稿或离线计划。正式云、地图、经营参数、SDK、真实 A/B 与真机门禁仍待补。阶段六接续 **O01 冻结状态机与受控命令**；本人订单列表属于 O06，已纠正原交接笔误。后续 O01 离线验收和最新进度见 [PHASE-6-EXECUTION.md](phase-6.md#phase-6-execution)；阶段五保留云待验收项，不回退旧定金 / 尾款演示。

本轮没有提交 / 推送、腾讯预览上传、部署或发布。

---

<a id="x01-addresses"></a>

## 原记录：X01-ADDRESSES.md

<a id="x01-addresses--x01地址管理与-checkout-共用选择"></a>
# X01：地址管理与 Checkout 共用选择

2026-10-04。本机地址草稿、页面链路及服务端离线模型已实现；正式云身份、真实 SDK 事务、地址分页和地理校验待接入。

`features/addresses/local-addresses.js` 在 development / shell 下使用 AppID 分区 `jiajiale.local-addresses.v1`，范围为 LOCAL_DEVICE。与收藏相同，这是本机数据，不声称微信账号 A / B 或跨设备隔离。正式模式不会读用这些草稿。

地址页从 Account 现有入口进入，支持新增、编辑、删除、设为默认和重新读取。收件人、省 / 市 / 区县、门牌为手工输入；编码及位置保持 null。客户端只作草稿格式校验，手机号暂支持 `1[3-9]` 开头的 11 位中国大陆手机号，不验证号码归属，也不把此规则当作用户已确认的正式经营政策。服务端创建 / 更新要求注入已配置的 validatePhone，缺失时报 CONFIGURATION_REQUIRED；未核验行政编码、地图 token、客户端 Location 不被当成可信位置。

默认地址是单一 defaultAddressId 指针，没有持久化竞争的 isDefault。新增地址不自动变默认；删除默认地址同时清空指针，不自动提升其他地址。整本机地址簿单值写入并读回，revision 和地址 version 校验旧编辑 / 默认 / 删除 / 选择。失败保留输入，确认结果不明确时提示先返回列表检查；同旧 revision 重试已写入的新增不会再创建另一条。

Checkout 导向同一地址页的选择模式，不复制 CRUD。没有显式选择时读取当前默认；显式选择保存 addressId + version。编辑或删除已显式选择的地址后，核对页清空该地址并要求重新选择，不悄悄回退到另一条默认地址。选择后返回原核对页，商品输入和小计不变。X01 验收时配送地址块仅用于本机输入；后续 X02 已接入自取 / 配送分支，自取不读取 / 展示配送地址，配送继续共用本模块。范围、正式报价和订单仍未开放；完整组合由 X03–X07 推进。

服务端 `address-model.js / address-service.js` 复用 D06 可信 principal 和 D07 请求白名单 / 摘要 / 幂等键，提供内部 create / get / update / remove / setDefault 离线编排。地址与用户指针、命令回执必须在同一事务提交；地址 CAS 检查 version，默认竞争还检查 user version。删除为软删除；重放原响应不复活地址。返回字段按白名单筛选，无 owner / 平台身份；setDefault 当前只投影 userId / version / defaultAddressId，完整 Profile 读模型待后续服务接入。

`snapshotAddress` 校验本人 / 未删除 / address version，深拷贝并冻结地址与位置白名单；之后编辑 / 删除来源不会改变既有快照。这是内部地址快照辅助函数，不是已创建订单。位置只接受可信服务已统一的 WGS84，未来 Quote 仍须重新验证号码、地理来源、范围与地址版本。手工地址无法据此取得配送通过结果。

SDK 适配器必须提供原子事务、唯一稳定地址 ID、创建时不存在 / 更新时版本匹配检查、用户与地址同事务、回执一起提交。当前没有云 handler / SDK / 部署；address.list 有意保持 CONFIGURATION_REQUIRED，不能返回未经 D07 签名游标校验的假分页。真实本人列表 / 账号 A/B / 数据库规则 / 默认并发需云环境就绪后补验收。

新增 19 项，全套 288/288；静态 194 文件，主包 2010 / 2048 KiB、features 65 KiB、legacy 45 KiB 源估算。覆盖本机 CRUD / 新客户端恢复 / AppID 分区 / 默认竞争 / 删除规则 / 旧版本 / 非法输入 / 不确定写入 / 选择失效 / 页面隐藏，及服务端可信身份 / 越权 / 事务回滚 / 幂等 / 地址快照白名单。

微信工具真实填表、拒绝手机号 123、保存两条显式验收地址、设默认与重进恢复、Checkout 读取默认 / 选择另一条 / 返回、编辑后的版本失效 / 重新选择，以及删除默认清空指针 / 删除所选失效均通过。删除取消与确认使用 showModal 受控返回回调，保存 / 删除是真实服务与 Storage 读回；不是人工原生弹窗点击验收。mock 已恢复。四张 366×793 截图已检查字段、留白、固定按钮和安全区，见 `docs/qa/2026-10-04/x01-*.png`。

本轮前地址及核对输入存储键不存在；测试地址先经 UI 删除，再仅清理本轮新增的两个键。原购物袋完整原始 JSON（含 revision、回执、勾选及留言）前后一致，收藏及其他既有存储未改。Node 新客户端重建覆盖持久恢复；微信完整进程重启 / 真机待补。平台既有 network offline SDK 日志不能报告为无错误。

下一项 X02：门店 / 履约配置读取与自取表单。继续保留已确认的每日 08:00–21:00、自取 / 配送 30 分钟独立容量、20 km 含边界 / 免费 / 预计配送政策；门店电话及正式参数不编造。未提交 / 推送 / 上传 / 部署，既有未提交改动保留。

---

<a id="x02-store-fulfillment"></a>

## 原记录：X02-STORE-FULFILLMENT.md

<a id="x02-store-fulfillment--x02门店资料履约切换与自取联系人"></a>
# X02：门店资料、履约切换与自取联系人

2026-10-04。已完成本机草稿、服务端内部离线预检和微信模拟器验收。正式门店配置读取、身份、地理核验、时段、报价与订单仍待云环境及经营资料，不开放正式购买。

门店参考资料独立放在 `miniprogram/fixtures/store-reference.js`，由 `store-information.js` 供核对页和 Account 门店说明共用。资料来自用户确认：家家乐蛋糕店，安徽省合肥市庐江县X085沙溪派出所南侧约50米，每天 08:00–21:00；自取 / 配送各 30 分钟，自取容量 3 单、配送 1 单，门店自行配送，20 km 含边界、免费、预计时间段。参考状态为 CONFIGURATION_PENDING，没有伪造 OPEN、正式 storeId、已发布配置或可信位置。门店电话为 null，界面说明正在准备；客服仍待配，不生成假电话 / 地图入口。旧 `data/store.json` 的定金、旧营业时间和演示资料不进入本链路。

核对页默认到店自取，显示门店地址 / 营业时间、姓名与手机号表单。自取不读取地址簿、不要求配送地址、费用为 0。选择商家配送后才读取 X01 共用地址选择模块；切回自取只清空页面上的配送地址，不删除地址簿或所选地址引用。配送文案说明范围、预计时间与云端最终校验，不承诺分钟送达。两分支均保留本机商品小计，底部正式下单按钮保持禁用。

`features/checkout/fulfillment-draft.js` 只在 development / shell 工作，按 AppID 保存 `jiajiale.local-fulfillment-draft.v1`，范围 LOCAL_DEVICE。保存方式、取货联系人、参考资料 ID / 版本及 revision，整值写入并读回。旧 revision、停业 / 已禁用方式、资料变化和未确认写入不报成功；重新选择方式可确认最新参考版本。联系人与 X01 地址共用草稿手机号格式检查，暂为 `1[3-9]` 开头的 11 位中国大陆号码，不能当作已批准的正式号码政策或号码归属验证。正式模式不读用这些草稿。

保存成功的联系人及方式在重新进入页面或新建客户端后恢复。未保存 / 非法输入在同一页面返回、重新读取与方式切换中保留供修改，不宣称完整进程重启会恢复未保存输入。页面隐藏后的异步结果不更新可见状态；保存失败保留表单，不使用假成功反馈。

`cloudfunctions/_shared/store-fulfillment.js` 提供内部 `projectStoreInformation` 与 `resolveFulfillmentInput`。输入须由未来服务读取可信门店和配置；验证 OPEN 门店、关联 PUBLISHED 配置、政策、时区 / 时间参数、可用履约方式及当前版本。联系人由注入的正式 validatePhone 校验；可信 D06 principal 必须有效。客户端多传费用、状态、owner 等字段拒绝。自取地址 ID 必须缺省 / null、配送费 0；配送要求地址 ID，但仍明确 requiresAddressValidation / requiresAppointmentValidation，checkoutAllowed=false。投影按白名单，不泄露内部资源计数或发布指针。

上述预检不是完整 Quote：尚未验证配送地址本人所有权 / 当前地址版本 / 可信坐标 / 范围，尚未组合时段、目录、库存或占用资源。没有 `store.get` handler、SDK、部署或客户端云 allowlist 扩展。真实门店缺电话、提前量、最远预约天数等资料，不能通过正式报价门禁。测试内电话、60 分钟 / 7 天等值标为 OFFLINE TEST ONLY，不迁入经营配置。D05 只导出已有 `validateTimePolicy` 供复用，未改变算法或已确认政策。

新增 13 项（本机草稿 5、服务端预检 4、页面 4），全套 **301/301**；静态 **202** 文件，4 主包页面 / 16 分包页面。主包源估算 **2013 / 2048 KiB**、features **77 KiB**、legacy **45 KiB**；实际包体仍以微信打包为准。测试覆盖持久恢复 / AppID 分区、非法联系人、版本竞争、资料变化、停业 / 自取禁用、不确定写入、页面隐藏及切换保留，服务端可信身份、配置关联 / 发布、版本和白名单拦截。既有 X01 / B06 / Account 测试适配双分支后继续通过。

微信工具实际从原购物袋进入核对页，姓名与手机号 123 输入后保存拒绝；更正为测试号码后真实保存并读回。重进自取恢复联系人；切配送、重进恢复配送；切回自取恢复联系人、清空页面地址、商品小计不变，正式下单仍禁止。Checkout WXML 编译摘要成功。两张 366×793 截图已核对表单、方式按钮、字号、留白和固定底部安全区：[自取](../../qa/2026-10-04/x02-pickup.png)、[配送](../../qa/2026-10-04/x02-delivery.png)。未使用 setData 或假加购 / 保存回调作为通过证据。

工具存储读取 / 导航曾超时，重开项目窗口后恢复；一次保存后的只读存储查询 socket hang up，该轮清理测试输入后重新完整验收，通过才记录成功。QA 脚本的存储键比较括号错误已修正，不是业务数据变化；实际前后键列表相同。测试前联系人与核对输入键不存在，结束仅删除本轮新建两键；原购物袋完整 JSON 含 revision / 回执 / 留言 / 勾选一致，原存储键恢复，地址 / 收藏 / 旧数据未改。SDK `webapi_getwxaasyncsecinfo:fail network offline` 仍存在，不能报告无错误；完整微信进程退出重启、真机、云 / 真实账号验收待补。

下一项 **X03**：复用 D05 距离模型，补可信地址 / 规则 / 版本的服务端范围评估编排与本机待核验状态。原始高德门店坐标仍为 GCJ-02，不能仅改标签作为 WGS84；未定位地址不得显示配送通过。现有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

---

<a id="x03-delivery-range"></a>

## 原记录：X03-DELIVERY-RANGE.md

<a id="x03-delivery-range--x03-配送范围离线编排与本机状态"></a>
# X03 配送范围：离线编排与本机状态

2026-10-05。保留 `codex/ui-refresh-2026-10-05` 的 UI 基线；本轮不修改已验收界面。

<a id="x03-delivery-range--实现范围"></a>
## 实现范围

`cloudfunctions/_shared/delivery-evaluation.js` 提供内部纯函数 `evaluateDeliveryInput`，没有网络 handler、数据库写入、地图调用或报价授权。请求仅允许 storeId、expectedStoreVersion、expectedConfigVersion、addressId、expectedAddressVersion 五个字段；可信服务端加载器另行提供门店、已发布配置、地址、D06 principal 和核验上下文。

检查本人所有权、地址未删除及当前版本、门店营业与配送启用、配置版本和生效时间。V1 必须恰有一个 ACTIVE 配送规则：门店自行配送、WGS84 半径 20000 米（含边界）、固定费用 0 分、预计配送时段。歧义规则、错误费用、规则中心与门店位置不一致均拒绝。

`verifyLocation(binding, location)` 是尚待实际地图服务实现的同步可信适配器接口，必须返回严格的 true。绑定实体类型、ID、版本与精确位置摘要；source / verifiedAt 字段本身不构成证明，Promise、伪造标记、缺失或未来时间位置均不能通过。正式适配器必须查验受控位置核验记录与有效期，不能直接相信客户端传入坐标。用户提供的高德 GCJ-02 坐标未转换成正式 WGS84 门店位置。

复用 D05 距离算法，20 km 边界包含，边界外 1 mm 拒绝，不扩大配送半径。返回深冻结的 OFFLINE_DELIVERY_EVALUATION、地址快照、范围结果、费用事实和绑定摘要；摘要覆盖环境、本人、门店 / 配置 / 地址 / 规则版本及位置。摘要不是认证凭证，不生成假的 evaluationId。requiresEvaluationPersistence 与 requiresAppointmentValidation 均为 true，checkoutAllowed 始终为 false。X05 仍需实际服务端保存、绑定报价并在提交时重新核验。

本机 Checkout 的 `delivery-status.js` 仅显示 ADDRESS_REQUIRED、ADDRESS_CHANGED、PENDING_CLOUD_VERIFICATION。手填地址 location=null；编辑或删除已选地址后要求重新选择，客户端任何 inRange 标记都不能开启购买。切回自取清除页面配送地址和范围状态，不删除地址簿或联系人输入。

<a id="x03-delivery-range--验证与边界"></a>
## 验证与边界

本项新增 9 项回归：服务端 6、客户端状态 1、Checkout 页面 2；含内 / 外 / 边界、无可信位置、本人 / 版本 / 配置失效、规则与费用拒绝、输出不可变及绑定变化。本轮相关回归 13/13 通过；UI 快照提交时全套 335/335、静态 215 个文件通过。测试使用 OFFLINE_TEST_ONLY 合成位置及配置，不代表门店实际经营参数。

微信开发者工具真实保存 / 选择测试地址、重进恢复待核验、编辑后失效、重新选择新版地址、切回自取清状态均通过，WXML 编译通过。首次重新选择导航未确认；加入页面数据读取后完整重测通过，未修改业务代码，不把首次失败隐去。两张 366×793 截图已核对：[待核验](../../qa/2026-10-05/x03-pending-range.png)、[地址失效](../../qa/2026-10-05/x03-changed-address.png)。删除测试地址使用受控 showModal 确认回调，随后恢复 mock；原购物袋完整 JSON、存储键集合与原履约 / 核对输入已验证保留。SDK 3.17.2 的 webapi_getwxaasyncsecinfo:fail network offline 日志仍存在，不称控制台无错误。

正式地图 / 地址验证、数据库保存、真实 A/B 权限与 SDK、实际云报价、库存与容量、真机仍未验收。云 allowlist 保持 user.me / store.health，不开放订单或付款。下一项 X04 预约时段仍需区分可约展示与实际占用；缺提前量及最大预约天数时不得编造经营值。

---

<a id="x04-appointment-availability"></a>

## 原记录：X04-APPOINTMENT-AVAILABILITY.md

<a id="x04-appointment-availability--x04-可约日期时段与容量"></a>
# X04 可约日期、时段与容量

2026-10-05。当前完成内部离线读模型和本机待配置提示；正式云可约查询和实际容量锁定尚未接入。

<a id="x04-appointment-availability--服务端内部读模型"></a>
## 服务端内部读模型

`cloudfunctions/_shared/appointment-availability.js` 的 readAppointmentAvailability 接受服务端可信门店、发布配置、购物袋、目录、所查日期 / 模式的容量记录、D06 principal 和服务端时钟 / 数量限制。请求严格只有 storeId、expectedStoreVersion、expectedConfigVersion、fulfillment、serviceDate、selection；selection 复用 B06 的 cartId / expectedVersion / 行 ID 与行版本。客户端时间、提前量、容量与费用字段不受理。

复用 X02 发布配置检查和 B06 本人购物袋 / 正式 SKU / 数量 / 留言重核验，提前量从所选正式商品读取，取门店与各商品的最大值。缺提前量、最大预约天数、正式商品或发布配置时拒绝，不从草稿猜默认值。时区使用 Asia/Shanghai；当地今天至配置最大预约天数含末日，是查询边界，**不是每天都有可约时间的保证**。每次查询一个日期，便于后续按日刷新，不一次返回无限日历。

复用 D05 半小时网格、营业窗口、日期覆盖、严格提前量截止和配置校验。正常完整营业日每模式 26 段，最后为 20:30–21:00；过去日期、窗口外日期、非法日期不可查询，临时关闭返回空时段列表。最早开始必须严格晚于服务端 now + 最大提前量。

每个合法定义与真实 SLOT 容量记录关联；不初始化库存、不假造零占用。状态：

| 状态 | 含义 / 可选性 |
|---|---|
| AVAILABLE | 当前 OPEN 且剩余至少一单，可选但未占用 |
| FULL | held + confirmed + consumed 达到容量，不可选 |
| CLOSED | 记录关闭，不可选 |
| UNVERIFIED | 缺真实记录，剩余量 null，不可选 |
| STALE | 记录与当前定义 / 政策不一致，剩余量 null，不可选 |

自取容量 3、配送 1，资源 ID 含履约模式；同一时段互不挤占。重复、混店 / 混日期 / 混模式及非法占用计数拒绝整次读取。配置变更不新造时段 ID，不清除旧计数。记录版本、配置 / 时间政策摘要、所选行 / 商品版本和提前量、查询时间与可约结果进入内部摘要，变化后需重新读取。

输出 OFFLINE_APPOINTMENT_AVAILABILITY，公开白名单只含日期查询边界、模式 / 时区、时段起止 / 标签 / 容量 / 状态 / 版本和重核验说明；不暴露本人 ID 或联系人。摘要不是认证或预约凭证。capacityReserved=false、checkoutAllowed=false、requiresCloudRevalidation=true；配送还需 X03 正式范围核验。X05 报价和最终提交仍需读当前配置 / 商品 / 时间 / 资源，D04 原子事务最终占用；列表可选不能保证稍后仍有名额。

<a id="x04-appointment-availability--本机页面与字体"></a>
## 本机页面与字体

核对页新增小型预约说明区，自取标题“预约自取时间段”，配送标题“预计配送时间段”；展示已确认的 30 分钟与每段最多 3 / 1 单。当前参考门店为 CONFIGURATION_PENDING，商品提前量和真实容量未知，故不展示虚假日期选项或空余数，不保存假的所选时段。配置失效、加载失败时清除提示状态，重进和切换重新按当前模式计算。

本区遵循 UI-TYPOGRAPHY：标题 14px / 600 / #111 / 1.6，规则 13px / 400 / #777 / 1.5，辅助说明 12px / 400 / #888 / 1.6。对应规范的表单分组、次级信息与辅助说明职责；这些是本区当前实际值。建议后续仅在用户要求调整核对页时统一已有 rpx 字体，本轮不修改其他页面或已有布局，视觉由用户编译后真机确认。

<a id="x04-appointment-availability--验证"></a>
## 验证

新增 9 项回归（时段模型 8、核对页 1），全套 344/344 通过；静态 218 个文件通过，主包源估算 1213 KiB、features 87 KiB、legacy 45 KiB。测试使用 OFFLINE_TEST_ONLY 提前量 60 / 90 / 180 分钟、最大 7 天、隔离目录与资源，均不是正式门店配置。

微信开发者工具真实核对页切换自取 / 配送、3 / 1 单规则、待配置且没有虚假选项、重进恢复通过；WXML 与 WXSS 局部编译通过。[配送预约提示截图](../../qa/2026-10-05/x04-delivery.png)已核对，未归档含原联系人信息的自取截图。原履约方式 / 联系人恢复，购物袋完整 JSON 与存储键未变；没有创建预约键或回执。此前 SDK network offline 日志问题未称已解决。正式可约 handler、SDK 实际资源 / 并发、云权限、真机与真实预约选择仍未验收。下一项 X05 可信报价，继续先完成参数化内部模型；正式经营参数缺失时购买门禁保持关闭。

---

<a id="x05-trusted-quote"></a>

## 原记录：X05-TRUSTED-QUOTE.md

<a id="x05-trusted-quote--x05-可信报价离线规划与重核验"></a>
# X05 可信报价：离线规划与重核验

2026-10-05。当前仅服务端内部纯模型，无 quote.create / quote.get handler、云保存、客户端正式报价或资源占用。保留全部已有 UI 和 X03 / X04 未提交改动。

<a id="x05-trusted-quote--输入与可信来源"></a>
## 输入与可信来源

`cloudfunctions/_shared/quote-model.js` 提供 planQuoteCreation、revalidateQuote、projectQuotePreview。入口复用 D07 的 checkout.quote.create 请求白名单：购物袋 ID / 版本、所选行 ID / lineVersion、方式、联系人、本人地址 ID、slotId、可选备注与幂等键。网络行版本明确转换为 B06 内部 expectedLineVersion；不接受客户端价格、总额、角色、坐标、费用、评估 ID、时钟或额外字段。订单备注 null 拒绝，省略为规范化空字符串。

门店、发布配置、本人购物袋、目录、地址、真实时段与库存记录，以及 principal / 时钟 / 数量限制均必须来自受控服务端加载器的一致读取；模型参数本身不是网络身份验证。复用 X02 联系人号码校验、B06 正式 SKU / 数量 / 留言 / 行版本重核验、D05 当前日期 / 最大提前量 / 时段定义与余额，以及 X03 本人地址 / 当前规则 / 精确位置可信核验。店或商品提前量、最大预约天数、quoteTtlMinutes、号码政策、备注政策、可信实拍核验任何一项缺失，不能生成正式报价。

verifyProductImage 接收产品 ID / 版本与冻结的 MediaRef 白名单；必须由正式素材加载器确认受控实拍引用，严格返回 true。开发 Hero 或参考图不代替正式商品图。validateOrderNote 是尚待经营备注限制配置的可信适配器，不猜长度；validatePhone 和 verifyLocation 同样不能用客户端自证结果代替。测试中的 true 适配器仅为隔离用例。

<a id="x05-trusted-quote--金额快照与时间"></a>
## 金额、快照与时间

价格从当前 SKU 重算，所有金额为 CNY 安全整数分；共享库存需求按整个所选袋聚合。未选行不进入报价，缺库存 / 不足 / 关闭或不可约时段拒绝。每订单 SLOT 需求为 1，不按商品数量占用预约名额；自取和配送容量独立。

调用 D02 captureOrderFacts 捕获版本化商品 / 留言 / 图片、袋选择证据、门店 / 联系人 / 地址 / 时段 / 配送规则及金额的不可变白名单快照。自取地址 null、运费 0、配送评估字段 null；配送经 X03 通过后亦为 0 分，并绑定地址版本 / 摘要和当前规则。报价规划生成的 quoteId 和配送 evaluationId 是确定性的**待保存标识**，仅在内部 OFFLINE_QUOTE_PLAN 中返回；不冒充已存在的报价或已保存的评估凭证。

过期时间取 min(createdAt + 发布配置 quoteTtlMinutes, 时段开始 - 最大提前量)，必须严格晚于创建时间；拒绝非法或溢出时效。now >= expiresAt 即失效，无需等待 TTL 清理。报价时效不等于订单付款保留时长，模型没有猜 paymentHoldMinutes。

<a id="x05-trusted-quote--保存重复请求与重核验"></a>
## 保存、重复请求与重核验

规划返回 proposedQuote、当前 STOCK / SLOT resourceVersions、幂等摘要与 requiredEffects；配送另附待保存的评估追踪内容。requiresAtomicPersistence=true，必须实际原子保存报价、幂等结果以及关联配送追踪后才可报告成功。追踪持久化位置仍待云接入设计；没有新增评估数据库集合。capacityReserved=false、stockReserved=false、checkoutAllowed=false。

幂等键按环境 / 本人 / checkout.quote.create 绑定业务请求摘要。已保存同键同参返回 REPLAY 决策，同键异参拒绝，未决回执返回 BUSY；这些是 D04 离线决策，未获得真实锁或完成 SDK 重放验收。没有受控回执时同 ID 再次规划不构成自动去重，未来插入和幂等回执必须同事务。

revalidateQuote 只接受服务端读取的本人记录，检查结构 / 未消费 / 时效，再从当前可信数据重建事实并比对版本、价格、地址、配置、资源证据与截止。价格或商品版本变化需要重新报价；已满或关闭的时段 / 库存不足不能继续使用旧报价。资源版本即使余额仍足够，只要证据版本变动也保守要求刷新。门店版本单独变化但快照事实不变的自取场景按当前 D02 结构比较经营事实及发布配置版本，不声称已增加 storeVersion 字段。消费检查不等于实际消费；order.create 仍需真实事务完成全资源预留和唯一消费。

projectQuotePreview 经重核验后投影 OFFLINE_QUOTE_PREVIEW，只含买方商品、金额、联系人 / 地址、时段和时效；不暴露资源版本、袋证据、评估 ID / 指纹、本人 ID 或内部坐标。配送显示 ESTIMATED。该投影尚未接客户端，不新增下单成功提示。

<a id="x05-trusted-quote--验证与下一项"></a>
## 验证与下一项

新增 13 项报价回归，全套 **357/357** 通过，静态 **221** 个文件通过；主包源估算仍 **1213 KiB**，features **87 KiB**、legacy **45 KiB**。涵盖双分支、整数金额、选中行、共享库存聚合、伪造价格拒绝、满额 / 缺库存、未定位 / 越界、过期等号边界、提前量截止、改价 / 地址 / 配置 / 资源版本失效、幂等及公开投影隐私。测试 TTL 10 分钟、备注 30 字、提前量 60 分钟、最大 7 天、模拟实拍引用与 (0,0) 点均为 OFFLINE_TEST_ONLY，不代表正式经营资料。

本轮无页面或素材变动，未重复操作微信模拟器；X04 原生验收记录保留。本项没有实际云持久化 / 地图 / SDK 并发 / 真实 A/B / 报价重放验收。下一项 X06 Checkout 双分支与输入保留组合；云购买门禁仍关闭。不提交 / 推送 / 上传 / 部署。

---

<a id="x06-checkout-confirmation"></a>

## 原记录：X06-CHECKOUT-CONFIRMATION.md

<a id="x06-checkout-confirmation--x06-双分支确认状态与输入保留"></a>
# X06 双分支、确认状态与输入保留

2026-10-05。完成本机输入保留组合、派生状态失效处理和未来报价适配器所需的纯客户端确认模型；未接正式云报价、预约选择、订单或付款。

<a id="x06-checkout-confirmation--本机核对页"></a>
## 本机核对页

沿用共用地址模块、门店参考资料、自取联系人草稿、逐行蛋糕留言、商品小计与 0 元运费。未增加额外订单级蛋糕留言，不把本机金额当正式总价。

同一个核对页内未保存联系人可以随自取 / 配送切换、访问地址页及返回保留；只有显式保存且读回确认才写入本机。新建页面恢复已保存联系人，未保存输入不跨页面实例持久化；不误称完整进程重启恢复。配送地址仍按共用地址簿所选 ID / 版本恢复，地址编辑 / 删除要求重选；切回自取清页面地址和范围，不删除地址簿或联系人。

方式写入竞争、门店参考变化、方式不可用或未确认写入时，清除旧地址 / 配送范围 / 预约提示，并关闭分支资格，保留表单输入供重新读取或修改。多个异步重载只采用当前 epoch，隐藏页面的迟到读取不能更新当前内容。

核对页接入 confirmation-session 的失效入口：重载、隐藏、联系人编辑、方式切换、地址刷新 / 选择、返回购物袋及输入保存错误都会丢弃报价确认请求。没有调用报价 begin / receive 的生产网络路径；当前 allowlist 没有 quote handler，不会伪造报价结果。

<a id="x06-checkout-confirmation--确认状态模型"></a>
## 确认状态模型

`miniprogram/features/checkout/confirmation-session.js` 不依赖 Node 内建模块，不读写 Storage、不发请求、不建订单、不调用付款。状态为 EMPTY / LOADING / READY / ERROR / EXPIRED，checkoutAllowed 始终 false。READY 只表示模型中收到符合目标 Quote DTO 形状的确认内容，不是下单或支付成功。

begin 对本次请求的门店、购物袋 / 行版本、方式、联系人、地址 ID、slotId 与备注做独立副本和冻结，生成递增 ticket；新请求和 invalidate 清空旧确认。receive / failed 只处理当前 LOADING 的 ticket，模式 / 输入改变后的旧响应、错误后的迟到成功以及重复成功均忽略。now >= expiresAt 清除旧金额和摘要，网络错误亦清除；用户表单独立保留。

目标 Quote DTO 必须为 ACTIVE / 未消费，方式、门店、联系人和备注与请求相符，整数金额逐行计算一致，运费按 V1 为 0，预约为 Asia/Shanghai 当地同日的 30 分钟段。到期、错误方式 / 门店、消费、异常金额或包含 OFFLINE_* 标记的对象不能成为确认。只保留买方白名单，剔除嵌套资源 / 袋证据 / 坐标；配送时间按 ESTIMATED 呈现。客户端这些检查仅用于避免显示错误，不能代替云端本人 / 范围 / 时段 / 库存最终裁决。

测试构造目标 DTO 形状时使用隔离服务端规划器生成的数据并在测试文件中去掉 offline 标记，**此转换仅存在测试，运行代码不提供转换或假云适配器**。实际云接口接入前不能将此测试视为真实报价确认通过。

<a id="x06-checkout-confirmation--验证与边界"></a>
## 验证与边界

新增 12 项：确认模型 8、核对页组合 4；相关测试 31/31，全套 369/369 通过。覆盖切换 / 返回的未保存输入、保存状态、竞争失效、乱序重载、旧响应、错误 / 到期清除、金额及字段拒绝、逐行留言和内部证据剔除。X06 静态 223 个文件通过，主包源估算 1213 KiB、features 94 KiB、legacy 45 KiB；合并 X07 后最新全套 375/375、静态 225，features 97 KiB，其余包不变。微信真实输入未保存联系人、双模式切换、地址页返回同实例保留、返回购物袋关闭实例及重新进入恢复已保存联系人通过。未点击保存，实际联系人存储保持原值；原模式 / 联系人、购物袋完整 JSON、核对草稿和存储键均已验证恢复。最初脚本错误假设返回购物袋后仍可 navigateBack 原实例，实际页面栈为单独购物袋，已修正验收路径。运行时 currentPage 查询出现卡住 / terminated，曾安全停止只读助手并重开项目窗口；新页恢复通过独立补验和实际 getData 确认，非一次完整脚本无错误通过。SDK offline 仍保留，不归档联系人截图。

本轮没有 WXML / WXSS / 字体或其他页面布局变动。正式 quote 网络错误与过期仅模型注入验证，云正向确认摘要、真实预约选择、A/B、SDK / 完整进程重启 / 真机仍待补。下一项 X07 提交契约和阶段验收，不能宣布 Checkout 整阶段已完成或开放订单 / 付款。
