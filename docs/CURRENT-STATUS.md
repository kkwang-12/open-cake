# 当前工作状态

更新：2026-10-11（Asia/Shanghai）。这是唯一的进度/阻塞/下一步入口；开始时核对Git，按任务读取源码。历史证据不构成新授权。

## 当前任务：G1 本人云地址 CRUD（换电脑接力；CLI连接阻塞）

- 本轮业务结果为本人地址真实保存读回；address六个action及页面异步接入已实现，使用原生身份、用户版本真实写保护、签名分页和只含实体引用的幂等回执。跨用户目标统一NOT_FOUND，重放重新授权/投影当前地址；手机号仅格式检查，手填不伪造位置/配送资格。[接口与预算](reference/network-api/13.md)。
- 云客户端地址开关仍false，不导入旧本机地址簿、不开放配送选择；未知写结果保留原key，草稿按AppID/阶段/环境/当前subjectHash隔离。切换账号再返回可恢复原操作；隐藏页面的异步结果不覆盖新编辑，保存失败保留输入。SDK4.0.2自包含部署源为cloudfunctions/address（13文件/117144字节），无密钥或node_modules；锁文件npm ci通过。[可审阅部署及追加样例计划](../artifacts/g1-address-package-20261011.json)。
- 用户本轮“继续往下推进”已确认所列development地址范围：address Event函数、2私有集合/索引、当前验收用户version/defaultAddressId及最多2样例地址/8安全回执；样例软删并清空默认指针，用户版本不回退。已用完2样例/7回执；两样例全部软删、默认null/用户version7，未改其他用户。后台结果丢失后采用原ID/key分步恢复；原生真实结果/并发缺口见[本轮证据与决策](archive/stages/phase-2.md#g1-本人地址原生事务与回执验收2026-10-11)。第二用户越权、真机、实际丢响应仍待验收。
- 两个集合创建均已查询原任务成功：addresses requestId `53582b26-ebe5-4418-a91e-503c37e30e2c`、idempotency_records requestId `cb9001f7-9d87-4b58-b9d8-f0218122be5a`；[地址结构](qa/address-cloud-20261011/addresses-created.json)、[回执任务终态](qa/address-cloud-20261011/idempotency-task-state.json)、[回执结构](qa/address-cloud-20261011/idempotency-created.json)均已回读。用户反馈没有确认框；不能把初始pending当作仍需寻找弹窗，后续以最终任务结果为准。
- 原索引任务已查到success；[结构回读](qa/address-cloud-20261011/address-index-readback.json)确认owner_address_scan为ownerId ASC/deletedAt ASC/updatedAt DESC/_id DESC。原函数部署taskId `confirmation_cloud_fn_deploy_3bfd3aef-669f-4616-9b3e-84a5fd0c5cbd`的[终态响应](qa/address-cloud-20261011/deploy-address-task-state.json)外层success，内部address.error为FailedOperation.UpdateFunctionCode/函数仍Creating，未完成代码部署；不能仅用任务外层success判定业务成功。[函数回读](qa/address-cloud-20261011/address-function-info.json)已Active，但runtime Nodejs16.13/timeout3，与用户截图一致；新函数已创建，源码/依赖部署未确认。无待查询pendingTask；2集合/索引已确认，私有规则/样例验收未完成，样例及回执新增0。
- 用户手工重建后，[函数回读](qa/address-cloud-20261011/address-function-after-manual.json)已确认Active/Nodejs20.19/timeout20，截图内存256 MB且6环境变量已填写；长字段/密钥输入框截断显示，尚未通过服务器调用核对完整配置，不将截图当作已保存/密钥长度通过证据。
- 用户已保存配置后，原重部署任务[终态](qa/address-cloud-20261011/deploy-address-node20-task-state.json)外层success但内部仍FailedOperation.UpdateFunctionCode/当前Updating；[函数回读](qa/address-cloud-20261011/address-function-after-saved.json)现在已Active/Nodejs20.19/timeout20。原生只读address.list返回缺少业务ok/apiVersion格式，不能认定业务代码已上传；三个集合users/addresses/idempotency_records客户端直读均拒绝，code -502003，[原生预检](qa/address-cloud-20261011/readiness-before-manual.json)。这只证明当前登录用户直读拒绝，不证明写权限/匿名规则已完整验收；无样例/回执写入，客户端开关仍false。
- 用户已按提示修正函数权限JSON并反馈ok；[原生预检](qa/address-cloud-20261011/readiness-after-rules.json)已返回正式ok=false/error=INVALID_REQUEST，3私有集合直读均拒绝；不再是缺少业务格式。微信原生调用自动注入userInfo，已仅在地址传输入口剔除此字段，身份仍取原生平台上下文；新增测试覆盖注入兼容、伪造身份不能越权、其他多余字段继续拒绝。适配已同步cloudfunctions/address及独立包，但不能据此认定真实故障已解决。
- 用户反馈已上传后，两次只读调用仍INVALID_REQUEST；用户明确要求再试一次后，[最新重试](qa/address-cloud-20261011/readiness-user-retry.json)仍INVALID_REQUEST/3私有集合直读拒绝。此前[函数回读](qa/address-cloud-20261011/address-function-after-upload.json)确认Active/Nodejs20.19/timeout20。用户日志截图确认云运行200/业务INVALID_REQUEST，但Event行没有输入内容，无法据此定位。已添加ADDRESS_INPUT_REJECTED/revision address-input-2安全诊断，只记录结构布尔值、固定错误类别及字段名哈希，不记录参数值/未知字段名/身份/联系方式/密钥。
- 诊断单文件增量原任务已查询[终态成功](qa/address-cloud-20261011/address-input-diagnostic-task-state.json)，随后[只读list](qa/address-cloud-20261011/readiness-after-diagnostic.json)仍INVALID_REQUEST。用户[18:22:31新日志](qa/address-cloud-20261011/user-input-diagnostic-tcbcontext.png)确认revision address-input-2/encoding OK/wellFormedAPI true/eventPlain及payloadPlain true/空payload，额外字段哈希31563d5f9a0343e5精确匹配tcbContext；先前仅剔除userInfo不足。已定点剔除两个传输字段，身份仍由平台context确定；新增覆盖tcbContext伪造不能越权、payload内嵌同名字段仍拒绝。本轮最终全量1102/1102，见验证节。
- tcbContext适配增量[任务终态成功](qa/address-cloud-20261011/address-tcbcontext-task-state.json)，[只读预检](qa/address-cloud-20261011/readiness-tcbcontext-fixed.json)正式ok/0地址/父version0。真实2样例create/update/default/remove成功，分页、原键当前投影、客户端3私有集合读写拒绝通过；[竞争](qa/address-cloud-20261011/native-race.json)一成功/一INTERNAL_ERROR，父版本仅+1，错误分类未通过。清理及管理回读完成：[地址](qa/address-cloud-20261011/address-final-rows.json)、[用户](qa/address-cloud-20261011/address-final-user.json)、[回执完整审计](qa/address-cloud-20261011/receipt-audit.json)，两个败者键均无回执。重复设置相同默认的回执版本4/真实父版本5不一致，原证据保留。
- 新候选已修复setDefault回执取本事务父版本+1，并添加脱敏提供方错误分类诊断；不能把一般事务失败改标版本冲突。候选全量1104/1104/静态495通过，源码/自包含/独立包处理器哈希一致，不重复离线测试。用户“云允许”明确批准追加development最多2条不配送样例/8安全回执（预计7），仅原地址函数/当前用户，结束软删并清空默认、不回退版本；[固定操作键分步计划](../artifacts/address-reverify-plan.json)，run g1-address-reverify-20261011-1791728754797，基线version7/0活动地址。追加额度已用0/0，禁止整轮重启或换key。
- 单文件增量旧任务168943c3的[查询](qa/address-cloud-20261011/address-provider-receipt-task-state.json)返回Task not found；门禁loginExpired=false/skill0.3.11 equal，[函数](qa/address-cloud-20261011/address-function-after-task-loss.json)Active/Nodejs20.19/timeout20。基于记录失效重提同一候选后，新任务4554e48c也在用户继续时[返回Task not found](qa/address-cloud-20261011/address-provider-receipt-resubmit-state.json)，不能据此判断代码部署成败。两次同类失败后按用户要求转手工，不再重提/查询失效任务；当前无可查询pending记录，追加样例/回执0/0，客户端开关false。
- 用户回复ok后按手工上传完成继续，只读预检两次失败：首次工具返回解析异常，第二次明确CONNECT_ERROR/无法连接WechatIDE CLI服务，[错误证据](qa/address-cloud-20261011/address-reverify-connect-error.json)。尚未验证候选实际部署；追加地址/回执仍0/0。发现cloudfunctions及miniprogram下新增project.config.json，保留用户文件，不据此判断当前打开工程。
- 用户再次回复ok后，门禁仍CONNECT_ERROR；显式auth返回success/authorized/alreadyTrusted/port51943，但随后门禁仍CONNECT_ERROR，[本轮连接证据](qa/address-cloud-20261011/address-reverify-auth-connect.json)。共三次尝试后按用户约定停止，不能把授权成功当作服务连接恢复；原生预检未执行，追加地址/回执仍0/0。
- 下一步用户手工重启微信开发者工具并打开主工程D:\Open cake，在设置→安全确认服务端口开启，再执行CLI auth及check_wechatide_status确认连接/登录/版本。恢复后按已授权固定run逐步await setup/race/same/cleanup；异常实际云回读后恢复/清理，不重新创建计划或扩额度。
- 注册部署/结构CLI不提供环境变量与权限规则配置；用户按同一控制台步骤设置6变量/32字节随机游标密钥、address拒匿名、2集合客户端读写false，保留既有函数权限条目及通配策略。用户完成后回读再运行原生验收，通过才启用本机开关。连接/人工问题仍按用户要求尝试2–3次后交其手工操作，不重复整轮样例写入。用户已明确授权本次提交并推送远端main，未授权小程序上传发布。

## 明天换电脑恢复

- 拉取远端main，打开仓库根目录（新电脑路径可不同），不要将cloudfunctions或miniprogram子目录单独导入。使用同一AppID/development环境；原机stash `pre-main-sync-20261011`仅本机保留，不是接力基线。
- 根目录 `npm ci`；若需再生成runtime-config，先用PowerShell `Copy-Item -LiteralPath miniprogram/runtime-config.js -Destination miniprogram/config.local.js` 保留当前公开development配置，再运行 `npm run configure`。config.local及微信私有配置/令牌不入库，游标密钥留在云函数设置，无需迁移或旋转。
- 固定run/ID/key及4个await阶段已随仓库保存：[计划](../artifacts/address-reverify-plan.json)、[预检](../artifacts/address-readiness.js)、[阶段生成器](../artifacts/prepare-address-reverify.cjs)。只用 `node artifacts/prepare-address-reverify.cjs --resume` 恢复同一计划；辅助CLI脚本中的工具安装路径须按新机调整，先读本机微信skill并完成登录/CLI门禁。
- 云只读预检必须确认同一验收subjectHash133a76b53fc4f5c8、用户version7、活动地址0/defaultnull；换电脑若微信身份不同则停止写入，不重建新run。核验address部署后按setup→race→same→cleanup逐步保存结果；race错误继续取ADDRESS_PROVIDER_REJECTED脱敏日志，预留清理回执。最后核对至多2新样例/8回执、样例软删/defaultnull、回执版本与父版本；第二用户/真机仍待验收。
- 本轮业务源码、地址独立函数、原生证据、最终1104回归日志及复验工具/计划随本次main提交保存。本机生成的两个子工程project.config.json保留在原机，不入接力基线；没有提交node_modules、私有配置或令牌。当前业务源码没有新修改，不重复已通过的全量回归；提交前核对文件差异、13文件部署哈希、5段原生脚本语法及证据字段。

- 上轮从远端main `c0d3989`接力，已启用development初版参考图及精确目录路径白名单；实际首页、三分类列表、详情与图片读通，购买/加购/收藏门禁保留。原机改动保留于stash `pre-main-sync-20261011`，不恢复旧快照；未新增云目录文档/素材、更新函数、提交/推送/上传或发布。

- 主流程沿用[ARCHITECTURE](ARCHITECTURE.md)：G1云商品/本人袋/地址 → G2权威报价/完整订单 → G3实付/商家履约/退款 → G4生产验收。D04约束正式订单，不作为整个G1的前置；67个任务与已确认V1政策保留。
- 首轮按明确授权仅在development新建catalog Event函数及categories/products/skus/media_assets四个空集合和查询索引。三个action为categories.list/products.list/product.get；集合客户端读写全部拒绝，函数拒匿名规则已回读。隔离目录标识g1-catalog-store不对应已创建/确认的业务门店。[部署与权限证据](qa/catalog-cloud-20261010/deployment.json)、[独立包清单](../artifacts/g1-catalog-package-20261010.json)。
- 本轮已按追加授权更新现有catalog、导入36文档/上传9图，36文档逐条回读匹配。浏览投影不依赖库存/数量/提前量完整，购买resolveSku校验保留；development显式开关与逐张批准共同允许DESIGN_PREVIEW，来源不伪标实拍。身份、目录绑定、有界只读快照及HMAC游标保留，密钥未旋转；不提供订单读取或写保护。[接口与预算](reference/network-api/09.md)。
- 首轮空集合原生验证10/10通过：空分类/商品、缺失商品、伪造身份字段、跨目录、伪造游标、四集合客户端直读拒绝。另有管理端伪造身份AUTH_REQUIRED；匿名拒绝为规则回读，未新增匿名账号。当时验证后四目录集合仍为0，users仍为1；新增业务文档0、素材上传0。[原生响应](qa/catalog-cloud-20261010/native-1791595292680.json)。
- 本机development/cloud目录已启用：Home显示3个分类代表商品；Shop分类按钮切换蛋糕/小蛋糕/面包，各返回3个云商品；详情保持AI参考来源与正式初版价格。云商品不写本机袋/收藏，袋、地址、订单、支付、商家尚未接通。
- 本机首次微信工具登录过期，扫码后恢复loginExpired=false/skill0.3.11匹配；开窗后曾AUTOMATOR_TIMEOUT，用户手工编译后最小运行时调用正常。主工程目录错误已定位为客户端未启用参考图/白名单为空，现已修正。用户要求同类连接/人工操作问题尝试2–3次后通知其手工操作，不持续重试；历史控制台网络故障不能作为本轮商品加载失败根因。
- 用户已确认既有9商品/15规格/价格作为经营初版，后续自行调整；唯一经营资料入口仍为[经营资料E05](EXTERNAL-DEPENDENCIES.md)。本轮原生核对3分类、分页4/4/1、9详情/15SKU与初版名称价格一致；9图下载解码成功，4目录集合客户端直读拒绝。[12项原生断言](qa/catalog-cloud-20261011/native.json)、[页面数据](qa/catalog-cloud-20261011/pages.json)、[列表截图](qa/catalog-cloud-20261011/shop-cake.png)、[详情截图](qa/catalog-cloud-20261011/detail-mini.png)。
- 当前已部署正式入口为user.me/store.health/catalog/address；address已完成真实本人CRUD与受控清理，仍有并发错误类别及回执版本复验缺口，开关false。store不是经营接口；袋/报价/订单/支付退款/商家功能仍未形成真实SDK业务闭环，D04缺口见下节。实际接入按本窗口执行证据判断。
- 上轮存储规则更新成功但回读PRIVATE/空规则；本轮当前登录用户9图真实读取通过，未重新回读规则或验证匿名/其他用户存储读取，不据此宣称存储权限完整验收。详情规格按钮实点后sheetOpen=false且canPurchase/canConfigure=false；商品卡片内部按钮选择器不可用，列表→详情自动点击未验收（详情为直接导航），真机未运行。G1目录模拟器读链完成，G1整体仍PARTIAL，下一业务交付为本人云袋/地址。

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
- test `dinner-cook-test-d5e320u981ec341`：最近2026-10-09快照为jjl-d04-probe及3个探针集合；客户端test配置为空。本轮未复查/更新test，生命周期候选仍未部署。
- production配置为空，未核实生产资源/发布审核状态。[环境审查来源](archive/stages/phase-0.md#project-readiness-review-2026-10-09)。

## 验证与后续边界

- 本轮最终候选（2026-10-11）：完整本地回归1104/1104，91文件；新增相同默认回执版本、提供方诊断脱敏与一般事务失败不改标冲突，已有原生传输适配/地址边界/客户端异步测试保留。静态495项，主包/features/legacy估算1400/162/45 KiB，[最终日志](qa/local-checks/tests-1791715109711-35116.tap)。SDK fake不证明真实云竞争；本轮云CRUD/私有直读写/清理通过，竞争失败分类及回执版本未通过，候选部署尚未核验。地址页面开关关闭、第二用户/真机/资金/发布未验收；既有失败日志与原生失败结果保留。
- 联合离线阶段与Payment/Admin边界的既有证据保留在[原记录](qa/test-orchestration-20261009/summary.json)，不能替代正式接入后的合法成功/未授权拒绝验证。真实接入时按接口及开放能力更新边界断言，不能直接移除门禁。
- 本机切cloud后4个离线测试暴露对隐式本机配置的依赖；已改用显式shell测试client，保留所有失败断言及购买门禁。受限HTTP失败与修正前失败原日志保留，最终通过结果不遮盖失败。[配置失败](qa/local-checks/tests-1791595372330-5476.tap)。验收分本地/云/真机/资金/发布，不用测试数估算上线比例。
- 原生自动化/工程恢复及开发环境只读核查证据保留在[执行记录](qa/d04-cloud/write-protection-20261009/execution.json)与[恢复核查](qa/d04-cloud/read-protection-20261009/environment-recovery.json)；后续实际调用前复核环境、身份、版本，避免触发无关业务。
- 经营资料、支付账户及其他缺项只维护在[EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)。首轮0文档/0素材与追加36文档/9图及catalog/指定存储规则授权分别查执行证据，目录新增额度已用完；本轮地址有限范围授权见当前任务，其余部署/发布/资金未授权。默认单agent；用户本次明确授权提交推送main用于换电脑接力。本轮验证按实际改动范围执行。
