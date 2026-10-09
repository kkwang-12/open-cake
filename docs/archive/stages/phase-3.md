# 商品与详情：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [C05-ACCEPTANCE-REVIEW.md](#c05-acceptance-review)
- [C06-HOME-SEARCH.md](#c06-home-search)
- [C07-FAVORITES.md](#c07-favorites)
- [C08-CATALOG-ACCEPTANCE.md](#c08-catalog-acceptance)
- [CATALOG-DRAFTS.md](#catalog-drafts)
- [CATALOG-READ.md](#catalog-read)
- [PHASE-3-EXECUTION.md](#phase-3-execution)
- [PRODUCT-DETAIL-REDESIGN.md](#product-detail-redesign)
- [PRODUCT-DETAIL.md](#product-detail)

---

<a id="c05-acceptance-review"></a>

## 原记录：C05-ACCEPTANCE-REVIEW.md

<a id="c05-acceptance-review--c05-验收复核2026-10-04"></a>
# C05 验收复核（2026-10-04）

最新结论：C05 返回恢复与配置变化确认已修复，本地回归通过。原有 UI 验收继续有效；微信工具返回路径复测已通过（见最新补验），正式经营配置及云端验证仍待补，不能标记整项正式验收通过。下面保留发现问题时的复核记录。

| 验收项 | 结果 | 依据 / 待办 |
|---|---|---|
| 详情、规格弹层、加购反馈三状态 UI | 通过 | 用户明确确认 UI 验证通过；截图见 docs/qa/2026-10-04 |
| 数据驱动规格、价格变化、非蛋糕适用字段 | 本地通过 | 现有测试；不虚构口味、夹心、适用人数 |
| 关闭 / 重开弹层保留选择 | 通过 | 8 寸、数量 2、留言均保留 |
| 离开详情页后返回保留有效选择 | 未通过 | onShow 每次 load；新 evaluate 清空选择，数量重置 1，留言清空 |
| 当前配置变化后的页面选择恢复与重新确认 | 页面未接入 | C03 模型有 reconcile，当前详情 load 未调用；应补页面集成与回归 |
| 留言 / 数量边界 | 部分通过 | 整数、已知配置约束及禁用留言有校验；示例数量上下限和蛋糕留言上限未知，不能宣称正式边界验收通过 |
| 本机购物袋写入 / 读回及失败反馈 | 本地通过 | Storage 实际读回成功才展示反馈；失败留在弹层；仅 LOCAL_DRAFT |
| 正式配置 / 云端权威验证 | 待补 | 等真实经营资料与环境；不能用本地草稿替代正式 Cart |

本次重跑 product-detail、local-bag、specification-model 三组相关测试：27 / 27 通过。但现有页面测试仅覆盖关闭 / 重开弹层，未覆盖离开详情页后返回，因此测试通过不等于全部验收条目通过。

另行执行页面生命周期复现：黑巧克力蛋糕选择 8 寸、数量 2、留言“生日快乐”，总价 516 元；关闭重开弹层仍保留；执行 onHide → onShow 后，规格未选择、数量 1、留言为空、总价为“—”。这是页面处理函数的本地复现，不冒充真机操作。

本机日志（Git 忽略）：artifacts/phase-3-qa/c05-review-tests.txt、c05-review-state-retention.json。

下一步先补 C05 的页面返回恢复、配置变化时重新确认及相应回归测试，再推进 C06 Home 同源编排与名称搜索。未知经营限制继续待确认，不猜值。此次仅复核并修正文档，没有修改已验收 UI 或业务代码，也没有提交 / 推送 / 上传 / 部署。


<a id="c05-acceptance-review--后续修复与验证"></a>
## 后续修复与验证

用户授权“接着做”后，详情页刷新接入 C03 reconcile。有效规格、数量及留言在页面隐藏 / 返回和加载失败后重试时保留；加载新商品时清空旧商品输入。配置失效的选项清除，数量按最新已知限额调整。留言被禁用时清除并说明；留言限额缩小时保留文本供修改，超限阻止加购，不静默截断。

价格、规格版本、数量限制或留言规则变化后，重新读取的数据用于显示；加购前使用微信原生确认框确认当前规格、数量、总价。取消、确认失败或确认期间页面隐藏不会写入购物袋；普通返回且配置未变不弹确认框。该反馈仍只对应本机草稿。

新增5项行为回归：页面返回 / 加载失败重试 / 商品隔离；失效选项；新价格和数量限额及确认取消；Unicode 留言边界和数量上下限；禁用留言及确认期间隐藏。全套202 / 202通过，静态168文件通过，主包源估算2019 / 2048 KiB（实际以微信编译为准），diff空白检查通过。测试中的经营限额只用于构造场景，未写入开发商品或正式经营配置。

本轮微信开发者工具 automation_navigate 返回 ok=false、timeout waiting for automator response，没有取得有效原生返回复测证据，不以CLI进程退出0冒充成功。此项保留待补；既有三状态UI截图与用户验收继续有效。

本机证据：artifacts/phase-3-qa/c05-fix-tests.txt、c05-fix-static.txt。下一步补微信原生返回复测；可继续推进C06本地同源首页编排与名称搜索，正式配置/云端门禁保留。本轮未改WXML/WXSS、图片或图标，未提交/推送/上传/部署。

<a id="c05-acceptance-review--微信工具最新补验"></a>
## 微信工具最新补验

用户要求重新测试，通过后推进C06。恢复工具连接后，实际点击选黑巧克力8寸/数量2，真实输入“生日快乐🎂”，原生进入购物袋再返回并重开弹层，规格/数量/留言/字符数5/总价516均保留，截图366×793已核对。因此返回恢复的原生门禁已关闭；此前超时是历史诊断，不覆盖本次通过。截图见docs/qa/2026-10-04/c05-return-before.png、c05-return-after.png；详细日志c05-native-*为Git忽略本机证据。随后推进C06本地与微信验证，209/209与静态170通过。仍不声明正式配置或云验收通过。

---

<a id="c06-home-search"></a>

## 原记录：C06-HOME-SEARCH.md

<a id="c06-home-search--c06-首页同源编排与名称搜索2026-10-04"></a>
# C06 首页同源编排与名称搜索（2026-10-04）

C05 微信工具返回复测通过后，按用户授权推进 C06。本地实现、回归、微信模拟器交互与截图通过；正式目录、门店推荐配置及云接口待补，不声明阶段三或正式业务整体验收完成。

<a id="c06-home-search--实现"></a>
## 实现

Home 不再使用 catalog-preview 的旧 ID、名称和价格。home-catalog Service 读取当前 catalog 所有分页，分类与推荐 / 当季 / 系列 / 人气引用同一批商品 ID 和卡片数据；失效引用剔除，重复引用去重，分页循环 / 重复商品 / 来源混用拒绝。当前没有门店编排配置，不虚构热门或当季名单：推荐为空时每类取一项展示，并明确“当前展示分类商品，门店推荐待配置”。未来通过同源 ID 配置槽位，不新增营销模块。

保留 Home Hero、分类示意图和 Home WXSS。下方商品卡使用当前商品名称、价格、图片字段和详情入口；当前商品图片为空，使用已有占位，不把旧设计照片绑定到无依据的 SKU。首页加载、失败重试、空列表和过期响应均有处理。

Shop 增加名称输入、搜索按钮 / 键盘确认、清空搜索和无结果提示。沿用 catalog 的 NFC、trim、小写、最长64字符及字面子串查询；不把输入当正则。搜索与当前分类组合，查询变化重置游标，旧请求结果不覆盖新查询。清空恢复当前分类列表；从首页分类进入清除旧关键词。名称、价格与详情配置仍来自 C02/C03 同源数据。

<a id="c06-home-search--微信工具验收"></a>
## 微信工具验收

工具版本0.3.11，登录与项目窗口正常。开始时 automator 超时；刷新及重开项目窗口后恢复，首次重开可能出现空页面元数据。所有成功步骤均检查响应 ok / success，不凭退出码判断通过；工具失败日志不作为通过证据。

C05：真实元素点击选择黑巧克力蛋糕8寸，增加到2，输入“生日快乐🎂”；通过真实 navigateTo 进入 pages/bag/bag，读当前页确认，再 navigateBack 返回、真实点击重开弹层。返回前后8寸选中、数量2、留言及字符数5、总价516元一致。截图366×793已核对。未用 setData 伪造恢复，未写正式 Cart。

C06：
- 首页读取三分类兜底商品：草莓鲜奶蛋糕168起、草莓小蛋糕36、牛角面包开发示例12；无旧 preview ID。
- 调用实际 Home select 处理函数触发原生导航，当前页确认进入 development-example-strawberry-cake 详情，168起，可打开规格；不是用 setData 替换页面状态。
- 实际点击“探索更多”进入 Shop。真实输入“草莓”并点击搜索返回两项：草莓鲜奶蛋糕、草莓小蛋糕。
- 不存在的名称返回零项，页面显示无结果提示。
- 实际点击清空恢复6项首屏分页；调用实际 loadMore 后共9项，hasMore=false。
- 通过实际分类处理函数切换 Mini Cake，保留“草莓”查询，仅显示草莓小蛋糕36元。
- 搜索结果 / 无结果截图366×793核对通过。平台仍有既有 network offline SDK 日志，不宣称 console 全程无错。

截图保存至 docs/qa/2026-10-04。详细本机响应日志为 artifacts/phase-3-qa/c05-native-*.txt、c06-native-*.txt，Git忽略。工具早期 timeout 日志仅为恢复诊断。

<a id="c06-home-search--回归与剩余门禁"></a>
## 回归与剩余门禁

新增7项，全套209/209通过；静态170文件通过；主包源估算2024/2048KiB，实际以微信编译打包为准。Home、Shop WXML 编译摘要均成功；diff空白检查通过。测试覆盖同源编排、空目录/环境门禁、旧响应隔离、首页合法导航、分类与搜索/分页/清空组合。

正式商品仍待商家确认，开发示例不可购买；没有新增云API、数据库写入、库存/履约授权、上传、部署、提交或推送。门店推荐/当季/系列/人气数据未配置，本地槽位能力不等于正式编排已验收。C05正式数量/留言规则与云端校验仍待资料。

下一项：C07 本地可先推进收藏持久化及 Favorites / Account 入口，真实云身份与跨账号隔离继续按 D06 门禁验证。

---

<a id="c07-favorites"></a>

## 原记录：C07-FAVORITES.md

<a id="c07-favorites--c07-本机收藏与公共入口2026-10-04"></a>
# C07 本机收藏与公共入口（2026-10-04）

本地实现及微信工具验证通过；真实微信账号隔离、跨设备收藏和云权限验收仍待云身份接通。当前明确使用 LOCAL_DEVICE 本机范围，不能标记 C07 正式整体验收通过。

<a id="c07-favorites--实现与边界"></a>
## 实现与边界

local-favorites 仅在 development/shell 开放，Storage 按 AppID 分区；保存当前商品 ID 和名称，不保存库存或旧售价。Favorites 每次读取当前同源目录，使用当前卡片与价格；目录不存在的收藏显示不可购买，仍可移除。添加前验证当前目录，旧 preview ID 不可收藏；取消不要求商品仍存在或目录读取成功。

重复收藏/取消为幂等操作。写入后真实读回，写失败/读回不一致/存储损坏不报告成功，不覆盖无效存储。详情页成功后才切换给定的心形图标；加载/返回恢复本机收藏状态，重复点击锁定、页面隐藏后迟到响应不改UI。未接通的旧设计预览仍明确提示。

Favorites 使用“本机收藏”标题及“保存在当前设备，账号同步尚未接通”说明。可进入当前商品详情、取消收藏，支持空列表/加载/失败重试；失效商品不能打开购买入口。此实现没有真实用户登录，也不声称账号 A/B 隔离已通过。

Account 订单、收藏和地址入口只允许已登记目标；订单/地址当前页面仍明确待业务接入。门店信息改为用户确认的 X085 沙溪派出所南侧约50米、每天08:00–21:00、自取/门店配送、20km含边界和0元配送费。客服及隐私资料仍明确待准备，关于品牌保留。

<a id="c07-favorites--验证"></a>
## 验证

新增6项，全套215/215通过；静态172文件、主包源估算2031/2048KiB通过（实际以微信打包为准）。Favorites/Product WXML编译摘要成功，diff空白检查通过。

回归覆盖：新Client恢复、重复操作、AppID分区（不冒充账号隔离）、当前目录价、下架/失效移除、Storage失败/读回/损坏、cloud/production/test门禁、旧预览拒绝、页面失败和隐藏隔离、Account合法入口及真实信息。

微信工具实际点击蓝莓芝士小蛋糕爱心，详情favorited=true；通过原生页面导航在收藏页读取该项42元，并核对366×793截图。关闭再打开项目后重新进入该商品，favorited仍为true；通过实际Account收藏按钮进入Favorites，重新读取仍在；实际点击该测试项取消收藏，列表中已移除。测试项开始时未收藏，只清理本轮新增的蓝莓记录，没有清空其他收藏。

重开后的automation曾超时；随后重新编译目标并导航恢复。失败日志不作通过依据，以最新reopened-pass、reopened-list和cancelled响应为准。未使用setData伪造收藏或恢复。此证据来自微信开发者工具模拟器，不冒充实体手机/云权限验收。

本机日志：artifacts/phase-3-qa/c07-tests.txt、c07-static.txt、c07-native-*.txt（Git忽略）；截图保存至docs/qa/2026-10-04/c07-favorites.png和c07-empty.png。

<a id="c07-favorites--后续"></a>
## 后续

C07正式门禁仍待：真实身份owner、账号A/B隔离、真实下架与云收藏幂等/重启验收。当前本机范围没有身份owner，请勿改成“已同步账号”。

下一项C08先做可离线的三分类完整链路与旧行为检查；云端恶意SKU/数量/组合拒绝仍须真实云验证，不能以离线模型替代。主包源估算已接近上限，后续业务页扩展前安排分包/素材整理并以真实打包结果核对。

本轮保留全部未提交改动，不改已验收页面布局或Home摄影；未提交、推送、上传、部署或发布。

---

<a id="c08-catalog-acceptance"></a>

## 原记录：C08-CATALOG-ACCEPTANCE.md

<a id="c08-catalog-acceptance--c08-目录本地验收与业务分包2026-10-04"></a>
# C08 目录本地验收与业务分包（2026-10-04）

C08 可离线部分及微信开发者工具三分类链路已通过。阶段三正式门禁仍待正式目录/库存/经营配置、真实云身份与云端SKU/数量/非法组合拒绝验收；本机草稿不等于正式 Cart，不能标阶段三整体验收完成。

<a id="c08-catalog-acceptance--分包决定与结构"></a>
## 分包决定与结构

用户授权自行决定是否分包。迁移前主包源估算2031/2048KiB，首页主图约1.4MiB；保留原图片和视觉，采用普通业务分包，为后续详情/购物袋/订单代码增长预留结构。

主包仅4个Tab页：Home、Shop、Orders、Account。新增features普通分包（name=business）含Product、Specification兼容壳、Bag、Checkout、OrderSuccess、OrderDetail、Addresses、Favorites、Admin共9页；既有legacy演示分包保持7页和关闭门禁。

共享Service、utils、components、样式和首页素材留主包，业务页相对目录深度保持一致。统一路由改为/features/...；所有实际入口通过constants/routes导航。未保留旧/pages/product等已迁移直达路径；以前日志/历史截图中的旧路径属于迁移前证据，新接入请使用统一routes。

静态检查支持主包+分包注册，拒绝普通JS跨分包require，输出并检查每个分包源大小；verify-miniprogram脚本同步识别正式业务分包，仍排除旧演示自动验收。测试/文档当前代码链接已更新。目录移动前核对绝对目标均在工作区内，保留全部文件内容及未提交改动。

当前源文件估算：
- 主包1998/2048KiB，较前减少约33KiB；
- features业务分包34KiB；
- legacy演示分包45KiB。

这是源文件统计，不是真实上传包大小；分包把后续业务增长移出主包，已有素材总量未压缩。主包仍主要由首页原图占用，后续正式实拍接云存储时继续核对大小。没有改写/压缩已验收图片或上传新素材。

<a id="c08-catalog-acceptance--c08-链路与迁移核对"></a>
## C08 链路与迁移核对

同一当前目录提供三分类名称/价格，Home→Detail匹配正确SKU；蛋糕按真实Size配置并允许现有留言，小蛋糕/面包跳过不适用组与留言。Bag实际保存、读回，再进入保持数据，取消/删除仅影响对应记录。非法SKU、版本、价格、非整数数量及缺组合在本地拒绝；云环境未配置时不能回退到开发商品。

业务页面没有pastries/desserts/drinks/Filter；旧定金/模拟支付逻辑继续只在受控legacy演示内，配置enableLegacyDemo=false。旧独立Specification兼容壳没有主流程入口，用户要求的规格弹层仍在当前详情页。Bag展示真实本机持久化列表并明确库存/履约核验前不能结算，没有把占位/草稿声称为正式购买能力。收藏保持LOCAL_DEVICE，云账号隔离待补。

<a id="c08-catalog-acceptance--验证证据"></a>
## 验证证据

新增5项回归，全套220/220通过；静态173文件通过，4主包页+16分包页完整注册。导航参数编码、非Tab进入方式、所有路由页面存在及普通分包依赖边界检查通过。

微信工具实际跑三条链路：
1. Home实际select处理函数触发进入features/product/product，草莓鲜奶蛋糕选6寸、数量1、留言“C08分包链路验收”，168元；
2. Home进入草莓小蛋糕，单品默认SKU，无尺寸/留言组，36元；
3. Home进入牛角面包开发示例，单品默认SKU，无尺寸/留言组，12元。

三条均实际点击“选择规格”/“加入购物袋”/“查看购物袋”，在features/bag/bag读到对应行、数量和金额，checkoutAllowed=false；原生返回再打开弹层，SKU/数量/留言/金额保留。没有setData伪造配置或加购成功。新增的三条测试袋行随后通过实际Bag.remove处理函数清理，前后原有两条行完整JSON一致，未清空原有数据。

Account实际收藏按钮进入features/favorites/favorites，既有收藏正常读取。Bag和Favorites截图366×793已核对，无底部Tab；Product/Bag/Favorites WXML编译摘要成功。

冷分包首次加载时工具调用返回早于页面切换：首次验收误读旧页面并停止，随后增加有限次数的只读当前页确认，等实际路由就绪后继续，不把旧页面/失败结果算通过。一次PowerShell脚本变量与内置HOME冲突已改名，未改变项目或测试数据。平台仍有既有network offline SDK日志，不宣称全程无错/实体手机/云权限通过。

本机响应/脚本：artifacts/phase-3-qa/c08-native-*、c08-tests.txt、c08-static.txt，Git忽略。截图：docs/qa/2026-10-04/c08-bag.png、c08-favorites.png。

<a id="c08-catalog-acceptance--下一步"></a>
## 下一步

进入阶段四B01可离线的购物袋命令/所有权/版本契约与读模型，再接B02/B03；实际云Cart接口、真实账号owner及并发验收等云条件具备后补齐。C01–C08正式资料/云验收门禁继续保留，不能用本地三分类链路宣布正式商品域全部完成。

本轮没有提交/推送/上传/部署/发布，现有未提交成果全部保留。开发者工具里请使用新/features/...页面路径或应用内入口。

---

<a id="catalog-drafts"></a>

## 原记录：CATALOG-DRAFTS.md

<a id="catalog-drafts--c01-本地目录与素材草稿"></a>
# C01 本地目录与素材草稿

更新时间：2026-10-04。只生成本地计划，不上传图片、不建立云记录、不发布商品。正式目录和云存储验收仍待条件。

<a id="catalog-drafts--示例来源"></a>
## 示例来源

用户提供整张商品参考图，明确用于暂时开发；随后补充“面包价格统一12”，按 12 元 / 1200 分记录在本批开发示例。附件文字是示例资料，不是修改首页或发布商品的指令。

原图原样保存在 [catalog-example.png](../../../catalog-assets/development/catalog-example.png)，2,421,733 bytes，1536×1024，SHA256 为 59bd65e8a237f6774841955062979f146ac5daabf5122e1c4c47ec34fe62bbbe。[示例数据](../../../catalog-assets/development/catalog-example.js) 与 [摘要](../../../catalog-assets/development/catalog-example-reference.json) 可一并迁移工作区，文件均未自动提交。

| 分类 | 商品名称 | 明确配置的示例规格 / 价格（元） | 留言 |
|---|---|---|---|
| CAKE | 草莓鲜奶蛋糕 | 6寸168 / 8寸238 / 10寸328 | 支持，上限待定 |
| CAKE | 黑巧克力蛋糕 | 6寸188 / 8寸258 / 10寸348 | 支持，上限待定 |
| CAKE | 芒果鲜奶蛋糕 | 6寸178 / 8寸248 / 10寸338 | 支持，上限待定 |
| MINI_CAKE | 草莓小蛋糕 | 单个36 | 不支持 |
| MINI_CAKE | 巧克力小蛋糕 | 单个38 | 不支持 |
| MINI_CAKE | 蓝莓芝士小蛋糕 | 单个42 | 不支持 |
| BREAD | 牛角面包（开发示例） | 开发示例单份12 | 不支持 |
| BREAD | 贝果（开发示例） | 开发示例单份12 | 不支持 |
| BREAD | 欧式面包（开发示例） | 开发示例单份12 | 不支持 |

面包名称 / 规格在原图底部被截断，三项名称为按外观描述的开发标签，正式名称 / 包装规格仍待商家确认。没有从图中推断额外口味或夹心。价格均用安全整数分记录；示例不替代 E05 正式经营批准。

<a id="catalog-drafts--草稿规划契约"></a>
## 草稿规划契约

实现：[catalog-draft-model.js](../../../cloudfunctions/_shared/catalog-draft-model.js)。buildCatalogDraftPlan(input, existing, settings, now) 是纯函数，返回深复制 / 深冻结的 OFFLINE_PLAN_NOT_APPLIED。

- settings / now 沿用 [D07 开发边界](../../DEVELOPMENT-SEED.md)：仅显式 development、匹配 expectedDevelopmentEnvironment、非登记生产环境、dev-* namespace；示例环境只是本地标签，不证明真实云环境存在。
- 门店 ID / 三分类由同环境同 namespace 的 D07 规划确定性派生，分类 published=false。必须先由未来受控 apply 核验真实门店存在，当前不创建门店或分类。
- input 只含 purpose=TEMPORARY_DEVELOPMENT_EXAMPLE、reference、products；商品只含 key/categoryCode/name/nameSource/messageDecision/optionGroups/variants。reference 只含受限包外 PNG 路径和 SHA256，不是 MediaRef。
- 规格 variant 必须明确列出 key/description/selectedOptions/unitPriceCents/priceSource；只接受配置组内的合法选项，不生成笛卡尔积 SKU。客户端标签不能成为权威标签，输出按组配置派生。
- 所有 products/skus 始终 DRAFT。数量上下限、提前量为 null，库存需求为空；未确认价格可明确 null+UNKNOWN，不能默认零或沿用旧 Demo。
- review 保留来源、留言决定和发布阻塞。蛋糕支持留言但长度未知时，product.messagePolicy 暂为 null，review 标 ENABLED + MESSAGE_MAX_LENGTH；它不代表商家关闭留言。必须补齐完整规则，不能自动发布。面包 / 小蛋糕本示例明确 DISABLED。
- 原图是整张参考海报，不是各商品独立实拍；products.images=[]，参考路径 / 摘要只在计划 metadata 中，绝不放入商品图片、订单 MediaRef 或 miniprogram。
- existing 是可信目标门店最小记录快照，不是自动扫描数据库。匹配 ID 的商品 / SKU 只 SKIP_EXISTING；已有父商品下未出现的候选 SKU 也 SKIP_EXISTING_PARENT，避免给已编辑 / 在售商品追加规格。孤立同 ID SKU、换门店 / 分类 / 组合、重复 ID / 组合拒绝整个规划；不覆盖已有名称、价格、状态或版本。
- 未来 executor 需 D06 门店 CATALOG_WRITE、实时角色 / 版本、原子 create-if-absent、关联 / 唯一索引重校验；本地快照和确定性 ID 不解决并发。生产导入另走批准的计划。

CatalogDraftError：INVALID_CATALOG_DRAFT / CATALOG_DRAFT_CONFLICT；D07 环境 / 输入错误可继续传播。没有增加网络 action 或改变客户端 allowlist。

<a id="catalog-drafts--素材与历史版本"></a>
## 素材与历史版本

实现：[media-model.js](../../../cloudfunctions/_shared/media-model.js)，所有 context 是可信服务端配置，不能接受客户端指定环境、云路径白名单、时间或素材来源。

| 导出 | 本地行为 |
|---|---|
| measureImageBytes(bytes,mimeType,maxBytes) | 对 Buffer 做大小 / PNG、JPEG、WebP 初步签名检查，返回实际 byteLength / SHA256 / 初步类型；不解码图片 |
| createMediaDraft(input,bytes,context) | 输入固定 assetId/revision/storageRef/sourceKind/mimeType，生成 DRAFT、retainedUntil=null；不上传 |
| validateMediaAsset(asset,context) | 校验确定性环境 ID、结构、状态、时间与受控引用，不证明来源真实性 |
| planMediaRegistration(input,bytes,existing,context) | 同 assetId/revision 锁定 storageRef/sourceKind/hash/MIME/大小；一致跳过、变化拒绝，换图必须新 revision |
| projectMediaReference(asset,context,usage) | 四字段白名单；DEVELOPMENT_PREVIEW 限 development 且非退役；PUBLIC_CATALOG 要求云引用 / PUBLISHED / REAL_PHOTO；HISTORICAL_ORDER 允许原云版本 RETIRED |
| resolveSnapshotMedia(ref,assets,context) | 精确匹配原 assetId/revision/storageRef/sourceKind，不跳转最新版本；缺失 / 冲突拒绝 |
| mediaRetentionDecision(asset,counts,context) | 未退役 / 未批准保留期 / 尚未到期 / 扫描不完整 / 目录、有效报价、历史订单仍引用时 KEEP；其余仅 RECHECK_BEFORE_DELETE |

仅接受 development 中的受限 /assets/ 本地路径，或明确服务配置 allowedCloudPrefixes 内的 cloud:// 稳定引用。拒绝外链、临时签名参数、路径穿越、data URL 和本地私有路径。这里的云前缀只是显式服务配置规则，尚未验证真实 SDK / 存储 bucket。

初步文件签名不是完整图片解码、安全验证或实拍来源证明；即使头部通过也仅生成 DRAFT。发布前必须由受控流程确认实拍 / 使用授权、完整解码、尺寸 / 内容与文件大小、真实文件存在和云环境权限，并登记不可覆盖版本。调用者传入 PUBLISHED 只用于模型契约，本模块没有发布或权限服务。

保留决策不会删除文件。未来删除须在可信扫描和事务 / 受控互斥内再次核验引用，避免扫描后新订单引用竞争；retainedUntil=null 表示未批准删除。历史引用存在时不能删除，也不能把旧版本重新指向新图片。参考海报不进入此正式生命周期。

MediaModelError：INVALID_MEDIA_CONFIGURATION / INVALID_MEDIA_REFERENCE / MEDIA_NOT_READY / INVALID_MEDIA_BYTES / MEDIA_TYPE_MISMATCH / INVALID_MEDIA_ASSET / INVALID_MEDIA_USAGE / MEDIA_VERSION_UNAVAILABLE / MEDIA_VERSION_CONFLICT / INVALID_MEDIA_REFERENCE_COUNTS。暂为内部错误，未知网络错误按 D07 脱敏规则处理。

<a id="catalog-drafts--本地-cli"></a>
## 本地 CLI

[plan-catalog-drafts.js](../../../scripts/plan-catalog-drafts.js) 固定读取已保存的开发示例及原图，不运行任意输入 JS。--settings 输入 D07 格式的 settings/now JSON；可选 --existing 为最小记录数组；--output 仅允许 artifacts/catalog-drafts 内新文件，父目录须已存在。

工具先检查原图真实路径位于包外素材目录、8 MiB 技术大小上限，再验证实际 SHA256 与签名。输出标 SIGNATURE_ONLY_NOT_PUBLISHABLE。目录的真实路径检查防止 junction / symlink 逃逸；独占创建防止覆盖任何旧计划。错误仅固定 code，不输出配置、记录、密钥、stack 或文件内容。

运行本机 Node（示例 settings 不是实际云环境）：
```powershell
Set-Location -LiteralPath 'D:\dinner cook'
New-Item -ItemType Directory -Force -Path artifacts/catalog-drafts
& 'C:\Users\78440\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/plan-catalog-drafts.js --settings artifacts/catalog-drafts/c01-settings.json --output artifacts/catalog-drafts/new-plan.json
```

本机示例 c01-settings.json / c01-example-r01.json / c01-existing-r01.json / c01-repeat-r01.json 均在 artifacts/catalog-drafts，Git 忽略；源码及原图在 catalog-assets/development。新机器应自行准备明确的开发 settings，不能依赖 artifacts 存在。

<a id="catalog-drafts--验证及下一步"></a>
## 验证及下一步

18 项针对性验证覆盖三分类 / 9 商品 / 15 SKU / 来源与价格、草稿不可买、非法组合、未知值、环境 / 白名单 / 深冻结、重复导入保留、孤立 SKU 拒绝、文件摘要、CLI 不覆盖 / 越界 / 脱敏、素材版本和历史引用保留。147/147 全套测试、152 文件静态检查通过，主包仍估算 1947/2048 KiB。证据见 artifacts/phase-3-qa；无新 UI 或云验收。

C01 本地草稿 / 生命周期契约通过；正式三分类读取、实拍 / 云上传 / 权限 / 保留任务仍待 E01/E05 与真实服务。下一项 C02 可先实现本地目录公开投影、三分类过滤 / 分页查询模型；开发示例必须显式标记并与正式在售读取隔离，后续按现有设计接入 Shop。不改已验收 Home。

---

<a id="catalog-read"></a>

## 原记录：CATALOG-READ.md

<a id="catalog-read--c02-商品列表与-shop-本地实现"></a>
# C02 商品列表与 Shop 本地实现

更新时间：2026-10-04。正式云接口仍 PLANNED，当前交付为公开读纯模型与 development/shell 的 Shop 示例浏览。没有云部署 / DB 查询 / 上传 / 新购买入口。

<a id="catalog-read--正式公开读取模型"></a>
## 正式公开读取模型

[createCatalogReadModel](../../../cloudfunctions/_shared/catalog-read-model.js) 接收可信、一致、有限的 categories/products/skus/mediaAssets 快照、服务 context 和服务器专用 HMAC key，返回 categoriesList() / productsList(input,now)。不接受 includeDraft / 任意排序 / Filter 或客户端控制的素材白名单。

context 为 environment/storeId/stage/allowedCloudPrefixes；key 为 id + 至少32字节 Buffer secret，模型复制密钥，调用方之后改变 Buffer 不影响此模型实例。context / records 先按既有 canonicalJSON 复制，拒绝 getter、循环、非JSON对象及稀疏数组；输出深冻结。

categoriesList 只投影已发布 CAKE / MINI_CAKE / BREAD 的 code/nameZh/nameEn/sortOrder。仅三分类，不因未知类目扩充 UI。productsList 输入与 D07 一致：storeId 必填，categoryCode/search/pageSize/cursor 可选。名称查询 NFC / trim / 小写 / 64字符上限，采用文字子串，不将输入当正则或数据库表达式。店 ID 须与可信快照范围一致。

正式商品卡必须同时满足：

- 目标门店、已发布三分类、product.status=ON_SALE，以及合法 ID / name / description / version / sortOrder。
- 至少一个经过 D03 resolveSku 的合法 ON_SALE SKU：明确价格 / 数量 / 提前量 / 留言规则 / 资源需求，唯一合法组合。低价草稿、下架规格或缺配置规格不参与起价。无有效 SKU 的商品不返回。
- 封面精确命中 C01 的同 assetId/revision、storageRef/sourceKind，不接受任意 URL / 未登记版本 / 内部额外字段；素材必须 PUBLISHED、REAL_PHOTO、受控云引用。若首张无效，可尝试后续有效引用；全无效则不返回商品。实际图片网络加载失败仍由已有卡片组件兜底。

ProductCard 只含 productId/version/categoryCode/name/description/cover/minPriceCents/currency；cover 只有 PublicMedia 的四字段。库存资源、实拍审批内部数据、文件摘要、保留期、审核元数据和原始文档均不返回。名称与规格文本不执行脚本。

categoriesList 返回 {apiVersion,items}；productsList 返回 {apiVersion,items,nextCursor,hasMore}，apiVersion 沿用 v1-api-2026-10-03。无合法商品返回空页，而非泄露草稿或把草稿当可买商品。

<a id="catalog-read--稳定分页与一致性边界"></a>
## 稳定分页与一致性边界

固定 sortOrder ASC + ASCII _id ASC；按 D07 默认20 / 最大50，取 pageSize+1，只返回前 pageSize，游标取最后返回项。同 sortOrder 以稳定 ID 打破并列，不使用 skip。可以更改下一页 pageSize，但不能复用游标改变店、类目、查询、环境或当前公开目录版本。

复用 [D07 HMAC 游标](../../API_NETWORK.md)。query 绑定公开分类 / 已投影商品排序内容的完整摘要，不把名称关键词原文、库存或密钥塞入 token。新建模型的公开名称 / 价格 / 状态 / 封面 / 排序发生变化时，旧游标拒绝并要求从第一页刷新。相同模型实例持有隔离的固定快照，调用者修改原对象不会影响后页。游标过期 / 被修改同样拒绝。

这不是真实数据库快照服务。当前模型在内存中处理完整有限快照；未来 SDK adapter 不能每次不受控全表扫描后分页。需先验证平台身份 / 门店可公开范围，用索引过滤同店、三分类、发布状态及必要关联，保持排序与 seek 的 AND 条件、可信目录修订 / 快照语义；并实测 SDK 字符排序、多页变更、索引和查询预算。不能把本模型的无重漏回归当成云分页已验收。

CatalogReadError：INVALID_CATALOG_SNAPSHOT / INVALID_CATALOG_READ_CONFIGURATION / INVALID_REQUEST / NOT_FOUND；D07 页请求 / 游标错误可传播。预期 D03 / C01 数据配置错误使商品不可公开，意外程序错误不吞掉。未来网络固定脱敏，不回传内部记录 / 配置 / stack。购买仍由云端再次核验价格 / 商品 / 库存 / 预约，浏览不占库存。

<a id="catalog-read--shop-开发示例"></a>
## Shop 开发示例

[生成脚本](../../../scripts/generate-shop-preview.js) 从 C01 用户示例生成 [shop-development.js](../../../miniprogram/fixtures/shop-development.js)，只保留9项卡片展示数据。蛋糕显示168/188/178元起，小蛋糕36/38/42元，面包统一12元。原图、参考摘要、真实 SKU / 服务端模型 / 密钥不进入主包；正式实体仍 DRAFT。

[catalog Service](../../../miniprogram/services/catalog.js) 仅 development+shell 可读取示例，明确 source=DEVELOPMENT_EXAMPLE、保留 development-example-* ID 和 canPurchase=false。其它 stage/mode 返回服务未开通，绝不回退到开发目录或把其发送给云接口。当前不改变 cloud.js allowlist，不冒充已部署 catalog。

本地标记 development-preview.* 是无购买能力的分页位置，绑定示例修订 / 分类 / 关键词；不是服务器签名游标，任何正式服务均不能接收它。默认页面6项、最多50项，没有前端签名密钥。返回卡片白名单，不复制源数据额外字段。

[Shop](../../../miniprogram/pages/shop/shop.js) 保留原先两列布局、四个分类标签及黑白暖白样式，小蛋糕中文与已确认三分类一致；不改 Home / Hero / 共享商品卡 / 旧 Product 预览。

- 首次加载 / 分类切换从第一页开始；进入时接收 Home 的 pendingShopCategory。
- 手动“加载更多”及滚到页尾续页；终页明确显示已展示全部。图片为空使用既有商品卡兜底。
- 加载失败显示固定提示和重新加载；续页失败保留已有商品 / 原游标，重试同页，防止重复点击造成并行续页。
- 请求代次检查防止旧分类成功 / 失败覆盖新分类；隐藏 / 卸载后迟到结果不更新页面，回来重新读取。
- 对重复返回 ID 做显示去重；分页标记不前进视为错误，避免无限续页。
- 开发示例点击提示“开发示例暂未开放选购”，不跳到仅支持三条旧 preview ID 的详情，避免无效详情或意外购买。C03/C04 后续接入真实规格 / 详情，本次不扩展这些能力。
- 页面明确显示临时开发示例、价格 / 照片待补、暂未购买。整张参考海报没有被当作每个商品的实拍图片。

生成 / 校验（本机 Node 路径见 HANDOFF）：
```powershell
node scripts/generate-shop-preview.js
node scripts/generate-shop-preview.js --check
node --test tests/catalog-read-model.test.js tests/shop-catalog.test.js
```

<a id="catalog-read--微信工具与验证"></a>
## 微信工具与验证

18项新增回归：公开投影 / 隐私、三分类 / 状态 / SKU过滤 / 起价、精确实拍引用、并列排序分页 / 游标绑定 / 变更 / 过期、数据隔离、C01草稿不公开、示例同步 / 环境隔离 / 12元价格、页状态竞争 / 重试 / 去重、防购买跳转及 JS-only 模块加载。全套165/165、静态158文件通过；主包估算1958/2048KiB，微信实际打包大小仍待工具确认。

首次微信截图发现 require JSON 模块导致 Shop 空白，已改为生成 JS 模块，并在 scripts/check.js 增加小程序相对 require 必须解析至 JS 的门禁；后端 Node JSON 读取保持支持。Node 测试不能替代微信运行验收。

修复后使用用户此前授权的本地官方 CLI 编译 / 打开 Shop，366×793截图已人工核对；真实元素点击 Bread 后3条 / 1200分，切回 All 并滚动触发续页后9条且终页。证据在 artifacts/phase-3-qa/c02-ui-report.json、c02-shop-fixed.png、c02-shop-bread.png、c02-shop-all-loaded.png。首次空白截图保留为诊断，不当验收图。工具缓冲还含平台 network offline SDK 错误，不能宣称全程无console错误。没有上传腾讯预览、二维码或真机测试。

完整本机报告：c02-tests.txt / c02-static.txt / c02-contract-audit.json / c02-report.json，均 Git 忽略。既有未提交成果按哈希核对保留；修改仅本任务的 Shop、静态门禁和进度 / 契约文档。没有 commit / push / 云写入。

C02本地模型与示例Shop通过；真实平台身份、SDK查询 / 索引 / 云接口、正式商品 / 实拍、真机交互和动态云分页仍待E01/E05，不标C02云整体验收完成。下一项C03本地SKU读取 / 规格配置投影与合法组合判定，再按依赖推进C04。

<a id="catalog-read--c03-本地商品详情--规格补充"></a>
## C03 本地商品详情 / 规格补充

createCatalogReadModel 新增 productGet({productId})，沿用 C02 公开条件；返回卡片字段及 images / optionGroups / messagePolicy / minLeadTimeMinutes / skus。SKU 仅含 skuId/version/description/selectedOptions/unitPriceCents/currency/minQuantity/maxQuantity，不公开库存需求。图集按精确已发布实拍版本去重，现行配置提供选项标签；不可公开商品统一 PRODUCT_UNAVAILABLE。

规格纯模型 / 输入输出详见 [SPECIFICATION-RULES.md](../../SPECIFICATION-RULES.md)。组合匹配、失效清除和版本重确认仅为客户端显示能力；正式价格 / 数量 / 留言 / 库存 / 履约仍须服务端最终验证。开发 Service 只在 development/shell 提供9商品/15规格，未知经营配置仍null、canPurchase=false。不增加 handler、SDK、allowlist 或 action 部署状态。

C04更新：Shop开发卡片现已导航同ID商品详情，不再停留于“暂未开放选购”提示；详情仍不可买，规格入口仅导航独立壳。详见 [PRODUCT-DETAIL.md](phase-3.md#product-detail)。前述C02行为为历史记录。

---

<a id="phase-3-execution"></a>

## 原记录：PHASE-3-EXECUTION.md

<a id="phase-3-execution--阶段三执行记录商品域"></a>
# 阶段三执行记录：商品域

更新时间：2026-10-04。入口 [总计划](../../DEVELOPMENT-PLAN.md)、[交接](../../HANDOFF.md)。阶段二本地已实现范围通过，真实云门禁仍待条件；继续用户授权的本地工作。

| Task | 状态 | 本次交付 / 待补 |
|---|---|---|
| C01 | 本地草稿 / 工具验证通过，正式目录与云验收待补 | 用户参考图原样保存于包外；三分类 9 商品 / 15 明确 SKU，面包统一 12 元；严格 DRAFT 管线 / create-only 规划 / 来源及阻塞 / 素材版本、白名单、历史引用保留；尚无云上传、数据库或正式目录读取 |
| C02 | 本地读模型 / 示例 Shop 验证通过，正式云待补 | 公开读投影、分类 / 搜索 / 稳定分页模型与 Shop 接入；云接口 / 实際 SDK 最终待环境 |
| C03 | 本地规格读模型 / 合法组合验证通过，正式云待补 | SKU / 规格读取投影与合法组合；正式未知配置继续待定 |
| C04 | 本地详情三状态 / 截图通过，正式云待补 | 商品详情 / 图集 / 起价 / 收藏入口，正式图与云继续待补 |
| C05 | UI与本地草稿加购通过，微信返回复测通过；正式配置与云待补 | 当前详情底部弹层，已接本机袋；未知经营规则不猜、正式购买未开放 |
| C06 | 本地同源首页/名称搜索及微信工具通过；正式目录/编排/云待补 | Home 使用当前目录，Shop 可搜索/清空/分页；不虚构门店推荐数据 |
| C07 | 本机收藏及微信工具通过；账号隔离/云待补 | LOCAL_DEVICE，不声称已同步真实账号；Account合法入口与门店资料 |
| C08 | 本地三分类/微信链路及业务分包通过；正式云验收待补 | 4 Tab主包，9业务页迁features，旧legacy关闭；阶段三正式门禁保留 |

本次资料是临时开发示例，正式价格 / SKU / 图 / 数量 / 留言上限和库存单位仍按 [E05/E06](../../EXTERNAL-DEPENDENCIES.md) 补齐。图中蛋糕 / 小蛋糕值如实转成整数分；面包名称底部被遮挡，用明确开发标签。用户补充“面包价格统一12”已记录。没有猜口味、夹心、数量限制或制作提前量。

实现、输入 / 输出、错误 / 发布边界与 CLI 见 [CATALOG-DRAFTS.md](phase-3.md#catalog-drafts)，内部契约见 [API_CONTRACT.md](../../API_CONTRACT.md)。整张海报约 2.42 MB，保存在 catalog-assets/development，不进入 miniprogram 或商品图片；后续独立图接入另行处理。Home / Hero / 既有页面和代码均保持。

147/147 全套回归（新增 18）、静态 152 文件、主包估算 1947/2048 KiB，通过。已有商品被编辑 / 发布后，重复计划不会覆盖或补新规格；同素材版本换内容拒绝，历史引用不跟随新图。纯函数 / 本地 CLI 不执行任何数据库、上传、支付或删除。

本机证据：artifacts/phase-3-qa/c01-tests.txt、c01-static.txt、c01-report.json、c01-contract-audit.json；计划示例 artifacts/catalog-drafts/c01-example-r01.json 与 c01-repeat-r01.json，Git 忽略。这些是离线证据，不是云并发、权限或设备操作验收。既有未提交改动保留，无自动 commit / push / 上传 / 部署。

<a id="phase-3-execution--c02-最新验证2026-10-04"></a>
## C02 最新验证（2026-10-04）

正式公开读取纯模型与开发示例Service/Shop完成本地部分；18项新增回归，全套165/165、静态158文件，主包估算1958/2048KiB。细则见 [CATALOG-READ.md](phase-3.md#catalog-read)。所有C01正式草稿仍DRAFT，未创建catalog云入口或更新客户端cloud allowlist。

Shop仅development/shell使用用户9条示例，三分类各3条，蛋糕为起价、面包统一12元；保留原布局，补加载 / 分页 / 重试与请求竞争隔离。未知图使用已有兜底，点击示例明确暂未开放选购。Home/旧Product/共享卡不变；正式SKU及云权威验收未替代。

微信工具首次运行发现require JSON模块错误，修复为JS生成模块并补静态门禁。修复后实际分类元素点击、Bread三项/12元、All滚到页尾9项/终页均验证；366×793截图人工核对。平台network offline SDK错误仍在缓冲，不声明console全程无错。没有上传/部署/真机或购买验收。

本机新证据artifacts/phase-3-qa/c02-tests.txt、c02-static.txt、c02-ui-report.json、c02-contract-audit.json、c02-report.json与c02-shop-fixed/bread/all-loaded.png，Git忽略。C01的147项/152文件为历史证据。C02正式云API、平台认证、SDK索引/排序/一致性/预算、正式目录、真机仍待条件；下一项C03本地规格读取和合法组合。

<a id="phase-3-execution--c03-最新验证2026-10-04"></a>
## C03 最新验证（2026-10-04）

正式 productGet 公开投影、显式 SKU / 合法组合模型、切换后失效选项清除、商品 / SKU 版本与价格 / 数量约束变化后的重新确认，以及9商品/15规格的隔离开发 Service 已完成可离线部分。详见 [SPECIFICATION-RULES.md](../../SPECIFICATION-RULES.md)。

18项新增，全套183/183、静态163文件、主包估算1983/2048KiB。测试与用户开发数据隔离，未知经营配置保持null；面包仍12元。客户端匹配不授予购买资格。Home、Shop、旧详情 / 规格页面不变；未写库或开放新云action。

本地微信工具打开Shop成功，规格Service运行时执行尝试超时，未获得原生规格结果；不声明原生规格交互 / 真机 / 云验收通过。c03-tests/static/contract-audit/report 为本机 Git 忽略证据。下一项 C04 商品详情页；C05 再接独立规格与留言 / 数量输入。

<a id="phase-3-execution--c04-最新实现与待验收2026-10-04"></a>
## C04 最新实现与待验收（2026-10-04）

9个同源开发商品的详情 / 起价 / 明确规格价、图集空图与单图错误兜底、Shop导航、独立规格页入口、收藏未保存说明已实现。Home旧设计链接单独隔离且不映射新SKU；Home/Hero字节不变。见 [PRODUCT-DETAIL.md](phase-3.md#product-detail)。

新增8项，全套191/191、静态165文件、主包源1990/2048KiB。微信打开详情与WXML编译摘要成功，但页面读取/截图自动化连接超时，刷新后仍超时；未取得有效截图或原生点击结果。页面验收保留待补；不报告C04整体通过。无云接口、购买、收藏持久化、上传或提交。下一项可继续C05本地独立规格页，同时保留C04原生/视觉验收门禁。

最新用户UI修订：以 [PRODUCT-DETAIL-REDESIGN.md](phase-3.md#product-detail-redesign) 为准。三状态原生截图366×793已核对，真实本机袋保存/读取通过；197/197、静态168、2015/2048KiB。用户明确覆盖独立规格页约定；C04页面截图旧门禁已补，正式C05确认与Bag/云仍待资料和环境，不把本机草稿当权威Cart。

2026-10-04用户确认UI验证通过；详情/规格弹层/本机加购反馈本轮UI验收关闭。用户授权提交并推送main，云/正式购买/收藏待办不变。当天总结与已纳入仓库的截图见 [今日总结](phase-0.md#daily-summary-2026-10-04)。

2026-10-04 C05复核发现：关闭重开弹层可保留选择，但离开详情页返回会重置规格、数量和留言；当前页面未接入模型 reconcile。相关27项测试通过，但未覆盖此生命周期遗漏。C05仅部分通过，先补返回恢复及回归再推进C06；详见 [C05验收复核](phase-3.md#c05-acceptance-review)。

C05后续修复：详情刷新已接reconcile，保留有效选择/数量/留言，清除失效项，按新限额调整并在加购前确认变更；取消或隐藏不写袋。新增5项，全套202/202，静态168文件、主包2019/2048KiB通过。微信automation_navigate业务响应超时，本轮原生返回复测待补；既有UI通过，不将本地回归当云验收。详见C05-ACCEPTANCE-REVIEW.md。下一项可推进C06本地部分，正式配置与云继续待补。

C05微信返回复测通过，已按用户授权推进C06：Home同源编排与缺推荐兜底、Shop名称查询/分类组合/清空/无结果/分页完成本地与微信模拟器验证。新增7项，全套209/209，静态170文件、主包2024/2048KiB。Home/Shop WXML编译摘要通过，截图已核对；正式目录/编排配置/云待补。详见 [C06-HOME-SEARCH.md](phase-3.md#c06-home-search)，下一项C07。

C07：新增6项，全套215/215、静态172、主包2031/2048KiB；Favorites/Product WXML摘要成功。微信真实收藏、重开项目恢复、Account入口与取消测试收藏已验证，截图核对；仅本机范围，真实账号隔离/云未验收。详见 [C07-FAVORITES.md](phase-3.md#c07-favorites)。下一项C08可离线部分，后续扩展需安排主包空间整理。

C08新增5项，全套220/220，静态173。用户授权自行决定分包，迁9个非Tab业务页到features；主包2031→1998KiB、业务分包34KiB、legacy45KiB（源估算）。微信三分类从Home进分包Detail，真实配置/本机加购/Bag读回/返回恢复通过，原有袋行保留；Account→分包收藏通过，截图和3个WXML摘要通过。原图/视觉不改，云权限/SKU恶意输入/正式目录等真实门禁待补。详见 [C08-CATALOG-ACCEPTANCE.md](phase-3.md#c08-catalog-acceptance)，下一步阶段四B01可离线部分。

---

<a id="product-detail-redesign"></a>

## 原记录：PRODUCT-DETAIL-REDESIGN.md

<a id="product-detail-redesign--商品详情-ui-重做详情--规格弹层--加购反馈"></a>
# 商品详情 UI 重做：详情 / 规格弹层 / 加购反馈

更新时间：2026-10-04。用户本轮明确改为详情页内底部规格弹层，优先于原 C04/C05 的独立规格页约定；Home 已验收视觉保持。

<a id="product-detail-redesign--实现与数据边界"></a>
## 实现与数据边界

详情主图 / 等尺寸空图区域占当前可用视口高度约59%，不再是圆角图片卡片；6vw统一内容留白，分类12px、名称28px/700、价格27px、简介14px/1.85。主图上覆盖返回与心形按钮，按原生statusBar/capsule测量避让胶囊；多图有独立圆点/序号。详情尺寸价格列表、开发说明和文字收藏胶囊移除。

固定底部“选择规格”黑色58px按钮，内容预留滚动空间并处理env(safe-area-inset-bottom)。弹层71vh、半透明遮罩、圆角/拖动条入口，内部scroll-view、固定总价/加购区；尺寸卡片包含当前尺寸和对应价、黑边及右上白勾。口味/夹心按现有optionGroups渲染，不创建参考图的假配置。当前数据只有尺寸，适用人数未提供，人数行不显示。总价=所选SKU整数分价格×数量。

三列展示用户确认的门店自取30分钟预约、门店配送20km、每天08:00–21:00。这些是门店服务事实，不是未经证实的新鲜食材/经典口味卖点。使用给定leaf/cake-slice/gift线性图标，未添加emoji或更多菜单。

9个当前商品源不变，面包12元；黑巧尺寸6/8/10寸分别188/258/348元。用户示例独立商品图仍缺失，保留大幅空图区及反馈缩略图兜底，不把整张海报或参考图草莓蛋糕挪为商品图。已确认旧Home设计图入口继续隔离，未强行绑定当前SKU。

收藏能力尚未接通：心形保持空心，点击明确提示，不伪造保存或实心状态。本次未实现跨设备收藏/购物袋、正式订单、支付、云库存或预约占用。

<a id="product-detail-redesign--实际本机购物袋"></a>
## 实际本机购物袋

现有 [local-bag.js](../../../miniprogram/services/local-bag.js) 经完善后的UI和回归接入：development/shell、按appId隔离键，选择经C03模型/现行SKU版本/价格重核对，写wx Storage并读回一致后才返回成功。同商品/SKU/规范化留言合并，不同留言分行；安全整数、已提供数量/留言约束、合并上限、写失败校验。未确认数量/留言长度不是正式可购买规则。

没有库存信息时不猜可用量。所有行requiresCloudValidation=true、checkoutAllowed=false。留言长度未定的蛋糕仅收本机草稿，不能据此生成有效云订单；不编造30字符上限或当前库存值。

成功后关闭弹层，黑色底部条显示真实已写入记录的名称/规格/本次数量及缩略图/兜底；“查看购物袋”进入实际读取页面，可查看/移除本机行。购物袋页明确“已保存在本机。商品、库存及履约信息核验后才能结算。”失败保留弹层且无成功条，不是模拟成功。

<a id="product-detail-redesign--图标与截图验收"></a>
## 图标与截图验收

已读取 design-assets/cake-ui-icons-20261004/README.md，并原样复制所需9个SVG到 miniprogram/assets/icons：back、heart-outline/filled、leaf、cake-slice、gift、check、minus、plus。黑色勾选圆底和按钮圆底由WXSS实现；不复制preview.svg或无功能more图标到页面。2.1描边保留。

实际微信截图中SVG返回、心形、三列线图标、加减及白色check均正常显示，不需要转换PNG。预览中vConsole关闭；保留微信胶囊/系统安全区，未实现参考图外壳、外部米色背景或假的状态栏。

最终同一视口导出的截图均366×793，已逐张人工对照参考比例：
- artifacts/phase-3-qa/detail-redesign-final-detail.png：主图约59%、6%侧距、字号层级/简介/三列、全宽主按钮、底部安全区。
- artifacts/phase-3-qa/detail-redesign-final-sheet.png：真实选择8寸/258元，边框白勾、遮罩、圆角、滚动体、加减/留言及固定总价/按钮。
- artifacts/phase-3-qa/detail-redesign-final-success.png：8寸×1真实持久化后的成功条、缩略图兜底及查看袋入口。

首次原生截图发现微信默认button宽度/外边距让主按钮收窄、返回位置偏移，已以明确width/margin修复后复拍。当前商品没有口味/夹心/人数/实拍，弹层留白和主图空区因此与参考的有完整资料案例不同，没有伪造内容来填满。

原生操作还验证6寸188元×2写入，查看袋读回376元；选择8寸总价258元并实际加购后读回新行258元。真实读取保存在detail-redesign-native-bag.txt。自动化曾超时/返回错误，失败诊断截图不计验收；后经官方runtime reLaunch恢复，最终截图与读取成功。Computer Use helper初始化两次失败，未用自建截图/输入方案绕过；最终使用微信官方本地CLI。平台仍有network offline SDK日志，不声明全程console无错。

全套197/197通过，静态168文件、主包源估算2015/2048KiB；新增针对性回归为本机袋重启/合并/保存失败/重校验/环境与数量留言，以及弹层切换价/关闭保留/真实反馈与失败状态。实际云/真机/发布仍未验收。

证据、审计报告、截图均在本机Git忽略的artifacts/phase-3-qa，不能当已入库或跨机器附件。无commit/push/上传/云部署。下一步完善正式经营配置和云适配，继续本地任务时保持本轮用户确认的弹层交互。

2026-10-04用户确认UI验证通过；详情/规格弹层/本机加购反馈本轮UI验收关闭。用户授权提交并推送main，云/正式购买/收藏待办不变。当天总结与已纳入仓库的截图见 [今日总结](phase-0.md#daily-summary-2026-10-04)。

---

<a id="product-detail"></a>

## 原记录：PRODUCT-DETAIL.md

<a id="product-detail--c04-商品详情本地实现页面验收待补"></a>
# C04 商品详情（本地实现，页面验收待补）

更新时间：2026-10-04。入口 [阶段三](phase-3.md#phase-3-execution)、[规格模型](../../SPECIFICATION-RULES.md)。

<a id="product-detail--当前实现"></a>
## 当前实现

[详情 Service](../../../miniprogram/services/product-detail.js) 在 development/shell 从 C02 卡片与 C03 规格同源读取9个开发商品，核对商品ID/名称/分类/来源/不可购买标记和最低SKU价格。缺少商品返回 PRODUCT_UNAVAILABLE，不一致返回 INVALID_RESPONSE；其他模式 CLOUD_NOT_CONFIGURED，不回退开发目录。固定公开错误增加 PRODUCT_UNAVAILABLE，未知错误继续脱敏。

蛋糕多规格显示最低价“起”与每个明确规格的价格；小蛋糕 / 面包显示单品开发价格，面包统一12元。不生成未知商品图、口味、夹心或数量/留言/提前量配置。返回详情仅含展示白名单，无库存需求或海报路径。

[详情页](../../../miniprogram/features/product/product.js) 有加载 / 重试 / 不可用 / 返回Shop状态，隐藏和卸载使迟到请求失效，重新展示时刷新详情。不存在、下架或暂未开放商品统一说明；尚无真实云适配，正式商品下架由 C03 服务端投影模型保证，不能把离线示例当作真实查询。

图集支持滑动 / 页数、每张图独立加载失败兜底；当前用户示例没有独立商品图，明确展示“商品照片正在准备”。整个参考海报没有被塞入每个商品图集。离线图集测试用两张旧设计图检查状态，不是正式实拍验收。

Shop点击现在进入同ID详情，不直接选购。详情“选择规格 / ADD TO BAG”只导航到独立 Specification 页并携带商品ID/source；该页目前仍为C05待接入壳，不输出确认结果或添加购物袋，没有详情页内弹层捷径。收藏入口明确提示“收藏功能正在准备，暂未保存”，不假装收藏成功；持久化留C07。

<a id="product-detail--已验收-home-的旧链接"></a>
## 已验收 Home 的旧链接

Home及Hero保持字节不变，仍使用三个旧 preview-* 设计卡片。详情Service为这些旧链接单独返回 LEGACY_DESIGN_PREVIEW，保留旧图/文案，面包示意价格同步用户确认的12元，明确“非当前商品售价”，不可进入新规格或购买，只能浏览当前开发商品。不把旧黑巧迷你、酸种等错误映射成当前示例SKU。

首页旧面包设计卡与其详情的价格已同步为12元；当前9个商品源内所有面包也为12元。这只是用户已确认的开发价格同步，旧图未变成正式实拍、旧链接未关联SKU。Home同源目录编排与旧预览移除属于C06，且必须遵守已验收视觉边界。

<a id="product-detail--验证"></a>
## 验证

新增8项针对性回归，全套191/191，静态165文件，主包源估算1990/2048KiB。覆盖9条同源价格/规格、旧预览隔离、环境门禁、非法ID、不一致数据、独立规格导航、收藏未保存提示、异常恢复、请求竞争与每图兜底。Shop既有导航回归按新详情行为更新，其分页/分类/加载逻辑不变。

微信官方本地工具能打开指定详情，product.wxml编译摘要success=true；刷新后再次截图和页面读取仍报timeout waiting for automator response，没有获得有效截图或原生交互结果。本次明确保留页面视觉 / 原生点击验收待补，不能仅凭打开成功标为页面验收通过。平台console缓冲含network offline SDK错误，未宣称无错。没有上传、二维码或云部署。

证据为本机Git忽略文件：artifacts/phase-3-qa/c04-tests.txt、c04-static.txt、c04-wxml.txt、c04-console.txt、c04-screenshot-attempt.txt、c04-contract-audit.json、c04-report.json。旧未提交成果按C04基线哈希核对保留。下一项C05独立规格页可继续本地实现，C04视觉/原生验证与真实商品/实拍/云条件仍需补验。

最新变更（2026-10-04）：用户明确改为详情页底部规格弹层和真实加购反馈，已完成三状态原生截图及本机袋验证。本文独立页/页面待截图为C04历史；当前行为以 [PRODUCT-DETAIL-REDESIGN.md](phase-3.md#product-detail-redesign) 为准。

---

<a id="specification-rules"></a>

## 原技术文档的验收/过程记录：SPECIFICATION-RULES.md

# C03 规格读取与合法组合（本地）

更新时间：2026-10-04。入口见 [阶段三](phase-3.md#phase-3-execution)、[公开目录](phase-3.md#catalog-read)、[D03 权威规则](../../CATALOG-CART-RULES.md)。

C03 已完成公开商品详情投影、客户端规格纯模型、开发示例读取及离线回归。没有新云 handler、数据库操作、库存占用、购买或页面改动。下一项 C04 商品详情页，独立规格交互 / 留言 / 数量确认属于 C05。

## 公开详情投影

[createCatalogReadModel](../../../cloudfunctions/_shared/catalog-read-model.js) 新增 productGet({productId})，只读取同一可信一致快照中满足 C02 公开条件的商品：发布分类、同门店 ON_SALE、D03 校验完整的有效在售 SKU、精确登记的 PUBLISHED / REAL_PHOTO 云素材版本。

输出 apiVersion、productId、version、categoryCode、name、description、cover、minPriceCents、currency、images、optionGroups、messagePolicy、minLeadTimeMinutes、skus。起价仍为有效在售 SKU 的最低整数分价格。图集保留有效引用的配置顺序，按 assetId/revision 去重；封面取首个有效引用。私有审核 / 库存需求 / 素材哈希 / 完整素材实体不公开。

optionGroups 只含 groupCode/label/required/options；每项 optionCode/label。messagePolicy 为 null 或 maxLength/normalizationVersion。SKU 只含 skuId/version/description/selectedOptions/unitPriceCents/currency/minQuantity/maxQuantity；选项标签来自现行配置，不信任调用方标签。没有库存可用量或占用证明。

请求只接受 productId。无此商品、跨门店、草稿、下架、无完整 SKU / 实拍引用均 PRODUCT_UNAVAILABLE；请求结构错误 INVALID_REQUEST。公开错误仍由 D07 固定映射。快照和输出隔离 / 深冻结。

## 客户端规格模型

[createSpecificationModel](../../../miniprogram/utils/specification-model.js) 是无 Node 依赖的纯显示模型。只接受显式 optionGroups / SKU 组合；不生成尺寸、口味、夹心或组合，不计算价格笛卡尔积。规范化输出剔除未知字段，拒绝重复 ID / 组合、必选项缺失、非法价格 / 数量配置、getter / 循环 / 非 JSON / 稀疏数组。

| 方法 | 行为 |
|---|---|
| configuration() | 冻结的白名单配置与来源、待定留言信息 |
| evaluate(selectedOptions=[]) | INCOMPLETE / INVALID_COMBINATION / MATCHED；匹配时返回唯一 SKU 的价格、数量上下限；不自动选择替代 |
| changeOption(previousState,{groupCode,optionCode}) | optionCode=null 可清空；保留兼容后续选择，清除不兼容项并提示“部分规格已不适用，请重新选择。” |
| reconcile(previousState) | 当前配置重新核对旧选择；删除失效选项，商品版本或 SKU 版本 / 价格 / 数量约束改变时 requiresReconfirmation=true |

选项启用遵循配置组顺序及已经选定的前置组。前置必选项未选时，后续选项暂不可选。可选组省略代表真实的省略组合，不能隐式选入某个 SKU 选项；只有显式配置的组合可匹配。无规格组商品可匹配显式空组合 SKU。

changeOption 遇商品版本或已匹配 SKU 事实变化返回 SPECIFICATION_VERSION_CHANGED，需先 reconcile。状态中的 selectedOptions 标签重取配置值。刷新后提示规格已更新 / 重新选择；调用方必须显式让用户重新确认，不能依靠旧确认直接购买。

所有模型结果 canPurchase=false，包括正式配置的 MATCHED 状态：这里只说明组合匹配，后续 Bag / Quote 仍需服务端核对现行商品、SKU、数量、留言、库存与履约。客户端不构成价格或容量权威。数量 / 留言输入校验与独立页面尚未实现，数量上下限只是读取结果。

## 用户开发示例

[生成器](../../../scripts/generate-specification-preview.js) 从包外 C01 示例经草稿规划校验，生成 [JS 配置](../../../miniprogram/fixtures/specification-development.js)。9 商品 / 15 明确 SKU 与 Shop 的 development-example-* ID 对齐。蛋糕仅图中明确尺寸，小蛋糕及面包保留明确单品组合；面包统一 1200 分。没有猜口味、夹心或商品实拍。

蛋糕留言支持为 PENDING_LIMIT，messagePolicy=null；小蛋糕 / 面包 DISABLED。minLeadTimeMinutes、minQuantity、maxQuantity 均 null，source=DEVELOPMENT_EXAMPLE、canPurchase=false、configurationPending=true。版本 0 / 示例 SKU ID 仅为本地演示标识，不能作为云端有效版本 / 商品 ID。

[规格 Service](../../../miniprogram/services/specification.js) 只允许 development/shell 读取该配置；其他模式返回 CLOUD_NOT_CONFIGURED，没有开发数据回退到生产或云调用。它不修改现有 cloud allowlist、Shop 点击行为、旧 Product / Specification 页或已验收 Home。

生成检查：node scripts/generate-specification-preview.js --check；Shop 生成检查仍 node scripts/generate-shop-preview.js --check。小程序只 require JS 模块，后端模型、密钥、库存和整张海报不进入这些前端配置。

## 验证与未验收范围

新增 18 项回归，全套 183/183；静态 163 个文件，主包源估算 1983/2048 KiB。测试覆盖非法组合、尺寸切换后失效夹心清除、可选组省略、版本和价格变化、冻结 / 数据隔离、三分类 / 示例价格、正式详情字段与可用性、图集精确引用，以及每个离线显式 SKU 与 D03 权威解析一致。

离线测试中的口味、夹心、数量上限 8、留言上限 12 和提前量 60 等仅是测试输入，未写入经营配置或用户示例。测试用素材登记同样不代表门店商品已具有正式实拍。

微信官方本地工具成功打开 Shop；尝试在运行时执行规格 Service 时 automation_evaluate 超时，没有获得规格模块的原生运行结果。本次不声明原生规格交互、真机、云 API / SDK / 实时目录验收通过。离线 JS-only 模块解析已测试，C04/C05 接页后继续微信运行验收。

本机证据在 artifacts/phase-3-qa/c03-tests.txt、c03-static.txt、c03-contract-audit.json、c03-report.json，Git 忽略。已有未提交文件按 C03 基线核对保留；未 commit / push / 上传 / 部署。60 个 action 的部署状态仍为 2 个现有本地入口 / 58 个 PLANNED。正式商品、实拍、未知经营参数与云环境继续按 [外部条件](../../EXTERNAL-DEPENDENCIES.md) 待补。

