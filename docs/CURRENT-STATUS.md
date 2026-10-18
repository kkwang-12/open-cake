# 当前工作状态

更新：2026-10-18（Asia/Shanghai）。本文件是唯一的进度、阻塞和下一步入口；按本轮任务读取源码，不从历史报告推断当前状态。

- 主工程：D:\Open cake，main。业务/UI源码、测试、规范及最终离线证据纳入本次日终提交；云端原始记录/数据库导出与私密配置仅本机保留，未发布小程序。
- development：cloudbase-d8gwtxzm64150b7e0；AppID wx154f791a17268ace。真实目录、本人云袋/地址、门店、时段及报价已接通；订单、付款退款、商家尚未开放。
- 当前无pending云任务，测试购物袋已恢复为空；客户端与服务端报价开启，checkoutAllowed=false，主下单按钮始终禁用。

## 当前交付：正式订单云函数候选（默认关闭）

- 购物袋可进入“核验报价”，使用当前本人云袋及行版本；不导入本机旧购物袋。结算页读取OPEN门店，选择真实日期/半小时时段、本人云地址，填写自取联系人，展示报价金额/有效期及AI参考图说明。
- 接入源码：[云报价客户端](../miniprogram/features/checkout/cloud-checkout.js)、[页面](../miniprogram/features/checkout/checkout.js)。原shell界面继续使用原本机接口；云模式经selection分支进入真实服务，布局沿用用户确认字体基线。
- 客户端先保存按app/环境/subjectHash隔离的完整payload/key；未知结果沿用原键，不同意图BUSY，成功后再核对当前身份/袋版本。换号清空旧地址选项/联系人，旧页面/日期/模式响应不能回写；输入、地址或时段变化及到期均使显示报价失效。
- Quote商品项不含购物袋lineId。最初云端已成功、客户端因错误按lineId校验而未展示；已按真实DTO的productId/skuId/数量/留言多重集合及行金额/总额修正，并用原键恢复原报价，无重复记录。页面商品信息与金额使用报价结果。
- 模拟器真实流程通过：云袋预览→结算页→2026-10-19的26个真实自取时段→¥348报价→原请求恢复→到期清除→测试行清理。[原生审计](qa/g2-checkout-ui-20261018/summary.json)、[到期画面](../artifacts/g2-checkout-ui-20261018/checkout-expired.jpg)。真机视觉与配送页面真实点击尚待确认；配送服务端及客户端单测已通过。
- 页面实验沿用g2-native-quote-20261018，明确追加2袋命令/1报价及其回执：本轮只新增1报价/1报价回执/2袋回执，无新配送评估。袋v27→29且空行，客户端pending报价清除；9库存/156时段业务字段、版本与占用未变，仅1库存/1时段内部保护计数因创建/原键重放各+1。
- 原run累计6/6袋命令、3/3报价及回执、1/1配送评估，全部完成，不重跑或重置资源。保留审计记录自然过期；实验[计划/恢复状态](../artifacts/g2-checkout-ui-20261018/state.json)无pending，未调用订单/资金。
- 最近集中验证：联合离线1217/1217（Payment192/Admin207/legacy19/其余799），边界/静态/图标通过；覆盖真实报价上下文下自取/配送建单、重放不重复占用、写失败回滚、跨门店创建与重放拒绝。[最终代码证据](qa/offline-2026-10-18T15-27-21-164Z/summary.json)。
- 下一步：接通未付款到期/取消的原子资源释放，核对正式集合/唯一索引/权限后，开展有预算的真实订单验收；用户仍可编译后真机确认报价页。购买、支付、商家保持关闭，不逐步索取聊天确认。

## development真实业务基线

