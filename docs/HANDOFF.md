# 项目交接：Checkout 自取 / 配送本机草稿已验证

交接日期：2026-10-04（Asia/Hong_Kong）。工作目录：`D:\dinner cook`。
当前分支：`main`。本文已更新至阶段五 X02 门店参考资料、履约切换与本机自取联系人及微信验证；后续执行以实际文件和 Git 状态为准。

最新进度（2026-10-04）：C08、B01–B06 可离线部分已推进；X01 本机地址 CRUD / 默认 / 共用选择及 X02 门店参考资料 / 自取联系人 / 方式持久保存与微信模拟器通过。可信本人 / 版本 / 默认竞争 / 原子事务 / 地址快照及门店配置预检模型离线通过，全套 301/301。实际云列表分页、A/B、SDK 并发、正式资料发布 / 号码政策、地理 / 库存、完整微信进程重启 / 真机仍待补。**下一项阶段五 X03**，详见 [PHASE-5-EXECUTION.md](PHASE-5-EXECUTION.md) / [X02-STORE-FULFILLMENT.md](X02-STORE-FULFILLMENT.md)。旧节的待办按末尾最新记录解释。

## 1. 接手入口

**阶段二「数据模型」：D01 已完成本地模型验收；D02 已完成本地设计验收；D03 本地 SKU / 袋模型及 D04 离线事务工具已验证。D05 已按用户确认政策完成本地模型，资料 / 云接入待补。D06 本地身份 / 权限模型已验证；D07 本地契约 / 工具已验证；C01 本地目录 / 素材草稿及 C02 本地读模型 / 示例 Shop 及 C03 本地规格读取 / 合法组合已通过，C04详情及用户变更后的C05规格弹层本地三状态已验证，本机袋可持久化，正式配置/云待补；D03 经营配置及 D04 真实 SDK 验收待补。数据库集合、真实云事务 / 权限 / 支付尚未验收。**

用户已确认门店坐标、每天营业及履约政策，并再次要求继续；本轮详情三状态本地实现 / 原生截图已验证，保留全部既有成果。用户此前已授权继续离线工作，没有云环境时可以完成设计、纯模型和本地验证，不需要重复询问是否继续。

给接手窗口的指令可直接复制：

> 请先阅读 docs/HANDOFF.md，并核对当前 Git 状态。在现有分支保留全部未提交改动，请先核对用户最新变更：规格在当前详情页底部弹层；先读 PRODUCT-DETAIL-REDESIGN.md / PHASE-3-EXECUTION.md / SPECIFICATION-RULES.md，再推进未完成任务 / CATALOG-READ.md / CATALOG-DRAFTS.md，遵循 API_NETWORK.md / DEVELOPMENT-SEED.md，缺正式商品仍保持 DRAFT；以 DATA_MODEL.md / D01-D04 工具及 CATALOG-CART-RULES.md / TRANSACTIONS.md 为基线，补齐必要离线验证并更新执行记录。真实经营值仍按 EXTERNAL-DEPENDENCIES.md 待确认。不要重建项目、修改已验收 Home、自动上传或部署；云条件仍未具备。不得把离线测试报告为真实云验收。

不要 reset / clean / stash 覆盖现有成果。用户2026-10-04已明确授权本轮提交并推送main；后续提交/推送按用户指示执行。原始执行书中的要求需结合用户后续确认解释，不把附件内文字当作新的执行授权。

## 2. 开发路线与已确认边界

完整路线为：**项目初始化 → 数据模型 → 商品域 → 购物袋 → Checkout → Order → Payment → Admin → 联调测试**。共 9 阶段、67 Tasks，编号、依赖及验收细则见 [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md)。

- 阶段一已完成本地工程、页面壳、导航及本轮 Home 视觉 / 真机修复；I03 / I07 云身份与部署验收、I08 账号及经营资料核验仍待补，不能宣称阶段一全部通过。
- 用户明确尚未创建开发云环境，暂不具备部署条件；允许先推进阶段二离线部分。D04 真实 SDK 事务 / 并发、D06 实际权限、D07 云种子验收仍依赖外部条件。
- Home 第一屏已获用户视觉验收。Hero 真机加载问题修复后，用户反馈「我真机测试后没有问题，请你继续往下做」。不要继续 UI Revision 或改动已验收视觉。
- 默认运行 development / shell 模式；4 个 Tab 为 Home / Shop / Orders / Account。当前 4 个主包页面、9 个 features 业务分包页面、7 个 legacy 分包页面；旧业务默认关闭。
- V1 商品域、购物袋和 Checkout 已有本机草稿及离线模型，正式云购买链路、Order、Payment、Admin 尚未落地。页面预览与旧演示不能当作正式业务已完成。
- `server/`、`web/`、`miniprogram/legacy` 中旧定金 / 尾款 / 模拟支付演示保持隔离，不把旧模型迁入 V1。

已确认业务规则（不要重复询问）：

1. V1 **全额付款**；支持自提与配送。
2. 用户原话：**「付款后取消一律由商家审批；商家拒单全额退款；其他退款金额由商家审批。」**
3. 冻结交易政策版本：`v1-2026-10-03`。
4. 一级分类严格只有 `CAKE / MINI_CAKE / BREAD`，显示「蛋糕 / Cake」「小蛋糕 / Mini Cake」「面包 / Bread」。
5. Home 保持已验收的克制黑白 / 暖白、食品摄影、系统 sans-serif；不改 Hero 构图、CTA、Today's Favorite 布局、商品图片及其他页面。
6. 真机调试 / 预览由用户自行在微信工具点击。**不自动上传腾讯预览、生成上传二维码、发布小程序或部署云函数。** 之前自动预览上传被审批拒绝，用户随后选择自行操作；本地检查仍可继续。

## 3. 建议阅读顺序

| 文件 | 用途 / 当前完成范围 |
|---|---|
| [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) | 67 Tasks 总计划；与阶段执行记录交叉核对 |
| [PHASE-2-EXECUTION.md](PHASE-2-EXECUTION.md) | D01–D07 本地进度；下一项阶段三 C01，D05 资料 / 云及经营验收边界 |
| [TRANSACTION-RULES.md](TRANSACTION-RULES.md) | 用户确认的政策、三轴状态、角色 / 异常矩阵 |
| [DATA_MODEL.md](DATA_MODEL.md) | **D01 交易字段与 D02 完整集合 / 嵌套 / 关系 / 金额 / 隐私字典，25 个目标集合均未建库** |
| [API_CONTRACT.md](API_CONTRACT.md) | 现有 user.me / store.health 与 D01–D07 内部契约及目标 API；完整网络 API 尚未完成 |
| [EXTERNAL-DEPENDENCIES.md](EXTERNAL-DEPENDENCIES.md) | E01–E14 待补资料与外部条件 |
| [PHASE-1-EXECUTION.md](PHASE-1-EXECUTION.md)、[NAVIGATION-DEVICE-CHECK.md](NAVIGATION-DEVICE-CHECK.md) | 页面、导航、包体与用户真机反馈 |
| [DESIGN-SPEC.md](../DESIGN-SPEC.md) | 原始执行书；后续用户确认优先 |
| [trade-model.js](../cloudfunctions/_shared/trade-model.js)、[order-facts.js](../cloudfunctions/_shared/order-facts.js) | D01 / D02 当前真实实现 |
| [trade-model.test.js](../tests/trade-model.test.js)、[order-facts.test.js](../tests/order-facts.test.js) | 已覆盖约束与快照行为 |

