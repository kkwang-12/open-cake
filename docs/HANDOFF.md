# 项目交接：云端主流程补验收与窗口分工

**最新安排（2026-10-08）：从第一阶段逐项补云依赖，本窗口负责后端/主流程，UI/动效/环境配置仍分工。R1已准备；user.me已真实事务创建/读取默认顾客，实查users=1、admin_roles=0、audit_logs=0，未写订单/资金。已修复SDK复用实例残留身份风险，user/store与两验收函数逐次核验平台第二参数；正常微信、错误配置、三集合客户端读拒绝及复用实例管理端拒绝通过。全套971/971、静态354；真机/完整权限/唯一冲突/资源竞争/逐写回滚仍待补。下一项D04，见[阶段二真实复验](PHASE-2-CLOUD-REVALIDATION-2026-10-08.md)、[D04安排](D04-CLOUD-SDK-ACCEPTANCE-PLAN.md)、[67 Task台账](CLOUD-BACKFILL-TRACKER-2026-10-08.md)。保留所有未提交成果，本节覆盖下文历史“未开通/未落库/下一项”安排。**

以下为此前阶段记录；最新离线推进已至文末 A07，不以标题或旧段落作为当前云验收结果。

交接日期：2026-10-05（Asia/Hong_Kong）。工作目录：`D:\dinner cook`。
当前分支：`codex/ui-refresh-2026-10-05`。UI 快照 15e4b47 已推送；本文已更新至阶段六 O06 内部订单列表 / 分页 / 详情读模型；后续执行以实际文件和 Git 状态为准。

**历史指示（2026-10-05）：当时开发 / 测试云环境尚未开通，允许先继续离线推进；真实订单保存、唯一索引与资源占用仍按 [真实订单验收](ORDER-CLOUD-ACCEPTANCE.md) 待补，不以本地测试代替。现在以顶部 2026-10-08 安排为准。**

最新进度（2026-10-05）：阶段三 C08、阶段四 B06、阶段五 X01–X07 及 O01–O06 可离线部分已推进，本机微信记录保留。O06 本人订单列表 / 分页 / 历史详情、状态 / 退款独立分组、公开日志链、只读权限及动作门禁通过；未接页面或真实 SDK，Orders 保持原空状态。最新全套 466/466、静态 242，主包 / features / legacy 源估算 1213 / 97 / 45 KiB。**下一项 O07 自提凭证 / 核销策略与权限模型，继续离线**；E10 码形式 / 有效期 / 尝试限制尚待确认，不能用测试值发布。O05 关单 / 审批资金执行、SLOT 回补、SDK / handler / A/B / 真机及整阶段云门禁待补，见 [PHASE-6-EXECUTION.md](PHASE-6-EXECUTION.md)。历史节待办按末尾最新记录解释。

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

9个给定SVG原样接入assets/icons，实际原生显示验证，包括白check/黑底分离。预览关闭vConsole。最终366×793三张截图已人工核对：artifacts/phase-3-qa/detail-redesign-final-detail/sheet/success.png。修正默认button宽度/外边距偏差后复拍。6寸188×2及8寸258×1真实写入并在袋页读回；native-bag.txt有证据，未模拟成功。

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

新增 20 项，全套 288/288、静态 194、主包 2010 / 2048 KiB、features 65 KiB。微信真实输入两条测试地址、非法手机号拒绝、默认 / 重进恢复、核对页选择 / 返回、编辑后失效 / 重选、删除默认清空以及删除所选失效通过；四张截图核对。删除 showModal 用受控取消 / 确认返回，非人工原生弹窗点击，mock 已恢复。初始地址 / 核对键不存在，UI 删除测试行后清理仅本轮两键；原购物袋完整原始 JSON 含 revision / 回执一致，其他存储未变。平台 SDK network offline 仍在，完整微信进程重启 / 真机与云门禁待补。

详见 X01-ADDRESSES.md / PHASE-5-EXECUTION.md。下一项 X02 门店 / 履约配置与自取表单，不猜门店电话 / 提前量等正式资料，不恢复已淘汰旧定金 / 尾款业务，不改已验收 Home / 商品视觉。所有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

## 33. X02 门店资料、履约切换与自取联系人（2026-10-04）

门店用户确认参考资料独立供核对页 / Account 共用，保留 CONFIGURATION_PENDING / phone=null，不混入旧定金演示。核对页默认自取，自取不读取地址簿；配送才调用 X01 共用选择，切回自取清页面地址、保留地址簿与联系人。方式及联系人按 AppID 的 LOCAL_DEVICE 单值持久保存 / 读回，revision / 参考版本保护；非法输入保留供修改，未确认写入不报成功，正式下单仍禁用。草稿手机号格式与 X01 共用，不冒充正式已核验号码。门店电话 / 客服 / 地理 / 提前量等资料仍待补。

服务端 store-fulfillment 内部预检要求可信 D06 principal、OPEN 门店、关联 PUBLISHED 配置、政策 / 时区 / 时间参数、当前版本、可用方式及注入号码校验；停业、自取关闭、旧版本和客户端费用 / 状态字段拒绝。自取地址 null / 费用 0；配送地址 ID 必填但本人 / 位置 / 范围 / 时段仍未校验，不产生 Quote / 资源占用或下单许可。无 store.get handler、SDK 或云 allowlist 扩展，正式经营值不编造。

新增 13 项，全套 301/301、静态 202，主包 2013 / 2048 KiB、features 77 KiB、legacy 45 KiB 源估算。微信真实非法手机号拦截、联系人保存并读回 / 重进恢复、配送切换 / 重进恢复 / 切回保留联系人及商品小计通过；两张 366×793 截图和 WXML 编译摘要已核对。工具存储 / 导航超时与 socket hang up 经重开、确认实际状态和清理测试输入后恢复，重新完整验收通过；QA 键比较表达式括号已修正。仅删除本轮新建联系人 / 核对输入键，原购物袋完整原始 JSON 含 revision / 回执一致，原存储键恢复，地址 / 收藏未改。SDK network offline 日志、完整微信进程退出重启 / 真机 / 云门禁待补。

详见 [X02-STORE-FULFILLMENT.md](X02-STORE-FULFILLMENT.md) / [PHASE-5-EXECUTION.md](PHASE-5-EXECUTION.md)。下一项 **X03 配送范围权威校验**，先可信地址 / 规则 / 版本的离线编排与本机待核验状态；原始高德 GCJ-02 点不能仅改标签当 WGS84，未定位不能假报配送通过。所有既有未提交改动保留，没有提交 / 推送 / 上传 / 部署。

## 34. X03 配送范围离线编排与本机待核验（2026-10-05）

保留用户最新 UI，当前分支 UI 快照 15e4b47 已推送；本轮只补验收和文档，不重新设计界面。内部可信本人 / 地址与门店配置版本 / 唯一 ACTIVE 规则 / WGS84 精确位置核验绑定、20 km 含边界及费用 0 离线通过；输出不可变 OFFLINE_DELIVERY_EVALUATION，不产生 evaluationId 或购买许可。客户端显示未选 / 地址失效 / 待云核验，绝不按本机坐标宣布配送通过。

相关 13/13 回归通过，UI 基线全套 335/335、静态 215，主包源估算 1213 KiB / features 85 / legacy 45。微信真实保存 / 选择 / 重进 / 编辑失效 / 重选 / 切自取完整重测通过，两张截图与 WXML 编译核对。首次重选导航未确认，加入页面状态读取后重测通过，未改业务代码；SDK offline 错误仍在。测试地址已清理，删除 modal 用受控回调且恢复 mock，原购物袋 JSON、存储键与原履约 / 核对输入已恢复验证。

详见 [X03-DELIVERY-RANGE.md](X03-DELIVERY-RANGE.md)。下一项 X04 预约日期 / 30 分钟时段 / 独立容量展示；不猜提前量、最大预约天数或付款保留时长，不把可约展示当作容量锁定。正式地理 / 云 handler / 保存 / 报价 / SDK / 真机待补。本轮未提交、推送、上传或部署。

## 35. X04 预约日期、时段与独立容量（2026-10-05）

内部 appointment-availability 复用 X02 可信发布配置、B06 本人购物袋与正式目录重核验以及 D05 时间模型；服务端商品最大提前量、当地日期窗口、30 分钟时段、真实 SLOT 3 / 1 容量读模型通过。缺记录 / 旧定义 / 满额 / 关闭不可选，不初始化库存或锁定容量；版本与时钟变化需重新读取，正式提交仍须 D04 原子事务。

