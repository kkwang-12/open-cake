# 工程与身份验证：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [INITIALIZATION.md](#initialization)
- [NAVIGATION-DEVICE-CHECK.md](#navigation-device-check)
- [PHASE-1-CLOUD-REVALIDATION-2026-10-08.md](#phase-1-cloud-revalidation-2026-10-08)
- [PHASE-1-EXECUTION.md](#phase-1-execution)
- [UI-R01A-EVIDENCE.md](#ui-r01a-evidence)

---

<a id="initialization"></a>

## 原记录：INITIALIZATION.md

<a id="initialization--项目初始化记录"></a>
# 项目初始化记录

日期：2026-10-03；项目：家家乐蛋糕店；目录：`D:\dinner cook`。

本文保留首次初始化的历史结果。后续在新分支上的阶段一迁移与当前状态，见 [阶段一执行记录](phase-1.md#phase-1-execution)。

<a id="initialization--初始化边界"></a>
## 初始化边界

本次完成可审查、可继续开发的工程基线与计划文档初始化。现有仓库已经初始化 Git，且已有原生小程序和可运行演示服务，因此不重新生成框架、不安装替代框架、不清理既有代码。本次没有完成云环境开通、业务迁移或微信支付接入。

`DESIGN-SPEC.md` 作为被审查的产品材料保留原文。本文及其他新增文档是审查结果和执行拆分，其中新增业务规则均标明为建议或待确认，不能当作原执行书已有定稿。

<a id="initialization--已完成的变更"></a>
## 已完成的变更

| 文件 | 结果 |
|---|---|
| `.editorconfig` | 明确 UTF-8、LF、两空格缩进；Markdown 保留有意的尾空格 |
| `.gitattributes` | 新增文本换行与图片二进制约定；未对存量文件批量重新归一化 |
| `package.json` | 规范格式，增加 `demo` 命令，保留现有 start / test / check |
| `project.config.json` | 声明 `cloudfunctionRoot: cloudfunctions/`，标明当前仍为演示运行基线 |
| `cloudfunctions/README.md` | 创建真实说明文件，列出云函数配置和部署约定；尚无业务函数 |
| `.gitignore` | 允许 `artifacts/design-ref/*.jpg` 参考图纳入版本管理，其余 artifacts 继续忽略 |
| `README.md` | 新增 V1 文档入口，保留原演示运行说明 |
| `docs/PROJECT-REVIEW.md` | 提供可行性审查、风险、建议模型和前置决策 |
| `docs/DEVELOPMENT-PLAN.md` | 按九个阶段拆分 Task、依赖、验收条件与阶段门禁 |

<a id="initialization--既有工作保护"></a>
## 既有工作保护

- Git 基线提交：`40f78b4`，`feat: add cake booking demo and WXML validation`。
- 开始时 `miniprogram/pages/shop/shop.js / .json / .wxml / .wxss` 已有未提交修改；本次未改动这四个文件。
- 开始时 `DESIGN-SPEC.md`、`assets/`、`miniprogram/assets/` 尚未跟踪；本次未删除、覆盖或自动提交。
- 原 `server/`、`web/` 和旧测试完整保留。遗留 JSON 数据不会直接迁成正式订单。
- 未创建新分支、提交、远程仓库或云部署。

<a id="initialization--验证记录"></a>
## 验证记录

运行环境检测：Node.js `v24.19.0` 可用，当前命令环境中的 `npm` 未被 PATH 识别。本次使用 Node 直接执行检查，不安装运行环境。

```powershell
node --test tests/domain.test.js tests/http.test.js tests/repository.test.js tests/wxml.test.js
node scripts/check.js
```

- 初始化前：19 项自动化测试通过，44 个 JS / JSON / WXML 文件静态检查通过。
- 初始化后：按同样命令复验，结果见下方最终记录。
- 旧测试主要验证演示版定金 / 尾款、权限、模拟退款、持久化与 WXML 表达式；不能作为云数据库并发、真实付款或新购物袋流程的验收凭据。
- 小程序源码原始文件合计 777,062 字节（约 759 KiB），这不是开发者工具生成的发布包体积。
- 微信开发者工具编译、云函数部署、支付回调、真机支付及视觉验收尚未执行。

最终复验记录：初始化后 19 / 19 项自动化测试通过，44 个 JS / JSON / WXML 文件静态检查通过；文档检查确认 67 个 Task 编号连续且唯一，全部包含依赖与验收条件，12 个本地 Markdown 链接有效，代码块闭合，UTF-8 无乱码。云函数根目录与 demo 命令配置正确；参考 JPG 可跟踪，其他临时 artifacts 仍被忽略。

<a id="initialization--尚未完成的项目初始化任务"></a>
## 尚未完成的项目初始化任务

开发计划阶段一的 `I01 / I02` 本次完成；`I03–I08` 仍待执行，包括云环境最小验证、四 Tab 与路由迁移、设计基础组件、质量门禁、依赖配置和外部条件登记。整个「项目初始化」阶段尚未验收通过。

---

<a id="navigation-device-check"></a>

## 原记录：NAVIGATION-DEVICE-CHECK.md

<a id="navigation-device-check--阶段一导航与真机检查"></a>
# 阶段一：导航与真机检查

日期：2026-10-03。分支：`codex/phase-1-initialization`。对应 I04（路由与四 Tab）、I05（UI Shell / 安全区）、I06（质量检查）。当前使用 development / shell，无需云环境。

<a id="navigation-device-check--当前结论"></a>
## 当前结论

阶段一尚未整体验收。Home 首屏视觉已由用户验收；2026-10-03 用户回复“我真机测试后没有问题，请你继续往下做”，本轮真机检查登记为用户确认通过。I03 / I07 的真实云验证、I08 的账号和资料仍待补；按本次继续指示推进阶段二离线设计 / 校验，保留所有真实云验收门禁。

用户首次真机截图确认首页可打开，分类和商品 JPEG 正常显示，但 Hero 出现“图片暂未加载”。恢复 PNG 后用户真机复测反馈无问题，Hero 故障已关闭。证据为用户反馈；未提供设备型号、系统 / 微信版本、最终上传包体积或逐项结果，不虚构这些记录，也不扩展为多设备验收。

<a id="navigation-device-check--hero-修复与包体积"></a>
## Hero 修复与包体积

- 前一次为解决主包 2216 KB 超限，将 Hero 从 PNG 改为无损 WebP；模拟器显示正常，但用户真机未加载。未取得真机 `binderror` 的原始错误，不能单凭截图确定具体解码或打包原因。
- 本轮恢复 `/assets/home/strawberry-hero-r01a.png`，确保未被打包排除。Hero 构图、文案、位置、商品卡和业务逻辑保持已验收版本。
- PNG 仅优化编码：1448 × 1086，保留透明通道；文件从 1,514,923 字节减至 1,475,298 字节。逐字节比较解码后的 RGBA，像素完全一致。
- 未使用的 WebP 候选移至忽略的 artifacts 备份。未被引用的 `pear.jpg` / `latte.jpg` 保留在源码，排除打包；当前三分类和商品素材均保留。
- 返回 Home 时清除旧 `imageFailed` 状态，让图片重新尝试加载；不循环重试，不改变购买流程。
- 按当前分包及文件 / 目录排除规则计算，主包源文件为 **1,993,653 字节，约 1947 / 2048 KiB**，余量 103,499 字节。此数值是源文件估算；实际编译、上传包体积以微信工具为准。

本轮检查：

| 检查 | 结果 |
|---|---|
| 静态检查 | 120 个 JS / JSON / WXML 文件通过；路由、引用和包体积检查通过 |
| 导航 / WXML 回归 | 5 / 5 通过 |
| PNG 像素一致性 | 与原图解码 RGBA 完全相同 |
| 打包门禁反例 | 在内存中模拟排除正在引用的 PNG，检查正确失败；模拟重新打入两张未引用 JPEG，2175 KiB 超限，检查正确失败；未修改真实配置 |
| Home 本地编译 / 截图 | 官方工具打开成功；截图确认 PNG 正常显示；图片元素 `src` 为 PNG 路径 |
| 当前 Console 查询 | 最终重新编译后 `grep -i error` 返回空字符串，仅表示当前缓冲区没有匹配行；不代表历史日志或真机无错误 |
| 差异格式 | `git diff --check` 通过 |
| 真机修复结果 | 2026-10-03 用户反馈真机测试无问题；本轮故障关闭；没有新增设备 / 上传包体积元数据 |

本机证据：[Home PNG 截图](../../../artifacts/package-qa/home-restored-png.png)、[像素检查](../../../artifacts/package-qa/png-verification.json)、[打包门禁检查](../../../artifacts/package-qa/packaging-guard-verification.json)。artifacts 不纳入 Git，干净检出需重新生成。

<a id="navigation-device-check--导航证据边界"></a>
## 导航证据边界

下表保留工具侧原始限制。用户随后整体确认本轮真机测试无问题，作为当前 Shell 导航与显示的人工验收来源；不把失败的工具调用改写为成功，也不推断 P10 云诊断或各单项独立证据齐全。

| 路径 | 当前证据 / 结论 |
|---|---|
| Home | 本地编译截图正常；用户旧调试包可打开，但旧 Hero 加载失败 |
| Shop / Orders 切换 | 自动导航后截图与页面、选中 Tab 一致；模拟器检查通过，待真机点击 |
| Account 切换 | 工具返回成功，但对应截图实际为 Home；不计通过，待人工点击 |
| Home 三分类 → Shop | 三次真实元素点击后的截图分别选中 Cake / Mini Cake / Bread，显示对应预览商品；模拟器检查通过，待真机 |
| Shop「全部」 | 点击后的截图显示三个预览商品；模拟器检查通过 |
| 商品卡 → 详情 / Header 返回 / Bag | 工具出现超时或组件元素找不到，无法据此判定交互通过或应用故障；待人工点击 |
| CTA / Account 子页 / 空态返回 | 待人工点击；静态路由和已有单元测试不能替代实际交互 |

本机截图与调用记录位于 [导航报告](../../../artifacts/navigation-qa/report.json)。工具页面元数据曾与实际截图不符，未据此判定通过。此次会话曾出现微信 SDK 的 `network offline` 错误，不能宣称 Console 全部无错误；该错误与本地图片修复分别记录。

<a id="navigation-device-check--用户真机复测步骤"></a>
## 用户真机复测步骤

1. 在微信开发者工具选择 Home，重新编译当前代码。
2. 结束旧真机调试会话，重新点击“真机调试”，使用本次生成的二维码打开新代码包；旧二维码不能作为本次修复证据。
3. 先确认完整草莓 Hero 已显示；若仍失败，保留真机控制台中的图片错误及截图。
4. 按下表检查。当前都是工程骨架 / 预览状态，不要求云服务、购买或支付成功。

| 编号 | 操作 | 可验收结果 | 真机状态 |
|---|---|---|---|
| P01 | 打开 Home；去其他 Tab 再返回 | Hero 每次正常显示；三分类图片正常；无残留加载失败占位 | 待测 |
| P02 | 依次点击首页 / 选购 / 订单 / 我的 | 四个页面与选中 Tab 一致，无白屏或错误跳转 | 待测 |
| P03 | 从首页依次点击蛋糕 / 小蛋糕 / 面包 | 进入 Shop，分别选中对应分类，显示对应预览商品 | 待测 |
| P04 | 点击首页“探索更多”；Shop 点击“全部” | 进入 Shop；全部筛选展示三条预览商品 | 待测 |
| P05 | 从 Home / Shop 点击商品卡；点击详情返回 | 打开对应详情；详情没有 TabBar；返回原页面；购买按钮明确未开放 | 待测 |
| P06 | 从 Home / 详情点击 Bag，再返回 | 打开非 Tab 的 Bag 骨架；返回来源页面；没有已下单或已付款假状态 | 待测 |
| P07 | 我的 → 收藏 / 地址 → 返回；我的 → 订单 | 子页无 TabBar、返回到我的；订单入口选中 Orders Tab | 待测 |
| P08 | 点击 Orders 的“浏览商品” | 返回 Shop Tab，页面和选中 Tab 一致 | 待测 |
| P09 | 查看 Header、页面底部并滚动 | Bag 和内容避让胶囊；TabBar / 底部安全区无遮挡；中文和触摸目标可用 | 待测 |
| P10 | 我的 → 开发连通检查 | 未配置云环境时显示明确错误，不显示身份校验或连通成功 | 待测 |

本轮清单已获用户整体确认，没有逐项勾选数据；P01–P09 的“待测”保留为原始清单状态，验收结果以上方用户反馈为准。P10 没有单独的真机结果。设备版本和实际包体积仍未提供；云验证继续等待开发环境，不自动通过阶段门禁。

<a id="navigation-device-check--修改文件"></a>
## 修改文件

- `miniprogram/assets/home/strawberry-hero-r01a.png`：无损编码优化，像素一致。
- `miniprogram/pages/home/home.js`：返回首页重试旧失败状态。
- `project.config.json`：排除两张未引用旧素材。
- `scripts/check.js`：主包源文件预算与引用图片防误排检查，当前支持 file / folder 排除规则。
- 本文与 `PHASE-1-EXECUTION.md`：记录实际进度、证据和待测项。

---

<a id="phase-1-cloud-revalidation-2026-10-08"></a>

## 原记录：PHASE-1-CLOUD-REVALIDATION-2026-10-08.md

<a id="phase-1-cloud-revalidation-2026-10-08--阶段一真实云补验收"></a>
# 阶段一：真实云补验收

日期：2026-10-08。依据开发计划 I01–I08 与 [历史离线记录](phase-1.md#phase-1-execution)。用户要求从第一阶段逐项重做此前缺云环境的事项；UI/动效与日常环境配置仍按窗口分工处理。

<a id="phase-1-cloud-revalidation-2026-10-08--实际执行与结论"></a>
## 实际执行与结论

**后续事实覆盖历史结论**：R1已创建，user.me真实落库已接通；SDK复用实例残留身份的缺陷已实测并修复。早先冷实例拒绝不能单独证明复用实例安全；下文“未部署身份模块/数据库为空”仅代表当时。user/store及两验收函数已更新，原生成功、固定配置拒绝与复用实例AUTH_REQUIRED通过。最新证据及971项回归见[阶段二复验](phase-2.md#phase-2-cloud-revalidation-2026-10-08)，真机/独立环境/日志门禁仍保留。

开发 AppID `wx154f791a17268ace`，EnvId `cloudbase-d8gwtxzm64150b7e0`，ap-shanghai，NoSQL 数据库 RUNNING。CloudBase MCP 登录 READY，实际已绑定正确环境。共享配置保持 development/shell，不影响其他窗口的 UI 预览。

本轮读取真实平台状态：user/store 为 Event、Nodejs20.19、Active/Available、index.main、CodeResult=success。接收环境窗口的云包核验记录（SDK 4.0.2、shared/runtime.js 与源文件一致），再次编译隔离工程并复验实际原生调用；未重新部署正常 user/store。

| 云端用例 | 实际结果 | 证据 |
|---|---|---|
| user.me，真实微信身份 | PASS，authenticated=true、customer | native-revalidation.json |
| store.health，真实微信身份 | PASS，available=true、正确 development EnvId | 同上 |
| 事件伪造 OPENID/role | PASS，仍 customer、sameSubject=true | 同上 |
| 无效 action / 数组 payload | PASS，两项均 INVALID_REQUEST | 同上 |
| 无可信身份的管理端伪造调用 | PASS，AUTH_REQUIRED | control-plane.json 中管理端请求标识 |
| 云端缺环境配置 | PASS，INVALID_CONFIGURATION | 原生调用独立验收函数 |
| 云端错误 AppID | PASS，APP_MISMATCH | 同上 |
| 云端错误 EnvId | PASS，ENV_MISMATCH | 同上 |

正向、伪造和无效请求使用实际 user/store；三项错误配置使用独立函数 `jjl-i03-rejection-20261008`。该函数先以真实 SDK getWXContext 与正确配置验证基线，再复用同一 runtime.js 对三套服务端固定错误配置验证拒绝。没有伪造可信上下文、修改正常函数变量或写业务数据。这证明部署运行时代码的拒绝路径，不等于切换了另一个环境，也不是完整跨环境访问试验。

验收函数源码：[initialization-rejection.js](../../../scripts/cloud-checks/initialization-rejection.js)；准备脚本：[prepare-initialization-cloud.js](../../../scripts/prepare-initialization-cloud.js)。实际包位于忽略的 artifacts/initialization-cloud-20261008/functions。平台回读入口与本地源码逐字一致。函数留在 development 供真机补验收，未建立 HTTP 路由或触发器；不纳入正式业务函数目录，发布前应按精确函数名称交给环境窗口退役，不自动删除。

复验步骤：编译打开 artifacts/cloud-env-validation-20261008 的 pages/verify/index，待该页实际 services/cloud.js 完成五项调用，再运行 [verify-initialization-native.js](../../../scripts/verify-initialization-native.js)。证据文件采用 exclusive create，不覆盖历史；重跑须使用新证据路径。验收脚本只读取隔离 App 的公开结果/启动原生调用，不操作商品/地址等业务存储。

<a id="phase-1-cloud-revalidation-2026-10-08--逐-task-状态"></a>
## 逐 Task 状态

| Task | 当前真实状态 | 尚缺 |
|---|---|---|
| I01/I02 | 保留历史本地验收；本轮未发现新增云待办 | 不因本轮重复改工程/UI |
| I03 | 工具真实成功、伪造拒绝及云端配置拒绝已复验 | 真机 user/store 与设备/微信版本；整体仍 PARTIAL |
| I04/I05 | UI/设备窗口负责；本窗口未改界面 | 原计划跨设备/长中文/导航证据按 UI 验收补齐 |
| I06 | 错误码/requestId、管理调用脱敏输出及本地质量检查通过 | 平台独立日志查询接口已废弃；CLS 尚未开通，完整日志查询/留存能力待环境方案 |
| I07 | 独立部署/依赖证据已核对；云端缺配置和错环境拒绝已执行 | 独立 test/production 实例互不串用尚未实测，不虚填 EnvId；整体保留 PARTIAL |
| I08 | 开发云条件明确，不再索要密码/密钥 | 实际商户/支付方案与经营资料责任人等原未决项 |

**阶段一仍未整体验收通过**，但工具链路与三项云端拒绝不再是 NOT_RUN。test 环境是同一小程序下独立云资源，当前最小链路不要求立即创建；隔离的破坏/并发/恢复场景后续安排，不能把同一 EnvId 填两遍充当环境隔离。说明参考 [官方环境说明](https://docs.cloudbase.net/quick-start/create-env)。

<a id="phase-1-cloud-revalidation-2026-10-08--工具限制及本地验证"></a>
## 工具限制及本地验证

微信 automation_evaluate 的页面栈接口 getCurrentPages 触发 APPID_ERROR（Cannot read properties of undefined），停止沿该接口反复修补；改为隔离 App 状态及原生 wx.cloud 调用。CLI 对嵌套双引号的转发亦有问题，脚本使用单行函数/内部单引号，并解析 result.result.result。失败不作为成功证据，最终通过有新平台/业务请求标识。

queryFunctions/listFunctionLogs 实际返回底层 GetFunctionLogs 已废弃，不能把此错误算 handler 失败或声称已读取全部云日志。管理端 invoke 的日志仅出现 code/requestId/stage 与固定拒绝响应；环境没有 CLS 日志服务，未自行开通新的服务。

本地针对性验证 **32/32**：cloud 7、authorization-model 16、新验收函数 3、新身份适配 6。静态检查 **332** 文件、4 主包/16 分包页面；源估算 main/features/legacy **1392/153/45 KiB**。数字仅代表本轮检查，不替代 SDK 数据事务或真机证据；未重新宣称历史全套 937 项当前通过。

CloudBase code-review：SEC001 通过，验收函数不回显完整 event/context/env、OPENID 或秘密；开发阶段门禁关闭其他阶段；使用真实 wx.cloud/getWXContext，无 Web/匿名身份替代。身份适配遵循 SDK 包内实际接口 add({data}) 与 throwOnNotFound=false，不用 set/upsert 覆盖用户。

<a id="phase-1-cloud-revalidation-2026-10-08--下一步与证据入口"></a>
## 下一步与证据入口

已准备 [cloud-identity-repository.js](../../../cloudfunctions/_shared/cloud-identity-repository.js)：稳定主键、原生上下文、首次事务插入、读取现有用户、禁用/身份损坏拒绝、存储异常脱敏。**该模块未部署或接入 user.me**；6 项测试为 SDK 形状的本地契约夹具，未证明真实事务冲突/回滚/索引能力。

数据库列表实际为空，环境窗口需先按 [R1 清单](phase-2.md#cloud-resource-manifest-2026-10-08) 准备三个空集合/规则/索引；主流程再补身份落库与 D04/D06 实际验收。不得因适配文件存在直接开放业务或初始化管理员。

- [本轮原生成功及配置拒绝证据](../../qa/initialization-cloud-2026-10-08/native-revalidation.json)
- [实际平台回读、空数据库与管理端拒绝](../../qa/initialization-cloud-2026-10-08/control-plane.json)
- [环境窗口包与部署交付](phase-2.md#cloud-environment-result-2026-10-08)
- [全部 67 Task 补验收台账](phase-2.md#cloud-backfill-tracker-2026-10-08)

本轮未修改 UI/动效、共享配置、user/store 正常代码，未创建集合、导入数据、删除资源、授予管理员、操作资金、上传/发布小程序或提交推送。新增独立验收 Event 函数及后端适配/测试/记录；原未提交成果保留。

---

<a id="phase-1-execution"></a>

## 原记录：PHASE-1-EXECUTION.md

<a id="phase-1-execution--阶段一执行记录项目初始化"></a>
# 阶段一执行记录：项目初始化

2026-10-08 最新补验收：真实 user/store 工具调用、伪造身份及无效请求拒绝复验通过，另在独立验收函数以真实微信上下文补三项云端配置拒绝。部署/SDK 核验已接收；真机、独立环境隔离、日志能力及 I08 资料仍待补，阶段一不整体通过。详见 [本轮真实云记录](phase-1.md#phase-1-cloud-revalidation-2026-10-08)；下表按初始日期保留历史状态。

日期：2026-10-03。分支：`codex/phase-1-initialization`。范围：[开发计划 I01–I08](../../DEVELOPMENT-PLAN.md)。

用户已确认尚未创建云环境，本次先完成本地工程。2026-10-03 用户确认本轮真机测试无问题并要求继续；云部署 / 真实身份与设备元数据保持待补，不借用测试桩宣称通过。原先未提交的文档、素材和首页修改一起保留在当前工作区；未自动 commit 或 push。

<a id="phase-1-execution--当前-task-状态"></a>
## 当前 Task 状态

| Task | 当前状态 | 已完成的本地交付 | 未完成的验收 |
|---|---|---|---|
| I01 | 已验收 | 原代码盘点、基线测试、审查与迁移清单 | 无 |
| I02 | 已验收 | 编辑 / 换行规范、文档入口、云目录登记、参考图跟踪 | 无 |
| I03 | 本地实现完成；待外部条件 | user.me、云服务入口、可信上下文校验、身份防伪与错误回归 | 创建开发环境，部署并用真实小程序身份在工具 / 真机调用 |
| I04 | 当前 Shell 导航获用户真机确认 | 四官方 Tab，13 个主页面逐页编译；分类 / 筛选工具截图；用户本轮整体真机反馈无问题 | 无逐项设备记录；工具侧 Account / 组件点击仍有接口限制，不伪造工具成功 |
| I05 | Home 首屏视觉与本轮真机显示通过；跨设备边界待补 | 用户首屏视觉验收；PNG Hero 修复后用户真机反馈无问题；公共 Shell 与安全区骨架 | 多宽度 / 长中文 / 不同设备证据；本轮没有设备版本元数据 |
| I06 | 本地质量基线已验证 | 错误码 / requestId / 脱敏日志回归、120 文件检查、29 测试；工具 2.02.2608080 / 基础库 3.17.2 编译基线 | 真实云日志与运行时证据归入 I03 / I07 |
| I07 | 本地实现完成；待外部条件 | 两函数各自 SDK 4.0.2 + lockfile，共用模块复制、自包含加载、显式环境生成 | 云端两个函数独立部署、运行时和 SDK 能力验证 |
| I08 | 本地登记完成；待外部条件 | 资料 / 政策 / 支付接入待办登记与阻塞 Task | 实际账号支付能力核验，填写资料负责人及业务确认结果 |

**Home 首屏视觉验收已通过（2026-10-03，用户确认）。** 最终版本为 Home Visual Polish：[已验收截图](../../../artifacts/home-polish/home-first-screen.png)；保留 [UI-R01A 原始证据与最新验收记录](phase-1.md#ui-r01a-evidence)。此结论只覆盖 Home 首屏视觉，不扩展到导航、真机、其他页面或云能力。

**阶段一尚未整体验收通过。** 本轮导航 / 显示已获用户真机确认；真实云环境部署、账号 / 资料核验及跨设备证据继续待补。用户要求继续，当前推进 [阶段二 D01 离线模型](phase-2.md#phase-2-execution)，不据此宣称云能力通过。

2026-10-03 真机检查补充：用户自行发起真机调试，发现 Hero WebP 在手机未加载，其余分类 / 商品 JPEG 可见。本轮恢复并无损优化 PNG，排除两张未引用素材，主包源文件估算 1947 / 2048 KiB；本地检查通过、模拟器 PNG 正常，用户随后反馈真机测试无问题，关闭本轮 Hero 故障。完整来源与工具限制见 [导航与真机检查](phase-1.md#navigation-device-check)。设备版本 / 上传包体积没有新数据，未声称多设备验收。

<a id="phase-1-execution--task-分析与实际修改范围"></a>
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

<a id="phase-1-execution--导航与遗留迁移"></a>
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

<a id="phase-1-execution--本地运行与配置"></a>
## 本地运行与配置

<a id="phase-1-execution--默认-ui-shell"></a>
### 默认 UI Shell

直接在微信开发者工具导入项目根目录，无需启动演示服务。默认 `shell / development`：显示三条明确标注的 UI 预览商品，不能购买。云模式、测试阶段与生产阶段不会返回预览商品。

基础库：`3.17.2`，来自开始时本机 `project.private.config.json`；当前工具版本：`2.02.2608080`。已将项目从 `latest` 改成固定值，本轮默认 Shell 的 13 个主页面实际编译通过；不据此推断后续云端或支付能力兼容。项目默认 `urlCheck: true`，原个人开发配置未覆盖或修改；个人配置可能覆盖该设置。

<a id="phase-1-execution--配置云调用"></a>
### 配置云调用

1. 将 `miniprogram/config.local.example.js` 复制为 `miniprogram/config.local.js`（已忽略）。
2. 填真实开发环境 ID，改 `mode: 'cloud'`，保持 `stage: 'development'`。
3. 运行 `node scripts/configure-local.js`，生成允许的公开配置 `runtime-config.js`。
4. 调用代码只读取已有的 `runtime-config.js`，不动态 require 可能缺失的本地配置，干净检出也能编译。

生成器只接受 mode / stage / appId / cloudEnvironments / enableLegacyDemo；拒绝未知字段、缺少当前环境或跨阶段共用环境。支付凭证不得进入此文件。环境 ID 不是密钥，但生成后应审查实际 Git diff，不将个人覆盖误作默认配置提交。

<a id="phase-1-execution--独立云函数准备"></a>
### 独立云函数准备

```powershell
node scripts/prepare-cloud.js
<a id="phase-1-execution--安装依赖时分别在-cloudfunctionsuser-和-cloudfunctionsstore-执行-npm-ci---ignore-scripts"></a>
# 安装依赖时分别在 cloudfunctions/user 和 cloudfunctions/store 执行 npm ci --ignore-scripts
```

两函数的 `package.json` 和 `package-lock.json` 各自锁定官方 `wx-server-sdk@4.0.2`。共用源码在 `_shared/runtime.js`，prepare-cloud 复制到每个函数的 `shared/runtime.js`，复制件纳入工程且由 check 比对，部署不引用包外文件。

函数云端配置必须填写 `JJL_APP_ID`、`JJL_CLOUD_ENV`、`JJL_STAGE`。它们与实际微信上下文 APPID / ENV 严格比对；OPENID 仅从 `cloud.getWXContext()` 读取。user.me 返回本人身份哈希摘要和固定 customer 角色，不返回原始 OPENID，不支持自提权。store.health 验证相同身份边界后返回连通信息。

云运行时优先在控制台核实可选的受支持 Node 版本，再进行部署；本机 Node v24.19.0 不作为云端支持证据。依据：[CloudBase 小程序云函数身份链路](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)、[官方 wx-server-sdk 源码](https://github.com/wechat-miniprogram/wx-server-sdk)。本阶段没有跨入数据模型、数据库事务或真实支付实现。

<a id="phase-1-execution--继续查看旧演示"></a>
### 继续查看旧演示

仅在本地配置 `shell / development` 且 `enableLegacyDemo: true`，重新运行 configure 脚本后，Account 的开发区域显示“旧预订演示”入口。

```powershell
node server/index.js
```

浏览器演示继续使用原 server / web。legacy 小程序有自己的 HTTP 适配器和演示缓存，不再复用 App 的云初始化状态。直接深链 legacy 页面时，未启用也不能发送演示请求。生产发布打包必须在 Q01 排除 legacy 子包 / 示例素材；本阶段没有生成生产包。

<a id="phase-1-execution--验证与证据"></a>
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

本地报告：[report.json](../../../artifacts/phase-1-qa/report.json)。截图：[Home](../../../artifacts/phase-1-qa/home.png)、[Shop](../../../artifacts/phase-1-qa/shop.png)、[Orders](../../../artifacts/phase-1-qa/orders.png)、[Account](../../../artifacts/phase-1-qa/account.png)、[Product](../../../artifacts/phase-1-qa/product.png)、[Bag](../../../artifacts/phase-1-qa/bag.png)。报告与截图位于 Git 忽略的 artifacts，属于本机证据，干净检出需重新生成。

最初截图为 363 × 785，最后串行检查时工具模拟器缩放使图片输出为 109 × 236；布局问题已复查，但这些低分辨率图片不作为字体细节、不同宽度或长中文验收证据。后续完整视觉验收需恢复模拟器显示比例并补截图 / 真机。

脚本依赖已安装的官方 `wechatide.cmd`，不依赖临时安装的旧 automator。默认使用本机工具路径；其他电脑先指定 `WECHAT_DEVTOOLS_CLI`。可用 `--pages=home,shop,product` 仅重新检查指定页面。工具未登录、端口未开启、授权未完成或编译失败时会以非零退出码停止；若返回授权 taskId，需完成工具授权后重新运行。本次已经获得授权。

```powershell
$env:WECHAT_DEVTOOLS_CLI='D:\微信web开发者工具\wechatide.cmd'
node scripts/verify-miniprogram.js
```

<a id="phase-1-execution--待补验收操作"></a>
## 待补验收操作

1. 服务端口、账号登录与客户端授权已完成；用户本轮整体真机确认已记录。仍缺逐项结果、设备 / 微信版本和实际包体积；失败的工具调用保留，不伪造自动化通过。
2. 当前手机显示已获用户反馈；补跨设备 / 多宽度 / 长中文边界，当前反馈不扩展为这些覆盖项。
3. 创建开发云环境后部署 user / store，分别核对 settings 与环境，Account 开发连通按钮真实调用两函数。
4. 用真实调用验证 event 中伪造角色 / OPENID 不生效，开发端不能连接生产环境，日志不含原始身份和联系方式。
5. 核实账号支付能力与未决政策登记。只有补足相关证据，才将 I03–I08 转成已验收并通过阶段门禁。

---

<a id="ui-r01a-evidence"></a>

## 原记录：UI-R01A-EVIDENCE.md

<a id="ui-r01a-evidence--ui-r01a--home-first-screen-evidence"></a>
# UI-R01A — Home First Screen Evidence

日期：2026-10-03。分支：`codex/phase-1-initialization`。

**状态更新（2026-10-03）：用户已确认最新 Home 首屏 Visual Polish 视觉验收通过。** 以下 UI-R01A 内容与三份截图保留为上一轮历史证据，最终验收版本以 [Home Visual Polish 首屏截图](../../../artifacts/home-polish/home-first-screen.png) 为准。

最新一轮仅修改 Home WXSS：分类导航高度收紧约 18%，移除描边 / 阴影、减弱方块容器并放大食品主体，校准字重 / 灰度 / tracking。其余 192 个基线文件和 Hero 构图 / 摄影位置 / CTA 规则未变；微信样式编译和静态检查通过，Console Error 过滤无命中。原照片文件、今日推荐布局、其他页面和业务未修改。

验收来源：用户在当前会话明确回复“ok我这边视觉验收完毕”。范围仅 Home 首屏视觉；导航交互、真机及阶段一其他 Task 不据此标完成。原记录中“待审核”描述为当时状态，现由本条用户验收记录更新。

参考：[已提供的首页 Reference](../../../assets/首页.png)。本轮仅调整 Home 第一屏的 Header、Hero、Typography、Photography、CTA、Category 和构图。

<a id="ui-r01a-evidence--1-home-第一屏完整截图"></a>
## 1. Home 第一屏完整截图

微信开发者工具实际截图，最终输出 374 × 862；未放大、补画或替换 UI。画面下方自然出现的今日推荐商品卡保持原实现。

![Home 第一屏](../../../artifacts/ui-r01a/home-first-screen.png)

<a id="ui-r01a-evidence--2-header--hero"></a>
## 2. Header + Hero

![Header + Hero](../../../artifacts/ui-r01a/header-hero.png)

<a id="ui-r01a-evidence--3-hero--category-card"></a>
## 3. Hero + Category Card

![Hero + Category Card](../../../artifacts/ui-r01a/hero-category.png)

两个局部图均从同一张最终工具截图按原像素裁出，不是另行生成的界面图。截图在本机 Git 忽略的 `artifacts/ui-r01a/`，不会随普通代码提交携带。

<a id="ui-r01a-evidence--4-本轮修改文件"></a>
## 4. 本轮修改文件

| 文件 | 本轮修改 |
|---|---|
| [home.wxml](../../../miniprogram/pages/home/home.wxml) | Home 专用单一品牌 Header；合并 Hero 文案与摄影；移除 Hero 商品名 / 价格和无功能 Hamburger；小 CTA、带照片的三列分类卡 |
| [home.wxss](../../../miniprogram/pages/home/home.wxss) | Home 首屏独立字体层级、构图定位、内容宽度 CTA、轻微叠入的分类卡及局部间距变量 |
| [home.js](../../../miniprogram/pages/home/home.js) | 复用已有安全区测量；Header 购物袋入口；三张分类图及加载失败显示；显示名“小蛋糕”。保留原分类跳转和商品卡选择行为 |
| [strawberry-hero-r01a.png](../../../miniprogram/assets/home/strawberry-hero-r01a.png) | 新增 Hero 专用透明照片副本，1448 × 1086，实际含 alpha；原 strawberry / chocolate / bread 照片不变 |
| [UI-R01A-EVIDENCE.md](phase-1.md#ui-r01a-evidence) | 本轮证据与实现说明 |

范围保护：[scope-report.json](../../../artifacts/ui-r01a/scope-report.json)。本轮开始快照中的其余 **188 个文件 SHA-256 均未变化**；Home 从 `<view class="section">` 起的下半屏 WXML 与本轮前逐字一致（统一换行后比较）。

公共 Header、全局 Token、product-card、底部 Tab、Shop、Orders、Account、Bag 逻辑、目录数据 / 服务、Checkout、Order、Payment、Admin 及前轮文档均未修改。工作区原有未提交改动属于此前阶段，不计入本轮文件清单。

<a id="ui-r01a-evidence--5-design-token-与修复说明"></a>
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

<a id="ui-r01a-evidence--图片处理记录"></a>
### 图片处理记录

使用内置 `image_gen`（imagegen 技能），以已有 `miniprogram/assets/home/strawberry.jpg` 为编辑输入，生成透明副本；最终工程路径为 `miniprogram/assets/home/strawberry-hero-r01a.png`。没有覆盖原照片。这是生成式去背景衍生素材，不等同于逐像素剪切，微小边缘或纹理差异仍需审核。

最终提示词：

> Use case: background-extraction. Asset type: transparent PNG photo cutout for an existing WeChat mini-program Home editorial hero. Edit target: the attached/current local strawberry.jpg photograph, not a style reference. Remove ONLY the gray photographic backdrop to actual alpha transparency. Preserve the exact same single strawberry cream cake, camera angle, proportions, complete silhouette, cream piping, number and placement of strawberries, colors, texture, side strawberry slices and bottom sponge. Do not redesign, restyle, beautify or add fruit, leaves, plate, decoration, text or shadows. Keep the complete cake in frame with a small even transparent margin. Preserve realistic food photography and original lighting. Return one genuinely transparent PNG, not a checkerboard painted background.

<a id="ui-r01a-evidence--6-微信开发者工具编译结果"></a>
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

<a id="ui-r01a-evidence--7-console-error系统限制与已知差异"></a>
## 7. Console Error、系统限制与已知差异

- `get_simulator_console --command 'grep -i error'` 返回空字符串，即查询时没有匹配的 Error 记录。
- 全部缓冲日志查询 `grep -n .` 仅见基础库版本和子包数量两条 system / info 记录。未观察到本轮模板、样式或图片加载错误；这是当前本地会话证据，不等于真机结论。
- 微信状态栏、Capsule 和安全区由系统决定。Home 复用既有安全区测量，顶部按实际 statusBarHeight 留白，右侧按 Capsule 位置预留空间；Bag 保留 44px 触摸目标，无法照 Reference 把右侧区域全部用于品牌导航。
- Reference 使用带场景 / 盘子的摄影和不同蛋糕视角。本轮保留当前蛋糕主体与视角，不补造摄影场景；透明边缘与原照片纹理的微差待视觉审核。
- 参考图为更多分类和悬浮底栏。本轮严格只用三分类，底部仍为既有官方四 Tab；分类卡仅学习其浮层构图关系。
- 本轮检查了实际模拟器画面；未提供真机、320px 窄屏或系统放大字体证据。这些环境的文字 / Capsule 细节仍待审核。
- 首屏以下内容和业务均未推进，没有进入下一 UI Revision。
