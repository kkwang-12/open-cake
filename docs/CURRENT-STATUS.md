# 当前工作状态

更新：2026-10-14（Asia/Hong_Kong）。这是唯一的进度/阻塞/下一步入口；开始时核对Git，按任务读取源码。历史证据不构成新授权。

## 当前任务：G2 门店公开云读取（已部署，原生验收PARTIAL；用户暂停）

- 用户2026-10-13明确选择“先接通选购草稿，购买继续关闭”，并授权有界云验证。development cart get/add/update/remove及既有页面服务已接通；页面/样式/组件未修改。未知库存/提前量不阻止保存，正式SKU数量范围仍校验，未知留言长度不允许非空留言；不填默认经营值。[技术接口](reference/network-api/14.md)。
- 新命令原子写本人袋/安全引用回执/users.version；相同值新key也物理保护袋与用户，默认地址指针不变。回执不保存行/留言/价格/响应快照，重放重新授权并返回当前袋。客户端未确认请求按app/环境/原生subject隔离，保留原payload/key/version，不导入离线袋；加购携带get返回的cartId防止调用期间换号写入另一账号。
- 云端13文件/SDK4.0.2精确匹配独立候选，cart Active/Nodejs20.19/timeout20/无触发器；新carts读写false，继承原通配函数拒匿名，原函数规则及其他6函数部署时间、idempotency_records规则未改。[部署](qa/cart-cloud-20261013/deployment.json)、[源码](qa/cart-cloud-20261013/deployed-source.json)。
- 原生预检、加购、相同值更新、重放/异参/未知留言拒绝及清理通过；固定run g1-cart-verify-20261013，新增1本人袋/4回执（上限1/5），用户14→18、默认null/0活动地址，袋version4/样例行0。回执仅引用与版本，无行/留言/价格/响应快照。[12项最终审计](qa/cart-cloud-20261013/final-audit.json)、[固定计划](../artifacts/g1-cart-verification-plan-20261013.json)，原始步骤及失败见[实验记录](archive/stages/phase-2.md#g1-本人云袋与原键恢复2026-10-13)。
- 首次并发一胜者/一INTERNAL_ERROR，仅一条回执/用户版本+1；立即返回VERSION_CONFLICT的严格断言未通过。管理回读后，用原败者key/参数重试确认VERSION_CONFLICT且无写；未知错误未改标冲突，来源仍未定位。真实双用户、实际丢响应及逐写提供方回滚仍待验收，不能据安全恢复宣布全部并发失败路径已解决。
- 本机cart已启用，既有购物袋页CLOUD_SELECTION_DRAFT/空袋/revision4；商品详情及原规格弹层canConfigure=true、canPurchase=false，未知留言输入关闭，[6项最终页面检查](qa/cart-cloud-20261013/native-pages.json)通过。服务层补齐删除丢响应后行已消失的恢复：reviewAll仅在袋版本已推进时确认原key，不在刷新中执行新写。最终本地1122/1122（93文件），[日志](qa/local-checks/tests-1791860732869-12700.tap)；联合阶段1120/1120及关闭边界证据见[初版联合验收](qa/g1-cart-local-20261013/summary.json)。最终静态552项/50图标、主包估算1414KiB；配置增量491/491保留，旧失败日志保留。
- 工具首次预检因Windows .cmd双引号传输报Invalid token，改为短单引号表达式后8项预检通过；最后页面复查曾AUTOMATOR_TIMEOUT，按约定仅刷新一次/最小读检查后重试，最终6项通过。[首次页面超时](qa/cart-cloud-20261013/native-pages-final-attempt1.json)保留，不认定为业务失败或后台验收成功。测试分组关联补齐后tooling 14/14通过，[日志](qa/local-checks/tests-1791861324289-31156.tap)。
- 2026-10-14门店读取：仅绑定门店的原生身份只读SDK快照及公开字段/营业窗口白名单；health保留。[接口约束](reference/network-api/15.md)。完整本地1130/1130（94文件），[最终日志](qa/local-checks/tests-1791970994470-17416.tap)，静态565项；初次2个旧关闭边界/请求标识断言失败已修正并保留原日志。CloudBase代码审查已核对原生鉴权、SDK有界读取及敏感字段投影。随后仅store更新代码和公开配置，回读Active/Available、Nodejs20.19/timeout10/无触发器，新JJL_STORE_READ_ENABLED=false；客户端新读取开关未启用。云端源码包已下载到原机artifacts，13文件逐一比对尚未完成，不认定源码验收通过。
- 用户确认后development新建stores/store_config，客户端读写false规则已回读；按[批准计划](../artifacts/g2-store-20261014/draft-plan.json)插入2条DRAFT且逐字段回读一致。门店activeConfigId/location仍null，配置cartLimits/slotPolicy仍null，未发布、不写库存/时段/报价/订单、其他函数未操作。[执行与暂停位置](qa/g2-store-cloud-20261014/execution.json)、[13文件候选](../artifacts/g2-store-20261014/package.json)。MCP本轮显式绑定development/ap-shanghai，不能再沿用current_env_id=null的旧快照；后续操作仍核对目标环境。
- [原生只读6项](qa/g2-store-cloud-20261014/native-readonly.json)5通过：health成功、伪造字段/slots拒绝、两集合客户端直读-502003；合法get预期CONFIGURATION_REQUIRED却返回INVALID_REQUEST，原因未定位，门店读取验收未通过。这不是自动化断连；当前微信登录有效/skill匹配、运行时已恢复。用户暂停后不再修复或调用云接口。晚上接力先比对已部署候选和微信原生传入业务事件，定位合法get错误；不要重复创建集合/插入草稿或把5/6写成通过。已确认经营值只查FULFILLMENT-RULES/CATALOG-CART-RULES，缺项只查EXTERNAL-DEPENDENCIES；购买/订单/支付/商家继续关闭，真机/资金/发布未验收。

## 已完成：本轮本人云地址追加复验

- development本人地址六个action及既有页面已接通；本机addresses.enabled已启用，页面/样式/组件未修改。原生身份、用户版本写保护、签名分页、按身份隔离的原键草稿和安全幂等回执保留；不导入本机地址簿，配送选择/订单/支付/商家门禁仍关闭；购物袋见当前任务。[接口与预算](reference/network-api/13.md)。
- 地址复验时已核对云端address Active/Nodejs20.19/timeout20；13文件逐一匹配1104全量通过的候选，当时本机三处字节差异仅为CRLF/LF。address与通配函数规则拒匿名，addresses/idempotency_records客户端读写false；未重新部署、改规则或旋转密钥。后续cart契约生成已更新本机共用副本，不代表云端address重新部署。[源码比对](qa/address-cloud-20261011/deployment-source-20261013.json)、[管控与最终回读](qa/address-cloud-20261011/reverify-cloud-audit-20261013.json)。
- 2026-10-13微信登录已恢复，skill0.3.11匹配；当前主工程D:\dinner cook、安装D:\微信web开发者工具。预检首次自动化超时，刷新后多行脚本解析失败，改为单行传输后成功；不是业务源码故障。确认原subjectHash133a76b53fc4f5c8/version7/0活动地址/defaultnull，users/addresses/idempotency_records原生直读拒绝。[预检及故障记录](qa/address-cloud-20261011/reverify-readiness-20261013.json)。同类断连最多重试2次，仍失败直接交用户手动操作。
- 沿用已授权固定run g1-address-reverify-20261011-1791728754797及原ID/key，按setup→race→same→cleanup逐步await并保存结果。新增2样例/7回执，低于2/8上限；两样例全部软删，默认null、用户version14，不回退版本、不修改其他用户。[固定计划](../artifacts/address-reverify-plan.json)。
- 本轮14项原生断言通过：create2/update1至父version10；默认地址竞争一成功/一VERSION_CONFLICT，父版本只+1至11；同一默认指针重设响应及回执版本12；清理至父version14。[完整步骤与决策](archive/stages/phase-2.md#g1-地址并发与回执追加复验2026-10-13)。
- [7条持久化回执审计](qa/address-cloud-20261011/reverify-receipt-audit-20261013.json)通过：create2/update1/setDefault2/remove2；字段/作用域正确，无联系方式或响应快照，竞争败者无回执，默认回执版本11/12匹配各自成功父版本。旧版本不一致与INTERNAL_ERROR原证据保留；本轮竞争通过不证明所有提供方失败路径已消除。
- 开关启用后[现有地址页](qa/address-cloud-20261011/reverify-page-20261013.json)实际为CLOUD_OWNER/空列表/revision14/无错误，selectionAllowed=false；未新增真实经营地址。第二用户实际越权、真机、实际丢响应仍未验收，不据单用户结果宣布G1整体完成。
- 地址复验未改业务源码；先前接力提交为245db4d。本人云购物袋候选见当前任务；地址第二用户/真机验证另补。本轮不提交/推送/发布或操作资金。

## 换电脑恢复参考

- 拉取已保存main并打开仓库根目录，不将cloudfunctions或miniprogram子目录单独导入；AppID wx154f791a17268ace/development云环境保持一致。旧stash pre-main-sync-20261011仅原机保留，不作为接力基线。
- 根目录npm ci；如需重建runtime-config，先复制当前公开runtime-config到config.local保留已启用目录/地址配置，再npm run configure。机密游标密钥保留在云函数配置，无需迁移或旋转；私有配置/令牌不入库。
- 原地址复验run已完成，预算已用2地址/7回执，不再执行setup或重启整轮。再次验证只读基线为同一subjectHash、用户version14/0活动地址/defaultnull；后续新写须明确新增范围。微信安装路径按本机实际调整，先核对登录/版本与CLI连接。

- 上轮从远端main `c0d3989`接力，已启用development初版参考图及精确目录路径白名单；实际首页、三分类列表、详情与图片读通，购买/加购/收藏门禁保留。原机改动保留于stash `pre-main-sync-20261011`，不恢复旧快照；未新增云目录文档/素材、更新函数、提交/推送/上传或发布。

- 主流程沿用[ARCHITECTURE](ARCHITECTURE.md)：G1云商品/本人袋/地址 → G2权威报价/完整订单 → G3实付/商家履约/退款 → G4生产验收。D04约束正式订单，不作为整个G1的前置；67个任务与已确认V1政策保留。
- 首轮按明确授权仅在development新建catalog Event函数及categories/products/skus/media_assets四个空集合和查询索引。三个action为categories.list/products.list/product.get；集合客户端读写全部拒绝，函数拒匿名规则已回读。隔离目录标识g1-catalog-store不对应已创建/确认的业务门店。[部署与权限证据](qa/catalog-cloud-20261010/deployment.json)、[独立包清单](../artifacts/g1-catalog-package-20261010.json)。
- 本轮已按追加授权更新现有catalog、导入36文档/上传9图，36文档逐条回读匹配。浏览投影不依赖库存/数量/提前量完整，购买resolveSku校验保留；development显式开关与逐张批准共同允许DESIGN_PREVIEW，来源不伪标实拍。身份、目录绑定、有界只读快照及HMAC游标保留，密钥未旋转；不提供订单读取或写保护。[接口与预算](reference/network-api/09.md)。
- 首轮空集合原生验证10/10通过：空分类/商品、缺失商品、伪造身份字段、跨目录、伪造游标、四集合客户端直读拒绝。另有管理端伪造身份AUTH_REQUIRED；匿名拒绝为规则回读，未新增匿名账号。当时验证后四目录集合仍为0，users仍为1；新增业务文档0、素材上传0。[原生响应](qa/catalog-cloud-20261010/native-1791595292680.json)。
- 本机development/cloud目录已启用：Home显示3个分类代表商品；Shop分类按钮切换蛋糕/小蛋糕/面包，各返回3个云商品；详情保持AI参考来源与正式初版价格。云商品可写本人云选购草稿，不写本机袋/收藏；本人地址已接通，购买/订单/支付/商家关闭。
- 本机首次微信工具登录过期，扫码后恢复loginExpired=false/skill0.3.11匹配；开窗后曾AUTOMATOR_TIMEOUT，用户手工编译后最小运行时调用正常。主工程目录错误已定位为客户端未启用参考图/白名单为空，现已修正。用户要求同类连接/人工操作问题尝试2–3次后通知其手工操作，不持续重试；历史控制台网络故障不能作为本轮商品加载失败根因。
- 用户已确认既有9商品/15规格/价格作为经营初版，后续自行调整；唯一经营资料入口仍为[经营资料E05](EXTERNAL-DEPENDENCIES.md)。本轮原生核对3分类、分页4/4/1、9详情/15SKU与初版名称价格一致；9图下载解码成功，4目录集合客户端直读拒绝。[12项原生断言](qa/catalog-cloud-20261011/native.json)、[页面数据](qa/catalog-cloud-20261011/pages.json)、[列表截图](qa/catalog-cloud-20261011/shop-cake.png)、[详情截图](qa/catalog-cloud-20261011/detail-mini.png)。
- 当前已部署入口为user.me/store.health/catalog/address/cart，另store.get已部署但关闭且原生未验收，见当前任务；本人地址与云袋草稿已接通，development开关已启用；第二用户/真机/实际丢响应仍待验收。报价/完整订单/支付退款/商家尚未形成真实SDK业务闭环，D04缺口见下节。实际接入按本窗口证据判断。
- 上轮存储规则更新成功但回读PRIVATE/空规则；当前登录用户9图真实读取通过，未验证匿名/其他用户存储读取，不据此宣称存储权限完整验收。首轮目录只读规格门禁现已由本轮云袋授权推进：原弹层能打开，canConfigure=true/canPurchase=false；列表→详情自动卡片点击、真机未验收。G1整体仍PARTIAL。

## D04：PARTIAL，正式提供方未接入

- 已验证：2026-10-08隔离云技术探针16/16，含原子写、回滚、幂等、库存/时段竞争及唯一冲突。[原记录](archive/stages/phase-2.md#d04-cloud-repair-2026-10-08)。这不是正式业务订单验收。
- 正式session和业务写入预算已有本地模型；`protectReads` / `findOrderByNumber` 真实提供方尚未接入。确定性订单ID及orderNo生成已有实现，严格64位编号反解doc查找仍待实现；附件提到的protectExisting/createSdkOrderDocumentSession及 `_transactionFence` 正式字段不能当作已实现。
- 读取实测read-existing/read-missing/query-empty全部STALE_COMMIT，保护0/3；SDK4.0.2事务内where可执行，但所测空查询不能保护。该结果用于选路线，不要求原生能力全部通过才实施替代方案。[原始响应](qa/d04-cloud/native-1791514800945.json)、[实验决策](archive/stages/phase-2.md#d04-read-protection-20261009)。
- 写保护实测：已有文档早/晚写、缺失共享保护记录3场景均PROBE_ROLLBACK_UNCONFIRMED；先冲突、后回滚返回DATABASE_TRANSACTION_FAIL/终止提示，未认定保护通过。两个绕过保护记录的反例均STALE_COMMIT，空查询协作保护未运行。[逐场景证据](archive/stages/phase-2.md#d04-write-protection-20261009)。
- 中断前已整体修正本地生命周期：仅明确冲突按提供方自动终止处理，未知错误仍清理并拒绝；用新事务改变保护版本并占用决策ID，验证保护锁与决策锁释放，再读持久化状态。候选原生版本 `d04-write-guard-lifecycle-1`，独立包已准备：[包清单](../artifacts/d04-guard-lifecycle-package-20261009.json)。候选尚未部署或云复验，不能宣称D04通过。
- 最近已完成的云部署仍为 `d04-write-guard-diagnostic-1`，SDK锁定4.0.2；原22文档窗口新增15个、仅3个探针集合，香港2026-10-09 11:31:42已关窗，原生PROBE_NOT_AUTHORIZED。[执行](qa/d04-cloud/write-protection-20261009/execution.json)、[关闭](qa/d04-cloud/write-protection-20261009/closure.json)。
- 先前新窗口授权对应的中断轮仅只读预检，未创建新run/开窗/部署/新增文档；该轮只做已授权G1目录接入，不继续D04云实验。2026-10-10只读清点时管理工具为账号级READY、current_env_id=null，未选择默认环境；实际云操作前须显式核对目标环境及当轮范围。
- 后续正式接入须先定义内部保护字段/迁移/输入白名单/DTO及完整操作预算，覆盖关键依赖变化、确定性唯一性、业务/保护逐写回滚、重试重新授权、原key丢响应恢复及双用户权限。[技术义务](D04-SDK-INTEGRATION.md)。
- 待验收：完整业务订单保存、所选真实读取保护、平台读写/载荷/重试预算、真实丢响应、真机及完整权限；购买/付款门禁保留。

## 云环境最近快照（development于2026-10-10回读）

- AppID `wx154f791a17268ace`；上海NoSQL。2026-10-10 queryEnv(list, ap-shanghai)完整返回2个环境，development/test均NORMAL；工作区检出4个project.config.json（1个主工程、3个验证工程），全部同一AppID。本机cloud配置仍指向development；本次未切换环境或核查其他地域、电脑其他目录。
- development `cloudbase-d8gwtxzm64150b7e0`：user/store、2个原验收函数、catalog（既有部署记录Active/Available，Nodejs20.19，SDK4.0.2，无触发器）；原快照users=1、admin_roles/audit_logs=0，初版执行记录目录计数已为categories=3/products=9/skus=15/media_assets=9。每个目录集合有_id/_openid及catalog_public_scan索引，正式交易集合未建齐；本次未重新查询资源全量。
- 2026-10-13云袋追加仅新cart函数/carts集合；其他6函数部署时间未变。本人袋1/空行/version4，新增安全回执4，原验收用户version18/defaultnull；目录/地址/素材未新增，未改test/production。实际管控回读见当前任务证据。
- test `dinner-cook-test-d5e320u981ec341`：最近2026-10-09快照为jjl-d04-probe及3个探针集合；客户端test配置为空。本轮未复查/更新test，生命周期候选仍未部署。
- production配置为空，未核实生产资源/发布审核状态。[环境审查来源](archive/stages/phase-0.md#project-readiness-review-2026-10-09)。

## 验证与后续边界

- 业务候选既有验证（2026-10-11）：完整本地回归1104/1104，91文件；新增相同默认回执版本、提供方诊断脱敏与一般事务失败不改标冲突，已有原生传输适配/地址边界/客户端异步测试保留。静态495项，主包/features/legacy估算1400/162/45 KiB，[最终日志](qa/local-checks/tests-1791715109711-35116.tap)。SDK fake不证明真实云竞争；2026-10-13已回读候选部署，本轮14项原生及7回执审计通过；地址页面已启用，第二用户/真机/实际丢响应/资金/发布未验收。配置变化对应cloud/client及address-client局部323/323（33文件）通过，[局部日志](qa/local-checks/tests-1791855980101-28292.tap)；不重复相同业务源码全量，旧失败结果保留。
- 联合离线阶段与Payment/Admin边界的既有证据保留在[原记录](qa/test-orchestration-20261009/summary.json)，不能替代正式接入后的合法成功/未授权拒绝验证。真实接入时按接口及开放能力更新边界断言，不能直接移除门禁。
- 本机切cloud后4个离线测试暴露对隐式本机配置的依赖；已改用显式shell测试client，保留所有失败断言及购买门禁。受限HTTP失败与修正前失败原日志保留，最终通过结果不遮盖失败。[配置失败](qa/local-checks/tests-1791595372330-5476.tap)。验收分本地/云/真机/资金/发布，不用测试数估算上线比例。
- 原生自动化/工程恢复及开发环境只读核查证据保留在[执行记录](qa/d04-cloud/write-protection-20261009/execution.json)与[恢复核查](qa/d04-cloud/read-protection-20261009/environment-recovery.json)；后续实际调用前复核环境、身份、版本，避免触发无关业务。
- 经营资料、支付账户及其他缺项只维护在[EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)。目录原新增额度已用完；地址追加2地址/8回执额度已用2/7，云袋1袋/5回执额度已用1/4，样例均已清理；本轮批准的门店2集合/2草稿及store更新已执行。剩余额度不构成新一轮授权，其他新部署/发布/资金未授权。用户明确暂停并授权提交推送当前改动至origin/main；最终提交和同步状态以Git为准。默认单agent；本轮仅补齐暂停证据与提交检查，不重复已通过的业务回归。