核对页新增按 UI-TYPOGRAPHY 的 14 / 13 / 12px 预约说明，缺经营参数时不生成假可约日历。新增 9 项，全套 344/344、静态 218；主包估算 1213 KiB、features 87、legacy 45。微信真实方式切换 / 3 与 1 单 / 待配置无选项 / 重进恢复、WXML 与 WXSS 编译通过；配送截图已核对，不归档原联系人截图。原模式 / 联系人恢复，购物袋完整 JSON 与键不变，未创建预约键。SDK offline、正式参数 / 云 / SDK 并发 / 真机仍待补。

详见 [X04-APPOINTMENT-AVAILABILITY.md](X04-APPOINTMENT-AVAILABILITY.md)。下一项 X05 可信报价，不用本机小计当 Quote，不编造 TTL 或支付保留时长。本轮未提交 / 推送 / 上传 / 部署，保留 X03 未提交资料与最新 UI。

## 36. X05 可信报价离线规划与重核验（2026-10-05）

quote-model 复用正式 D07 请求白名单，已明确转换 lineVersion / expectedLineVersion；可信服务端加载一致门店配置、本人袋 / 目录、地址 / 位置核验、库存和时段，经 D02 捕获不可变事实。报价 TTL 来自发布配置，截止不晚于时段提前量边界；金额为整数分，库存按所选袋聚合。旧报价重核验拒绝过期、消费、价格 / 配置 / 地址 / 资源版本变化，公开投影不泄露内部证据。

新增 13 项，专项 13/13、全套 357/357、静态 221，主包 / features / legacy 源估算 1213 / 87 / 45 KiB。只返回 OFFLINE_QUOTE_PLAN、待保存 quoteId / 评估追踪标识和原子效果，没有实际保存、占用、真实并发或 API 接入；同键回执仅离线决策，不宣称真实去重完成。真实 TTL / 号码 / 备注 / 实拍 / 地理 / 时间参数仍待补。

详见 [X05-TRUSTED-QUOTE.md](X05-TRUSTED-QUOTE.md)。下一项 X06 双分支输入保留组合；现有 UI 与全部 X03 / X04 未提交成果保留，本轮无页面变动，未重复微信验收，没有提交 / 推送 / 上传 / 部署。

## 37. X06 输入保留与 X07 提交契约 / 阶段验收（2026-10-05）

X06 confirmation-session 为未来 Quote 适配器准备 ticket / READY / ERROR / EXPIRED 状态，不调用网络；在隐藏 / 重载 / 输入或方式修改 / 地址更新 / 返回袋 / 保存错误时失效，旧响应不覆盖当前输入。方式竞争或未知写入清旧派生分支，保留用户表单；确认模型拒绝离线对象、错误金额与模式、过期或已消费报价，公开摘要只保留买方事实。

微信实际未保存联系人、切换、地址页回原实例保留、回袋关闭实例 / 重新进入恢复已保存联系人通过；原模式 / 联系人、袋完整 JSON、核对草稿与键恢复验证。最初返回路径假设错误已按 pageStack 修正；currentPage 查询卡住 / terminated，曾停只读助手及重开项目，最后新页联系人恢复独立补验通过，不称单次脚本无错误完成。没有联系人截图、假云报价或付款成功。

X07 提交计划只携 quoteId / expectedQuoteVersion / idempotencyKey，不转发金额，callable / checkoutAllowed / paymentAllowed 均 false；订单真实保存后才可 payment.create，不明结果 state.get 核对。没有 handler、SDK 事务或实际 key 持久管理。X06 新增 12、X07 新增 6 项，全套 375/375、静态 225，主包 / features / legacy 1213 / 97 / 45 KiB 源估算。

详见 [X06-CHECKOUT-CONFIRMATION.md](X06-CHECKOUT-CONFIRMATION.md) / [PHASE-5-REVIEW.md](PHASE-5-REVIEW.md)。当时下一项为 O01 冻结状态机与受控命令（已纠正原订单列表笔误），正式 Checkout 整阶段门禁保留。未改视觉或覆盖既有成果，本轮未提交 / 推送 / 上传 / 部署。

## 38. O01 冻结状态机与受控命令（2026-10-05）

按原开发计划推进阶段六，O01 是命令、O06 是订单列表。新增内部 order-command-model 复用 D07 / D06 / D01；顾客本人入口和当前同店商家权限明确分离，强制订单版本 / 服务端时钟、读取当前待审申请，拒绝任意 nextStatus、伪造身份 / 付款与旧定金状态。返回冻结状态补丁、版本条件、幂等元数据、脱敏日志草稿及必需原子效果，不执行订单 / 资源 / 核销 / 退款。

未付款不可制作，自取不可配送、非法越级无计划 / 日志 / 资源写入；已付取消仍待商家审核，拒单补全额剩余退款，制作后不自动恢复库存。日志不伪造 after，未来执行器须根据最终交易轴生成并原子提交。缺真实执行器、理由脱敏或凭证验证不得报成功。

新增 10 项、90 组状态 / 履约 / 命令矩阵，专项 39/39、全套 385/385、静态 227；主包 / features / legacy 源估算 1213 / 97 / 45 KiB。没有本轮 UI、微信或云 SDK 验收，保留全部未提交工作，未提交 / 推送 / 上传 / 部署。

详见 [O01-CONTROLLED-ORDER-COMMANDS.md](O01-CONTROLLED-ORDER-COMMANDS.md) / [PHASE-6-EXECUTION.md](PHASE-6-EXECUTION.md)。下一项 **O02 订单创建、唯一订单号与不可变快照**；真实保存 / 并发 / 资源 / 支付仍按 O03–O05 / P 阶段依赖执行。

## 39. O02 订单创建与不可变快照（2026-10-05）

order-creation-model 仅接受 order.create 的报价 ID / 版本 / 幂等键，可信本人报价 / 现行门店配置 / 袋与 SKU / 价格 / 地址与范围 / 预约 / 资源重核验。输出待付订单头与独立有序明细，商品、图片、留言、金额、门店、地址、时段和费率保持不可变；订单头不另存 items 或 id。旧报价变化要求重新确认，不悄悄替换金额。

编号按 D04 完整摘要确定生成，实际唯一索引 / create-if-absent 待 SDK；付款期限读取发布配置，缺值拒绝，不猜保留时间。离线原子计划含报价消费条件和整单资源 / 订单 / 明细 / 日志 / 幂等要求，未保存 / 占用 / 移除袋 / 付款。实际数据库不可变性仍待权限与事务落实。

新增 10 项，O02 / X05 / O01 专项 33/33、全套 395/395、静态 229；包体源估算 1213 / 97 / 45 KiB。UI 与本机数据未操作，所有未提交成果保留。没有微信 / 真机或实际 SDK 验收，未提交 / 推送 / 上传 / 部署。

详见 [O02-ORDER-CREATION.md](O02-ORDER-CREATION.md) / [PHASE-6-EXECUTION.md](PHASE-6-EXECUTION.md)。下一项 **O03 整单库存 / 时段原子预留、付款截止及事务边界**，正式云与真实经营参数缺项继续保留。

## 40. O03 整单原子预留与内部事务服务（2026-10-05）

用户确认云环境尚未开通，授权继续离线；撤销此前等待真实验收后才推进的暂停条件，实际云待补清单保留。新增 order-transaction-service，在注入事务内重读当前用户 / 报价 / 袋 / 目录 / 地址 / 配置 / 资源，经 O02 / X05 重核验、D04 整单 HELD 后组合写订单 / 明细 / 首日志 / 报价消费 / 成功回执。零行写 / 任意异常拒绝；末尾复核报价与付款截止。创建日志 before=null，后续日志仍须实际交易前态。

当前仅 tests/fixtures/order-transaction 的串行内存适配器。最后库存、独立 3 / 1 名额竞争、多资源全有或全无、9 个写入位置异常 / 零行逐一回滚、用户撤销、时间到期、同键重放与唯一意图本地通过；不是 SDK / 索引 / 真实并发证明。首次专项断言误以为过期先于消费后的版本冲突，按原业务顺序修正断言后重测通过。

新增 14 项、全套 409/409、静态 232，包体源估算 1213 / 97 / 45 KiB。内部结果 cloudVerified / checkoutAllowed / paymentAllowed=false，未接客户端、不删除袋、无资金调用。现有 UI 与全部未提交工作保留，未新做微信 / 真机 / 云验收，未提交 / 推送 / 上传 / 部署。

详见 [O03-ATOMIC-ORDER-TRANSACTION.md](O03-ATOMIC-ORDER-TRANSACTION.md)。下一项 **O04 幂等恢复、响应丢失重试与按袋行版本精确同步**；真实接入开通后按 [ORDER-CLOUD-ACCEPTANCE.md](ORDER-CLOUD-ACCEPTANCE.md) 验收。

