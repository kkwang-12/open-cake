# 阶段一执行记录：项目初始化

日期：2026-10-03。分支：`codex/phase-1-initialization`。范围：[开发计划 I01–I08](DEVELOPMENT-PLAN.md)。

用户已确认尚未创建云环境，本次先完成本地工程。云部署 / 真实身份 / 真机证据保持待补，不借用测试桩宣称通过。原先未提交的文档、素材和首页修改一起保留在当前工作区；未自动 commit 或 push。

## 当前 Task 状态

| Task | 当前状态 | 已完成的本地交付 | 未完成的验收 |
|---|---|---|---|
| I01 | 已验收 | 原代码盘点、基线测试、审查与迁移清单 | 无 |
| I02 | 已验收 | 编辑 / 换行规范、文档入口、云目录登记、参考图跟踪 | 无 |
| I03 | 本地实现完成；待外部条件 | user.me、云服务入口、可信上下文校验、身份防伪与错误回归 | 创建开发环境，部署并用真实小程序身份在工具 / 真机调用 |
| I04 | 编译 / 截图通过；待交互验收 | 四官方 Tab，13 个主页面逐页编译截图，7 个 legacy 子包页面静态验证，统一导航 | 实际点击四 Tab / 分类 / 详情 / 返回及真机路由 |
| I05 | Home 首屏视觉已验收；其余边界 / 真机待补 | 2026-10-03 用户确认最新 Home Visual Polish 首屏视觉验收通过；公共组件、三分类与安全区骨架已实现 | Home 首屏以外的视觉范围、不同宽度 / 长中文和真机安全区验证 |
| I06 | 本地质量基线已验证 | 错误码 / requestId / 脱敏日志回归、120 文件检查、29 测试；工具 2.02.2608080 / 基础库 3.17.2 编译基线 | 真实云日志与运行时证据归入 I03 / I07 |
| I07 | 本地实现完成；待外部条件 | 两函数各自 SDK 4.0.2 + lockfile，共用模块复制、自包含加载、显式环境生成 | 云端两个函数独立部署、运行时和 SDK 能力验证 |
| I08 | 本地登记完成；待外部条件 | 资料 / 政策 / 支付接入待办登记与阻塞 Task | 实际账号支付能力核验，填写资料负责人及业务确认结果 |

**Home 首屏视觉验收已通过（2026-10-03，用户确认）。** 最终版本为 Home Visual Polish：[已验收截图](../artifacts/home-polish/home-first-screen.png)；保留 [UI-R01A 原始证据与最新验收记录](UI-R01A-EVIDENCE.md)。此结论只覆盖 Home 首屏视觉，不扩展到导航、真机、其他页面或云能力。

**阶段一尚未整体验收通过。** 当前主要剩余项目是实际导航交互、真机验证及真实云环境部署，所有可独立进行的本地工程已推进。

## Task 分析与实际修改范围

```text
Task Goal           建立四 Tab 的 V1 工程骨架、云调用与质量基线
Scope               I03–I08 的本地实现和验证；保留 I01/I02 基线
Affected Domain     Engineering / User / Store health / UI Shell
Files               miniprogram、cloudfunctions、scripts、tests、根配置与阶段记录
Data Flow           UI → 领域 Service → 云函数 → 可信微信上下文
Acceptance Criteria 代码 / 模板 / 路由检查通过，测试无回归，云环境未知时拒绝访问
```

本阶段的 Store 仅实现已鉴权 health 操作，未创建业务门店数据库。商品 / 购物袋 / 地址 / 订单 / 管理页为明确未开放的路由骨架，没有新增正式交易动作或伪造已付款状态。

## 导航与遗留迁移

| 原位置 / 行为 | 当前位置 / 行为 |
|---|---|
| shop 中 Home / Shop 页内切换 + 自绘悬浮导航 | `pages/home/home` 和 `pages/shop/shop` 两个独立官方 Tab；统一黑色导航 |
| 三官方 Tab | Home / Shop / Orders / Account 四 Tab |
| 商品弹层 / Bag 占位 | Detail 独立页面；Bag、Specification、Checkout 均独立非 Tab 路由，未开放购买 |
| order 详情 | 主包 `order-detail` 骨架；旧详情保留在 `legacy/pages/order/order` |
| staff 店员口令页 | 主包 `admin` 骨架，不显示顾客管理员入口；旧口令页保留在 `legacy/pages/staff/staff` |
| 本地 HTTP、定金 / 尾款、模拟支付 | `legacy/` 子包与原 `server/`、`web/` 独立演示；默认不开启 |
| 首页六类目与额外商品 | 开发预览只保留 Cake / Mini Cake / Bread；不增加 Filter 或营销 |