- 目录：3分类/9商品/15SKU/9批准素材，初版名称价格已由用户确认；图片来源DESIGN_PREVIEW，仅development明确许可用于浏览与报价，保留AI标识，不重标实拍。[经营缺项唯一入口](EXTERNAL-DEPENDENCIES.md)、[经营规则](CATALOG-CART-RULES.md)。
- 商品/SKU经营字段24条已按5批CAS更新并完整回读，version0→1，价格/规格/图片/内部计数保留。[字段审计](../artifacts/g2-quote-data-20261018/final-audit.json)。蛋糕提前30分钟，另两类0分钟；留言按采纳资料决策，SKU数量1–15。
- 门店g1-catalog-store：v3/OPEN，activeConfigId=g2-initial-config-20261014。配置v3/PUBLISHED、业务configVersion=0，上海时区，08:00–21:00、提前预约3天，报价5分钟，付款保留30分钟，自取3/配送1，20km含边界/0配送费。[最终发布回读](../artifacts/g2-quote-publish-20261018/final-audit.json)。
- 店址及GCJ02位置经用户确认腾讯POI；有效门店v3位置证明已绑定，地址使用同一云端私密密钥的HMAC证明，未轮换密钥或改历史位置事实。[履约规则唯一来源](FULFILLMENT-RULES.md)。
- 每履约日共享分类配额：CAKE15/MINI_CAKE20/BREAD20，跨商品/尺寸/自取配送共享；库存日期ID不含SKU或配置版本。报价与订单SDK读取同一日期资源，不能占永久分类池。[字段与政策](reference/data/daily-quota.md)。
- 已初始化2026-10-19至21：9日期库存、156时段，全字段审计通过。只add缺失ID，不set/upsert或重置版本/占用；跨日需按实际日期补齐，缺资源不可选。[库存](../artifacts/g2-quote-data-20261018/inventory-audit.json)、[时段](../artifacts/g2-quote-data-20261018/slots-audit.json)。
- 四交易前置集合inventory_resources/slot_inventory/checkout_quotes/delivery_evaluations已建，原生客户端直接读4/4拒绝；写规则按用户设置，尚未直接回读/实测。stores/store_config/location_verifications等已有拒绝规则证据保留。

## 云函数与真实验收

- checkout：Active/Nodejs20.19/timeout20，SDK4.0.2，quote.create/get已开启。仅原生身份、本人袋/地址、批准素材、门店位置证明；原子写报价/回执，配送另写评估，不占资源或写订单。[接口](reference/network-api/07.md)。
- 首轮真实报价自取/配送各创建、重放、get及异参/价格注入拒绝共8项通过，完整DTO一致，2报价/2回执/1评估；袋v23→27清理通过。首次CONFIGURATION_REQUIRED及1次热重试失败原结果保留，用户更新配置后成功；未逐字段回读环境变量，不断言特定变量是唯一根因。[审计](qa/g2-quote-cloud-20261018/summary.json)。
- store：Active/Nodejs20.19/timeout20，READ_ENABLED=true，health/get/slots.list已原生验收。时段读取同一只读事务内核对配置、在售商品最大提前量及确定性真实时段；缺失/满额/关闭/陈旧不可选，不返回容量/占用数，不写资源或新增索引。[接口](reference/network-api/15.md)、[7项验收](qa/g2-store-slots-20261018/summary.json)。
- 报价递增证明_transactionFence后health曾误拒绝；已修复已知非负安全整数元数据兼容，未知字段/异常计数仍拒绝。仅store单文件增量部署任务d4fdc071成功，部署后health/get/slots三项通过；无待确认任务，不重发。[原始证据](../artifacts/g2-store-slots-20261018/live/)。
- cart：原生get/add/update/remove真实接通，写本人袋/安全引用回执/users.version，丢响应按原payload/key恢复；不保存行/留言/价格响应快照。历史竞争一胜者/一INTERNAL_ERROR，仅一回执；原败者key回查重试确认VERSION_CONFLICT，不把一般提供方错误改标冲突。[接口](reference/network-api/14.md)。
- address：本人云地址、GCJ02解析/版本证明与页面已接通，用户已确认真机定位效果；当前本人1活动地址。旧复验run已清理，不以历史用户/地址版本作为新写基线。[接口与预算](reference/network-api/13.md)。
- 地址加载诊断保留：原生只读list两次3685ms/659ms，均1活动地址，普通列表不调用地图；只证明首次请求较慢，冷启动/初始化仍待归因。[原始计时](../artifacts/address-performance-readonly.json)。
- catalog/user及两既有拒绝/身份验证函数保留；目录浏览、规格弹层与本人云袋已接通。匿名/第二用户存储读取尚未完整验收，不据当前用户9图成功宣布存储权限全部通过。