## 41. O04 响应丢失恢复与精确袋同步（2026-10-05）

新增 order-cart-sync-model / order-recovery-service。创建时捕获内部 cartRemovalSnapshot；订单已提交后另一个事务按行 ID / 版本 / 内容摘要删除匹配行，并原子写成功检查点。修改 / 新增 / 重加行保留，全局袋版本增加不导致整袋覆盖；已同步订单重放不再删除后续行。创建结果未知不清袋；袋同步失败保留订单 / HELD，同 key 重试补偿，不产生新订单。

新增 15 项，覆盖多行混合同步、两处写失败 / 零行回滚、并发改袋冲突、创建与同步响应丢失、服务重建、所有权及同订单并发。全套 424/424、静态 235，主包 / features / legacy 源估算 1213 / 97 / 45 KiB。只有串行内存事务证据，真实 SDK / handler、客户端 key 持久化、正式袋迁移及后台调度待补；不自动删除本机草稿，不显示假成功。

详见 [O04-ORDER-RECOVERY.md](O04-ORDER-RECOVERY.md)。未改已验收 UI，未操作微信 / 真机 / 真实云，未提交 / 推送 / 上传 / 部署，全部既有未提交工作保留。下一项 **O05 取消 / 到期协调与资源释放**，真实关单竞争待 P04。

## 42. O05 待付取消 / 到期与资源协调（2026-10-05）

新增内部 order-cancellation-model / service，复用 D07 / D06 / D01。只有无支付意图的 UNPAID 或全部可信关闭记录已与 CLOSED 摘要一致才取消；未知支付返回内部协调要求，不写成功回执或释放资源。当前版本 / 完整支付查询及不存在条件、已消费报价、整单预留 / 资源读取须保护到提交。全部计数、RELEASED 与解析日志、订单、最终日志、回执同事务；已关闭销售资源可合法释放。

内部 expire 验证受信任触发输入，精确截止到达才尝试；未知付款仍占用，已付 / 已取消跳过，重放不再释放。没有真实 SYSTEM 触发认证或定时扫描部署。已付申请 / 商家审批与剩余全额拒单退款只为不可执行协调计划；制作后 CONSUMED 库存保留，未消耗 SLOT 缺适用政策拒绝自动回补，真实审批 / 资金执行待补。

新增 20 项、全套 444/444、静态 238，包体源估算 1213 / 97 / 45 KiB。初次专项两处失败来自测试将旧版本新 key 误判为状态错误、只读事务重建后仍修改旧对象；修正为当前版本及数据库读回后通过，真实 Payment 更新版本仍会拒绝旧取消请求。详见 [O05-ORDER-CANCELLATION.md](O05-ORDER-CANCELLATION.md)。未改 UI 或操作微信 / 真机 / 实际云、资金 / 本机 Storage，未提交 / 推送 / 上传 / 部署，既有成果保留。

下一项 **O06 订单列表 / 分页 / 详情读模型**。O05 整体云验收、SDK 读集 / 原子释放、关闭竞争 / 迟到款仍待 P04 / P06；制作后 SLOT 策略、后台补偿与客户端实接待补。

## 43. O06 本人订单列表 / 分页 / 历史详情（2026-10-05）

新增内部 order-read-model / service，复用 D07 / D06 / D02。order.list 新增可选 view（ALL / ACTIVE / CURRENT / PAST / COMPLETED / CANCELLED），原精确 status 保留，两者取交集；60 action 及客户端 allowlist 不变。创建时间 / ID 降序、HMAC 游标 / pageSize+1、整个 seek AND 本人状态过滤、每页当前用户及读集保护本地通过。

详情按 position 校验独立明细 / 金额，用下单快照，不读现行目录重写；原媒体 revision 退役仍读、不可用为空。CURRENT / PAST 由履约轴决定，退款独立；PAID 待接单、MAKING 制作中。日志校验完整版本链、已知前后状态及最终轴，只输出固定文案；身份 / 资源 / 事件 / 原因 / 凭证摘要不进公开投影。操作均为 disabled 内部提示，缺云不开放付款 / 收货 / 凭证。

新增 22 项、全套 466/466、静态 242，源包体 1213 / 97 / 45 KiB。O03 实际本地创建及 O05 取消输出兼容；仍无真实 SDK / handler、订单页面实接或微信 / 真机验收。初次专项纠正了隐私断言误把允许的测试地址引用里嵌入的用户摘要当直接身份字段，以及统一了损坏日志轴的内部错误，复测通过。详见 [O06-ORDER-READ.md](O06-ORDER-READ.md)。保留现有 UI 和全部未提交改动，未提交 / 推送 / 上传 / 部署。

下一项 **O07 自提凭证 / 核销策略、权限与防重放模型**；码形 / 有效期 / 尝试限制未确认前保持关闭。阶段六整体、订单 UI 与真实 SDK / 云 / 资金门禁仍待补。

## 44. O07 自提凭证 / 核销内部事务（2026-10-05）

新增 pickup-credential-model / order-pickup-service。明确注入策略与服务端密钥下生成绑定环境 / AppID / 订单 / 本人 / 门店 / 签发时间的 HMAC 候选值，仅存摘要与元数据；本人 READY / PICKUP / PAID 可取，同店当前 ORDER_OPERATE 才能核销。完成、usedAt / usedBy、订单版本 / 最终日志 / 成功回执同事务；错码数 / 冷却、内部日志 / FAILED 回执先提交再返回拒绝，不能抛错回滚限速。重放 / 重建 / 换 key 或操作人不重复完成、不绕过同一凭证限制，回执指纹为稳定 HMAC。

签发 / 错码维持完整订单日志链，O06 校验 READY 自提轴不变并隐藏私有事件；完成公开文案仍为“已完成自取”。凭证明文 / 原 reason / 密钥不入订单日志或回执；正确核销必须有完整可信资源证据。显式测试 KEEP_CONFIRMED 分支保留 CONSUMED 库存和 CONFIRMED SLOT，不重复扣减 / 返还，不代表正式完成资源政策。

新增 27 项、全套 493/493、静态 246，主包 / features / legacy 源估算 1213 / 97 / 45 KiB。并发一次完成 / 两种 key、两种响应丢失、过期边界 / 续发、持久限速 / 锁定、密钥轮换、用户 / 角色撤销及资源变动冲突、每写异常 / 零行全回滚和 O06 链兼容通过。初次专项失败来自测试短 key 和不一致交易轴，已修正测试数据重跑，无放宽契约。

见 [O07-PICKUP-CREDENTIAL.md](O07-PICKUP-CREDENTIAL.md)。OPAQUE_TOKEN / 60 秒 / 3 次 / 1 秒仅内部测试候选，E10 正式码形 / 有效期 / 尝试限制与 SLOT 完成政策没有发布默认值。真实 SDK / handler、展示 / 扫码、密钥 / 政策管理及云权限验收待补；内部 callable / cloudVerified / fulfillmentAllowed=false。没有新 UI / 微信 / 真机 / 云验收或提交 / 推送 / 上传 / 部署，全部既有未提交工作保留。

下一项 **O08 配送更新 / 确认收货与订单域离线验收**；E11 异常配送细则、真实资金及阶段六正式门禁仍待补。

## 45. O08 配送更新 / 确认收货与阶段六离线验收（2026-10-05）

新增 order-delivery-service：同店当前 ORDER_OPERATE 从 READY 开始配送，本人或当前同店从 DELIVERING 确认完成。订单 / completedAt / 最终日志 / 回执同事务，同 key 重放、异参拒绝、不同角色竞争只完成一次；重放仍核验当前授权及对应 actor / 状态轴 / 版本 / 时间日志证据。历史开始回执不把已完成 / 已取消订单改回配送中，付款 / 退款轴及历史事实保持原值。未处理领域效果拒绝，不支持前端 PAID 或骑手 / 自动收货。

O07 资源证据抽成双方式共用 order-fulfillment-resources，补报价方式 / 原预约 slotId / 完整预留检查，旧核销回归通过；完成缺显式政策拒绝，KEEP_CONFIRMED 只是测试策略，不重复扣库存 / 自动回补时段。详情新增 deliverySupport 预计时段 / 门店自送 / 联系门店内部提示，无电话不造值，当前页面未接，联系 / 确认动作均禁用；E11 异常规则与正式电话待补。