原首页探索四文件已先复制到 `artifacts/phase-1-backup/shop.*`，保留字节内容，另备份原全局样式。原图片仍在 `miniprogram/assets/home/`；新首页复用草莓蛋糕主视觉、商品卡和留白方向。该备份是本机临时文件，未纳入 Git；原代码历史也保留在既有提交中。

旧主包 order / staff 和 HTTP 工具只在确认 legacy 对应文件存在后移除重复文件。没有删除 server / web、旧测试、演示数据或用户素材。

V1 使用官方黑色 TabBar，视觉边界是固定底栏，不复刻参考图的悬浮黑色圆角条。非 Tab 购买页由小程序页面类型自然隐藏 TabBar，不调用 hideTabBar / showTabBar 切换。

## 本地运行与配置

### 默认 UI Shell

直接在微信开发者工具导入项目根目录，无需启动演示服务。默认 `shell / development`：显示三条明确标注的 UI 预览商品，不能购买。云模式、测试阶段与生产阶段不会返回预览商品。

基础库：`3.17.2`，来自开始时本机 `project.private.config.json`；当前工具版本：`2.02.2608080`。已将项目从 `latest` 改成固定值，本轮默认 Shell 的 13 个主页面实际编译通过；不据此推断后续云端或支付能力兼容。项目默认 `urlCheck: true`，原个人开发配置未覆盖或修改；个人配置可能覆盖该设置。

### 配置云调用

1. 将 `miniprogram/config.local.example.js` 复制为 `miniprogram/config.local.js`（已忽略）。
2. 填真实开发环境 ID，改 `mode: 'cloud'`，保持 `stage: 'development'`。
3. 运行 `node scripts/configure-local.js`，生成允许的公开配置 `runtime-config.js`。
4. 调用代码只读取已有的 `runtime-config.js`，不动态 require 可能缺失的本地配置，干净检出也能编译。

生成器只接受 mode / stage / appId / cloudEnvironments / enableLegacyDemo；拒绝未知字段、缺少当前环境或跨阶段共用环境。支付凭证不得进入此文件。环境 ID 不是密钥，但生成后应审查实际 Git diff，不将个人覆盖误作默认配置提交。

### 独立云函数准备

```powershell
node scripts/prepare-cloud.js
# 安装依赖时分别在 cloudfunctions/user 和 cloudfunctions/store 执行 npm ci --ignore-scripts
```

两函数的 `package.json` 和 `package-lock.json` 各自锁定官方 `wx-server-sdk@4.0.2`。共用源码在 `_shared/runtime.js`，prepare-cloud 复制到每个函数的 `shared/runtime.js`，复制件纳入工程且由 check 比对，部署不引用包外文件。

函数云端配置必须填写 `JJL_APP_ID`、`JJL_CLOUD_ENV`、`JJL_STAGE`。它们与实际微信上下文 APPID / ENV 严格比对；OPENID 仅从 `cloud.getWXContext()` 读取。user.me 返回本人身份哈希摘要和固定 customer 角色，不返回原始 OPENID，不支持自提权。store.health 验证相同身份边界后返回连通信息。

