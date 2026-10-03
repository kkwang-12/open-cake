# D07：开发种子与可重复计划

日期：2026-10-03。revision=development-draft-v1-2026-10-03。当前是本地无副作用规划器与只写 JSON 的 CLI；**未创建云集合 / 写入云数据 / 执行管理员初始化**。

实现：[development-seed.js](../cloudfunctions/_shared/development-seed.js)、[plan-development-seed.js](../scripts/plan-development-seed.js)、[回归](../tests/development-seed.test.js)。测试目录中的 catalog.js 明确 OFFLINE TEST ONLY，不能被 seed 引入。

## 明确的开发边界

buildDevelopmentSeedPlan(settings,existing,now) 的 settings 必须来自受控服务配置：

- stage 只能 development，test/production 均拒绝。
- environment 与 expectedDevelopmentEnvironment 必须一致；productionEnvironments 是明确数组，命中任何生产环境拒绝。当前未配置真实云环境，示例仅 offline-dev / offline-prod，不作真实 ID。
- namespace 必须 dev- 开头，后续小写字母 / 数字 / 连字符，固定该批命名空间；种子 ID 为 scopedDocumentId('development-seed',[environment,namespace,collection,key])。
- now 为明确有效 UTC 毫秒，不用业务日期替代，不猜云端运行时。未来落库用服务端时钟。
- existing 只含 categories / stores / store_config 的可信本环境相关记录（collection/document），完整 JSON；不读取资金、用户、角色或真实订单，不能接受普通客户端提交的快照作为数据库状态。

配置只是环境防误用约束，不能让一个把生产 ID 填成 development 的任意调用者获得落库权限；当前无云 executor。未来受控适配器从已核验运维配置获得 whitelist 与实际环境，独立受控调用授权，拒绝客户端 seed action。

## 五个草稿记录

| 集合 / 数量 | 初始数据 | 不填的未知值 |
|---|---|---|
| categories / 3 | CAKE/MINI_CAKE/BREAD，蛋糕 / Cake、小蛋糕 / Mini Cake、面包 / Bread；sortOrder=0/1/2；published=false | 不自动发布正式目录 |
| stores / 1 | 名称“开发草稿门店（非正式发布）”，最新确认文字地址、Asia/Shanghai、status=DRAFT，activeConfigId=null | phone/location=null，不伪造正式名称、电话或 WGS84 |
| store_config / 1 | configVersion=0、status=DRAFT、PICKUP/DELIVERY、两项已确认政策版本，publishedAt=null | timePolicy/cartLimits/quoteTtlMinutes/paymentHoldMinutes/slotPolicy=null；deliveryRules=[] |

每个创建载荷含 _id/schemaVersion=1/version=0/createdAt/updatedAt。草稿配置禁止半个规则：业务提前量、最大预约天数、报价 / 支付时效、回补规则和正式袋限制未齐，不能生成看似可发布的 TimePolicy / SlotPolicy / DeliveryRule。

计划 referenceFacts 是参考元数据，不落入以上集合：用户确认每天 08:00–21:00、两种模式周一至周日 14 个窗口、30分钟 / 3与1独立容量、20km含边界 / 0费 / 商家自行配送；高德原始经度117.2886/纬度31.1498/GCJ02/source=AMAP。normalizedLocation=null，不编造 verifiedAt，不把 GCJ02 标签改成 WGS84。

不生成产品 / SKU / 测试价格 / 数量上限 / 商品资源 / 时段资源 / 客户 / 管理员 / 交易 / 资金数据，不在初始化时发布或 OPEN。阶段三正式目录与实拍素材另按 E05/C01 准备。

## 可重复执行与冲突

规划器只输出 CREATE_IF_ABSENT 或 SKIP_EXISTING，没有 update/upsert/replace/delete 操作。确定性 _id 已存在时保留内容与版本；后来编辑或发布也不能被重复 seed 降为草稿。分类在其他 ID 已有同一 code 时按唯一 code 跳过；配置按 storeId/configVersion 逻辑唯一；重复当前记录 / 唯一键冲突 / ID 对应不同逻辑实体均 SEED_CONFLICT，先核实，不“修复”覆盖。

SKIP_EXISTING 仅输出 collection/_id，不把已有联系方式、完整配置或数据库原文复制到计划。不同环境 / namespace 的新草稿 ID 隔离，但 categories.code 仍按字典保持全局唯一。existing 不完整会使计划误认为不存在，真实 adapter 必须按逻辑键重新读并原子裁决。

未来 apply 必须在真实 SDK 事务中重新读取指定 ID 和逻辑唯一键并 create-if-absent；分类逻辑键并发要实际验证，不能只凭离线快照保证唯一。整批 5 记录 + 必要审计 / 运行记录写入要计预算，失败不能留错误发布指针。不同 key / 并发运行须安全保留 existing；权限规则需先拒绝客户端访问并读回核验。受控种子实际权限 / 事务 / 索引 / 并发尚未验收。

## 本地 CLI 使用

输入 JSON 形状：{settings:{stage:"development",environment:"offline-dev",expectedDevelopmentEnvironment:"offline-dev",productionEnvironments:["offline-prod"],namespace:"dev-d07"},now:服务端测试毫秒}。已有最小记录文件可选，省略按空快照规划；不表示已查询真实云数据库。

命令：node scripts/plan-development-seed.js --input artifacts/development-seed/input.json --existing artifacts/development-seed/existing.json --output artifacts/development-seed/plan.json。没有 existing 时省略该参数。

CLI 只在本工作区 artifacts/development-seed 已存在目录中写计划，校验真实父目录仍在工作区；exclusive create 拒绝覆盖任何已有输出，第二次需要用新文件名或用户自行管理旧计划。它不会连接 SDK、创建集合、部署规则或 apply。输入错误只打印固定码，已有输出不覆盖，不打印配置 / 原文 / stack。

错误码：SEED_ENVIRONMENT_REJECTED（非开发或配置不符）、INVALID_SEED_INPUT（非法快照 / 时间 / 集合）、SEED_CONFLICT（逻辑键 / ID 冲突）。CLI 另有 OUTPUT_ALREADY_EXISTS / SEED_PLAN_FAILED，不能把失败当做部分成功。

本机已保存 offline-dev 的输入与生成计划到 artifacts/development-seed；artifacts 被 Git 忽略，不能当作已提交种子、真实云 ID、或可营业配置。云环境可用后必须单独验证落库，当前本地回归只证明规划 / 保留 / 拒绝边界。
