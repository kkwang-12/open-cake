# UI-R01A — Home First Screen Evidence

日期：2026-10-03。分支：`codex/phase-1-initialization`。

**状态更新（2026-10-03）：用户已确认最新 Home 首屏 Visual Polish 视觉验收通过。** 以下 UI-R01A 内容与三份截图保留为上一轮历史证据，最终验收版本以 [Home Visual Polish 首屏截图](../artifacts/home-polish/home-first-screen.png) 为准。

最新一轮仅修改 Home WXSS：分类导航高度收紧约 18%，移除描边 / 阴影、减弱方块容器并放大食品主体，校准字重 / 灰度 / tracking。其余 192 个基线文件和 Hero 构图 / 摄影位置 / CTA 规则未变；微信样式编译和静态检查通过，Console Error 过滤无命中。原照片文件、今日推荐布局、其他页面和业务未修改。

验收来源：用户在当前会话明确回复“ok我这边视觉验收完毕”。范围仅 Home 首屏视觉；导航交互、真机及阶段一其他 Task 不据此标完成。原记录中“待审核”描述为当时状态，现由本条用户验收记录更新。

参考：[已提供的首页 Reference](../assets/首页.png)。本轮仅调整 Home 第一屏的 Header、Hero、Typography、Photography、CTA、Category 和构图。

## 1. Home 第一屏完整截图

微信开发者工具实际截图，最终输出 374 × 862；未放大、补画或替换 UI。画面下方自然出现的今日推荐商品卡保持原实现。

![Home 第一屏](../artifacts/ui-r01a/home-first-screen.png)

## 2. Header + Hero

![Header + Hero](../artifacts/ui-r01a/header-hero.png)

## 3. Hero + Category Card

![Hero + Category Card](../artifacts/ui-r01a/hero-category.png)

两个局部图均从同一张最终工具截图按原像素裁出，不是另行生成的界面图。截图在本机 Git 忽略的 `artifacts/ui-r01a/`，不会随普通代码提交携带。

## 4. 本轮修改文件

| 文件 | 本轮修改 |
|---|---|
| [home.wxml](../miniprogram/pages/home/home.wxml) | Home 专用单一品牌 Header；合并 Hero 文案与摄影；移除 Hero 商品名 / 价格和无功能 Hamburger；小 CTA、带照片的三列分类卡 |
| [home.wxss](../miniprogram/pages/home/home.wxss) | Home 首屏独立字体层级、构图定位、内容宽度 CTA、轻微叠入的分类卡及局部间距变量 |
| [home.js](../miniprogram/pages/home/home.js) | 复用已有安全区测量；Header 购物袋入口；三张分类图及加载失败显示；显示名“小蛋糕”。保留原分类跳转和商品卡选择行为 |
| [strawberry-hero-r01a.png](../miniprogram/assets/home/strawberry-hero-r01a.png) | 新增 Hero 专用透明照片副本，1448 × 1086，实际含 alpha；原 strawberry / chocolate / bread 照片不变 |
| [UI-R01A-EVIDENCE.md](UI-R01A-EVIDENCE.md) | 本轮证据与实现说明 |

范围保护：[scope-report.json](../artifacts/ui-r01a/scope-report.json)。本轮开始快照中的其余 **188 个文件 SHA-256 均未变化**；Home 从 `<view class="section">` 起的下半屏 WXML 与本轮前逐字一致（统一换行后比较）。

公共 Header、全局 Token、product-card、底部 Tab、Shop、Orders、Account、Bag 逻辑、目录数据 / 服务、Checkout、Order、Payment、Admin 及前轮文档均未修改。工作区原有未提交改动属于此前阶段，不计入本轮文件清单。

## 5. Design Token 与修复说明

**全局 `styles/tokens.wxss` 未修改。** 复用已有背景 / 表面 / 文字 / 灰色 / 边线颜色及系统 Sans-serif 字体栈；在 Home WXSS 内定义 4 / 8 / 12 / 16 / 24 / 32 的局部 spacing scale，以 rpx 表达，不影响其他页面。