## D04与正式订单边界

- [order-sdk-session](../cloudfunctions/_shared/order-sdk-session.js)已实现确定性ID、全部依赖读取保护、create-if-absent、资源/日志/回执原子写及100操作/64KiB单文档/1MiB/最多3尝试15秒预算；同key只允许内部保护计数变化。
- test隔离jjl-order-sdk-lab已部署Nodejs20.19/timeout20，完整自取/配送/原键重放及首末写失败4场景、53文档精确审计通过；实验窗口关闭，原生LAB_NOT_AUTHORIZED确认。[审计](qa/d04-cloud/order-sdk-20261018/management-audit.json)、[关闭](qa/d04-cloud/order-sdk-20261018/closure-poll.json)。
- 既有文档早/晚写保护两场景2/2通过；旧read-existing/read-missing/query-empty出现STALE_COMMIT及旧提供方回滚未确认等失败原证据保留，不将SDK读视为已保护。[D04约束](D04-SDK-INTEGRATION.md)。
- 正式[order handler](../cloudfunctions/_shared/order-cloud-handler.js)及自包含部署包已完成，固定development/门店、原生身份、本人报价与最小CommandResult；原键重放同样检查门店。开关默认false，客户端order allowlist未开放。[本机部署说明](../artifacts/g2-order-20261018/部署说明.md)及私密环境文件已准备，尚未部署或写云数据；未付款清理/取消链路及正式集合/索引/规则仍待接通核对。实际丢响应、第二用户、真实资源交错、正式平台预算及资金/真机仍待验收。
- 制作/取消时段回补策略及原子写义务已实现并离线覆盖，订单必须绑定原reservation日期ID/策略版本，不按操作当天重定位。[取消后的时段规则](FULFILLMENT-RULES.md#取消后的时段名额回补)。
- test环境dinner-cook-test-d5e320u981ec341仅隔离探针/实验；production配置为空，未核实生产资源、审核或发布状态，不改production。

## 换电脑与协作约束

- 必须迁移完整当前工作区（含未提交/未跟踪源码、docs/qa、需要的artifacts及隐藏.git），不能只拉main；本轮未生成迁移压缩包。私密文件本机保管，不入库、不贴聊天。
- 根目录npm ci。公开runtime-config已启用development的catalog/addresses/cart/store/checkout；重建前将这些公开字段保留到miniprogram/config.local.js，再npm run configure。私密地图Key/地址证明密钥仍在云端及被忽略的本地环境文件，不生成或轮换。
- 重要私密恢复路径：artifacts/g2-address-20261016/cloud-env.local.json、artifacts/g2-quote-20261018/environment.local.json；其余原始实验JSON可能含本人标识/地址，仅私人迁移。云资源沿用，不重复创建集合/初始化/开实验窗口。
- 本机wechatide路径D:\微信开发者工具\wechatide.cmd，skill0.3.11；新机按实际安装路径、登录及真实服务/端口恢复，不复制旧.ide或猜Token。工具同轮先非沙箱status，连接异常按AGENTS核查；2–3次不能解决就列操作清单交用户。
- 默认单agent；同一已授权任务连续执行与核验，不逐步请求确认。结果未知先查原task/key/云版本，不重发。用户可手动部署；本轮已直接完成获授权的store增量修复。未授权不提交、推送、正式发布或改其他聊天/全局配置。
- 测试按阶段集中；失败及原始证据保留，旧阶段关闭断言随真实接入更新但不删除资金/权限门禁。离线、真实云、模拟器、真机、资金分别报告，测试数不代表上线比例。
