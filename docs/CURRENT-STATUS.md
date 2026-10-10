# 当前工作状态

更新：2026-10-10（Asia/Hong_Kong）。这是唯一的进度/阻塞/下一步入口；开始时核对Git，按任务读取源码。历史证据不构成新授权。

## 当前任务：G1 云商品目录只读接入（PARTIAL）

- 主流程沿用[ARCHITECTURE](ARCHITECTURE.md)：G1云商品/本人袋/地址 → G2权威报价/完整订单 → G3实付/商家履约/退款 → G4生产验收。D04约束正式订单，不作为整个G1的前置；67个任务与已确认V1政策保留。
- 首轮按明确授权仅在development新建catalog Event函数及categories/products/skus/media_assets四个空集合和查询索引。三个action为categories.list/products.list/product.get；集合客户端读写全部拒绝，函数拒匿名规则已回读。隔离目录标识g1-catalog-store不对应已创建/确认的业务门店。[部署与权限证据](qa/catalog-cloud-20261010/deployment.json)、[独立包清单](../artifacts/g1-catalog-package-20261010.json)。
- 本轮已按追加授权更新现有catalog、导入36文档/上传9图，36文档逐条回读匹配。浏览投影不依赖库存/数量/提前量完整，购买resolveSku校验保留；development显式开关与逐张批准共同允许DESIGN_PREVIEW，来源不伪标实拍。身份、目录绑定、有界只读快照及HMAC游标保留，密钥未旋转；不提供订单读取或写保护。[接口与预算](reference/network-api/09.md)。
- 微信模拟器原生验证10/10通过：空分类/商品、缺失商品、伪造身份字段、跨目录、伪造游标、四集合客户端直读拒绝。另有管理端伪造身份AUTH_REQUIRED；匿名拒绝为规则回读，未新增匿名账号。验证后四目录集合仍为0，users仍为1；新增业务文档0、素材上传0。[原生响应](qa/catalog-cloud-20261010/native-1791595292680.json)。
- 原生验证通过后本机切为development/cloud并启用目录读取；Home/Shop/详情已有云service接入，空/错响应不回落示例商品，云商品不写本机购物袋/收藏。袋、地址、订单、支付、商家能力仍关闭；没有上传/发布小程序、资金、提交或推送动作，其他云函数未更新。
- 主工程模拟器开窗/上下文及隔离同源码刷新曾遭微信工具APPID_ERROR/read ECONNRESET，页面编译/真机验收未完成。[最新只读连接检查](qa/catalog-cloud-20261010/console-network-20261010.json)：当前loginExpired=false、skill 0.3.11匹配；此前[登录过期快照](qa/catalog-cloud-20261010/tool-status-20261010.json)已不代表当前状态。用户云控制台overview的qbase管理请求仍报ECONNRESET；系统代理7890开启，公开腾讯云首页直连/代理均200，微信站点代理200/直连超时，上海2环境查询NORMAL。尚未复现具体失败接口，不能将代理或登录认定为全部故障根因；下一步对照浏览器控制台与工具插件，再验证最小运行时调用。本次未改网络设置/发起登录/打开工程/调用业务接口。[历史工具错误](qa/catalog-cloud-20261010/simulator-errors.json)。
- 用户已确认既有商品名称/规格/价格作为正式经营初版沿用，后续自行调整；经营采用决定及剩余资料缺项只维护在[经营资料E05](EXTERNAL-DEPENDENCIES.md)。最新[初版执行记录](qa/catalog-cloud-20261010/initial-execution.json)已写入并读回3分类/9商品/15SKU/9素材，上传9图；原生状态AUTOMATOR_TIMEOUT/NOT_ACCEPTED，主工程初版参考图配置未启用、真机未运行。下一步完成正向云调用、主页面配置及列表/详情/真机验收；不要求重交整套商品，未知经营值不填测试默认值，G1未完成。
- 后端目录只读核查：正式入口仅user.me/store.health/catalog三项；store不是经营接口。袋/地址/报价/订单/支付退款/商家功能主要为_shared本地模型或注入式服务，尚未形成正式云入口与真实SDK业务闭环；D04缺口见下节。另窗只读核查未改业务代码/切环境/重跑验收；本主流程目录开发与部署按本轮执行证据判断。
- 本轮存储规则更新接口返回成功，但回读仍PRIVATE/空规则，尚未认定九图读取规则生效。原生验证连接超时/运行时ID丢失后短指令已可执行；验证模块提取错误已定位修正，正向列表/详情/图片结果仍待取得。本机初版参考配置保持未启用，UI页面/样式/组件未改。

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

- 最近最终代码及本机cloud配置验证（2026-10-10）：完整本地回归1086/1086，89文件；未知购买配置只读、逐图批准、精确存储路径/匿名/私有读取/客户端写拒绝及交易门禁覆盖；静态440项。[通过日志](qa/local-checks/tests-1791599041049-31640.tap)。初次2处fixture/旧浏览语义断言失败已修正且保留[失败日志](qa/local-checks/tests-1791598486183-27516.tap)。包体主包/features/legacy估算1399/153/45 KiB，实际以微信编译为准；原生本轮/真机/资金/发布未验收。
- 联合离线阶段与Payment/Admin边界的既有证据保留在[原记录](qa/test-orchestration-20261009/summary.json)，不能替代正式接入后的合法成功/未授权拒绝验证。真实接入时按接口及开放能力更新边界断言，不能直接移除门禁。
- 本机切cloud后4个离线测试暴露对隐式本机配置的依赖；已改用显式shell测试client，保留所有失败断言及购买门禁。受限HTTP失败与修正前失败原日志保留，最终通过结果不遮盖失败。[配置失败](qa/local-checks/tests-1791595372330-5476.tap)。验收分本地/云/真机/资金/发布，不用测试数估算上线比例。
- 原生自动化/工程恢复及开发环境只读核查证据保留在[执行记录](qa/d04-cloud/write-protection-20261009/execution.json)与[恢复核查](qa/d04-cloud/read-protection-20261009/environment-recovery.json)；后续实际调用前复核环境、身份、版本，避免触发无关业务。
- 经营资料、支付账户及其他缺项只维护在[EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)。首轮0文档/0素材与追加36文档/9图及catalog/指定存储规则授权分别查执行证据，新增额度已用完；其他部署/发布/资金未授权。默认单agent；用户本轮已授权将当前改动提交并推送到origin/main，最终提交及同步状态以Git为准。本轮不重复业务回归，提交前检查差异、新增JSON及常见密钥/工具令牌模式。