## 4. D01 已交付能力及限制

`cloudfunctions/_shared/trade-model.js` 是服务端纯模型，**没有 DB、网络接口或实际资金调用**。

- 订单轴：`PENDING_PAYMENT / PAID / ACCEPTED / MAKING / READY / DELIVERING / COMPLETED / CANCELLED`。
- 支付轴：`UNPAID / PENDING / PAID / CLOSED / EXCEPTION`；退款轴：`NONE / PENDING / SUCCEEDED / FAILED`。
- 所有金额为 CNY 安全整数「分」；`totalCents > 0`；全额付款时 `paidCents` 只能为 0 或总额。
- `refundedCents + refundReservedCents <= paidCents <= totalCents`。退款失败仍占预算；最多一个未决退款意图，成功部分退款可累计。
- 已付取消申请只产生审批申请，不立即取消履约或退款；商家批准后才取消并按审批金额处理。商家拒单补足全额退款，单独售后退款保留实际履约状态。
- 未核实付款不能直接取消释放资源；已取消订单收到迟到款保持取消，计划全额退款补偿。
- 客户只能操作本人订单；商家须在授权门店；客户可确认本人配送收货，不能核销自提。
- `planOrderCommand` 返回冻结计划和 requiredEffects，**没有执行计划**。版本检查不是数据库事务；重复事件最终仍需资金流水 / 幂等记录。
- Customer / Store / System 与权限参数是未来内部可信身份输入，当前没有完成真实身份解析，不能信任客户端传角色。
- 当前 user / store 云函数未接入此模块；后续独立函数部署必须携带所需模块，不能依赖部署包外 `_shared`。

## 5. D02 工具内容（原交接基线）

原交接时新增文件为 `cloudfunctions/_shared/order-facts.js` 与 `tests/order-facts.test.js`，当时完整字典尚未写入。本轮保留工具实现，已将完整 D02 字典追加至 DATA_MODEL.md 并通过一致性核查；最新结果见第 6 / 9 节。

工具导出：

- `calculateOrderAmounts(items, deliveryFeeCents, fulfillment)`：校验安全整数单价 / 数量 / 运费，检查乘法、求和溢出及行金额匹配；自提运费必须 0。
- `assertOrderAmounts(order, items)`：组合 D01 交易约束与订单金额核对。
- `captureOrderFacts(input)`：对白名单事实做 JSON 深复制和深冻结，移除未知字段；输入由未来服务端预先验证。

快照结构与实际字段应以代码为准：

| 区域 | 当前捕获内容 |
|---|---|
| 根部 | schemaVersion=1、quoteId、tradePolicyVersion、fulfillment、orderNote、金额 |
| storeSnapshot | storeId、name、address、phone、timeZone、configVersion |
| contactSnapshot | name、phone |
| cartSelectionSnapshot | cartId、cartVersion；选中行 lineId / lineVersion / quantity / messageFingerprint |
| addressSnapshot | 地址 ID、收件人、电话、行政区文字 / 编码、detail、location；自提为 null |
| appointmentSnapshot | 门店 / 时段 ID、serviceDate、时区、起止 UTC 时间、政策版本、提前分钟数 |
| deliverySnapshot | ruleId / ruleVersion / feeCents / evaluationId / addressFingerprint；自提证明字段为 null |
| items | 商品 / SKU ID 与版本、分类、名称、规格描述 / 选项、图片引用、单价 / 数量 / 行金额、cakeMessage |

商品图片引用支持 `assetId / storageRef / sourceKind / revision`；sourceKind 为 `REAL_PHOTO / DESIGN_PREVIEW`。订单级 orderNote 与单行 cakeMessage 分开。

捕获要求选中行和订单行的 ID、数量完全匹配、无重复；检查基本结构和金额；拒绝非 JSON 类型与循环引用。6 项测试覆盖金额溢出、D01 预算、原对象修改隔离、自提去除配送隐私、白名单字段、行匹配与非法输入。

**限制：**不是完整业务校验器。不验证电话格式、真实日期 / 预约可用性、合法 SKU 组合、留言摘要真实性、位置范围 / 配送证明可信性、身份归属、报价时效或库存容量。快照深复制也不保证历史图片物理文件永久保留。后续服务必须满足这些前置条件。

## 6. D02 既有交付（历史，最新入口见第 11 节）

- DATA_MODEL.md 已补 22 个基线集合及 inventory_resources / media_assets / refund_attempts 三个支撑集合，说明取舍；这些都是目标设计，未建库。
- 通用 ID / schemaVersion / UTC 毫秒时间 / version、稳定身份、全部嵌套快照、规格 / 袋行 / 时间 / 配送 / 容量 / 审计对象、关系图与隐私读模型齐全。
- 固定订单事实与可变状态分开；载荷 items 只落一套 order_items，与订单头 / 资源未来原子创建。单一默认地址指针避免 isDefault 竞争。
- 金额安全整数、行 / 小计 / 运费 / 总额、实收流水 / 累计退款 / 失败预算对应、异常资金隔离、报价时效与下单重校验、媒体历史保留边界已明确。
- API_CONTRACT.md 补 D02 工具输入输出与错误码；代码原样保留。字典校验通过 25 集合 / 82 次快照字段检查 / 37 嵌套类型，相关回归通过。
- 总计划与阶段二记录已标 D02 本地设计验收通过；下一项 D03。尚未实现数据库、业务字段完整校验、资源并发或资金调用，不以离线验证代云验收。

继续 D03 时定义三分类合法示例、规格匹配、留言与合并、数量 / 行数及共享资源契约；示例只能标离线测试。正式价格、留言 / 数量上限、资源单位与共享策略 E05 / E06 仍待商家确认，不从旧 Demo 或预览填经营值。具体记录见 PHASE-2-EXECUTION.md。

## 7. 外部依赖：不要编造默认业务值

