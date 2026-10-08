# X03 配送范围：离线编排与本机状态

2026-10-05。保留 `codex/ui-refresh-2026-10-05` 的 UI 基线；本轮不修改已验收界面。

## 实现范围

`cloudfunctions/_shared/delivery-evaluation.js` 提供内部纯函数 `evaluateDeliveryInput`，没有网络 handler、数据库写入、地图调用或报价授权。请求仅允许 storeId、expectedStoreVersion、expectedConfigVersion、addressId、expectedAddressVersion 五个字段；可信服务端加载器另行提供门店、已发布配置、地址、D06 principal 和核验上下文。

检查本人所有权、地址未删除及当前版本、门店营业与配送启用、配置版本和生效时间。V1 必须恰有一个 ACTIVE 配送规则：门店自行配送、WGS84 半径 20000 米（含边界）、固定费用 0 分、预计配送时段。歧义规则、错误费用、规则中心与门店位置不一致均拒绝。

`verifyLocation(binding, location)` 是尚待实际地图服务实现的同步可信适配器接口，必须返回严格的 true。绑定实体类型、ID、版本与精确位置摘要；source / verifiedAt 字段本身不构成证明，Promise、伪造标记、缺失或未来时间位置均不能通过。正式适配器必须查验受控位置核验记录与有效期，不能直接相信客户端传入坐标。用户提供的高德 GCJ-02 坐标未转换成正式 WGS84 门店位置。

复用 D05 距离算法，20 km 边界包含，边界外 1 mm 拒绝，不扩大配送半径。返回深冻结的 OFFLINE_DELIVERY_EVALUATION、地址快照、范围结果、费用事实和绑定摘要；摘要覆盖环境、本人、门店 / 配置 / 地址 / 规则版本及位置。摘要不是认证凭证，不生成假的 evaluationId。requiresEvaluationPersistence 与 requiresAppointmentValidation 均为 true，checkoutAllowed 始终为 false。X05 仍需实际服务端保存、绑定报价并在提交时重新核验。

本机 Checkout 的 `delivery-status.js` 仅显示 ADDRESS_REQUIRED、ADDRESS_CHANGED、PENDING_CLOUD_VERIFICATION。手填地址 location=null；编辑或删除已选地址后要求重新选择，客户端任何 inRange 标记都不能开启购买。切回自取清除页面配送地址和范围状态，不删除地址簿或联系人输入。

## 验证与边界

本项新增 9 项回归：服务端 6、客户端状态 1、Checkout 页面 2；含内 / 外 / 边界、无可信位置、本人 / 版本 / 配置失效、规则与费用拒绝、输出不可变及绑定变化。本轮相关回归 13/13 通过；UI 快照提交时全套 335/335、静态 215 个文件通过。测试使用 OFFLINE_TEST_ONLY 合成位置及配置，不代表门店实际经营参数。

微信开发者工具真实保存 / 选择测试地址、重进恢复待核验、编辑后失效、重新选择新版地址、切回自取清状态均通过，WXML 编译通过。首次重新选择导航未确认；加入页面数据读取后完整重测通过，未修改业务代码，不把首次失败隐去。两张 366×793 截图已核对：[待核验](qa/2026-10-05/x03-pending-range.png)、[地址失效](qa/2026-10-05/x03-changed-address.png)。删除测试地址使用受控 showModal 确认回调，随后恢复 mock；原购物袋完整 JSON、存储键集合与原履约 / 核对输入已验证保留。SDK 3.17.2 的 webapi_getwxaasyncsecinfo:fail network offline 日志仍存在，不称控制台无错误。

正式地图 / 地址验证、数据库保存、真实 A/B 权限与 SDK、实际云报价、库存与容量、真机仍未验收。云 allowlist 保持 user.me / store.health，不开放订单或付款。下一项 X04 预约时段仍需区分可约展示与实际占用；缺提前量及最大预约天数时不得编造经营值。