新增 27 项，O07 / O08 专项 54/54、全套 520/520、静态 251，源包体 1213 / 97 / 45 KiB。覆盖双角色权限、状态矩阵、注入拒绝、事务所有写异常 / 零行、响应丢失 / 重建、版本与撤销 / 资源变化冲突、取消竞争、退款独立轴、损坏重放证据和两条历史链；两处时间样例已修正，不放宽守卫。Paid / 接单 / 制作 / 备妥 / 已付取消结果是隔离夹具，不代表实际资金、上游命令执行或退款 / 关单验收。

见 [O08-ORDER-DELIVERY.md](O08-ORDER-DELIVERY.md) 和 [PHASE-6-REVIEW.md](PHASE-6-REVIEW.md)。O01–O08 可离线范围已推进，正式订单 / 页面 / SDK / 云、E10 / E11 / 完成 SLOT 政策及真实资金门禁未通过。没有本轮 UI、微信 / 真机 / 云验收或提交 / 推送 / 上传 / 部署，全部未提交工作保留。

下一项阶段七 **P01 支付接入 / 配置核查**；先推进可离线边界，真实商户关联 / 平台方案 / 云与受控实付仍待条件。保持单一真实支付路径，未核实前不猜 provider / 密钥 / 参数，不恢复旧定金或添加模拟付款入口。

## 46. P01 支付配置 / 环境隔离离线边界（2026-10-05）

新增 payment-configuration-model 和三个阶段均 null 的安全示例。显式单一候选、服务端环境 / AppID 绑定、阶段环境与回调隔离、密钥作用域引用、平台转发认证 / 直接验签解密两条候选链及固定私密错误本地通过；REAL 仅形状，accountVerified / cloudVerified / callable / paymentAllowed 恒 false。没有 payment handler / SDK 或实际选型，客户端 allowlist 保持 user.me / store.health。

受控新付款登记要求原授权引用 / 范围 / 当前时钟 / 明确预算，但持久预算与授权来源未实现。复核修正了过期授权可能阻断资金恢复的边界：CREATE 到期拒绝，已有支付查询 / 关闭 / 退款 / 通知计划要求原支付和原授权证据，不授予新付款。100 分 / 1 次 / 60 秒为夹具，不是正式安排；生产仍有发布门禁。

核对官方候选文档发现内部完整摘要订单号超过微信商户单号长度，P02 要独立唯一编号 / 持久关联；付款有效期可能被接口调整，不得因此延长订单原截止或资源占用，真实关单仍需协调。没有生成预支付参数、写资金记录或加载密钥。

新增 24 项，全套 544/544、静态 255，主包 / features / legacy 源估算 1213 / 97 / 45 KiB。见 [P01](P01-PAYMENT-CONFIGURATION.md)、[阶段七记录](PHASE-7-EXECUTION.md)及[支付云验收](PAYMENT-CLOUD-ACCEPTANCE.md)。没有 UI / 微信 / 真机 / 云验收，没有提交 / 推送 / 上传 / 部署，全部既有未提交成果保留。

下一项 **P02 可离线预支付意图、复用与查单恢复**。P01 整体没有完成，E01 / E03 / E14 仍待真实条件；下轮先读现有订单 / 支付字典和 O05 协调要求，不把离线计划当已部署支付能力。

## 47. P02 支付意图 / 复用 / 一次发送及查单恢复要求（2026-10-05）

新增内部 payment-intent-model / service，复用 payment.create 白名单与当前本人 / 用户 / 订单 / 完整 HELD 校验。独立随机 32 字符商户单号持久关联，不截断内部订单号；预算 / 未决意图 / 引用回执同事务。相同或不同 key 重复准备只复用，不多编号 / 占预算；异参拒绝。回执 SUCCEEDED 指意图准备，非资金成功，订单轴 / 版本和资源不改。

claimDispatch 为内部接口，事务条件写 PREPARED→REQUESTED、token / 时间后才返回所需外部动作；当前无执行器。发送响应丢失 / 新服务 / 新 key 均 QUERY_REQUIRED，不再次领发送权。UNKNOWN 兼容未来未知结果，仍 PENDING；到期不重开或释放。窗口向下取秒、最短有效期加显式余量、提交前复核授权 / 时钟；2000ms 只是夹具。O05 读取已存未决支付后只协调，不走无支付释放。

payment_test_budgets 追加为第 26 个目标集合，客户端全部 CRUD 关闭草案未部署。非生产原授权摘要 / scope 和 reserved+used 双限额验证，预算与意图同事务；不同订单竞争一笔额度、原预算引用 / 摘要、重复不占 / 未知不返还通过。真实授权来源、初始化 / 消耗 / 关闭释放及 SDK 持久预算待补；生产仍有独立发布 / provider 门禁。

新增 30 项，专项 30/30、全套 574/574、静态 259，源包体 1213 / 97 / 45 KiB。覆盖逐写异常 / 零行回滚、两种提交响应丢失、竞争 / 版本 / 撤销 / 资源 / 配置读依赖、短窗口 / 到期与预算 / 编号异常。首次修复共用支付校验未导出、prepare 同步抛错；短测试 key 与独立授权到期样例纠正后通过，未放宽业务规则。

详见 [P02](P02-PAYMENT-INTENTS.md)及[阶段七记录](PHASE-7-EXECUTION.md)。只有串行内存适配器，真实唯一 / 查询不存在条件保护、预支付 / 查单、READY 唤起参数、原配置归档、关闭后重付待补；cloudVerified / callable / paymentAllowed=false，payInvocation=null。UI 与全部既有未提交工作保留，没有微信 / 真机 / 云 / 资金验收或提交 / 推送 / 上传 / 部署。

下一项 **P03 可离线可信通知业务核验、事件去重与原子入账**。实际验签解密 / 平台转发认证、SDK 及 P01 / P02 整体门禁仍未通过；P04 处理真实查询 / 关闭 / 迟到款，不把客户端成功或离线事件当资金证据。

## 48. P03 通知业务核验 / 双去重 / 原子入账（2026-10-05）

新增内部 payment-notification-model / service。来源适配器显式注入、每次重放重核验，实例私有凭证不能用 JSON / 客户端 verified / success 伪造；tests 以对象身份模拟，未实现实际验签 / 解密 / 平台转发认证。核对原环境 / AppID / 商户 / profile、单号 / 本人付款者摘要、CNY 全额、成功时间与未决意图；来源 VERIFIED 与业务通过分离。

通知与商户全局交易守卫存 payment_events 双去重，来源拒绝独立 namespace 不污染真实通知，事实冲突追加不可覆盖原记录。正常支付 / 预算 reserved→used、整单 HELD→CONFIRMED、订单 PAID / paidCents / version 和最终日志同事务；不重复消耗库存，不改历史事实 / 退款轴。取消 / 迟到 / 已关闭或资源异常的匹配资金 PAID / QUARANTINED，不恢复履约或假退款；预算有问题保留原计数与资金证据。

平台秒级成功时间区间显式保存精度，payments.confirmedAt 保留原值，orders.paidAt 是经核验创建 / 发送约束的成功时间下界，防历史倒退。用户当前禁用或新付款授权到期不丢已有资金；不授予新付款权限。正常 10 写及隔离 4 写逐处异常 / 零行回滚、重复 / 响应丢失与重建、跨订单竞争、时间 / 预算 / 撤销 / 隐私、O03 历史快照 / O06 详情兼容通过。组合用例初次时钟相差 8 小时已对齐夹具，不放宽守卫。

新增 **28 项**，全套 **602/602**、静态 **263**，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。见 [P03](P03-PAYMENT-NOTIFICATIONS.md)及[阶段七记录](PHASE-7-EXECUTION.md)。只有串行内存适配器，没有 HTTP callback / 应答、真实 SDK / 跨环境全局唯一证明或资金验收；内部 callable / cloudVerified / paymentAllowed=false。未改 UI、未操作微信 / 真机或实际云，未提交 / 推送 / 上传 / 部署，全部既有未提交工作保留。

下一项 **P04 可离线主动查单 / 关单协调、取消竞争与迟到款补偿意图**。隔离资金不自动转正常入账；真实重新核实 / 退款意图留 P04，执行退款 / 对账任务留 P06 / P07。P01–P03 整体实际接入与阶段七门禁仍未完成，E01 / E03 / E14 保留在[支付云验收](PAYMENT-CLOUD-ACCEPTANCE.md)。

## 49. P04 查询 / 关闭协调及迟到款全额意图（2026-10-05）