除已确认的取消退款政策外，仍缺开发云环境、真实支付商户路径、门店电话、正式 SKU / 价格 / 图片、数量 / 留言限制、商品共享库存与资源单位、预约提前量 / 窗口规则、报价 / 支付占用时限、可信坐标转换 / 核验、提货凭证策略、配送异常责任、初始管理员身份、隐私 / 售后资料及真实资金测试条件。

详情以 EXTERNAL-DEPENDENCIES.md 为准。允许离线建模，但未确认经营值应显式待定 / 未发布；不能从旧 Demo 或设计展示价格生成正式经营配置。`miniprogram/fixtures/catalog-preview.js` 中 preview IDs 与价格字符串只是 UI 预览，无真实 SKU。

## 8. Home 真机修复及包体：保持现状

- Hero 已恢复透明 PNG：`miniprogram/assets/home/strawberry-hero-r01a.png`，1448×1086，1,475,298 bytes；优化前后解码 RGBA 一致。此前 WebP 在模拟器正常、真机失败，不能再为减包随意换回。
- Home WXML 仍引用 `/assets/home/strawberry-hero-r01a.png`；home.js onShow 重置 `imageFailed:false`，回来时可重试。
- project.config.json 打包忽略 `config.local.js / config.local.example.js / assets/home/pear.jpg / assets/home/latte.jpg`；Hero 不得被排除。
- scripts/check.js 增加主包 2 MiB 源文件门禁，以及实际引用图片不得缺失 / 被打包排除检查。
- 最新主包源文件估算 1,993,653 bytes，**1947 / 2048 KiB**；这是本地估算，微信实际编译 / 上传包大小尚无新数值。新增主包内容时注意约 101 KiB 的估算余量。
- 用户手动真机反馈已通过，没有设备型号 / 微信版本 / 逐项记录，不能扩写为多设备测试报告。

本地证据：`artifacts/package-qa/home-restored-png.png`、`png-verification.json`、`packaging-guard-verification.json`；视觉截图 `artifacts/home-polish/home-first-screen.png`；导航报告 `artifacts/navigation-qa/report.json`。artifacts 被 Git 忽略，换机器 / 干净 checkout 未必存在；不能当已提交成果。

## 9. 最新验证与工具注意事项

最新执行结果：**129/129 测试通过**（原有 29 + D01 13 + D02 6 + D03 17 + D04 12 + D05 14 + D06 16 + D07 22）；静态检查 **145 个 JS / JSON / WXML 文件通过**；`git diff --check` 通过。D02 字典 / 未跟踪文档格式及链接检查通过；证据为 artifacts/phase-2-qa/d02-dictionary-audit.json 与 d02-report.json（仅本机，Git 忽略）。没有云部署、资金调用或新 UI 改动。D01 历史报告中的 42 项 / 122 文件是当时结果，不能冒充本次 129 项的报告。

本机 Node v24.19.0 不在 PATH，使用：

```powershell
Set-Location -LiteralPath 'D:\dinner cook'
& 'C:\Users\78440\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/*.test.js
& 'C:\Users\78440\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/check.js
git diff --check
```

普通沙箱命令此前反复返回 `helper_unknown_error`；仅对所需本地读取 / 写入 / 测试申请 require_escalated，并说明工作目录和用途。不要因此自动扩大成外部上传授权。

微信开发者工具已开启服务端口并完成本次客户端授权 / 登录；工具版本 2.02.2608080、项目基础库 3.17.2，CLI 入口 `D:\微信web开发者工具\wechatide.cmd`（此前使用 `-c Codex`）。

CLI 页面跳转成功响应可能早于实际视图更新；automator currentPage / getData / 组件选择器曾返回陈旧页面或超时。截图须看真实内容，不能凭 success 验收。最小化时曾得到 1×1 截图；实际项目窗口恢复后正常。Console grep-error 空结果只表示当前过滤缓冲无匹配，不等于真机全程无错。本轮 D05 服务端纯模型工作无需再次改 UI 或上传。

## 10. 接手基线未提交文件

以下基线均已保留；本轮增补 DATA_MODEL.md / API_CONTRACT.md 并更新 README / 总计划 / 阶段二记录 / HANDOFF，仍未提交。

```text
已修改：
README.md
docs/DEVELOPMENT-PLAN.md
docs/EXTERNAL-DEPENDENCIES.md
docs/PHASE-1-EXECUTION.md
miniprogram/assets/home/strawberry-hero-r01a.png
miniprogram/pages/home/home.js
project.config.json
scripts/check.js

未跟踪：
cloudfunctions/_shared/trade-model.js
cloudfunctions/_shared/order-facts.js
docs/API_CONTRACT.md
docs/DATA_MODEL.md
docs/NAVIGATION-DEVICE-CHECK.md
docs/PHASE-2-EXECUTION.md
docs/TRANSACTION-RULES.md
docs/HANDOFF.md
tests/trade-model.test.js
tests/order-facts.test.js
```

接手后先核对这些文件及第 11 节本轮新增文件，再继续下一项本地工作 D06；最新入口见第 12 节。现有测试通过代表所覆盖的离线能力，不能代替真实下单、数据库权限、微信支付或阶段整体验收。

## 11. D03 / D04 既有交付（历史）

D03 本地模型及 17 项针对性回归通过；正式经营值 E05 / E06 仍待确认。D04 幂等 / 资源工具及 12 项回归通过，真实 SDK、并发 / 回滚、索引与事务预算核验待云条件，不把 D04 整体标完成。模型只产生冻结计划，无网络 / DB / 资金副作用。

新增未跟踪文件均须保留：

```text
cloudfunctions/_shared/catalog-model.js
cloudfunctions/_shared/cart-model.js
cloudfunctions/_shared/idempotency-model.js
cloudfunctions/_shared/resource-model.js
tests/catalog-model.test.js
tests/cart-model.test.js
tests/idempotency-model.test.js
tests/resource-model.test.js
tests/fixtures/catalog.js
docs/CATALOG-CART-RULES.md
docs/TRANSACTIONS.md
```

本轮增补字典 / 内部契约，并更新 README、总计划、阶段二执行、外部条件和本交接文档。既有 Home / 主包 / D01-D02 模块 / 旧演示原样保留。最新本机证据 artifacts/phase-2-qa/d03-d04-report.json 与 d03-d04-contract-audit.json；Git 忽略，不当云证据。

下一项 **D05 离线模型**：按真实配置参数实现时区 / 当地日期 / 预约窗口 / 多商品提前量 / 范围 / 运费边界，未知经营值只用标明离线测试例。不得把 tests/fixtures/catalog.js 的价格、数量、60 分钟等写正式配置；没有自动上传 / 部署 / commit / push 授权。现有函数只 user.me/store.health，没有新交易接口或真实资金链路。

## 12. D05 最新接手入口与已确认经营资料