云运行时优先在控制台核实可选的受支持 Node 版本，再进行部署；本机 Node v24.19.0 不作为云端支持证据。依据：[CloudBase 小程序云函数身份链路](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)、[官方 wx-server-sdk 源码](https://github.com/wechat-miniprogram/wx-server-sdk)。本阶段没有跨入数据模型、数据库事务或真实支付实现。

### 继续查看旧演示

仅在本地配置 `shell / development` 且 `enableLegacyDemo: true`，重新运行 configure 脚本后，Account 的开发区域显示“旧预订演示”入口。

```powershell
node server/index.js
```

浏览器演示继续使用原 server / web。legacy 小程序有自己的 HTTP 适配器和演示缓存，不再复用 App 的云初始化状态。直接深链 legacy 页面时，未启用也不能发送演示请求。生产发布打包必须在 Q01 排除 legacy 子包 / 示例素材；本阶段没有生成生产包。

## 验证与证据

- 新增回归覆盖：可信身份防伪、无身份 / 错 App / 错 Env、错误配置、未知 action、脱敏、网络失败、响应异常、胶囊计算、四 Tab / 参数编码、演示深链门禁。
- 旧演示领域 / HTTP / 持久化 / WXML 测试保留；全部测试最终结果见下方记录。
- user 与 store 分别在各自目录加载真实 SDK / index.js 成功，不使用另一个函数的 node_modules。该检查不代表云部署或真实身份成功。
- 本机 npm 不在 PATH，因此仅将官方 npm 11.6.2 下载到忽略的 `artifacts/tooling/`，校验 npm 注册表 SHA-512 完整性；没有安装全局工具或改系统 PATH。
- 首次 CLI 检查发现服务端口关闭；用户随后开启端口并允许 Codex 客户端授权，官方 `islogin` 返回 `login: true`。授权仅用于本地工具检查。
- 官方 `simulator_open_page` 与 `simulator_screenshot` 已逐页验证 13 个主页面。截图检查发现并修正主视觉 / CTA 宽度、分类宽度、Account 列表宽度与详情 Header 标题挤成竖排的问题。
- `miniprogram-automator@0.12.1` 以及新版工具的页面栈 / 页面数据自动化接口出现 `rawPath null` 或响应超时。已停止用这条链路判定通过，改用支持的逐页编译 / 截图接口；点击 Tab、分类跳转和返回交互仍待验收。
- `get_simulator_console --command 'grep -i error'` 返回空字符串：仅证明查询时没有匹配的缓冲行，不代表全部日志为空。
- 当前未部署云函数、未创建云资源、未上传小程序、未收真实资金、未自动提交 Git。

最终本地复验（2026-10-03）：

| 检查 | 结果 |
|---|---|
| `node scripts/check.js` | 通过；120 个 JS / JSON / WXML 文件，13 主页面 + 7 legacy 页面，含组件 / 依赖 / 绑定 / 样式与共用代码检查 |
| `node --test tests/*.test.js` | 29 / 29 通过；旧演示无回归，新增身份 / 环境 / 路由边界验证通过 |
| `git diff --check` | 通过 |
| `node scripts/verify-miniprogram.js` | 13 / 13 主页面编译并生成截图；不包含点击导航断言 |
| user / store 独立 SDK 加载 | 各自真实 SDK 4.0.2 / index.js 加载通过；并非云端运行证明 |

本地报告：[report.json](../artifacts/phase-1-qa/report.json)。截图：[Home](../artifacts/phase-1-qa/home.png)、[Shop](../artifacts/phase-1-qa/shop.png)、[Orders](../artifacts/phase-1-qa/orders.png)、[Account](../artifacts/phase-1-qa/account.png)、[Product](../artifacts/phase-1-qa/product.png)、[Bag](../artifacts/phase-1-qa/bag.png)。报告与截图位于 Git 忽略的 artifacts，属于本机证据，干净检出需重新生成。

最初截图为 363 × 785，最后串行检查时工具模拟器缩放使图片输出为 109 × 236；布局问题已复查，但这些低分辨率图片不作为字体细节、不同宽度或长中文验收证据。后续完整视觉验收需恢复模拟器显示比例并补截图 / 真机。

脚本依赖已安装的官方 `wechatide.cmd`，不依赖临时安装的旧 automator。默认使用本机工具路径；其他电脑先指定 `WECHAT_DEVTOOLS_CLI`。可用 `--pages=home,shop,product` 仅重新检查指定页面。工具未登录、端口未开启、授权未完成或编译失败时会以非零退出码停止；若返回授权 taskId，需完成工具授权后重新运行。本次已经获得授权。

```powershell
$env:WECHAT_DEVTOOLS_CLI='D:\微信web开发者工具\wechatide.cmd'
node scripts/verify-miniprogram.js
```

## 待补验收操作

1. 服务端口、账号登录与客户端授权已完成；补实际点击四 Tab、首页分类到 Shop、商品详情 / 返回与购物袋入口记录。页面栈自动化接口异常时可由人工操作验收；逐页编译记录不能替代该项。
2. 真机验证胶囊、安全区、中文长标题、触摸目标；视觉截图不能替代真机能力。
3. 创建开发云环境后部署 user / store，分别核对 settings 与环境，Account 开发连通按钮真实调用两函数。
4. 用真实调用验证 event 中伪造角色 / OPENID 不生效，开发端不能连接生产环境，日志不含原始身份和联系方式。
5. 核实账号支付能力与未决政策登记。只有补足相关证据，才将 I03–I08 转成已验收并通过阶段门禁。