新增内部 payment-recovery-model / service，恢复调用与平台结果来源分别注入；tests 是对象身份 / 串行内存，不是实际验签或任务身份。先持久 QUERY / CLOSE 请求，结果按原绑定 / 商户单号 / 版本核验。SUCCESS 复用 P03 QUERY 来源资金计划，通知 / 查询共用交易守卫；NOTPAY / 关闭 ACK、已付提示或未知只要求查询。关闭占权阻止 PREPARED 发送，可信 CLOSED 才释放原预算 / 写全部关闭摘要与日志，O05 后续重读取消 / 释放。

关闭只返 reserved、不重置 used；已释放后迟到款消费一次，授权额度已被其他意图耗尽时保留资金 / 预算核实。取消 / 明确迟到资金证据齐全才同事务取消 / 释放 HELD、确认实付摘要与全额退款 RESERVED / PENDING 意图、日志及持久告警需求；原交易事实保持，守卫处理状态受控更新并追加 reconciliationEventId。异常金额 / 付款者 / 资源 / 日志 / 预算或另有未知支付 / 退款不自动重建；无退款请求或假成功、无告警发送。

新增 **37 项**，全套 **639/639**、静态 **267**，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。查询正常 11 写、关闭 5 写 / 占权 2 写、迟到待付 10 写 / 已取消 6 写逐位置异常 / 零行回滚；响应丢失 / 重建、伪造 / 配置 / 版本与付款竞争、精确到期 / O05、预算释放后迟到、隐私 / 记录损坏及 O03 / O06 历史详情兼容通过。

首次接线问题为服务配置函数混入 JSON 状态 / 观察空资源数组缺失，已修正；测试纠正原配置授权版本、取消重试版本与异步认证调用顺序不等于提交顺序的假设，未放宽规则。详见 [P04](P04-PAYMENT-RECOVERY.md) / [阶段七记录](PHASE-7-EXECUTION.md)。UI / 全部未提交改动保留，未操作微信 / 真机 / 实际云，未提交 / 推送 / 上传 / 部署。

下一项 **P05 可离线支付会话、继续支付与付款结果恢复契约**。实际查 / 关单、SDK、原配置归档 / 系统认证、跨环境交易与退款唯一、任务 / 退款执行 / 告警和真机仍待条件；P01–P04 整体及正式阶段七门禁未通过，E01 / E03 / E14 仍待[支付云验收](PAYMENT-CLOUD-ACCEPTANCE.md)。

## 50. P05 支付会话 / 继续支付 / 结果恢复契约（2026-10-06）

2026-10-06 UI 源码整理已提交并推送到 codex/ui-refresh-2026-10-05，提交 890cb7f；云端订单 / 支付和其他未提交成果保留。随后 P05 暂停时仅完成首批 16 项专项，用户本轮授权恢复；复查补同版本意图变化、付款轴倒退 / 历史金额与期限、客户端时钟回退边界，未改用户已确认 UI。

新增 features/payment/payment-session.js：只生成 OFFLINE_PAYMENT_REQUEST_PLAN 和会话摘要，所有调用 / 支付 / 成功页标记 false。未来归一化摘要白名单与本人 orderId / 金额 / 退款 / 版本校验；success / cancel / fail 及预支付完成只要求 state.get。未知 / 查询失败不再付款，同版本重试复用 key；旧 ticket / 页面失效回调丢弃。PAID_REPORTED 不代表已实付，不开放成功页，退款 / 取消独立提示。截止只做本机保守禁用，不取消订单 / 释放资源。

新增 **19 项**，全套 **675/675**、静态 **274**、SVG **41 个**通过；源包体 **1239 / 126 / 45 KiB**。新增测试基线 656 已包含 UI 的 17 项回归。实际 payment.create / state.get、完整意图与本人认证、预支付参数、请求持久化 / 跨实例恢复、付款继续入口 / 成功页与真机均未接入；当前键仅实例内存，不能声称已完成弱网持久恢复或真机支付。

详见 [P05](P05-PAYMENT-SESSION.md)。P05 整体与阶段七门禁仍待 E01 / E03 / E14 及真实 P01–P04。没有本轮 UI / 微信 / SDK / 云 / 资金验收或提交 / 推送 / 上传 / 部署，全部未提交改动保留。下一项 **P06 可离线退款意图执行边界、查询恢复与预算一致性**，不执行实际退款。

## 51. P06 已有退款意图执行边界 / 可信结果恢复（2026-10-06）

新增 refund-model / refund-service，读取原已付 APPLIED 资金、完整退款 / 尝试、审批日志与原配置。退款 RESERVED / SETTLED 聚合与订单摘要一致；SUBMIT / QUERY 先记尝试才给内部不可调用 transportPlan，未知只查、同键重放不再发送，可信 FAILED 可受权原号重试不再占额。SUCCESS 精确原交易 / 金额 / 币种 / 平台号 / 时间业务核验，事件 / 平台号守卫去重后，同事务写尝试 / 意图 / 订单退款资金 / 日志；失败仍 RESERVED，旧失败不倒退已退。

O06 增加 REFUND_CONFIRMED / REFUND_FAILED 严格轴检查和公开固定文案。迟到款全额退款后仍取消、已释放资源不恢复；多次部分退款累计与本意图预算验证。新增 **19 项**，全套 **694/694**、静态 **278**、SVG **41 个**通过；源包体 **1239 / 126 / 45 KiB**。成功 6 写 / 失败 5 写逐位置异常及零行回滚、丢响应 / 重建、双来源候选、权限伪造、未知 / 并发串行化、事件冲突与双履约 O03 → P04 → P06 → O06 历史详情通过。

组合首测错误来自付款简化夹具没有订单明细，补 O03 真实模型输出的完整快照后重测通过。只有串行内存和对象身份来源，不是实际验签 / SDK 并发；没有平台退款或资金证据，不能宣称 P06 整体完成。实际审批创建 / 当前角色和原配置认证、退款提交 / 可信通知或查询、原号重试 / 时间精度映射、超时调度、唯一索引及真实退款闭环待补。

详见 [P06](P06-REFUND-RECOVERY.md)及支付云验收。没有 UI / 微信 / 真机 / 云或资金操作，没有提交 / 推送 / 上传 / 部署，全部既有改动保留。下一项 **P07 可离线补偿任务 / 对账 / 告警边界**，不自动发送消息或实际资金请求。

## 52. P07 补偿任务 / 对账 / 告警边界（2026-10-06）

后续最新结论见第 53 节 P01–P07 顺序代码复审；本节测试数字保留原开发轮次记录。

新增 payment-maintenance-model / service。服务器注入完整 scope 未决快照，候选只查支付 / 退款或领域复核，没有资金提交和资源操作。任务 ID 绑定实体版本，租约 token + version 防旧 worker，提交前复核到期、延迟重试、次数上限及长期未决生成未发送告警。claim 保存运行记录，finish 与任务终态同事务；旧租约运行保持历史 STARTED / 截止，不伪造领域资金失败。

对账需服务器来源验证及同范围完整本地 / 平台归一化记录，核对引用、整数分 / CNY、状态、平台流水号，缺失 / 差额各自报告，重复成功流水拒绝。报告固定字段摘要 / 字典序稳定，业务引用脱敏；差异报告与 ALERT_REQUIREMENT 原子、同记录去重，messageSent=false，不覆盖订单 / 支付 / 退款。服务未调用 P04 / P06，领域提示执行前必须重新核验；没有定时器 / 自动扫描 / 实际账单适配器。

新增 **23 项**，全套 **717/717**、静态 **281**、SVG **41 个**通过；源包体 **1239 / 126 / 45 KiB**。覆盖重复 / 租约竞争 / 过期重领 / 提交中到期、旧结果 / 丢响应 / 重建、策略 / 人工需求、任务运行告警逐写异常与零行、来源伪造、账单完整范围 / 金额 / 状态 / 流水差异 / 重复流水与排序稳定。测试阈值仅合成策略，不是正式配置。

详见 [P07](P07-MAINTENANCE-RECONCILIATION.md)。P07 整体 / 阶段七真实门禁未通过，真实来源 / 范围扫描 / 领域接线 / 超时任务、SDK / 索引 / 并发、正式策略 / 负责人 / 渠道 / 送达 / 处置待补。没有 UI / 本机 Storage / 微信 / 真机 / 云 / SDK / 实际资金或对外消息操作，未提交 / 推送 / 上传 / 部署，全部既有未提交改动保留。下一项 **P08 阶段七离线评审、可复现证据与真实验收清单**。

## 53. P01–P07 顺序代码复审（2026-10-06）

用户要求从 P01 逐部分审查。顺序检查模型、服务、共享校验、客户端契约、夹具及阶段记录，修复 8 项：P02 发送遗漏完整支付历史；P03 选中意图未匹配完整读集；P05 终态 / 关闭观察及已退累计回退；P06 查询无超时出口、受理平台号未绑定、秒级时间误拒；P07 本地账本 scope 缺校验。P01 / P04 未发现新的确定性缺陷，P04 同步新退款精度字段。