已确认政策版本 v1-fulfillment-2026-10-03：PICKUP/DELIVERY，30 分钟，每段自取 3 单、配送 1 单，独立容量；门店自行配送、无骑手，中心半径 20km 含边界、0 分，预计配送时段不承诺分钟，最终范围 / 时段 / 容量由云端核验。门店地址“安徽省合肥市庐江县X085沙溪派出所南侧约50米”，08:00–21:00，按 Asia/Shanghai 记录。

新增未跟踪文件需保留：cloudfunctions/_shared/fulfillment-model.js、tests/fulfillment-model.test.js、docs/FULFILLMENT-RULES.md；已增补字典 / 内部契约 / 事务设计与全部执行入口。新模型 / 14 项回归通过，91/91 全套及135文件静态通过，主包估算1947/2048 KiB。证据 artifacts/phase-2-qa/d05-report.json、d05-contract-audit.json、d05-tests.txt、d05-static.txt，均仅本机 Git 忽略。

2026-10-03 最新补充：用户确认地址“安徽省合肥市庐江县X085沙溪派出所南侧约50米”，纬度 31.1498、经度 117.2886，来源高德地图；常规营业日每天，营业时间延续 08:00–21:00（Asia/Shanghai）。覆盖此前邮电局地址与营业日待确认状态。原始高德点按 GCJ-02 登记；当前距离模型只接收可信 WGS84，地图服务转换 / 核验仍待接入，stores.location / center 暂保持 null，不编造 verifiedAt。正式电话、临时停业覆盖、提前量、最大预约天数、支付保留与已付取消回补策略仍待配置。 测试 0分钟 / 14天 / 15分钟 / 原点坐标不是正式配置。D05 为本地模型通过，云接入和资料完整发布没有验收。

下一项可离线推进 D06 权限方案，真实越权 / 并发 / 云种子与阶段门禁保持待环境。不得改已验收 Home、自动部署 / 上传或提交 / 推送。已有模块、测试与 Home 均须保留。

## 13. 最新门店资料补充

2026-10-03 最新补充：用户确认地址“安徽省合肥市庐江县X085沙溪派出所南侧约50米”，纬度 31.1498、经度 117.2886，来源高德地图；常规营业日每天，营业时间延续 08:00–21:00（Asia/Shanghai）。覆盖此前邮电局地址与营业日待确认状态。原始高德点按 GCJ-02 登记；当前距离模型只接收可信 WGS84，地图服务转换 / 核验仍待接入，stores.location / center 暂保持 null，不编造 verifiedAt。正式电话、临时停业覆盖、提前量、最大预约天数、支付保留与已付取消回补策略仍待配置。

本次仅同步资料文档，保留现有未提交代码、测试与 Home。此前 91 项测试报告为 D05 原验收证据；未创建正式发布配置或部署云资源。下一项本地工作现为 D07，最新验收见第 14 节。

## 14. D06 既有接手入口（历史，最新见第15节）

D06 本地身份 / 所有权 / 门店能力工具与 16 项回归通过。新增未跟踪文件需保留：cloudfunctions/_shared/authorization-model.js、tests/authorization-model.test.js、docs/AUTHORIZATION-RULES.md、cloudfunctions/database/security-rules.draft.json。当前 107/107 测试、138 文件静态检查通过，主包仍估算 1947/2048 KiB；证据 artifacts/phase-2-qa/d06-report.json、d06-tests.txt、d06-static.txt，仅本机 Git 忽略。

新工具必须由可信 SDK / 服务配置 / 本环境最新 users / admin_roles 调用；没有网络认证或 DB 查询副作用。完整 user 哈希映射不使用追踪摘要。本人 ownerId 与门店 / 能力隔离，复合退款要求同一角色完整授权；用户包装器禁止系统付款证据。原 D01 STORE actor 只检查门店范围，所以真实用户 handler 必须先经 D06 能力包装，不能直接接受客户端 actor。25 集合普通客户端规则草案关闭直接 CRUD，公开内容经未来投影接口。

D06 云整体验收未完成：缺初始管理员真实身份 / 云环境 / 实际用户持久化，未验证客户端直写、真实双账号越权、撤销与敏感事务竞争。必须按 AUTHORIZATION-RULES.md 补真实证据，不把 107 项离线回归当作云验收。既有代码 / Home / 主包保留，无自动提交、上传或部署。

下一项本地工作 D07：梳理完整目标 action / DTO / 权限 / 错误 / 幂等 / 分页和 quote→order→payment 时序；设计受控可重复开发种子，缺经营值保持 DRAFT，不填测试价格 / 提前量 / 伪 WGS84。D03 经营、D04 真事务、D05 地理最终核验、D06 实际权限与 D07 云种子均保留外部门禁。

## 15. D07 最新接手入口

D07可离线部分通过：60目标action与DTO/权限/错误/幂等/分页/时序，基础schema/脱敏错误、HMAC游标与五个DRAFT种子规划；没有目标业务handler、SDK查询/写入、地图或资金动作。已有user.me/store.health及客户端allowlist不变，58目标action为PLANNED。全套129/129、静态145文件、主包估算1947/2048KiB。

新增未跟踪文件须保留：cloudfunctions/_shared/api-contract.js、pagination-model.js、development-seed.js；scripts/plan-development-seed.js；tests/api-contract.test.js、pagination-model.test.js、development-seed.test.js；docs/API_NETWORK.md、DEVELOPMENT-SEED.md、PHASE-2-REVIEW.md。最新本机证据artifacts/phase-2-qa/d07-report.json、d07-contract-audit.json、d07-tests.txt、d07-static.txt；开发示例artifacts/development-seed/d07-input.json与d07-plan.json，仅本机Git忽略。

种子是OFFLINE_PLAN_NOT_APPLIED，只生成三分类/门店/配置草稿，正式价格/电话/提前量/袋限制/支付和quote时效/回补仍null；不发布、不生成管理员或订单。GCJ02经度117.2886/纬度31.1498只在referenceFacts，stores.location仍null。CLI只写工作区artifacts/development-seed，新文件独占创建，不覆盖已有文件；无云executor。

本地已实现范围评审未发现未关闭P0，真实云门禁无结论；D04实际事务/并发、D05可信地图与完整配置、D06双账号/规则/撤销、D07云seed待环境。阶段二不能标整体完成。下一项阶段三C01先准备本地目录/素材加载与DRAFT管线，正式商品/规格/价格/实拍仍按E05确认；不得把UI预览或tests/fixtures/catalog.js当经营目录，不改已验收Home、自动上传/部署/提交/推送。

## 16. C01 最新接手入口（2026-10-04）

用户最新请求：提供图片作为暂时开发素材案例，上一条错误消息忽略，继续开发；随后明确“面包价格统一12”。按12元录入本批开发示例。蛋糕/小蛋糕按图可见规格、价格、留言决定记录，面包名称底部截断仅开发描述；不把临时图当正式经营批准或修改首页授权。