| 项目 | 当前实现（供验收对照） |
|---|---|
| Header | 只保留“家家乐 / CAKE / BAKERY”与真正可用的 Bag 入口；中文 36rpx / 600，英文 18rpx / 500 / 2px tracking；无 Hamburger |
| Hero | 文案与透明蛋糕照片处于同一 600rpx 高构图区域；不再是文案下堆叠一张独立圆角商品图；不显示名称或价格 |
| Headline | 56rpx / 600 / 1.12；以字号与两行构图建立主视觉，不使用 800 / 900 |
| Eyebrow | 20rpx / 500，2px tracking，Secondary Gray |
| Subtitle | 24rpx / 400 / 1.8，Secondary Gray；按“一份好蛋糕，让日常 / 值得庆祝。”分成两行，文案不变 |
| Photography | 原草莓蛋糕的透明衍生照片位于 Hero 右侧；`aspectFit` 保持比例和完整主体，不拉伸，不裁掉主体 |
| CTA | “探索更多 →”；内容决定宽度、黑底白字、小 Pill；保留 44px 最小触摸高度，与文案左沿对齐 |
| Category | 仅蛋糕 / Cake、小蛋糕 / Mini Cake、面包 / Bread；三列等宽，各使用已有食品照片，112rpx 正方缩略图、统一 aspectFill |
| Floating Card | Warm / White 表面、24rpx 圆角、细边线、极弱阴影；以 -24rpx 顶部间距轻微叠入 Hero 底部 |
| Grid / Density | Header、Hero 文案、CTA 和原今日推荐标题统一 32rpx 左沿；正常模拟器首屏能看到完整 Header / Hero / Category 及今日推荐标题 |

这些说明对应 AC01–AC20 的实现位置；AC21 / AC22 由范围保护结果支持。它们不是 Product Owner 的视觉验收结论。

### 图片处理记录

使用内置 `image_gen`（imagegen 技能），以已有 `miniprogram/assets/home/strawberry.jpg` 为编辑输入，生成透明副本；最终工程路径为 `miniprogram/assets/home/strawberry-hero-r01a.png`。没有覆盖原照片。这是生成式去背景衍生素材，不等同于逐像素剪切，微小边缘或纹理差异仍需审核。

最终提示词：

> Use case: background-extraction. Asset type: transparent PNG photo cutout for an existing WeChat mini-program Home editorial hero. Edit target: the attached/current local strawberry.jpg photograph, not a style reference. Remove ONLY the gray photographic backdrop to actual alpha transparency. Preserve the exact same single strawberry cream cake, camera angle, proportions, complete silhouette, cream piping, number and placement of strawberries, colors, texture, side strawberry slices and bottom sponge. Do not redesign, restyle, beautify or add fruit, leaves, plate, decoration, text or shadows. Keep the complete cake in frame with a small even transparent margin. Preserve realistic food photography and original lighting. Return one genuinely transparent PNG, not a checkerboard painted background.

## 6. 微信开发者工具编译结果

工具 2.02.2608080；基础库 3.17.2。没有云部署、上传或发布。

| 检查 | 本轮结果 |
|---|---|
| `simulator_open_page`，Home | `ok: true`，`success: true`；实际显示新 Home |
| `compile_wxml`，最终 Home WXML | `success: true`，`name: $gwx`，`codeLength: 80149` |
| `compile_wxss`，最终 Home WXSS | `success: true`，`files: 2`，`comm / page`，`totalCodeLength: 10883` |
| `simulator_screenshot` | `success: true`，374 × 862，完整截图与两个局部截图已保存 |
| `node scripts/check.js` | 通过；120 个 JS / JSON / WXML 文件，路由、组件、模板、依赖与样式检查正常 |
| 现有导航 / WXML 回归 | 5 / 5 通过；未新增与样式实现镜像的测试 |
| `git diff --check` | 通过 |

## 7. Console Error、系统限制与已知差异

- `get_simulator_console --command 'grep -i error'` 返回空字符串，即查询时没有匹配的 Error 记录。
- 全部缓冲日志查询 `grep -n .` 仅见基础库版本和子包数量两条 system / info 记录。未观察到本轮模板、样式或图片加载错误；这是当前本地会话证据，不等于真机结论。
- 微信状态栏、Capsule 和安全区由系统决定。Home 复用既有安全区测量，顶部按实际 statusBarHeight 留白，右侧按 Capsule 位置预留空间；Bag 保留 44px 触摸目标，无法照 Reference 把右侧区域全部用于品牌导航。
- Reference 使用带场景 / 盘子的摄影和不同蛋糕视角。本轮保留当前蛋糕主体与视角，不补造摄影场景；透明边缘与原照片纹理的微差待视觉审核。
- 参考图为更多分类和悬浮底栏。本轮严格只用三分类，底部仍为既有官方四 Tab；分类卡仅学习其浮层构图关系。
- 本轮检查了实际模拟器画面；未提供真机、320px 窄屏或系统放大字体证据。这些环境的文字 / Capsule 细节仍待审核。
- 首屏以下内容和业务均未推进，没有进入下一 UI Revision。