新增 12 项回归，修复前两批分别复现 7 / 2 项失败（关闭观察追加路径属于同一问题）；修复后全套 **729/729**，支付专项 **192 项**，静态 **281**；主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。详情、代码定位、失败 / 最终 TAP 证据及真实接入缺项见 [顺序复审报告](PHASE-7-REVIEW-2026-10-06.md)。

内部退款服务必填 queryRetryAfterMs，仅允许超时重查原号，不重新 SUBMIT 或释放。退款证据新增 occurredAtPrecisionMs，意图新增 settledAtPrecisionMs（未成功 null，成功 1 / 1000）；保留原时间。受理时绑定平台身份并原子持久化，不入账。对账两侧必填四项 scope。未部署数据库，旧缺字段离线记录应重建，不默认推断精度。

没有改页面 UI，没有微信 / 真机 / 云 / 资金 / 对外消息、提交 / 推送 / 部署。全部既有未提交改动保留。P01–P07 代码复审完成，整体实际验收仍未通过；下一步以报告整理 P08 离线证据，真实门禁仍按支付云验收待 E01 / E03 / E14。

## 54. P08 Payment 离线验收与证据工具（2026-10-06）

接续用户认可的 P01–P07 复审，新增 scripts/verify-payment-offline.js、npm verify:payment:offline 入口、5 项证据防误判测试及 P08 阶段矩阵 / R01–R12 真实验收计划。支付专项、初始化旧基线、其他回归三组不重复跑文件；静态 / SVG 单独记录，源码执行前后 SHA-256 含未提交成果，日志另有摘要。

最终证据 docs/qa/p08-2026-10-06-final/summary.json：192 + 19 + 523 = **734/734**，静态 **283**、SVG **41**，源包体 **1239 / 127 / 45 KiB**；源码前后指纹一致，客户端付款探测平台调用 0。非零退出、缺 / 重复汇总、空执行 / 跳过 / 取消 / TODO 或旧基线不足 19 项拒绝通过；目录越界及复用实测退出 1，不覆盖原证据。

报告 scope=OFFLINE_PAYMENT_ACCEPTANCE_EVIDENCE，实际云 / 密码学来源 / 实付 / 退款 / 真机 / SDK 并发验收全部 false；P08 和阶段七整体仍待 E01 / E03 / E14。实际场景、证据字段、负责人及执行顺序见 [P08](P08-PAYMENT-ACCEPTANCE.md) / 支付云验收。没有改 UI 或真实业务入口，没有微信 / 云 / 资金 / 对外消息、Git 提交 / 推送 / 部署；保留全部未提交改动。

下一项 **A01 商家授权 / 角色 / 撤销可离线边界**。正式入口及运营执行仍需 D06 / P08 实际门禁；不使用旧 staff PIN 或模拟成功。

## 55. A01 商家受控授权 / 撤销 / 审计（2026-10-06）

用户授权接续离线推进，新增 admin-access-service、隔离内存事务夹具及 32 项针对性回归。受控 bootstrap 验证调用与服务端批准资料，按 scope / 主体 / 最小能力 / 版本 / 有效期一次创建角色、永久初始化审计和回执；普通客户端、首访、旧 PIN 均不授予权限。角色委派全部门店 / 能力由同一当前授权覆盖，禁止本人自修改和拼接扩权；ACTIVE 0→REVOKED 1 保留原范围与历史，重授权新记录。

每次事务重读用户 / 角色 / 门店，授权 / 撤销三写原子；逐写异常 / 零行回滚、旧 key 历史重放不复活、审计 / 回执损坏、完整读集及初始化批准变更 / 提交期限栅栏通过。禁用人员与归档门店仍可受权撤销；当前入口摘要和能力观察不可作为后续业务凭证。reason 只保存服务器脱敏值，平台 ID 不进审计 / 回执 / 返回。

最终全套 **766/766**、静态 **288**，主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**；证据 docs/qa/a01-2026-10-06/full-final.tap 与 static-final.txt。首轮数组回调下标误作为文本长度参数已修正，夹具未知角色 / 客户端错误形式纠正；复查补批准版本 / 期限提交保护和回执审计时间一致性。较早 full.tap 的 765 项保留原轮次。

只有串行内存与对象身份来源，不是实际 SDK、受控运维认证或真实管理员授权。没有 admin handler / 新客户端 action、页面入口或视觉变更。E01 / E12、D06 / P08 实际门禁及 AR01–AR07 全部 NOT_RUN；A01 整体 / 正式运营未通过。详见 [A01](A01-ADMIN-AUTHORIZATION.md) / [阶段八记录](PHASE-8-EXECUTION.md)。没有微信 / 真机 / 云 / 资金 / 对外消息、提交 / 推送 / 上传 / 部署，全部既有未提交成果保留。

下一项 **A02 可离线商家订单读取与履约命令编排**，复用 O01 / O08 / P06；实际运营仍保持关闭。

## 56. A02 商家订单读取 / 履约 / 拒单意图（2026-10-06）

新增 merchant-order-service、隔离组合夹具和 34 项专项；A01 完整记录校验提取 admin-access-state 共用。O06 增加同店商家投影，列表状态 / HMAC cursor 与当前 grant 绑定，先门店权限后关联读取；列表无电话 / 地址，详情仅履约必要历史资料。当前用户 / 角色 / 门店 scope 每次事务重查，原顾客读取回归保留。

ACCEPT / MARK_READY 各三写；单库存 START_MAKING 五写，确认库存→消耗并引用同笔制作日志，SLOT 不改；PAID 拒单同一角色 ORDER_OPERATE + REFUND_APPROVE，将确认资源释放、取消 / 剩余款 PENDING / RESERVED 意图 / 日志 / 回执原子，单库存 + SLOT 有退款八写。原已付和历史快照不变，已全退只取消，不生成或宣称新退款。

O07 / O08 由原工厂在同笔事务注入严格 A01 access / assertAccessReads，保留原 HMAC / 资源 / 完成策略。自提及配送完整链、拒单→P06 可信恢复→O06 顾客历史、全退 / 部退、逐写异常 / 零行回滚、角色撤销 / 提交竞争、串行两管理员与重放通过。已有待审取消报 CANCELLATION_REVIEW_REQUIRED，需 A06 显式审批，避免悬空申请或假审核。

首轮发现路由丢严格 scope、无权修改提前读关联资料两项，修复前 boundaries-before.tap 2 项失败；复查 pending-review-before.tap 1 项复现悬空取消风险，已阻止。原轮次 full-final 800 项保留，终稿 full-final-v2 明确已全退结果，**800/800**、静态 **292**，主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。受影响组合 142 项通过，详见 [A02](A02-MERCHANT-ORDERS.md) / [阶段八](PHASE-8-EXECUTION.md)。

仍为串行内存 / 对象身份 / 合成经营与资金证据；没有正式 handler / 新 action / 客户端入口 / UI 修改。E01 / E12、E06、E10 / E11 / SLOT、SDK / 索引 / 完整查询 / 退款号跨环境唯一、真实页面 / 真机 / 资金与 MR01–MR08 全部 NOT_RUN，A02 整体及正式运营未验收。未操作微信 / 云 / 实际资金 / 对外消息或 Git 提交 / 推送 / 上传 / 部署，保留全部既有未提交成果。

下一项 **A03 自提码输入 / 扫码 / 核销确认的可离线交互契约**，实际凭证策略、真机和运营条件仍待。

## 57. A03 自提输入 / 扫码 / 核销确认会话（2026-10-06）

新增 features/admin/pickup-session.js 及 28 项专项。显式 OPAQUE_TOKEN 候选政策 / keyFactory，手输从所选内部订单开始；扫码需要显式同步 codec，不发布默认二维码或短码。仅构造 admin.order.get / order.transition 计划，受权同店自提已付备妥摘要之后由用户确认；摘要未验证码真伪，最终仍走 A01 / A02 / O07 原事务。没有接 Page / wx / Storage / 网络、顾客凭证展示或正式运营。

current 白名单不含原码、key、电话 / 地址 / 留言或内部证据。原请求只在私有内存和显式请求计划，禁止整体日志 / setData / 明文落库。错码提交后重新输入 / 重读版本，锁定 / 冷却不猜期限。响应丢失 / 隐藏保留原 key / version / credential，结果未明不换码或自动重试；只有原成功回执及相符 COMPLETED 详情才为演练 COMPLETION_REPORTED。进程退出 / destroy 后安全持久恢复尚未实现，正式开放前必须补核验与安全恢复路径。