新增须保留：catalog-assets/development/catalog-example.png、catalog-example.js、catalog-example-reference.json；cloudfunctions/_shared/catalog-draft-model.js、media-model.js；scripts/plan-catalog-drafts.js；tests/catalog-draft-model.test.js、media-model.test.js；docs/CATALOG-DRAFTS.md、PHASE-3-EXECUTION.md。原图2,421,733bytes，存包外，未进入商品MediaRef/miniprogram；Home/Hero和所有既有模块均保留。

C01本地工具通过：三分类9商品/15明确SKU；全部DRAFT、缺数量/库存/提前量/独立实拍/留言长度仍阻塞；目录与素材重复规划不覆盖现有记录，已有父商品不补新规格。素材签名初步识别不等于完整解码/来源批准；同版本锁定摘要和引用，历史精确版本可读，保留工具不会删除。详情见CATALOG-DRAFTS.md。

最新全套147/147（新增18）、静态152文件、主包估算1947/2048KiB；git diff/文档/基线保留核验见artifacts/phase-3-qa/c01-report.json、c01-contract-audit.json、c01-tests.txt、c01-static.txt。离线计划artifacts/catalog-drafts/c01-example-r01.json及c01-repeat-r01.json，均Git忽略，未apply。第9/15节129项是D07历史报告，最新以本节为准。

下一项C02可离线推进公开目录投影、三分类筛选/搜索和稳定分页查询模型；正式只读在售、屏蔽库存/素材内部字段，开发示例显式隔离。后续Shop接入遵守现有设计，不改已验收Home。真实云接口/SDK、正式照片及经营配置仍待E01/E05，C01/阶段三整体不能标已完成；无自动commit/push/上传/部署。

## 17. C02 最新接手入口（2026-10-04）

用户继续指示已落实C02本地部分：cloudfunctions/_shared/catalog-read-model.js公开投影/三分类/名称子串/有效SKU起价/精确已发布实拍引用/HMAC目录摘要绑定seek；无云网络handler或SDK，60action注册/58PLANNED及cloud allowlist不变。C01草稿未发布，正式读取不会显示它们。

Shop已接入用户9条开发示例，三分类各3，面包12元；生成脚本scripts/generate-shop-preview.js与miniprogram/fixtures/shop-development.js从C01来源同步，miniprogram/services/catalog.js限定development/shell、所有示例canPurchase=false。不携带原海报、参考摘要、SKU权威数据或密钥。图片仍用既有兜底；点击示例提示暂未开放选购，C04详情未接入。

本次修改Shop三文件、scripts/check.js以及必要进度/契约文档；新增读模型/生成脚本/示例模块/Service/tests/catalog-read-model.test.js/tests/shop-catalog.test.js/docs/CATALOG-READ.md。Home/Hero、旧Product、共享商品卡和全部原有领域模块原样保留。初次微信运行发现require JSON不支持，已换生成JS并补小程序模块门禁；不能只凭Node加载验收。

最新全套165/165（C02新增18）、静态158文件、主包估算1958/2048KiB；官方本地CLI编译Shop、元素点击Bread三项/12元、All滚到页尾九项/终页与366×793截图人工核对通过。平台network offline SDK日志仍存在，不声称console全程无错。无真机、云API、真实资金、上传/部署/commit/push。

本机证据artifacts/phase-3-qa/c02-tests.txt、c02-static.txt、c02-ui-report.json、c02-contract-audit.json、c02-report.json；截图c02-shop-fixed.png / c02-shop-bread.png / c02-shop-all-loaded.png，均Git忽略。初次空白截图是诊断记录，不作验收图；第16节147项为C01历史。

下一项C03本地规格/SKU读取投影与合法组合，正式数量/库存/留言长度/提前量未定继续阻塞，不将示例发布为ON_SALE或绕过云端最终裁决。C02真实SDK/索引/排序/动态分页/平台鉴权、正式照片与经营配置及真机仍待条件；阶段三不能标整体完成。不改已验收Home，不自动上传/部署/提交。

## 18. C03 最新交付与接手点（2026-10-04）

C03可离线部分已完成，下一项C04商品详情页。详见 [SPECIFICATION-RULES.md](SPECIFICATION-RULES.md)。

- catalog-read-model.js 新增严格 productGet 投影；精确公开图集、配置组、留言政策、制作提前量及合法在售SKU价格/数量白名单。
- miniprogram/utils/specification-model.js 提供 evaluate / changeOption / reconcile；只匹配显式组合，尺寸切换清失效夹心并提示；商品版本或SKU版本/价格/数量变化须重确认。
- services/specification.js 与 JS development fixture、generate-specification-preview.js 提供9商品/15明确规格；沿用Shop示例ID、面包12元，不猜口味/夹心/经营限制。
- 客户端所有结果canPurchase=false；示例数量/提前量null、蛋糕留言长度待定。正式商品与云最终校验没有被这些模型替代。
- 新增18项测试，全套183/183、静态163文件、主包源估算1983/2048KiB。测试口味/夹心/数量/留言/提前量仅离线测试值，没有成为经营配置。
- 本地微信打开Shop成功，但automation_evaluate规格模块执行超时；未获得原生规格运行结果。C04/C05接页后继续工具运行验证，不报告真机/云/购买验收。
- 本机证据artifacts/phase-3-qa/c03-tests.txt、c03-static.txt、c03-contract-audit.json、c03-report.json，Git忽略。Home/Shop/旧Product/旧Specification及既有成果保留，没有提交、上传或部署。

C04应使用同源详情/规格数据，处理无效ID、下架、图缺失与价格含义；开发示例仍明确临时/暂不可买。ADD TO BAG导向未来独立规格页，C05再完成留言/数量/确认，不沿用旧弹层下单。收藏持久化为C07，C04入口不得冒充已保存。不要修改已验收Home。

## 19. C04 当前接手点（2026-10-04）

详情Service/product-detail.js、Product三文件、Shop点击及客户端固定PRODUCT_UNAVAILABLE错误已接入本地详情。9商品/15明确规格同源，蛋糕显示起价/各尺寸价格，面包12元；原海报不作商品图，空图说明待补。独立规格入口携带id/source，只导航、不写Bag；收藏入口提示未保存，C07再持久化。见 [PRODUCT-DETAIL.md](PRODUCT-DETAIL.md)。

Home页面代码/Hero保持字节不变；旧面包fixture示意价已按用户“面包统一12”同步12元。旧preview-*仍单独设计预览并标非当前售价，不映射新SKU。既有领域模型/用户素材/Shop布局与规格壳保持。未提交成果按本轮基线保留。

8项新增，全套191/191、静态165文件、主包估算1990/2048KiB。官方微信打开详情及product.wxml编译摘要成功；automation页面读取/截图超时，刷新重试仍无结果。没有有效截图/原生点击证据，C04页面视觉/原生验收待补；平台日志含network offline SDK错误。真实商品/实拍/云同样待补，无上传/部署/提交。

本机证据artifacts/phase-3-qa/c04-tests/static/wxml/console/screenshot-attempt、c04-contract-audit.json与c04-report.json，Git忽略。不要声称C04完整验收通过，也不要凭 CLI进程退出0忽略结果内ok=false。

下一项C05可先做独立规格页：基于C03模型按数据逐步选择，清失效项并提示、后退保留有效选择，留言/数量未知时不猜经营值、不输出可购买确认、不写袋；先确保临时开发预览可看可选。真实确认和加入购物袋仍依赖后续域/云校验。保留C04待补页面验证，微信自动化恢复后补实际截图/点击；不得修改已验收Home或自动上传。

## 20. 最新用户 UI 变更与验收（2026-10-04）

用户明确要求参考图三状态：详情、当前页底部规格弹层、真实加购反馈；该指示覆盖先前“独立规格页/不能弹层”的任务约定。Home不改。完整实现与边界见 [PRODUCT-DETAIL-REDESIGN.md](PRODUCT-DETAIL-REDESIGN.md)。

已实现大幅主图/等比例空图、返回/心形避胶囊、6%留白与字号层级、三列已确认门店服务事实、固定全宽主按钮、可滚动71vh规格弹层、所选SKU价格/数量/可选留言、真实本机保存成功条和查看袋。未知人数/口味/夹心/库存未补造；收藏仍未接通、不给假成功。开发说明从详情UI移除，购物袋页明确本机保存/待核验结算。

9个给定SVG原样接入assets/icons/cake-ui，实际原生显示验证，包括白check/黑底分离。预览关闭vConsole。最终366×793三张截图已人工核对：artifacts/phase-3-qa/detail-redesign-final-detail/sheet/success.png。修正默认button宽度/外边距偏差后复拍。6寸188×2及8寸258×1真实写入并在袋页读回；native-bag.txt有证据，未模拟成功。

全套197/197、静态168文件、主包估算2015/2048KiB。本机袋所有行checkoutAllowed=false/requiresCloudValidation=true，没有云库存、订单、付款或跨设备保证。未知经营规则继续阻止正式购买；LOCAL_DRAFT不属于D03正式Cart持久化。此轮不标正式C05/Bag领域云验收通过。

现有未提交成果保留；本轮修改Product/Bag页、详情展示数据、presentation/本机袋及相关测试/文档，未改Home/Hero、正式领域模型、用户源图或云allowlist。禁止把旧19节独立规格页约定恢复覆盖本轮用户需求；旧节为历史。无commit/push/上传/部署。

## 21. 用户 UI 验收与 main 同步（2026-10-04）

用户确认“UI部分没有问题，我已经验证通过”，本轮详情/规格弹层/加购反馈UI验收关闭；收藏/云/订单/支付边界仍不变。用户明确要求总结当天并提交推送main，覆盖旧“不要自动commit/push”约定，仅授权Git同步，不授权小程序上传或云部署。

[今日总结](DAILY-SUMMARY-2026-10-04.md)已整理累计代码、测试及待办；三张最终验收图纳入docs/qa/2026-10-04，临时artifacts日志继续忽略。main通过保留历史的快进接收阶段一及本轮累计成果，不做强制推送或覆盖工作。后续以main和最新Git状态接手。

## 22. C05验收复核（2026-10-04）

用户要求检查C05完成与验收情况。UI已由用户验收，相关27项本地测试重跑通过；独立复现发现离开详情页返回会重置有效规格、数量与留言，页面也未接入配置 reconcile。因此C05仅部分通过，先补页面返回恢复及回归测试再推进C06，正式配置/云继续待补。详细结论见 [C05-ACCEPTANCE-REVIEW.md](C05-ACCEPTANCE-REVIEW.md)。此次仅复核与修正文档，未改已验收UI，未提交/推送/上传/部署。

## 23. C05返回恢复修复（2026-10-04）

用户授权继续，已完成详情页reconcile集成与返回恢复；规格/价格/数量/留言规则更新需在本机加购前原生确认，取消或确认期间隐藏不写袋。有效输入返回/重试保留，新商品清空旧输入；超长留言保留待改，禁用留言清除并提示。新增5项，全套202/202与静态168通过，主包2019/2048KiB。此次微信原生导航响应超时，返回路径复测仍待补，UI旧验收有效，正式配置/云待补。下一步可推进C06本地同源Home与名称搜索，并补原生返回复测。不改已验收视觉，不虚构经营值；此轮没有提交/推送/上传/部署。见 [C05验收复核与修复](C05-ACCEPTANCE-REVIEW.md)。

## 24. C05微信补验与C06（2026-10-04）

用户授权重新用微信工具测试，通过后推进C06。C05真实选8寸/数量2/留言“生日快乐🎂”，进入Bag确认页面后返回重开弹层，输入和总价516保留，截图核对通过。工具连接经过刷新/重开恢复，不用退出0或setData冒充验收。C06同源Home编排/分类兜底、Shop名称搜索/分类组合/无结果/清空与分页已完成本地及微信模拟器验证；新增7项，全套209/209，静态170、主包2024/2048KiB；WXML摘要成功。Home Hero/分类摄影/WXSS保留，下方卡不再用旧预览ID或价格，缺图按现有占位。门店推荐等缺配置不编造，正式目录/经营限制/云仍待补。详见 [C06-HOME-SEARCH.md](C06-HOME-SEARCH.md) 与C05复核最新补验。下一项C07；本轮未提交/推送/上传/部署，现有未提交改动全部保留。

## 25. C07本机收藏与公共入口（2026-10-04）

用户要求继续并及时报告问题。已明确报告云身份未接，C07先实现LOCAL_DEVICE本机收藏，AppID分区不冒充账号A/B隔离。详情真实写入读回才点亮心形，Favorites同源当前卡/价格、失效标不可购买仍可取消，Account入口及确认门店资料补齐；客服/隐私继续待配。新增6项，全套215/215、静态172、主包2031/2048KiB；微信工具真实收藏蓝莓芝士小蛋糕、重开恢复、Account收藏入口及取消本轮测试项通过，截图核对。重开连接超时已恢复，失败日志不算通过。真实账号/跨设备/云待补。详见 [C07-FAVORITES.md](C07-FAVORITES.md)。下一项C08本地链路与旧行为检查；主包空间已向用户报告，后续扩展前安排分包/素材整理。没有提交/推送/上传/部署，所有旧改动保留。