首轮 23 项通过，复查新测试复现三处缺口：返回版本过宽、初始摘要金额未重算、高版本付款状态回退；boundaries-before.tap 保留 3 项失败，全部修正。局部 ticket 使用对象身份，跨实例相同 generation 或克隆不能注入结果；补跨会话及溢出 / 生命周期 2 项。A03 / A02 / O07 最终组合 **89/89**，全套 **828/828**、静态 **294**，主包 / features / legacy 源估算 **1239 / 139 / 45 KiB**。最终全套 / 静态并行执行前后源码指纹一致，证据 [摘要](qa/a03-2026-10-06/summary.md)。

合成联测完成链 / 丢响应同 key 回执重放不二次耗资源、错码回执不重复计数、冷却后当前版本正确核销及确认后角色撤销拒绝；平台调用探测 0，客户端两个 admin action 仍关闭。实际 E01 / E12、E10 / SLOT、D06 / P08 门禁，真实页面 / 扫码 / 持久恢复 / SDK / 真机与 PS01–PS07 全部 NOT_RUN；A03 整体未验收，所有确认 / 履约 / 成功反馈门禁 false。

未改现有页面 JS / WXML / WXSS 或字体，未操作微信 / 真机 / 云 / 实际资金 / 对外消息，没有提交 / 推送 / 上传 / 部署，全部既有未提交成果保留。详见 [A03](A03-PICKUP-SESSION.md) / [阶段八](PHASE-8-EXECUTION.md)。下一项 **A04 商品 / SKU / 库存维护可离线部分**，复用目录 / 权限 / 事务规则，不补未知经营默认值。

## 58. A04 商家目录 / SKU / 库存维护（2026-10-06）

新增 merchant-catalog-model / service、A01 可组合夹具及 31 项专项。当前同店 CATALOG_WRITE，严格用户 / A01 scope / 角色 / 门店先验；服务复用 6 个既有 action，但无真实 handler / allowlist / 页面。新商品 DRAFT 和确定性父子 ID；显式完整 SKU、三分类 / 合法组合 / 整数分价格 / 数量 / 留言 / 资源重验，现有分类 / SKU 组合固定，省略 SKU 禁硬删，归档终态。

ON_SALE 校验明确经营值、合法可售 SKU、已发布类别、同店 OPEN 已确认单位资源和确切登记 PUBLISHED / REAL_PHOTO 云图片；测试资料不是正式经营批准。未变 SKU 不递增，变化 SKU / 产品与审计 / 回执原子；原 key 重放重验当前权限、原 expectedVersion+1 / 新建 0 和确定性 ID。库存总量不少于 held + confirmed + consumed，其他计数 / unit / 店 / 状态不变，不清占用或处理 SLOT。

同店完整有限快照 + HMAC 分页绑定当前人员 / grant / 店 / 条件 / 内容修订，真实有界 SDK 查询和完整谓词 / 不存在条件仍待；不能只 CAS 产品。审计仅 STORE actor、scope / 店、目标版本、脱敏 reason / requestId 和请求 / 实体摘要，不保存完整草稿、电话或媒体元数据，摘要不作为密码学来源证明。

典型单 SKU 创建 / 改价 4 写；未改 SKU 产品、上下架 / 库存 3 写。全部写位置异常 / 零行回滚、串行双人同版本、当前权限 / 数据 / 资源 / 素材 / 新记录提交变化、归档 / 图片版本 / 分页 / 重放通过。A04→O03 的实际本地服务组合拒绝改价 / 下架 / 库存版本后的旧 quote，已有订单 facts / items / 金额 / payment / log / 占用 / 素材保留。顾客 Storage / 页面未接线，不遍历修改 cart / quote。

first 26 项中的 23 项失败为夹具遗漏 A01 options.runTransaction，正确接入后 second 26/26。复查加强原请求重放版本 / 新建实体绑定；追加测试的早期失败包含修改提交前旧对象引用，已改为当前数据库对象，不作为实际越权证据。终稿 31 项专项，受影响组合 **119/119**，全套 **859/859**、静态 **298**，主包 / features / legacy **1239 / 139 / 45 KiB**。全量 / 静态执行前后源码指纹一致；证据 [摘要](qa/a04-2026-10-06/summary.md)。

实际 E01 / E12、E05 / E06、D06 / P08、商家页面 / 真机 / 云 SDK / 索引 / 并发 / 素材文件保留与 MC01–MC07 全部 NOT_RUN，A04 整体未验收，cloudVerified / callable / operationsAllowed false。未改现有 UI，未操作微信 / 真机 / 云 / 实际资金 / 对外消息，没有 Git 提交 / 推送 / 上传 / 部署，全部既有未提交成果保留。

实现 / 契约 / 验收见 [A04](A04-MERCHANT-CATALOG.md) / [阶段八](PHASE-8-EXECUTION.md)。下一项 **A05 门店 / 营业 / 预约 / 配送配置维护可离线部分**，保持用户确认每天 08:00–21:00、30 分钟、自取 3 / 配送 1、20 km 含边界 / 0 费 / 云端最终校验；未知提前量 / 窗口 / 时长等不补默认。

## 59. A05 门店 / 预约 / 配送配置维护（2026-10-06）

新增 merchant-store-model / service 与 A01 / O03 可组合夹具。当前同店 CONFIG_WRITE、用户 / scope / grant / 完整有限 store / config / slot 读集在事务重验。8 个既有 action 内部可离线执行，无真实 admin handler / allowlist / 页面。门店信息维护、CLOSED / ARCHIVED 保留订单与占用，地址变化撤销旧定位；定位仅受权地图 token 服务端解析，GCJ02 或 source / verifiedAt 字段不能直接作为真实证明。

新配置 DRAFT、确定性 ID、本店单调唯一序号；已有草稿 CAS，PUBLISHED / RETIRED 不覆盖或退役，旧序号不能覆盖新发布。发布原子保存 config / store.activeConfigId / version / 未来已建资源 / audit / receipt，同名时间政策版本不能换内容。仍可约未来时段维护实时 policyVersion，禁约 / 不再可约时段 CLOSED；已开始资源、原 ID / 模式 / 容量池 / held / confirmed / consumed 保留，关闭资源不自动重新开放，缺行不假装可选。D02 实时资源政策版本已明确受控发布维护，历史订单快照仍固定。

用户确认每天 08:00–21:00、30 分钟、自取 3 / 配送 1、20 km 含边界 / 0 费 / 门店自送 / ESTIMATED 保持。日期禁约 / 缩短窗口完整验证；容量先校验不低于占用再限制 V1 固定值。未知正式 minLead / maxAdvance / quote TTL / payment hold / cartLimits / releasePolicyVersion 不补默认，草稿 null 可保存但不可发布。正式发布还需服务端定位、经营政策与电话验证并保护审批资料到提交，字段 / 摘要不能自证批准。用户高德点和正式地址未被替换成测试资料或伪造 WGS84。

32 项专项、组合 157/157，最终全套 891/891、静态 302，源包体 1239 / 139 / 45 KiB；终稿执行前后指纹一致。first 26 项失败为新调用空 productLeadTimes 与组合夹具元数据时间不一致；second 25/26，最后为测试误期待 QUOTE_CHANGED（O03 保留 SLOT_FULL_OR_CLOSED）；均已修正，非云端事故。追加极大提前量回归先复现未拒绝草稿，补齐安全算术和四位年份预约边界。最后区分验证 binding 的发布序号 / 读取及拟写记录版本，重新全量验收，证据见 [摘要](qa/a05-2026-10-06/summary.md)。

A05→实际本地 O03 拒绝门店编辑 / 配置切换 / 时段关闭后的旧 quote，当前可约摘要使用新配置；历史 orders / items / facts / 金额 / payment / logs / quote / reservations 保留。A02 已确认订单在禁约时段仍可接单并制作，不取消或清占用。只串行内存适配器，真实有界查询、完整谓词 / 负读 / 证明直到提交、索引与事务预算仍待；不允许分批发布或先切指针。

MS01–MS07、E01 / E12、正式经营资料 / 地图适配器 / 经营批准 / 页面 / SDK / 真机 / 并发全部 NOT_RUN。A05 整体未验收，cloudVerified / callable / operationsAllowed false。未改已确认 UI，未操作微信 / 云 / 资金 / Git 提交 / 推送 / 部署，所有既有未提交成果保留。见 [A05](A05-MERCHANT-STORE.md) / [阶段八](PHASE-8-EXECUTION.md)。下一项 **A06 取消 / 退款异常和审计读取可离线部分**。