## 26. C08本地验收与业务分包（2026-10-04）

用户授权自行决定分包并继续。9个非Tab业务页已移动到miniprogram/features普通分包，4 Tab留主包，所有相对共享依赖与旧改动保留；route统一/features/...，旧/pages/product等路径不再登记，后续勿继续用旧日志URL。静态/导航/验收脚本已适配，主包2031→1998KiB、features34KiB、legacy45KiB，图片未改。C08新增5项，全套220/220、静态173；微信三分类Home→分包详情→真实规格→本机Bag→返回恢复通过，取消3条新测试袋行后原有2行完整一致；Account→分包收藏正常。冷分包导航需确认实际currentPage后再操作，工具返回成功不保证已切页。截图和Product/Bag/Favorites WXML摘要核对；平台既有离线SDK日志仍在。C08仅可离线/模拟器通过，真实云拒绝恶意SKU/数量/组合与正式商品/账号门禁待补，阶段三不能标正式全完成。下一步阶段四B01本地购物袋命令/版本/读模型。详见 [C08-CATALOG-ACCEPTANCE.md](C08-CATALOG-ACCEPTANCE.md)。本轮无提交/推送/上传/部署。

## 27. B01 / B02 离线接口编排（2026-10-04）

用户授权继续。新增 cloudfunctions/_shared/cart-service.js，复用 D07 请求白名单、D06 可信 principal、D03 袋 / SKU / 留言规则及 D04 摘要 / 键工具。GET / ADD / UPDATE / REMOVE 返回稳定 ID 与版本；拒绝伪造身份 / 私有字段、跨用户读写、旧版本、非法 SKU / 数量 / 行数及缺配置。购物袋与命令回执约定原子存储，相同键重放原始结果，参数变化拒绝，写入失败整笔回滚；相同 SKU + 规范化留言合并，不同留言 / 不同 SKU 独立，合并仍查数量上限，不预扣库存。新增 10 项，全套 230/230、静态 175 文件通过；主包 1998、features 34、legacy 45 KiB，均未改变小程序资源。详见 B01-B02-CART-SERVICE.md / PHASE-4-EXECUTION.md。

没有实际 SDK 适配器、部署 cart 函数或接入本机 LOCAL_DRAFT，接口契约仍标 PLANNED；测试内事务适配器不代表云验收。现有未提交改动与本机袋保留，没有提交 / 推送 / 上传 / 部署。下一项 B03：先推进本机数量 / 勾选 / 计数 / 小计，未知经营值不猜，正式 Checkout 继续阻止；云就绪再补身份、事务、配置与联网验收。

## 28. B03 本机购物袋交互（2026-10-04）

用户授权继续。Bag 补齐数量加减、单行 / 全选、计数及已选小计、固定底部安全区操作栏；Home / Shop 角标通过同一 bag-count 组件读取本机袋。select / updateQuantity 真存储并读回；新增 revision 冲突保护，旧数据 selected 默认 true / revision 默认 0，读不回写；规格 / 价格变化拒绝数量更新，未知经营值不猜。新增 8 项，全套 238/238、静态 179、主包 2002 KiB / features 39 KiB / legacy 45 KiB。微信实际新增草莓 6 寸测试行，数量到 2、单行取消、重进恢复、全选 / 全取消 ¥0 小计、移除测试行及 Home / Shop 角标 4 均通过；四张截图已核对。原有黑巧克力 6 寸×2、8 寸×2 两行内容 / 数量 / 金额 / 勾选恢复一致。连接断开与 CLI 百分号选择器失败已恢复，不计失败为通过。

见 B03-LOCAL-BAG.md。B03 仅本机 / 模拟器完成，正式云同步与权威金额验收待补；保持 LOCAL_DRAFT、checkoutAllowed=false，无正式报价、库存预留或订单。下一项 B04：客户端冲突、重试 / 幂等流程，之后 B05 / B06。所有既有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

## 29. B04 本机冲突与重试（2026-10-04）

详情页加购意图使用 operationId，同输入失败重试沿用键，改变规格 / 数量 / 留言或确认成功后的新添加使用新键；in-flight 标记不随页面加载清空。local-bag 将加购回执与袋行同值写入并读回，重复键重放原始结果，同键改参数拒绝；删除后重放不复活。数量 / 勾选 / 删除失败只刷新实际记录，旧 revision 拒绝，刷新失败不虚报“已刷新”。未知经营值与正式购买门禁继续保留。回执保留、不猜 TTL；页面意图未跨完整进程重启持久化，正式云需要待处理命令和真实网络补验。

新增 8 项，全套 246/246、静态 180、主包 2005 KiB / features 40 KiB / legacy 45 KiB。微信真实加购及回执记录、工具仅变更测试行存储 revision 后旧页面写入拒绝 / 刷新 / 用户再操作通过；测试行已移除，原有黑巧克力 6 寸×2、8 寸×2 行内容 / 数量 / 金额 / 勾选一致。同步 getStorageSync mock / evaluate 不支持故障注入，该部分仅 Node 实际存储适配器测试通过，不能说微信 / 云故障注入已通过。工具尝试带来的临时 API 异常经 simulator_refresh 恢复，QA hook 清理；socket hang up 后先读现状再继续，没有盲目重发。两张截图已核对，详见 B04-CART-RETRY.md。

下一项 B05 当前价格 / 下架 / 缺货 / 规格失效处理，本地可继续；云库存、身份、网络并发与正式结算待环境就绪。未提交成果全部保留，没有提交 / 推送 / 上传 / 部署。

## 30. B05 本机商品与价格复核（2026-10-04）

Bag onShow / 重试异步复核当前配置，单行错误保留行；价格 / 名称 / 规格版本变化需确认，SKU / 数量 / 留言失效不可勾选仍可查看 / 移除，临时读取错误不当下架。仅有效已选行参与小计，全选跳过失效行；读不回写原勾选或历史留言。原生 modal 明确同意后再读当前配置并比较 token / revision，更新单行快照，取消 / 隐藏 / 过期确认不写。specification 合法但缺失商品改报 PRODUCT_UNAVAILABLE，重复 / 损坏仍配置异常。stock-review 复用 D03 / D04 聚合共享库存需求、验证余额 / 状态 / 范围，仅离线快照函数、无预留 / 云接入；本机 stockStatus=UNKNOWN、checkoutAllowed=false。

新增 12 项，全套 258/258、静态 184、主包 2010 KiB / features 42 KiB / legacy 45 KiB。微信只改新增测试行的历史价格快照 150（当前目录仍 168）及失效 skuId，复核 / 受控 modal 回调取消与同意 / 真实读回更新 / 保留留言 / 失效删除通过；原有黑巧克力两行原始存储对象逐字一致，showModal mock 恢复，两张截图核对。首次旧编译缓存与重编译连接超时恢复后继续，未盲目重加测试行或清库，不计失败为通过。不是人工原生弹窗点击验收，也不代表真实云缺货 UI 接通。详见 B05-CART-REVIEW.md。