## 60. A06 取消审批 / 退款异常 / 财务与审计读取（2026-10-06）

新增 merchant-resolution-model / service、merchant-finance-read-service 和 O03 / A01 / P06 组合夹具。补齐 O05 已付本人取消申请原子保存：唯一 PENDING、原请求日志 / 订单 version / 审计 / 回执，订单状态和资源 / 款项不变。request ID 绑定 scope / order / requestLogId，审批用一次 reviewLogId / 当前角色 / 订单与请求版本。缺新关联字段的旧离线记录需受控重建 / 迁移，不补假审批。

同店明确 REJECT 要 ORDER_OPERATE；APPROVE 要同一当前 grant 的 ORDER_OPERATE + REFUND_APPROVE。批准显式整数分、可为 0，不超过剩余预算；原子 review / resource resolution / refund PENDING RESERVED / order / log / audit / receipt。拒绝不释放或退款。已完成订单不能批准取消，可显式拒绝申请。制作后 CONSUMED 库存不回补，SLOT 正式策略缺失拒绝；测试 RETAIN / RELEASE_UNCONSUMED 不是经营批准。退款单独批准仅 REFUND_APPROVE，保持履约 / facts / 占用，未决期间不另退。

既有 admin.refund.retry 在原 A06 权限事务使用 P06 planAttempt：首次 SUBMIT / 已确认 FAILED 重发同号、未知或已受理 QUERY、查询在途抑制 / 超时只查原号、已到账不发。原金额 / 退款号 / budget 不变，独立可信结果才入账。原 key 重放验证当前用户 / 角色 / 完整账本 / 原版本 / 具体 log 轴转换 / 确定性 review / intent / attempt，transportRequired=false；丢响应不取得第二次发送权。没有外部退款调用或成功 UI。

财务列表 / 详情白名单省略联系方式、地址、平台号 / profile / reason 全文、原始异常。AUDIT_READ 与 REFUND_APPROVE 分离，多店审计收窄当前门店，旧缺 outcome 返回 null。只新增 PLANNED exceptions.list（registry 61 项，59 PLANNED），读取 P07 任务实际 status / leaseExpired，不暴露租约 / 改任务。已 CLOSED 的付款订单补偿要 P04 / O05 恢复，不误用退款；付款异常没有客户端资金动作。所有读取是完整可信有限快照，SDK 有界查询 / 预算 / 谓词保护待补，不能只 CAS order 或把分页标完整。

37 项专项，组合 212/212，全套 928/928、静态 307，源包体 1239 / 139 / 45 KiB，执行前后源码指纹一致。典型 request / refund approval 5 写、制作前正金额取消 10 写、attempt retry 3 写，所有写位异常 / 零行回滚；串行竞争、失响应重放、FAILED / UNKNOWN / 查询超时、独立 P06 一次到账、财务 / 审计 / P07 异常权限 / 分页 / 脱敏通过。

first 27/28 的剩余为测试误期待回滚 beforeCommit 外部变更，已保留外部变化并验证本次新退款未提交；replay-before 2 项复现新重放缺具体操作绑定，已修复；affected-first 204/205 为重复定义既有 retry 并误计 62，移除重复，实际 61；affected-final 209/210 为模拟履约比夹具时钟晚，校正测试时间；affected-verified 212/212。复查修正 CLOSED 付款订单的任务映射、已付完整来源 / 原始异常白名单。非云 / 真机事故，日志保留见 [证据](qa/a06-2026-10-06/summary.md)。

A06 整体未验收，RF01–RF07 / E01 / E12 / P08、正式 SLOT 策略、真实 SDK / 索引 / 当前权限 / 资金 / 任务 / 页面 / 真机全部 NOT_RUN，cloudVerified / callable / operationsAllowed / externalRefundExecuted false。未改 UI、未操作微信 / 云 / 资金 / 对外消息或 Git 提交 / 推送 / prepare-cloud / 部署，全部未提交成果保留。见 [A06](A06-MERCHANT-RESOLUTION.md) / [阶段八](PHASE-8-EXECUTION.md)。下一项 **A07 Admin 可离线阶段评审与真实运营 / 旧入口退役清单**。

## 61. A07 Admin 离线评审 / 联合流程 / 旧入口退役清单（2026-10-06）

新增 verify-admin-offline 与 9 项联合 / 隔离回归，package 增加 verify:admin:offline；复用 P08 严格 TAP、子进程期限、独占证据目录、固定代码 / 公开素材指纹。A01–A06 194 项 + A07 9 = Admin 203；旧基线 19、其他 715，共 **937/937**，静态 **310**、SVG **41**，源包体 **1239 / 139 / 45 KiB**。首轮 9/9，终稿源码前后匹配：398 文件，SHA256 `5cf7a45e90b9d1b5109ccca9d70b1de9677753bf20c61a94f627df92228ec9f8`。

实际 client 对 59 个 PLANNED action 在平台初始化前拒绝，平台探测 0；legacy guard 的 11 个禁止配置组合各拒绝 staff / order / 模拟 refund 请求，显式 development / shell / true 对照仅触达 stub。实际 user handler 忽略伪造 role / PIN / openid，仍 customer。60 个非 legacy JS 字面依赖 / localhost 与 canonical routes 通过；不是完整程序分析或正式产物验证。目录越界 / 复用退出 1，旧报告哈希不变。

联测：取消请求明确拒绝→自提确认 / 丢响应原 key 重放→完成；人工配送完成→部分退款合成可信结果一次到账→原配送 key 重放，商品 / 地址 / 资源保留；制作前批准取消后禁止接单、UNKNOWN 只查原号；角色撤销后拒绝退款 retry 原回执与财务读取。仍为串行内存、合成 PAID、对象身份 provider proof 与测试协议投影，不作为真实 SDK / 来源验签 / 实付 / 页面证据。

商家仍 Shell，顾客页面未接 A04 / A05 维护同步；实际本地服务组合只证明可信 quote / 当前预约摘要变化与历史保护。旧子包 7 页仍注册，staff / server / Web / PIN / 定金尾款 / 模拟资金作为演示基线保留；当前运行时关闭，正式发布剔除待 Q01 / AG10，本 Task 不批量删演示。

详见 [A07 与 AG01–AG10](A07-ADMIN-ACCEPTANCE.md) / [证据](qa/a07-2026-10-06/summary.md)。真实云 / 管理员 / 页面 / 真机 / 并发 / 资金 / legacyRetired 全部 false，A07 整体及阶段八运营未验收。旧 HTTP 测试仅临时回环服务，未启动演示经营进程或读取 / 改写经营数据；未改 UI、未操作微信 / 云 / 资金 / 对外消息，没有 Git 提交 / 推送 / 上传 / prepare-cloud / 部署，原未提交成果保留。

下一项 **Q01 可离线干净构建、函数独立部署依赖与权限 / 配置核验准备**。实际 E01 / I07 / D06 / P08、SDK / 完整查询 / 负读 / 索引 / 事务预算、正式地图 / 经营 / 核销与回补策略、持久恢复 / 页面 / 资金 / 并发仍待；进入阶段九不自动开放正式入口。

## 62. 2026-10-08 云环境确认与主流程调整

环境窗口反馈 AppID、开发 EnvId 与登录权限齐备；真机结果和独立 test EnvId 待补。已新增 [主流程资源清单](CLOUD-RESOURCE-MANIFEST-2026-10-08.md)：R0 无需业务集合；R1 仅准备 users/admin_roles/audit_logs 空集合及拒绝客户端规则/身份唯一索引，后续业务资源待适配冻结。此为新增执行范围，不是创建或验收通过记录。

用户确认认证通过及环境关联；微信 CLI 实际查到 AppID `wx154f791a17268ace` 的开发环境 `cloudbase-d8gwtxzm64150b7e0`，函数列表 total=0。工具状态提示登录过期；尚未部署或实际调用函数，也未验证数据库/索引/安全规则。project.config.json 已更新，但生成配置仍旧 AppID/shell/空环境；本窗口未修改它们。

用户重新划分窗口：本窗口补主流程/后端与真实云验收，配置和 UI 由其他窗口承担。任务、证据要求与可复制指令见 [环境交接](CLOUD-ENVIRONMENT-HANDOFF-2026-10-08.md)。优先补 I03/I07 → D04/D06 数据与权限 → C/B/X 可信业务 → O03 真实订单保存/唯一性/资源占用 → 其余订单/支付/运营及发布门禁；此前 Q01 离线下一项不再代表优先级。旧离线成果保留，不标记真实验收通过。