下一项 B06：有效选中行的 Checkout 输入与购物袋链路验收，精准移除仍由 O04 接通，正式购买继续关闭。现有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

## 31. B06 有效已选核对与购物袋链路（2026-10-04）

Bag「核对商品」先复核有效已选集合，将行 ID / 袋 revision / 本机 token 同值保存并读回后导航；Checkout 每次显示从袋 / 目录重算本机小计并比较完整选中集合，版本 / 商品变化清金额、要求重新选择。未选 / 失效行不进入核对，所有草稿保留，UNKNOWN 库存及正式下单门禁不变。选择模块放 features 分包，主包未增大。服务端 checkout-selection 内部模型复用可信 principal、Cart、SKU / 数量 / 留言校验，拒绝价格 / 数量等客户端额外字段，从可信读快照计算整数分，非云 handler。O04 创建后版本 / 内容摘要精确移除、保留未选 / 新增 / 已修改行及补偿去重策略已写入契约，实际移除未接订单。

新增 11 项，全套 269/269、静态 188、主包 2010 / 2048 KiB、features 49 KiB、legacy 45 KiB。微信真实新增 6 / 8 / 10 寸三条不同留言、重进持久读取、部分勾选仅两行 / ¥406、核对页重开恢复、实际数量变化后旧输入拦截通过，三张截图已核对。一次输入 TLS 连接断开，读取存储确认第一条已加 / 第二条未加后继续，未重复添加。测试行移除并恢复原勾选，原有两条黑巧克力原始对象逐字一致，清除本轮核对输入，revision 单调增加。完整微信进程重启仅 Node 新客户端恢复覆盖，微信 / 真机待补；没有真实云验收。

详见 B06-CHECKOUT-SELECTION.md。下一项阶段五 X01，先本机地址草稿及离线默认 / 权限模型；云身份 / 并发、正式联系人 / 电话规则、权威配送范围继续待环境就绪。所有旧改动保留，没有提交 / 推送 / 上传 / 部署。

## 32. X01 本机地址与共用选择（2026-10-04）

地址 CRUD / 显式默认 / 删除确认从 Account 原入口接入；地址模块置于 features 分包，Checkout 只调用同一地址页选取，不复制编辑逻辑。AppID 分区 LOCAL_DEVICE，本机手机号格式检查、手工省市区 / 门牌、编码及 location=null，不冒充账号云地址或配送通过。单值地址簿 revision 与单地址 version 保护旧写，单一默认指针；删除默认清空、不自动提升。显式所选 ID / version 在编辑 / 删除后失效，Checkout 提示重选，商品小计保持；保存结果不明不虚报成功，保留输入供检查。

address-model / address-service 服务端内部离线编排复用 D06 principal / 本人校验、D07 白名单与幂等摘要 / 回执；用户默认版本竞争与地址 CAS、默认删除 / 软删除 / 回执同事务，历史快照按白名单冻结。正式 validatePhone 未配置拒绝创建 / 更新；地图 token / 客户端已核验 Location 不信任。SDK / handler / 真实 A/B 未接，address.list 签名分页和完整 Profile 仍待实现，不称云功能完成。

新增 19 项，全套 288/288、静态 194、主包 2010 / 2048 KiB、features 65 KiB。微信真实输入两条测试地址、非法手机号拒绝、默认 / 重进恢复、核对页选择 / 返回、编辑后失效 / 重选、删除默认清空以及删除所选失效通过；四张截图核对。删除 showModal 用受控取消 / 确认返回，非人工原生弹窗点击，mock 已恢复。初始地址 / 核对键不存在，UI 删除测试行后清理仅本轮两键；原购物袋完整原始 JSON 含 revision / 回执一致，其他存储未变。平台 SDK network offline 仍在，完整微信进程重启 / 真机与云门禁待补。

详见 X01-ADDRESSES.md / PHASE-5-EXECUTION.md。下一项 X02 门店 / 履约配置与自取表单，不猜门店电话 / 提前量等正式资料，不恢复已淘汰旧定金 / 尾款业务，不改已验收 Home / 商品视觉。所有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

## 33. X02 门店资料、履约切换与自取联系人（2026-10-04）

门店用户确认参考资料独立供核对页 / Account 共用，保留 CONFIGURATION_PENDING / phone=null，不混入旧定金演示。核对页默认自取，自取不读取地址簿；配送才调用 X01 共用选择，切回自取清页面地址、保留地址簿与联系人。方式及联系人按 AppID 的 LOCAL_DEVICE 单值持久保存 / 读回，revision / 参考版本保护；非法输入保留供修改，未确认写入不报成功，正式下单仍禁用。草稿手机号格式与 X01 共用，不冒充正式已核验号码。门店电话 / 客服 / 地理 / 提前量等资料仍待补。

服务端 store-fulfillment 内部预检要求可信 D06 principal、OPEN 门店、关联 PUBLISHED 配置、政策 / 时区 / 时间参数、当前版本、可用方式及注入号码校验；停业、自取关闭、旧版本和客户端费用 / 状态字段拒绝。自取地址 null / 费用 0；配送地址 ID 必填但本人 / 位置 / 范围 / 时段仍未校验，不产生 Quote / 资源占用或下单许可。无 store.get handler、SDK 或云 allowlist 扩展，正式经营值不编造。

新增 13 项，全套 301/301、静态 202，主包 2013 / 2048 KiB、features 77 KiB、legacy 45 KiB 源估算。微信真实非法手机号拦截、联系人保存并读回 / 重进恢复、配送切换 / 重进恢复 / 切回保留联系人及商品小计通过；两张 366×793 截图和 WXML 编译摘要已核对。工具存储 / 导航超时与 socket hang up 经重开、确认实际状态和清理测试输入后恢复，重新完整验收通过；QA 键比较表达式括号已修正。仅删除本轮新建联系人 / 核对输入键，原购物袋完整原始 JSON 含 revision / 回执一致，原存储键恢复，地址 / 收藏未改。SDK network offline 日志、完整微信进程退出重启 / 真机 / 云门禁待补。

详见 [X02-STORE-FULFILLMENT.md](X02-STORE-FULFILLMENT.md) / [PHASE-5-EXECUTION.md](PHASE-5-EXECUTION.md)。下一项 **X03 配送范围权威校验**，先可信地址 / 规则 / 版本的离线编排与本机待核验状态；原始高德 GCJ-02 点不能仅改标签当 WGS84，未定位不能假报配送通过。所有既有未提交改动保留，没有提交 / 推送 / 上传 / 部署。
