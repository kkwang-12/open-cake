# 数据模型与真实云实验：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [CLOUD-BACKFILL-TRACKER-2026-10-08.md](#cloud-backfill-tracker-2026-10-08)
- [CLOUD-ENVIRONMENT-HANDOFF-2026-10-08.md](#cloud-environment-handoff-2026-10-08)
- [CLOUD-ENVIRONMENT-RESULT-2026-10-08.md](#cloud-environment-result-2026-10-08)
- [CLOUD-RESOURCE-MANIFEST-2026-10-08.md](#cloud-resource-manifest-2026-10-08)
- [CLOUD-RESOURCE-R1-RESULT-2026-10-08.md](#cloud-resource-r1-result-2026-10-08)
- [D04-CLOUD-REPAIR-2026-10-08.md](#d04-cloud-repair-2026-10-08)
- [D04-CLOUD-RUN-2026-10-08.md](#d04-cloud-run-2026-10-08)
- [D04-CLOUD-SDK-ACCEPTANCE-PLAN.md](#d04-cloud-sdk-acceptance-plan)
- [D04-ORDER-DOCUMENT-SESSION-2026-10-09.md](#d04-order-document-session-2026-10-09)
- [D04-ORDER-WRITE-BUDGET-2026-10-09.md](#d04-order-write-budget-2026-10-09)
- [D04-PROBE-ENVIRONMENT-HANDOFF.md](#d04-probe-environment-handoff)
- [ISSUE-HANDOFF-01-TEST-ENVIRONMENT.md](#issue-handoff-01-test-environment)
- [ISSUE-HANDOFF-02-D04-DATABASE.md](#issue-handoff-02-d04-database)
- [ISSUE-HANDOFF-03-D04-FUNCTION.md](#issue-handoff-03-d04-function)
- [ISSUE-HANDOFF-04-D04-CONCURRENCY-LOGS.md](#issue-handoff-04-d04-concurrency-logs)
- [ISSUE-RESULT-01-TEST-ENVIRONMENT.md](#issue-result-01-test-environment)
- [ISSUE-RESULT-02-D04-DATABASE.md](#issue-result-02-d04-database)
- [ISSUE-RESULT-03-D04-FUNCTION.md](#issue-result-03-d04-function)
- [ISSUE-RESULT-04-D04-CONCURRENCY-LOGS.md](#issue-result-04-d04-concurrency-logs)
- [PHASE-2-CLOUD-REVALIDATION-2026-10-08.md](#phase-2-cloud-revalidation-2026-10-08)
- [PHASE-2-EXECUTION.md](#phase-2-execution)
- [PHASE-2-REVIEW.md](#phase-2-review)

---

<a id="cloud-backfill-tracker-2026-10-08"></a>

## 原记录：CLOUD-BACKFILL-TRACKER-2026-10-08.md

<a id="cloud-backfill-tracker-2026-10-08--全阶段真实云补验收台账"></a>
# 全阶段真实云补验收台账

**2026-10-09：订单写入预算与文档session映射准备完成，幂等回放增加读取保护义务，全套1025/1025；见[session记录](phase-2.md#d04-order-document-session-2026-10-09)。无新增云验收：D04仍PARTIAL，真实provider读取/查询保护、完整预算、正式订单保存、真实丢响应及真机待补。**

**最新D04：独立test能力实验真实16/16、本地1009/1009通过，见[D04复验](phase-2.md#d04-cloud-repair-2026-10-08)。D04整体仍PARTIAL；下文未部署/缺test等准备记录为历史。**

日期：2026-10-08。从 DEVELOPMENT-PLAN.md 的 67 个 Task 逐项登记；离线通过不会自动转为云通过。记录“待执行”不表示实际失败或功能已完成。本窗口只改后端/主流程；UI/环境配置按既有分工交接。

已执行的详细证据见 [阶段一复验](phase-1.md#phase-1-cloud-revalidation-2026-10-08)；资源由 [分批清单](phase-2.md#cloud-resource-manifest-2026-10-08) 控制。未取得真机/test/经营/商户条件的门禁保留。最小链路及非破坏读验证不要求先新建第二环境；需要与开发数据隔离的破坏/并发/恢复/资金场景另行准备，不能复用 EnvId 假装两个环境。

<a id="cloud-backfill-tracker-2026-10-08--阶段一"></a>
## 阶段一

最新事实：R1、真实users创建/复读、三集合客户端读拒绝及复用实例鉴权修复已完成本轮复验，见[阶段二记录](phase-2.md#phase-2-cloud-revalidation-2026-10-08)。全套971/971；阶段整体仍PARTIAL。下一项[D04验收安排](phase-2.md#d04-cloud-sdk-acceptance-plan)，不将单用户事务提交当成多文档/并发/回滚通过。

后续代码准备：D04 SDK文档事务基础层及9项本地契约通过，全套更新 **980/980**、静态357；未部署该基础层或执行云故障/竞争，D04仍PARTIAL。独立test未确认，当前环境查验与精确分工见D04安排。

最新D04推进：独立验收服务/入口/打包、16项场景断言、微信原生并行执行器已准备，新增20项本地契约，全套1000/1000、静态366。未部署或云实验；环境窗口精确资源/索引/配置清单已交付，见[D04交接](phase-2.md#d04-probe-environment-handoff)。正式订单、完整谓词保护/预算/实际网络丢响应仍NOT_RUN。

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| I01 | 仓库盘点、旧流程基线与迁移记录；保存 `INITIALIZATION.md` 和审查结果 | 历史本地验收；无新增云操作 | 确认现有 Git，不重复 init；列出旧后端 / 页面 / 数据与新目标差异；19 项旧测试和静态检查结果有记录；首页未提交修改保留 |
| I02 | 工程规范与文档入口；编辑 / 换行规则、cloudfunctionRoot、demo 命令、参考图跟踪规则 | 历史本地验收；无新增云操作 | 配置 JSON 可解析；README 可进入审查 / 计划；参考图不再被忽略，其余临时 artifacts 仍忽略；未创建无实现函数、未批量重写业务文件 |
| I03 | 云开发最小连通 / 身份验证与服务边界；记录 SDK / 运行时 / 部署方式 | 工具云成功/拒绝复验；真机待补 | 开发环境一个真实函数从可信上下文返回本人身份摘要；伪造 event.openid / role 无效；无权限 / 错误环境有可理解报错；客户端无私钥；工具与真机均验证一次 |
| I04 | 统一路由与四 Tab；Home / Shop 分离，order → order-detail、staff → admin；登记未实现购买页 | UI窗口；不改界面 | Home / Shop / Orders / Account 均可真实 switchTab；详情 / 商家旧入口不失效；非 Tab 购买页用合法路由；Bag 不占 Tab；无需新业务即可编译；首页修改迁移结果可审查 |
| I05 | UI Token 与公共 Shell；商品卡、按钮、空态 / 错误态、安全区和官方导航 | UI窗口；跨设备待补 | 品牌家家乐；黑色 CTA；棕色只用于规定点缀；不同宽度与长中文布局无覆盖；Home 不保留无功能 Menu（以用户本轮 UI 修订要求为准）；明确官方 Tab 与悬浮参考图的差异；不批量引入未用组件 |
| I06 | 质量与错误处理基线；统一 requestId / 错误码、脱敏日志、检查入口和兼容版本记录 | 静态/错误关联复验；CLS查询待补 | 检查命令覆盖已落地 JS / JSON / WXML 及注册页面；接口错误可追踪 requestId 且日志无明文电话 / 地址 / 密钥；固定经编译验证的基础库 / 工具基线；失败时退出码非零 |
| I07 | 云函数依赖与共用代码打包策略、环境示例配置 | 独立部署已核对；三项配置拒绝实测；独立环境待补 | 两个实际函数可独立部署并调用同一共用规则；不依赖包外 require；锁定 SDK 依赖；缺环境参数明确拒绝；开发 / 测试 / 生产不会默默串用；只交付脱敏配置示例 |
| I08 | 外部条件和未决政策登记；支付接入路径、素材、门店、配送、容量、售后负责人 | 账号支付能力/经营资料仍待核实 | 将审查第 7 节事项逐项标明来源 / 状态 / 阻塞 Task；核实当前账号可用支付方案并记录结果；未获资料的项目明确标缺失，不使用虚构联系人或默认经营政策 |

<a id="cloud-backfill-tracker-2026-10-08--阶段二"></a>
## 阶段二

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| D01 | 冻结交易 / 状态规则；订单、资金、退款三轴与角色操作矩阵 | 已冻结模型；真实领域接入待后续验证 | 有自提 / 配送正常迁移及待付取消、已付拒单、制作后取消、退款失败、迟到支付处理表；确认全额支付与旧定金隔离；非法迁移与可操作角色有明确错误码；未决经营政策不伪装定稿 |
| D02 | 完整字段字典、关系与金额 / 快照模型；订单行、payments / refunds / logs | R1三集合/规则/索引读回；真实完整默认users已验证；其他业务集合待补 | 每字段有类型、必填、默认、单位、不可变性与隐私归属；金额安全整数分；列出订单商品 / 地址 / 门店 / 时间 / 运费快照；实付、累计退款及总额关系可校验 |
| D03 | 商品规格与购物袋行模型；合法 SKU、逐行留言、最大行数 / 数量 | 经营值与真实目录/库存待补 | 三分类各有一条合法示例；未配置的组合明确不可选；留言不成为 SKU；同 SKU 不同留言可共存；非蛋糕无不适用步骤；说明共享库存或 SKU 独立库存决策 |
| D04 | 幂等、库存预留与原子事务设计；索引、确定性文档 ID 与冲突策略 | PARTIAL：独立test能力实验16/16通过（多文档/并发/逐写回滚/唯一冲突）；正式业务订单、谓词保护、预算与真实丢响应仍NOT_RUN，见D04-CLOUD-REPAIR-2026-10-08.md | 实测所选 SDK 多文档事务可用；库存为 1 两个并发请求仅一个成功；同 owner / command / key 不生成重复结果；事务中断无半条订单；事务预算与购物袋上限有依据；不在事务内调用支付 API |
| D05 | 门店 / 预约 / 配送与资源模型；时区、窗口、提前量、slot 容量与费率 | 可信地图/配置/时段持久化待执行 | 定义自提 / 配送边界条件、禁约日期、营业跨日策略、多商品最大提前量、容量 HELD / CONFIRMED / RELEASED 语义；明确位置来源 / 未定位拒绝逻辑；规则版本可入快照 |
| D06 | 身份、所有权、管理员角色和数据库安全规则 | users落库/复读、三集合客户端读拒绝及当次原生鉴权通过；客户端写/两人业务/角色待补 | 开发环境实际验证：本人可经接口管理自己的地址 / 袋；他人私有读写、价格 / 状态直改、角色自提权均失败；公开读仅暴露在售目录 / 必要门店信息；支付事件与财务集合不可普通直写 |
| D07 | API 契约、错误码、分页及开发种子；模型阶段验收报告 | 真实handler/查询/种子apply待执行 | 契约列出每个 action 的输入 / 输出 / 身份 / 权限 / 幂等 / 错误；有 quote → order → payment 时序；种子限开发环境且可安全重复执行，不删已有数据；索引支持约定查询与分页；模型评审无未关闭 P0 |

<a id="cloud-backfill-tracker-2026-10-08--阶段三"></a>
## 阶段三

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| C01 | 三分类目录种子、素材元数据与云存储引用 | 待执行；先补此前云依赖及本阶段所需资料 | Cake / Mini Cake / Bread 均可读取；商品价格与素材来源明确，缺实拍标开发占位；图片失败有兜底；参考图 / 私钥不进入商品素材；正式图生命周期有快照保留方案 |
| C02 | 商品列表 / 分类 / 分页云接口与 Shop | 待执行；先补此前云依赖及本阶段所需资料 | All 仅含三分类在售商品；分类切换准确；多页排序稳定无重复 / 漏项；下架商品不作为可买商品；空类目 / 请求失败可恢复；无 Filter / 扩充分类 |
| C03 | SKU / 规格配置读取与合法组合判定 | 待执行；先补此前云依赖及本阶段所需资料 | 尺寸 / 口味 / 夹心 / 数量约束均来自数据；测试有合法和非法组合；尺寸切换后旧夹心失效时清除并提示；唯一有效 SKU 与云端价格可定位；不同分类适用规则正确 |
| C04 | 商品详情 / 图集 / 起价 / 收藏入口 | 待执行；先补此前云依赖及本阶段所需资料 | Detail 显示真实目录数据和准确价格含义；按用户2026-10-04指示“选择规格”打开底部弹层；商品下架 / ID 无效 / 图丢失有说明；弹层使用当前C03规格模型，不接旧定金/模拟付款逻辑 |
| C05 | 详情规格弹层与确认结果 | 待执行；先补此前云依赖及本阶段所需资料 | 按用户2026-10-04变更，在详情底部弹层按实际 Size / Flavor / Filling / Message / Quantity 配置；后退不丢有效选择；非蛋糕跳过不适用步骤；留言和数量边界校验；结果输出 SKU、留言、数量，并经本机 Storage 写入/读回后反馈；仅存本机草稿，不声称已写正式 Cart |
| C06 | Home 编排与基础名称搜索 | 待执行；先补此前云依赖及本阶段所需资料 | 分类 / 今日推荐 / 当季 / 系列 / 人气引用同一商品源；名称关键词搜索能找在售商品、空查询回列表、无结果有提示；首页不硬编码价格或新增营销模块；无可用推荐有布局兜底 |
| C07 | 收藏持久化、Favorites / Account 公共入口 | 待执行；先补此前云依赖及本阶段所需资料 | 收藏 / 取消幂等且跨重启保持；账号 A 收藏不出现在 B；下架收藏可移除并标不可买；可从收藏进入 Detail；Account 的订单 / 地址 / 客服 / 门店 / 关于入口有合法目标或明确待接入提示 |
| C08 | 目录域验收与旧探索行为迁移 | 待执行；先补此前云依赖及本阶段所需资料 | 三分类各跑一条完整配置链路；恶意 SKU / 数量 / 非法组合被云端拒绝；页面无 pastries / desserts / drinks / Filter 或 Bag 占位充当正式能力；旧图与控件仅按需复用；静态检查和工具编译通过 |

<a id="cloud-backfill-tracker-2026-10-08--阶段四"></a>
## 阶段四

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| B01 | 获取 / 添加 / 更新 / 删除购物袋行接口 | 待执行；先补此前云依赖及本阶段所需资料 | 云端获取 owner，不接受任意 userId；返回稳定 lineId 与 version；非法 SKU、非整数数量、超限行数失败；A 不能读写 B 的袋；加入不预扣库存 |
| B02 | 相同行合并与独立留言规则 | 待执行；先补此前云依赖及本阶段所需资料 | 同 SKU + 规范化留言 + 门店可按冻结规则合并；不同留言保持两行；合并后数量不超限；重复添加请求沿用键只执行一次；相同价格但不同 SKU 不误合并 |
| B03 | Bag 页面、数量 / 删除 / 勾选、计数与小计 | 待执行；先补此前云依赖及本阶段所需资料 | 非 Tab 页无底部 Tab；显示商品 / 规格 / 逐行留言；增减 / 删除 / 勾选与云端结果一致；数量和金额展示正确；所有入口计数同一数据源；空袋不能结算 |
| B04 | 购物袋版本竞争与网络重试 | 待执行；先补此前云依赖及本阶段所需资料 | 两次基于旧 version 的写入不会覆盖新结果；冲突刷新并提示；提交中有防连点；超时后重试不重复加数量；删除行再重试不会复活旧行 |
| B05 | 商品改价 / 下架 / 缺货 / 规格失效处理 | 待执行；先补此前云依赖及本阶段所需资料 | 重新进入袋复核当前商品；改价明确显示变化；失效行可删、不可选择结算；现行不足库存提示不可购买但袋不声称预留；历史留言不被静默改写 |
| B06 | 勾选结算输入与购物袋验收 | 待执行；先补此前云依赖及本阶段所需资料 | 仅选中有效行形成 Checkout 输入（行 ID / 袋 version）；混合未选行不进订单；3 个不同 SKU / 留言行可持久保存；刷新 / 重启不丢；计算不信任前端；订单创建后的精准移除策略写入契约 |

<a id="cloud-backfill-tracker-2026-10-08--阶段五"></a>
## 阶段五

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| X01 | 地址 CRUD / 默认 / Checkout 选择共用模块 | 待执行；先补此前云依赖及本阶段所需资料 | 本人可新增 / 编辑 / 删除；两个并发设默认后仍最多一个默认；删除默认后的规则一致；Checkout 只选地址不复制维护逻辑；非法电话 / 他人 addressId 失败；订单地址不随以后编辑变化（O02 验证） |
| X02 | 门店 / 履约配置读取与 Pickup 表单 | 待执行；先补此前云依赖及本阶段所需资料 | 展示真实门店信息和可用履约方式；选择门店 / 联系人 / 手机号有校验；Pickup 不要求配送地址 / 不收配送费；停业或自提关闭不能报价；Store / About / 客服内容缺资料时明确说明 |
| X03 | Delivery 地址范围判定与规则读取 | 待执行；先补此前云依赖及本阶段所需资料 | 按已冻结行政区或地理边界云端判断；内部 / 外部 / 边界 / 未定位四种地址行为有用例；改变前端坐标或地区字符串不能绕过权威定位规则；未知地址不进入付款 |
| X04 | 可约日期 / 时间段、提前量与容量展示 | 待执行；先补此前云依赖及本阶段所需资料 | 按门店时区计算；禁约 / 过期 / 窗口外 / 提前量不足不可选；多商品取最大提前量；自提 / 配送时段分开；满额时段不可用；配置变化可刷新；展示可约不承诺已锁定 |
| X05 | 权威报价接口：商品小计、运费、总额、版本 / TTL | 待执行；先补此前云依赖及本阶段所需资料 | 前端伪造单价 / 总额无效；数量乘价用整数分；Pickup 运费为 0、Delivery 费率命中正确；非法时段 / 范围失败；改价或袋版本变化产生新报价；报价含 owner / 行版本 / 履约规则快照 |
| X06 | Checkout 双分支、确认摘要与输入保留 | 待执行；先补此前云依赖及本阶段所需资料 | 切换履约模式清理不适用值并重新报价；显示门店或地址、日期时段、联系人、各行留言、运费与总额；可返回袋修改；过期 quote / 网络错误不会展示付款成功；不生成额外订单级蛋糕留言 |
| X07 | Checkout 提交契约与阶段验收 | 待执行；先补此前云依赖及本阶段所需资料 | 明确后续调用 order.create(quoteId, idempotencyKey) 和 Payment 动作；当前未接通时不可误导为已下单；保存自提 / 配送报价正向和范围 / 提前量 / 改价失败证据；地址 / 时间模块没有重复实现 |

<a id="cloud-backfill-tracker-2026-10-08--阶段六"></a>
## 阶段六

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| O01 | 实现冻结状态机与受控命令：接单 / 制作 / 备妥 / 配送 / 完成 / 取消 | 待执行；先补此前云依赖及本阶段所需资料 | 合法迁移表有参数化验证；普通顾客不能接单、制作、任意指定 nextStatus；未付款不可制作；自提不进入 DELIVERING；非法越级失败且没有日志 / 资源副作用；旧 WAIT_DEPOSIT 等不混入 V1 |
| O02 | 订单创建与不可变快照、唯一订单号、可信总额 | 待执行；先补此前云依赖及本阶段所需资料 | 有效 quote 建 PENDING_PAYMENT，多行快照包含商品 / 图片 / 留言 / 单价及地址 / 门店 / 时段 / 费率；重新读取现行价格和权限；报价变化返回明确冲突重新确认；创建后改商品 / 地址 / 门店不改变快照 |
| O03 | 库存与预约名额原子预留、支付截止时间 | 待执行；先补此前云依赖及本阶段所需资料 | 一个库存 / 一个 slot 名额，两个并发订单仅一个成功；写快照失败资源不占用；数量不足整单拒绝；支付有效期不晚于允许预约边界；记录资源状态与到期时间；部分成功不被当作订单 |
| O04 | 幂等创建与精确移除已下单袋行、超时恢复 | 待执行；先补此前云依赖及本阶段所需资料 | 同 key 同请求反复调用返回同 orderId；同 key 不同请求冲突；订单提交成功响应丢失后可恢复；仅删对应版本已下单行，保留未勾选 / 新加入 / 已修改行；袋同步异常可补偿且不重复创建订单 |
| O05 | 客户待付取消、到期任务、已付拒单 / 取消意图与资源释放 | 待执行；先补此前云依赖及本阶段所需资料 | 未创建支付单可直接取消并释放一次；已创建外部单通过 Payment 关单协调接口等待确认；未知付款保留待处理资源；已制作库存不自动恢复；取消权限及理由合法；重复任务不多释放；与 P04 接通前只验领域协调契约 |
| O06 | Orders 列表 / 分页、详情、CURRENT / PAST 与上下文动作 | 待执行；先补此前云依赖及本阶段所需资料 | A 不能看 B 订单；All / Active / Completed / Cancelled 与退款展示规则准确；分页稳定；PENDING_PAYMENT 只显示去支付 / 取消；PAID 显示待接单，MAKING 才显示制作中；日志时间线与快照一致 |
| O07 | 一次性自提凭证及核销领域规则 | 待执行；先补此前云依赖及本阶段所需资料 | 仅本人已备妥自提单可见凭证；非自提 / 未 READY / 已取消不可核销；管理员 / 门店范围校验；凭证不可由公开订单号推算；重复核销幂等且只完成一次；错误码尝试限速；展示码 / 二维码形式按决策落实 |
| O08 | 配送更新 / 确认收货与订单域验收 | 待执行；先补此前云依赖及本阶段所需资料 | READY → DELIVERING → COMPLETED 遵守冻结角色规则；顾客只能确认本人配送中订单；重复完成不重复消耗资源；失败配送有联系门店路径；两条状态链和并发 / 取消用例通过；PAID 测试事件只在隔离测试环境使用 |

<a id="cloud-backfill-tracker-2026-10-08--阶段七"></a>
## 阶段七

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| P01 | 核实并接入一个支付方案；测试 / 正式模式隔离和商户配置 | 待执行；先补此前云依赖及本阶段所需资料 | 验证实际 AppID / 商户关联与选用方案可下单 / 查单 / 关单 / 退款；凭证云端受控；清楚区分平台代验签与自验签；前端无商户私钥；正式模式不存在 simulate 成功入口；受控实付安排有登记 |
| P02 | 本人订单预支付与复用 / 查单恢复 | 待执行；先补此前云依赖及本阶段所需资料 | 金额 / 商户单号由云端获取 / 生成；他人或已取消 / 已付单不可下单；重复点击复用未决支付单；请求超时先查询而非盲目另建；前端只能获得必要支付参数，不可自定 totalFee |
| P03 | 可信支付通知、业务字段核对与原子入账 | 待执行；先补此前云依赖及本阶段所需资料 | 来源伪造 / 错商户 / AppID / 单号 / 金额 / 币种拒绝并记录异常；同事件及不同事件同 transactionId 不重复入账；资金记录、PAID 与资源确认同事务或有可重试一致性保障；通知重试可安全应答 |
| P04 | 主动查单、超时关单、取消竞争与迟到款补偿 | 待执行；先补此前云依赖及本阶段所需资料 | 回调丢失查单能恢复 PAID；支付 / 取消 / 超时并发不丢资金、不过度释放；外部关单已付结果按实付处理；未知状态继续补偿；已取消订单迟到实付自动登记退款意图并报警，不恢复制作；资源最终一致证据齐全 |
| P05 | 真机唤起微信支付、订单继续支付与品牌成功页 | 待执行；先补此前云依赖及本阶段所需资料 | 前端 success 后再查询后端；PAID 才进成功页；暂未知显示确认中可恢复；用户取消 / 网络失败可回订单重试；成功页展示单号、明细、履约、时段、门店 / 地址，文案为已付款 / 待接单；去支付按钮真实接通 |
| P06 | 全额 / 商家批准部分退款闭环、失败 / 重试与售后状态 | 待执行；先补此前云依赖及本阶段所需资料 | 已付拒单退足实付；其他退款金额按用户确认的商家审批规则；累计成功 + 未决意图占用 ≤ 实付；相同退款键只出一笔；可信结果成功才标已退款；失败仍可查 / 重试；用户无权任意退款；零 / 部分 / 全额及多次部分退款预算均有契约和真实验证 |
| P07 | 支付 / 退款补偿任务、对账和异常告警 | 待执行；先补此前云依赖及本阶段所需资料 | 定时重试未决支付 / 退款；任务重放不重复扣 / 退；实收 / 退款账本与外部记录可核对；金额不符、长时间未知、补偿失败触发可操作告警；运行记录脱敏并含业务单号 / requestId；不将通知当唯一资金证据 |
| P08 | Payment 阶段验收与可复现证据 | 待执行；先补此前云依赖及本阶段所需资料 | 在允许实付的隔离环境完成至少一笔受控真实小额付款及退款，并核对实际资金；覆盖失败 / 取消 / 重复 / 丢通知 / 并发关单 / 晚到款；19 项旧测试保持通过或有说明；新支付用例通过；无未关闭资金 P0 |

<a id="cloud-backfill-tracker-2026-10-08--阶段八"></a>
## 阶段八

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| A01 | 初始管理员受控授权、入口、角色与撤销 | 待执行；先补此前云依赖及本阶段所需资料 | 本人可信身份命中受控角色才显示入口；普通用户直接打开页面 / 调函数仍拒绝；用户不能自写角色；撤销后下一次敏感操作即时拒绝；门店范围明确；授权 / 撤销留审计，旧 staff PIN 不进入 V1 |
| A02 | 商家订单列表 / 接单 / 制作 / 备妥 / 配送 / 完成 / 拒单 | 待执行；先补此前云依赖及本阶段所需资料 | 状态列表含新已付订单、各履约阶段及取消退款；动作按领域规则执行；两位管理员同时接单仅一次有效迁移；已付拒单触发退款意图；订单缺字段 / 资源异常有清楚提示而非任意改状态 |
| A03 | 自提码输入 / 扫码核销交互 | 待执行；先补此前云依赖及本阶段所需资料 | 合法码定位可核销订单后确认完成；错码 / 已核销 / 取消 / 他店码均按规则处理；重试不二次核销；确认页显示必要摘要；不靠前端查码后直接修改订单状态 |
| A04 | 基础商品 CRUD / 分类 / SKU / 图 / 上下架 / 价格 / 库存 | 待执行；先补此前云依赖及本阶段所需资料 | 三分类限制、合法组合与整数分价格云端校验；调低库存不得低于已占用资源；改价 / 下架触发袋和 quote 失效规则但不改变历史订单；被快照引用图片不随意删；非法组合不能保存；每次改动有 actor / version |
| A05 | 门店 / 营业 / 禁约 / 时段容量 / 配送边界与费率编辑 | 待执行；先补此前云依赖及本阶段所需资料 | 修改有版本与云端校验；容量不能降到已占用以下；关闭时段不删除已确认订单；未来可约和报价刷新，历史快照保持；边界 / 费用 / 停业异常配置被拒绝；真实资料与测试资料不混淆 |
| A06 | 取消 / 退款异常查看、重试与审计入口 | 待执行；先补此前云依赖及本阶段所需资料 | 有权限者能看退款处理中 / 失败及补偿异常并按规则重试；重试不另退一笔；顾客不能调用；理由、操作者与结果可追踪；电话 / 地址只在有业务需要的页面展示，不写完整日志 |
| A07 | Admin 域验收与新旧入口退役清单 | 待执行；先补此前云依赖及本阶段所需资料 | 受权商家可从接单完整走自提核销和人工配送；商品 / 门店改动反映到客户侧；普通用户全部敏感动作被拒；明确旧 staff / server 接口不进正式购买链路；保留遗留回归依据，不在此 Task 批量删除演示代码 |

<a id="cloud-backfill-tracker-2026-10-08--阶段九"></a>
## 阶段九

| Task | 原计划交付 | 本轮真实状态 | 原计划验收依据 |
|---|---|---|---|
| Q01 | 干净环境构建 / 函数独立部署 / 权限与配置核验 | 待执行；先补此前云依赖及本阶段所需资料 | 在全新测试环境按文档复现；各实际函数依赖完备；索引与规则有效；正式路径无 localhost / 演示客户 / PIN / 模拟支付；发布配置恢复适用安全校验；所需云权限及配额有记录 |
| Q02 | Golden Path A / B：多行购买、真实支付、商家履约 | 待执行；先补此前云依赖及本阶段所需资料 | 自提从 Home 配置到核销 Completed；配送从地址范围 / 时段到本人或受权商家确认 Completed；成功页 / Orders / Account 状态一致；支付金额与云端报价一致；客服 / 收藏 / 地址入口可用；记录完整脱敏链路 |
| Q03 | 并发与幂等联合验收 | 待执行；先补此前云依赖及本阶段所需资料 | 最后一份库存 / 最后一个时段，多个并发请求最多一单占用；重复下单不增单；回调 / 关单 / 取消并发最终收款退款及预留一致；双管理员动作不重复日志 / 核销；失败时资源计数可解释 |
| Q04 | 权限与攻击输入回归 | 待执行；先补此前云依赖及本阶段所需资料 | 两个顾客互查 / 改袋 / 改地址 / 查订单失败；伪造 openid / role / 价格 / nextStatus / 回调失败；管理员撤销与门店范围有效；取餐码猜测限速；财务与角色集合不能客户端直写 |
| Q05 | 时间 / 配送 / 报价 / 商品边界和弱网恢复 | 待执行；先补此前云依赖及本阶段所需资料 | 覆盖跨午夜、提前量临界、禁约 / 窗口外、范围边界 / 未定位、满额、SKU 下架 / 改价 / 删除地址、长中文与超量；弱网重复点击、后台恢复、付款后断网能查回真实状态；不会因错误提示重复扣款 |
| Q06 | 开发者工具 + iOS / Android 真机 UI 与微信能力 | 待执行；先补此前云依赖及本阶段所需资料 | 四 Tab、独立购买页、胶囊 / 安全区、窄屏 / 长中文 / 滚动 / 键盘无遮挡；黑白 Token 与真实图一致；支付 / 客服及必要权限说明实际可用；工具显示主包 / 分包符合实施时官方阈值；截图与设备 / 版本可复查 |
| Q07 | 支付对账、故障补偿、备份恢复与回退演练 | 待执行；先补此前云依赖及本阶段所需资料 | 正常 / 未决 / 退款资金均能对账；停用任务再恢复不重复资金动作；测试备份在独立环境恢复且可读完整快照 / 日志；日志脱敏；告警有负责人和处理步骤；回退后仍可处理未决支付，不能回退为演示收款 |
| Q08 | V1 验收报告、缺陷闭环与发布准备清单 | 待执行；先补此前云依赖及本阶段所需资料 | `QA_REPORT.md` 逐项列结果 / 环境 / 证据；零未关闭资金 / 越权 / 丢单 P0；其他缺陷有范围和处理决定；真实素材、门店信息、售后 / 隐私、客服、平台当前资质与审核资料已核对；形成可供用户审阅的发布清单，本 Task 不自动发布 |

<a id="cloud-backfill-tracker-2026-10-08--后续执行纪律"></a>
## 后续执行纪律

依次补事实/实现/验收，允许不依赖阻塞项的后端准备先行，不跨过整阶段门禁宣称完成。每次实际调用记录环境、SDK、请求标识、断言和副作用；真机/资金/并发分别记录。不导入正式数据，不自动授予管理员，不发布或推送。新证据只更新对应行和执行记录；旧失败证据保留。

---

<a id="cloud-environment-handoff-2026-10-08"></a>

## 原记录：CLOUD-ENVIRONMENT-HANDOFF-2026-10-08.md

<a id="cloud-environment-handoff-2026-10-08--云环境配置交接与主流程补验收"></a>
# 云环境配置交接与主流程补验收

**主流程最新回写：环境问题01–03已复核；后端并发/唯一冲突及执行器问题由本窗口独立解决，SDK能力实验16/16通过，见[D04修复复验](phase-2.md#d04-cloud-repair-2026-10-08)。当前没有新的环境窗口执行项；D04整体仍PARTIAL，日志服务缺口仍在，工具绑定已恢复development。下文“当前问题03”等为历史。**

**当前单项：执行[问题 03：D04 函数与受控主体配置](phase-2.md#issue-handoff-03-d04-function)。问题 02 数据库配置经主流程复核通过；只准备验收入口，不写 probe 数据，实验由主流程执行。下文“问题 02 当前执行”已属历史。**

**最新安排：问题 01 经主流程复核关闭，test=`dinner-cook-test-d5e320u981ec341`。本轮仅执行[问题 02](phase-2.md#issue-handoff-02-d04-database)中的三个测试集合、规则与唯一索引；D04 综合清单中的函数/主体配置留到问题 03。旧的缺 test 及问题 01 等待安排保留为历史。**

**最新执行边界：用户要求问题一个一个处理。本轮仅执行[问题 01：独立 test 环境准备](phase-2.md#issue-handoff-01-test-environment)，完成或阻塞后回报主流程并停止。下文 D04 集合、索引、函数配置留到问题 02，待主流程复核 01 后再交接。**

日期：2026-10-08（Asia/Hong_Kong）。工作目录：`D:\dinner cook`。

<a id="cloud-environment-handoff-2026-10-08--窗口分工"></a>
## 窗口分工

**后续交接覆盖历史任务**：账号/配置/R0部署与R1资源已完成，本窗口已更新user/store鉴权、接通users真实落库并完成工具复验，详见[最新云验收](phase-2.md#phase-2-cloud-revalidation-2026-10-08)。无需再重配AppID、部署旧包、重复建R1或清空用户。当前要补真机user.me/store.health与设备/微信版本，以及[D04安排](phase-2.md#d04-cloud-sdk-acceptance-plan)中的独立test环境创建/关联；资源/索引待主流程给出精确执行清单，R2–R5仍不批量执行。密码/私钥不需要提供。两个development验收函数仅按精确名称在后续发布准备时退役，不现在自动删除。

用户最新指示：本窗口负责主流程、后端代码，以及此前因云环境缺失而未执行的真实验收。UI、字体、动效和环境配置由其他窗口处理。本文件是环境配置窗口的任务单；不代表这些任务已经完成。

后续D04精确任务已给出，见[D04-PROBE-ENVIRONMENT-HANDOFF.md](phase-2.md#d04-probe-environment-handoff)：独立test、三个空probe集合/规则、receipt复合唯一索引、单个Event函数及限时原生主体白名单。主流程验收包/原生执行器已准备，本地1000/1000通过，尚未部署；不要依据历史“资源清单尚未给出”重复等待，也不要创建R2–R5正式业务集合。

保留现有全部未提交和未跟踪文件。先核对 Git 状态，不重置、不清理、不覆盖其他窗口成果；本任务不要求提交、推送或上传小程序。UI 窗口按用户单独要求工作，涉及视觉时遵循根目录 AGENTS.md 与 UI-TYPOGRAPHY.md。

<a id="cloud-environment-handoff-2026-10-08--最初已确认事实及边界历史快照"></a>
## 最初已确认事实及边界（历史快照）

| 项目 | 2026-10-08 核查结果 |
|---|---|
| 正式小程序 AppID | `wx154f791a17268ace`，用户提供认证截图 |
| 开发环境 EnvId | `cloudbase-d8gwtxzm64150b7e0`；名称 cloudbase；用户确认已关联 |
| 平台关联 | 微信 CLI 的 cloud_env_list 实际返回上述环境 |
| 平台函数 | cloud_fn_list 实际返回 total=0，尚未部署 user/store |
| 工具登录 | 状态查询提示 loginExpired=true；只读环境查询成功，部署前需重新登录并核验 |
| 匿名访问 | 用户截图为关闭；保持关闭，小程序使用微信原生身份 |
| 本地工程配置 | project.config.json 已为新 AppID；runtime-config.js 仍为旧 AppID、shell/development、三个环境 ID 空；config.local.js 不存在 |
| 配置生成器 | scripts/configure-local.js 默认 AppID 仍为旧值，直接运行可能写回旧 AppID |
| 可部署入口 | 只有 user/store；客户端仅允许 user.me/store.health；业务服务仍为离线实现 |

以上证明环境存在和关联，不证明函数运行、数据库索引、安全规则、真实订单或支付已验收。独立 test/production 环境尚未确认。

实际使用的工具：`D:\微信web开发者工具\wechatide.cmd`，CLI v0.3.11。只读查询示例：

```powershell
& 'D:\微信web开发者工具\wechatide.cmd' -c Codex cloud_env_list --appid wx154f791a17268ace
& 'D:\微信web开发者工具\wechatide.cmd' -c Codex cloud_fn_list --appid wx154f791a17268ace --env cloudbase-d8gwtxzm64150b7e0
& 'D:\微信web开发者工具\wechatide.cmd' -c Codex check_wechatide_status --skill-version 0.3.11
```

<a id="cloud-environment-handoff-2026-10-08--环境配置窗口任务"></a>
## 环境配置窗口任务

2026-10-08 补充：账号/AppID/开发环境登录条件已由环境窗口反馈齐备，不再要求用户提供密码或密钥；真实部署/调用结果按返回证据更新，不能从条件齐备推断成功。主流程已提供 [分批资源清单](phase-2.md#cloud-resource-manifest-2026-10-08)：当前最小链路不需要数据库；下一批可准备 R1 三个空集合及规则/索引，R2–R5 暂不执行。该清单明确补充下文原先“资源清单另行提供”的范围。

1. 阅读 [总交接](../../HANDOFF.md)、[阶段一记录](phase-1.md#phase-1-execution)、[云函数说明](../../../cloudfunctions/README.md) 和适用云开发技能；重新核对文件及账号状态。旧记录中“未开通”是历史情况，不能覆盖上面的新证据。
2. 修正配置生成器的旧 AppID 来源，统一 project.config.json 与生成配置；建议读取当前项目 AppID，避免另一个写死默认值。沿用已有公开字段白名单与校验，不把密钥放入小程序或提交文件。
3. 建立本机忽略的配置，仅将已确认 EnvId 对应 development。不得把同一环境复制到 test/production，不编造环境 ID；已有本地配置应先读取并保留有效内容。
4. 与 UI 窗口协调验证方式。共享工作区默认保持 shell，以免正在修改的本地商品、购物袋和地址预览被 cloud 门禁中断。用隔离副本或明确协调的临时配置验证 cloud，完成后恢复共享默认值并记录结果。
5. 恢复微信开发工具登录。查阅实际 CLI --help，再操作 cloud_fn_deploy 等命令。核对平台支持的 Node 运行时与 SDK；本地 Node 版本不能作为云端运行时已支持的证据。
6. 仅准备并部署 user/store 两个最小事件函数。每个函数独立安装锁定依赖（现有 wx-server-sdk 4.0.2），核对 scripts/prepare-cloud.js 复制的 shared/runtime.js；该脚本不是业务函数部署生成器。设置 JJL_APP_ID、JJL_CLOUD_ENV、JJL_STAGE=development，并检查实际生效值；不新增公开 HTTP 或匿名访问入口。
7. 在真实小程序上下文调用 user.me/store.health，记录可信平台身份路径与配置校验结果。验证事件伪造 openid/role 不会授予身份或商家权限；可信上下文与配置不匹配应拒绝。需要错误配置验证时使用隔离测试配置，不干扰共享环境。开发工具调用和真机调用分别记录，未执行的项目写 NOT_RUN。
8. 交付脱敏证据：时间、AppID/EnvId、实际运行时与 SDK 版本、函数部署状态、调用结果/请求标识、配置恢复状态、仍阻塞项目。不要写完整 OPENID、电话、令牌、密钥或包含敏感变量的原始函数详情。

此交接不要求创建业务集合、导入正式商品、授予管理员、删除云数据、调用支付退款，或开放订单/payment/admin 客户端白名单。数据库设计与后端适配由主流程窗口负责；后续确需环境窗口执行的资源清单另行提供。部署须遵循执行窗口实际审批与技能要求；遇到登录或权限问题报告具体错误，不把查询成功写成部署成功。

<a id="cloud-environment-handoff-2026-10-08--返回主流程窗口的验收单"></a>
### 返回主流程窗口的验收单

- [ ] 配置生成器不再写回旧 AppID；公开配置一致，无秘密泄漏。
- [ ] 开发环境关联复核；独立测试环境可用性明确记录。
- [ ] user/store 部署及实际依赖、运行时核验完成。
- [ ] 微信原生调用成功；身份/配置拒绝路径有证据。
- [ ] 真机结果单列；共享 shell 配置与 UI 开发恢复。
- [ ] I03/I07 每项记录通过、失败或 NOT_RUN，不以本地测试代替云验收。

<a id="cloud-environment-handoff-2026-10-08--主流程窗口补齐顺序"></a>
## 主流程窗口补齐顺序

| 顺序 | 补齐范围 | 完成依据 |
|---|---|---|
| 1 | I03/I07：接收最小云链路证据 | 配置、独立函数运行、原生调用及拒绝路径；尚未全部完成 |
| 2 | D02–D07，重点 D04/D06 | 真实 SDK 数据适配、集合/唯一索引/安全规则、完整查询条件、越权负读、当前权限、事务限制及失败处理 |
| 3 | C/B/X 云端业务链路 | 商品/SKU、购物袋、地址、营业与预约、可信配送距离和报价；沿用现有页面契约，UI 修改交其他窗口 |
| 4 | O03，再 O04–O08 | 真实订单原子保存、报价一次消费、唯一性、库存与独立时段占用、逐写失败回滚、丢响应重试；随后恢复/取消/查询/核销/配送 |
| 5 | P01–P08 | 商户及唯一支付接入方式确认后补真实验签/查询/恢复；资金验收需单独受控安排，合成支付不能作为成功依据 |
| 6 | A01–A07，再 Q01–Q08 | 真实管理员与权限撤销、经营操作/审计/恢复，随后发布构建、真机、并发、运维验收 |

先补原阶段真实门禁，再判断下一阶段可否通过。Q01 的离线构建准备可以开展，但不能绕过前面实际验收。[订单验收矩阵](../../ORDER-CLOUD-ACCEPTANCE.md) 与 [支付验收矩阵](../../PAYMENT-CLOUD-ACCEPTANCE.md) 保持未执行项，不直接修改 cloudVerified/realAcceptance 等标记。

订单关键验收需在隔离测试资源中执行：真实持久化读回；同 key/同报价及不同 key/同报价竞争；唯一订单号；最后库存、最后自取/配送容量；全部写入点失败回滚；超时后原 key 返回同一订单。原子范围包括报价消费、订单/明细、库存与时段资源、日志/回执，以最终事务设计为准。

既定履约政策继续沿用：每天 08:00–21:00、30 分钟时段、自取 3 单/配送 1 单且独立计算；门店自行配送、20 km 含边界、费用 0、预计时间段。提前量、未来预约窗口、保留时长、正式库存/目录、地图可信坐标、核销策略等未确认值按 [外部条件登记](../../EXTERNAL-DEPENDENCIES.md) 补齐，不自行采用测试值发布。

最近 A07 的 937/937、静态 310、SVG 41 是 2026-10-06 离线记录，本轮没有重跑，也不代表 2026-10-08 当前工作区或云环境已通过。

<a id="cloud-environment-handoff-2026-10-08--可复制给环境窗口的指令"></a>
## 可复制给环境窗口的指令

> 请阅读 D:\dinner cook\docs\CLOUD-ENVIRONMENT-HANDOFF-2026-10-08.md 和 docs/HANDOFF.md，保留所有现有未提交改动。你只负责配置一致性、微信工具登录、开发云环境及 user/store 最小链路的部署与验证；UI/动效及订单/支付/管理员业务实现由其他窗口负责。按交接任务记录真实证据，未执行项保留 NOT_RUN，共享工程默认保持 shell。不要提交推送、上传小程序、删除云数据、导入正式经营数据或操作真实资金；交付完成项和具体阻塞，供主流程补 I03/I07 与数据层验收。

<a id="cloud-environment-handoff-2026-10-08--环境窗口执行结果2026-10-08"></a>
## 环境窗口执行结果（2026-10-08）

详见 [独立交付记录](phase-2.md#cloud-environment-result-2026-10-08)：配置一致、共享 shell、微信登录、user/store 独立部署及云包 SDK/运行时核验已完成；管理端缺可信身份拒绝有证据。第三轮真实原生 user.me/store.health、伪造身份不提权及无效请求拒绝通过，模拟网络阻塞已解除；真机及云端错误配置项 NOT_RUN；I03/I07 不标整体通过。最终状态以该记录和脱敏 QA 文件为准。

---

<a id="cloud-environment-result-2026-10-08"></a>

## 原记录：CLOUD-ENVIRONMENT-RESULT-2026-10-08.md

<a id="cloud-environment-result-2026-10-08--开发云环境与-userstore-交付记录2026-10-08"></a>
# 开发云环境与 user/store 交付记录（2026-10-08）

**最新结果：第三轮重试网络已恢复 wifi，真实微信模拟器 user.me/store.health、伪造身份保持 customer/同一用户、无效 action/payload 拒绝均通过；此前 network offline 阻塞已解除。真机与云端错误配置项仍 NOT_RUN，I03/I07 整体不标通过。**

时间范围：2026-10-08 10:20–10:36（Asia/Hong_Kong）；以各 JSON 的 ISO 时间戳为准。工作目录 D:\dinner cook。只负责配置、工具登录、开发环境与两个最小函数；不代替主流程的数据层/订单/支付/管理员验收。

<a id="cloud-environment-result-2026-10-08--已完成"></a>
## 已完成

- 配置生成器从 project.config.json 读取并校验 AppID；本机显式 AppID 不一致时拒绝，保留公开字段白名单、环境隔离与 legacy 门禁。旧 AppID 不再是默认来源。
- 新建 Git 忽略的 miniprogram/config.local.js；仅 development=cloudbase-d8gwtxzm64150b7e0，test/production 留空。生成 runtime-config.js 为 wx154f791a17268ace、development/shell、enableLegacyDemo=false；共享工程全程未切 cloud。
- 微信 CLI v0.3.11，登录状态 loginExpired=false、versionRelation=equal，无需重新扫码。cloud_env_list 返回确认开发环境；部署前 cloud_fn_list total=0。
- npm 不在 PATH，使用已有 pnpm 临时执行固定 npm@10.9.4。user/store 分别 npm ci --ignore-scripts --no-audit --no-fund，均 exit=0、102 个包；保留各自既有 lockfile。首次 pnpm --store-dir 参数不支持，改用 --config.store-dir 后成功，不把失败计作成功。
- prepare-cloud.js 已同步两份 shared/runtime.js；包外 _shared 不是部署依赖。
- wxide 部署帮助未提供 runtime/envVariables 参数，使用已登录且绑定正确 EnvId 的 CloudBase MCP 创建 user/store（只创建这两个 Event 函数）。Nodejs20.19、index.main、timeout=10 秒，JJL_APP_ID/JJL_CLOUD_ENV/JJL_STAGE 实际回读均为上述 AppID/EnvId/development；两个函数 Active/Available、CodeResult=success、无触发器。未新建 HTTP 路由或改变匿名登录配置。
- 从平台下载代码包，在内存检查实际 wx-server-sdk=4.0.2，两个云包内 shared/runtime.js 与源文件逐字一致；仅保存版本、SHA 和公开配置，不保存下载 URL 或原始云详情。
- 本地配置隔离验证 7/7；现有 cloud.test.js 7/7；当前静态检查 321 文件通过，主包/features/legacy 源估算 1392/153/45 KiB；git diff --check exit=0。这些是本地证据，不是云身份或数据层验收。

部署请求 ID：user ff5a8fa3-4bcc-4f83-bc53-0b1a62acfc25；store 1fb775ce-32f8-4416-98e6-f41584e63cbe。配置回读与包摘要见下列 JSON。

<a id="cloud-environment-result-2026-10-08--已执行云端拒绝验证"></a>
## 已执行云端拒绝验证

管理端 invokeFunction 使用实际部署包，但没有微信原生调用者身份。user 事件伪造 openid/OPENID/APPID/ENV/role 与 payload.role，结果 AUTH_REQUIRED；store 健康调用携带伪造身份同样 AUTH_REQUIRED。两次平台 InvokeResult=0 表示代码执行成功，业务 ok=false 表示正确拒绝；不记为 user.me/store.health 原生成功。

| 函数 | 平台请求 ID | 业务 requestId | 结果 |
|---|---|---|---|
| user | d98bd714-1f63-47b4-b80a-fb8f1d66dbf3 | 9172e3e0-8109-45cd-804c-3449a15f9f00 | AUTH_REQUIRED |
| store | ab61fe92-73cc-484a-a63b-f3793cb52cf0 | 5f4ff3f1-0377-4a10-b523-c4009c0b4d8e | AUTH_REQUIRED |

<a id="cloud-environment-result-2026-10-08--原生验证历史阻塞与最新结果"></a>
## 原生验证、历史阻塞与最新结果

隔离工程 artifacts/cloud-env-validation-20261008（项目名 user-store-cloud-validation）复用实际 services/cloud.js 和 errors.js，独立 cloud 配置，仅一个验收页；不复制或改写共享商品/购物袋/地址 UI，不上传小程序。首次 automation_evaluate 异步调用超时；编译打开页面后以 onLoad 实际调用，再同步读取结果，运行时可读。

wx.getNetworkType 实际返回 networkType=none、weakNet=true。控制台 cloud init error: network offline 和 webapi_getwxaasyncsecinfo:fail network offline。user.me 返回脱敏 CLOUD_CALL_FAILED、client-muyx59p7-w6qkbnht；没有云端原生 requestId，不认为成功。用户回复已切正常网络后复核仍 none，重编译再次失败 client-muyxc25a-6avax4xp；已请用户确认隔离窗口的模拟网络设置。没有用 mock 或伪造平台身份绕过。

| 交接验收项 | 当前状态 | 证据/缺项 |
|---|---|---|
| 配置一致/公开字段/共享 shell | PASS | config-verification.json |
| 微信工具登录/开发环境关联 | PASS | wechat-status.json；实际 cloud_env_list |
| user/store 独立部署/运行时/SDK/共享规则 | PASS | cloud-evidence.json、两份 package-verification.json |
| 云端无可信身份且事件伪造身份拒绝 | PASS（管理端） | 两次 AUTH_REQUIRED，不能替代原生身份路径 |
| 工具原生 user.me | PASS | 第三轮真实 wx.cloud 调用 authenticated=true、role=customer |
| 工具原生 store.health | PASS | 第三轮真实 wx.cloud 调用 available=true、development、正确 EnvId |
| 可信微信上下文下伪造身份仍 customer | PASS | role=customer、sameSubject=true；平台请求 ID 已记录 |
| 可信上下文与 AppID/EnvId 不匹配拒绝 | NOT_RUN | 本地回归通过；未改变共享云函数配置做故障测试 |
| 云端缺配置拒绝 | NOT_RUN | 本地回归通过；未改正常开发函数制造故障 |
| 真机 user.me/store.health/拒绝路径 | NOT_RUN | 用户真机操作待补；未上传预览/小程序 |
| 独立 test/production 环境 | NOT_RUN / 未确认 | 当前关联查询只有开发环境，不复制 EnvId、不创建额外环境 |
| 集合/索引/安全规则/SDK 事务与越权 | NOT_RUN | 未获资源清单且属主流程后续验收 |
| 正式经营数据/订单/支付/管理员 | NOT_RUN | 不在本窗口范围 |

I03/I07 保持整体未验收；主流程可接收已完成的配置/部署/依赖与真实无身份拒绝证据，真机、错误配置与独立环境隔离验收仍须补齐。数据库设计/适配不因两个函数已部署而通过。

<a id="cloud-environment-result-2026-10-08--证据与恢复"></a>
## 证据与恢复

- [公开部署与云调用](../../qa/cloud-env-2026-10-08/cloud-evidence.json)
- [配置验证](../../qa/cloud-env-2026-10-08/config-verification.json)
- [本地/静态/原生状态](../../qa/cloud-env-2026-10-08/local-and-native-summary.json)
- [微信登录](../../qa/cloud-env-2026-10-08/wechat-status.json)
- [user 包核验](../../qa/cloud-env-2026-10-08/user-package-verification.json)、[store 包核验](../../qa/cloud-env-2026-10-08/store-package-verification.json)
- [首次原生失败](../../qa/cloud-env-2026-10-08/native-call-result.txt)、[用户切网后复核](../../qa/cloud-env-2026-10-08/native-after-network-change.txt)

共享工程配置保持 development/shell，新 AppID 与项目一致；隔离工程保留供切网后复验，不会修改共享本机存储。原有未提交/未跟踪文件保留，未 reset/clean/stash/提交/推送；本次未修改 UI、动效、订单/支付/管理员实现或客户端 allowlist，未创建业务集合/导入经营资料/删除云数据/授予管理员/操作真实资金。

CloudBase code-review：按 SEC001 检查两个最小 handler，仅记录 code/requestId/stage，不回显完整上下文/事件/环境；微信身份保持 getWXContext 原生路径，未引入 Web/匿名身份替代。

运行时参考：[CloudBase 官方函数配置](https://docs.cloudbase.net/cli-v1/functions/configs)推荐 Nodejs20.19；实际结果以平台回读和云包为证，不以本机 Node 版本推定云支持。

<a id="cloud-environment-result-2026-10-08--用户要求重试后的复核"></a>
## 用户要求重试后的复核

时间：2026-10-08T02:38:54.981Z（UTC，对应 Asia/Hong_Kong +08:00）。初次只读网络查询提示 cant find runtimeid by projectpath；编译打开隔离验收页后运行时已恢复。再次实际查询仍 networkType=none、weakNet=true；原生 user.me 再次 CLOUD_CALL_FAILED，client requestId=client-muyxg9up-oq85r666。store.health 与身份/配置原生拒绝项仍 NOT_RUN；不把工具编译成功当作云调用成功。证据 [本轮结果](../../qa/cloud-env-2026-10-08/native-retry-2.txt)。共享配置经核对仍 development/shell。

<a id="cloud-environment-result-2026-10-08--第三轮重试原生链路通过"></a>
## 第三轮重试：原生链路通过

时间：2026-10-08T02:42:17.156Z（UTC，Asia/Hong_Kong 为 +08:00）。用户要求再次重试；重新编译隔离验收页后，getNetworkType=wifi、weakNet=false，实际 services/cloud.js 调用 user.me/store.health 均成功。无 mock/伪造可信上下文；handler 使用 wx-server-sdk.getWXContext()。事件伪造 openid/role 无效，customer 与正常调用 subjectHash 一致（证据仅保存 sameSubject=true，不保存用户标识）；无效 action/admin 与 payload 数组均 INVALID_REQUEST。

| 项目 | 业务 requestId | 平台请求 ID / 结果 |
|---|---|---|
| user.me | dd7d70d4-bb8e-409f-8af7-af3352c86d4f | 客户端包装未透传平台 ID；authenticated=true、customer |
| store.health | 6abeba1f-5e5a-4110-8fb9-310b084b09d7 | 客户端包装未透传平台 ID；available=true、development、正确 EnvId |
| 伪造身份 | 676bcf5f-f03c-424e-a439-d3ce44e063c6 | 84a1cb39-0d6e-48fc-bc89-5e129c41807e；customer、sameSubject=true |
| 无效 action | b58055bb-0540-40f0-ba02-2584f126e5d2 | e0cc1b10-ef5d-4c9c-a7c0-f36c3a0490a4；INVALID_REQUEST |
| 无效 payload | 58b879e5-01e7-414e-8e6a-5920730372ed | 54687261-76d1-43ac-82a6-50ac6438c0d3；INVALID_REQUEST |

[完整脱敏断言与结果](../../qa/cloud-env-2026-10-08/native-verified-summary.json)、[原生工具返回](../../qa/cloud-env-2026-10-08/native-retry-3.txt)、[网络状态](../../qa/cloud-env-2026-10-08/network-retry-3.txt)。历史失败记录保留，当前网络阻塞已解除。真机、可信 AppID/EnvId 不匹配与缺配置的云端拒绝、独立 test/production、数据层验收均未执行，保留 NOT_RUN。共享配置仍 development/shell；没有上传/提交/推送/云数据或资金操作。

---

<a id="cloud-resource-manifest-2026-10-08"></a>

## 原记录：CLOUD-RESOURCE-MANIFEST-2026-10-08.md

<a id="cloud-resource-manifest-2026-10-08--主流程云资源清单分批创建与验收"></a>
# 主流程云资源清单：分批创建与验收

日期：2026-10-08。来源：[数据模型](../../DATA_MODEL.md)、[事务与候选索引](../../TRANSACTIONS.md)、[权限契约](../../AUTHORIZATION-RULES.md)。本文件交给环境窗口执行资源配置；不表示已创建资源或通过云验收。

<a id="cloud-resource-manifest-2026-10-08--r0最初-userstore-最小链路历史范围"></a>
## R0：最初 user/store 最小链路（历史范围）

**初始R0集合0、业务索引0、种子记录0。** 当时user/store仅验证平台身份；后续R1已准备，user.me已接入真实users事务，见[最新复验](phase-2.md#phase-2-cloud-revalidation-2026-10-08)。不能手填users代替可信原生创建。真机最小链路仍不需要正式商品或管理员。

开发 EnvId `cloudbase-d8gwtxzm64150b7e0`、AppID `wx154f791a17268ace`。无需再索取账号密码、私钥或令牌。待提供独立已关联 test EnvId，不能复用 development。真机记录由操作人填写手机型号/系统、微信版本、时间、两函数成功或失败结果及脱敏请求标识；未执行保持 NOT_RUN。

<a id="cloud-resource-manifest-2026-10-08--r1数据与权限适配的首批空集合"></a>
## R1：数据与权限适配的首批空集合

环境窗口可在已核验 development 环境准备下面三个**空集合**；不导入记录，不授予管理员。先读取现有结构：已有同名集合只核对，不删除、不重建、不覆盖规则。若存在业务数据、规则或索引差异，先回报差异，由主流程明确迁移方案。

| 集合 | 新集合客户端规则 | 新建索引规格 | 用途 |
|---|---|---|---|
| users | read=false、write=false | `uq_user_identity`：environment ASC、appId ASC、openId ASC；unique=true | 原生身份稳定映射；确定性 _id 与复合唯一性均需验证 |
| admin_roles | read=false、write=false | `ix_role_subject_status`：subjectId ASC、status ASC；unique=false | 当前用户授权加载；门店范围/capabilities 由服务端完整验证 |
| audit_logs | read=false、write=false | 暂只保留平台默认 _id 索引，不新增查询索引 | 后续受控身份/授权变更审计；写入与事务设计由主流程实现 |

以上为逻辑规格，**不是工具可直接上传的 JSON**。执行窗口须核对实际管理工具字段、索引能力及构建完成状态；不支持复合 unique、字段顺序不一致或构建失败时，保持阻塞并报告，不能降为普通索引后写“唯一已验收”。不删除平台默认索引。audit_logs 查询索引在真实查询适配冻结后给出。

每个新集合的规则分别设置为平台接受的拒绝客户端读写规则（逻辑为 `{"read":false,"write":false}`），并读取确认；[security-rules.draft.json](../../../cloudfunctions/database/security-rules.draft.json) 带有项目元数据与 create/update/delete 草稿字段，**不能整份作为平台规则上传**。平台语法/操作由环境窗口实际核验，不以本文件推断部署成功。

规则阻止普通客户端直连；服务端 SDK 仍须自行鉴权，不能据此宣布越权防护完成。索引只提供查询/唯一约束，不提供权限。主流程下一步实现可信平台身份→users 的 create-if-absent 与读取、当前角色加载及事务中的权限有效性校验；不能用 subjectHash 作为用户主键。

R1 返回证据：EnvId、三个集合是否原已存在、规则实际读回、索引字段/方向/unique/状态、创建时间及错误码。不打印集合文档或完整 OPENID。主流程真实 SDK 写读/并发验收另行记录。

<a id="cloud-resource-manifest-2026-10-08--r2r5后续范围登记当前不执行"></a>
## R2–R5：后续范围登记，当前不执行

以下完整业务集合来自现有模型，便于估计范围；尚未冻结实际 SDK 查询和索引，**不能一次性创建并导入 fixtures**。每批开始前主流程补具体字段、索引方向、唯一语义、测试资源和清理清单。

| 批次 | 集合 | 索引/约束重点 |
|---|---|---|
| R2 目录/个人数据/门店 | categories、products、skus、favorites、carts、addresses、stores、store_config、media_assets | 分类 code 唯一、店内发布配置版本唯一、本人收藏/购物袋唯一；发布状态/owner/store 过滤与稳定分页；SKU 合法组合与素材引用 |
| R3 报价/订单/资源 | checkout_quotes、orders、order_items、order_logs、cancellation_requests、reservations、slot_inventory、inventory_resources、idempotency_records | 订单号唯一、报价一次消费、同单明细/资源预留唯一、同店同模式时段唯一、同主体命令 key 唯一；最后库存/时段及逐写回滚 |
| R4 支付/退款 | payments、refunds、payment_events、refund_attempts、payment_test_budgets | 商户范围业务号及可信平台号去重；事件去重、未决预算与尝试序号；null/未决记录唯一语义需验证，不盲建全字段 unique |
| R5 运营查询与发布 | 复用上述集合，不额外猜建集合 | 当前角色撤销、审计分页、真实扫描/任务租约、必要查询索引与发布包验证 |

支付 provider/商户/environment 的唯一范围需接入方案明确后冻结；不能把尚未发生支付的 null 平台交易号建成错误唯一约束。订单、资源及角色的确定性 ID 仍须真实 create-if-absent/事务冲突验收。缺失文档查询、读取集保护、事务预算都不能由索引存在推断。

<a id="cloud-resource-manifest-2026-10-08--测试数据和清理边界"></a>
## 测试数据和清理边界

- R0/R1 配置阶段不写业务数据。真实用户由可信微信上下文适配创建；不手写管理员，不把测试 fixture 的 ownerId 当平台身份。
- 独立 test 环境未确认前，不执行最后库存/容量竞争、逐写故障、角色撤销竞争或资金实验。仅环境结构准备和最小链路验证不受此影响。
- test 验收使用专用 runId、固定测试主体、测试门店/商品/资源及逐文档清单，业务字段沿用真实 schema；审计不能泄漏电话/地址/OPENID。具体数据生成器由主流程提供，不从 tests/fixtures 直接全库导入。
- 测试数据只用于受控 SDK 验收，不发布到正式目录，不启用真实经营或支付。合成 PAID/退款记录只能证明模型路径，不能算实付/退款证据。
- 当前 development-seed 只支持 development，不能改 stage 来在 test 强行运行。其五条 DRAFT 计划也没有真实 executor；R2 若落库，须先完成 create-if-absent/逻辑唯一/整批事务适配，不能在控制台手工批量导入代替。
- 保持无默认清库操作。验收结束仅凭 runId 与精确文档清单提出受控清理方案；不按集合全删、不按模糊前缀删、不清用户历史/审计。

<a id="cloud-resource-manifest-2026-10-08--当前分工及下一步"></a>
## 当前分工及下一步

更新：R1与真实身份创建/读取、客户端读拒绝已完成本轮复验，无需重复创建/清空用户/改规则。实查users=1、admin_roles=0、audit_logs=0。下一项[D04安排](phase-2.md#d04-cloud-sdk-acceptance-plan)，test配置交环境窗口，精确资源清单由主流程冻结后再执行；下段为最初分工。

环境窗口：完成 R0 的真机/工具证据，准备 R1 空集合/规则/索引并返回差异；独立 test EnvId 由环境负责人补齐。主流程窗口：实现并测试真实身份/数据库适配，补 D04/D06 实际验收，再冻结 R2/R3 和真实订单原子保存方案。UI/动效仍交其他窗口。

资源清单准备不等于数据层验收。当前 I03/I07 真机、D04 SDK/事务/唯一性、D06 当前权限/越权负读和订单持久化均保留待执行状态。

<a id="cloud-resource-manifest-2026-10-08--环境窗口-r1-执行回执"></a>
## 环境窗口 R1 执行回执

2026-10-08：三个空集合已创建，客户端 read/write 全拒绝规则已读回；两个指定索引的字段顺序/方向/unique 已读回。平台默认还提供 _openid_1，已按要求保留。显式索引构建状态未返回，SDK 唯一/事务/权限与原生拒绝验收不据此标通过；本轮原生读验证受微信工具 APPID_ERROR 阻塞。详见 [R1 独立结果与脱敏证据](phase-2.md#cloud-resource-r1-result-2026-10-08)。未导入或写入数据、未授权管理员、R2–R5 未执行。

---

<a id="cloud-resource-r1-result-2026-10-08"></a>

## 原记录：CLOUD-RESOURCE-R1-RESULT-2026-10-08.md

<a id="cloud-resource-r1-result-2026-10-08--r1-空集合规则与索引执行结果2026-10-08"></a>
# R1 空集合、规则与索引执行结果（2026-10-08）

来源：[主流程资源清单](phase-2.md#cloud-resource-manifest-2026-10-08)。环境 cloudbase-d8gwtxzm64150b7e0，AppID wx154f791a17268ace，ap-shanghai，实际 RuntimeBackends.nosql=true、postgresql/mysql=false。以下只证明资源结构准备，不代表 D04/D06、真实身份落库或业务验收通过。

<a id="cloud-resource-r1-result-2026-10-08--执行与回读"></a>
## 执行与回读

执行窗口时间约 2026-10-08 10:50–10:55（Asia/Hong_Kong）；证据保存时间 2026-10-08T02:52:25.458Z（UTC）。三个集合先前均不存在：微信和管理端列表均 total=0。平台创建成功；本轮没有写入文档。

| 集合 | 原已存在 | 规则实际回读 | 指定业务索引实际回读 | 回读文档数 |
|---|---|---|---|---|
| users | 否 | CUSTOM，read=false、write=false | uq_user_identity：environment ASC → appId ASC → openId ASC，Unique=true | 0 |
| admin_roles | 否 | CUSTOM，read=false、write=false | ix_role_subject_status：subjectId ASC → status ASC，Unique=false | 0 |
| audit_logs | 否 | CUSTOM，read=false、write=false | 未新增业务查询索引 | 0 |

创建请求：users 35600c8c-de5e-4fc1-a7ae-c5998c08409a；admin_roles a30fe39e-85ea-472a-8b21-ce3b2b94a8b5；audit_logs 6445d2af-fade-4cd4-8631-6c00d1b5e32a。索引创建请求：users 96aca127-6e44-4ecc-aa3c-97343fa33707；admin_roles e486c4e8-f43e-4084-ae8d-702bd2c55883。各项成功，未收到云 API 错误码。最终列表请求 50b7abd6-33c7-47af-80af-202617bb1af9。

<a id="cloud-resource-r1-result-2026-10-08--差异和验收限制"></a>
## 差异和验收限制

1. 平台创建集合时默认生成 _id_ 和 _openid_1 两个索引。audit_logs 的实际 IndexCount=2，users/admin_roles 各为3；_openid_1 不是本窗口额外添加。遵守清单“不删除平台默认索引”，全部保留，未为 audit_logs 猜建业务查询索引。
2. 两个指定索引已在 describeCollection/listIndexes 读回，字段顺序、Direction="1"、Unique 标志严格一致，Size=8192；未降为普通索引。工具未提供显式 Building/Ready/Failed 状态，构建完成状态仍需控制台或受控 SDK 确認，不虚报已完成构建验收。Accesses.Since 是平台返回的访问统计起始时间，不当作精确集合创建时间。
3. 工具对默认 _id_ 返回 Unique=false；不修改该索引，不用该字段证明 _id 的 create-if-absent/并发语义。确定性 _id 与复合唯一性仍由主流程实际 SDK 验证。
4. 原生客户端只读拒绝验证尝试在数据库执行前被微信工具 APPID_ERROR 阻断：Cannot read properties of undefined (reading '0')；编译隔离页同样报错。该项 NOT_RUN（工具阻塞），不能当作权限拒绝成功。记录见 [工具失败](../../qa/cloud-resource-r1-2026-10-08/client-read-denial.txt)。没有继续写操作或模拟返回。

管理入口接受并回读了 {"read":false,"write":false}。按官方规则，create/update/delete 继承 write；这里只核验配置，服务端仍须可信身份及当前角色鉴权。[规则文档](https://docs.cloudbase.net/database/security-rules)、[索引 API 字段](https://cloud.tencent.com/document/product/876/127964)。

<a id="cloud-resource-r1-result-2026-10-08--返回主流程"></a>
## 返回主流程

可继续实现可信平台身份 → users 的稳定映射/create-if-absent，以及 admin_roles 当前授权加载。不要用当前 user.me 的追踪 subjectHash 当用户主键，也不要手填 users/管理员伪装落库完成。

保持 NOT_RUN：实际 SDK 写读与复合 unique 冲突/并发、确定性 _id、跨集合事务/回滚/权限有效性、客户端越权负读与直写、角色撤销竞争；R2–R5；真机与独立 test 环境。索引显式构建状态未取得。这些不能由空集合/规则/索引存在替代。

[完整脱敏资源证据](../../qa/cloud-resource-r1-2026-10-08/resource-evidence.json)保存创建/规则/索引请求标识、实际回读及差异。没有打印集合文档或完整 OPENID、没有导入资料/授予管理员/删除数据/资金操作。未改 UI、业务 handler、草稿规则文件或主流程实现；共享配置核对仍 development/shell。既有未提交改动全部保留，无提交/推送/上传。

---

<a id="d04-cloud-repair-2026-10-08"></a>

## 原记录：D04-CLOUD-REPAIR-2026-10-08.md

<a id="d04-cloud-repair-2026-10-08--d04-并发唯一冲突与执行器复验"></a>
# D04 并发、唯一冲突与执行器复验

日期：2026-10-08。此轮全部由主流程本窗口完成，没有调用子 agent 或向其他窗口派发任务；保留现有未提交改动，未修改 UI、development 业务资源或已部署 user/store。

**结果：隔离 SDK 能力实验 16/16 通过；D04 整体仍 PARTIAL。**

<a id="d04-cloud-repair-2026-10-08--修复及真实证据"></a>
## 修复及真实证据

1. 事务适配层此前把操作阶段的 `DATABASE_TRANSACTION_CONFLICT` 转为通用错误，底层 SDK 因失去精确 code 无法触发冲突重试。现在将明确冲突标记交还 SDK；每次回调仍重建读取缓存，耗尽重试后返回固定脱敏错误。已安装 SDK 的 `@cloudbase/database/dist/commonjs/transaction/index.js` 明确按此 code 重试，wx-server-sdk 的 transaction 包装调用该底层实现。
2. wx-server-sdk 将实际重复键错误包装为 `DATABASE_REQUEST_FAILED/-502001`。适配层补充识别明确 `DATABASE_DUPLICATE_WRITE`、原生数字11000或完整 `E11000 duplicate key error` 标记；通用请求失败、普通duplicate字样或不完整E11000仍失败，不作为唯一冲突证据。依据：[MongoDB错误码](https://www.mongodb.com/docs/manual/reference/error-codes/)、[CloudBase重复写错误](https://docs.cloudbase.net/error-code/DATABASE_DUPLICATE_WRITE)。本次真实响应归一为 `CLOUD_UNIQUE_CONFLICT`，诊断为 `MONGO_DUPLICATE_KEY/-502001`，且回读证明两个不同_id只有第一条存在。
3. 测试入口仅返回固定provider分类、数字错误码、操作类别和尝试次数，不输出原始消息、用户身份、凭证、event或context。主流程检视了鉴权和敏感数据路径。
4. 微信工具读取曾中断，后续取得明确 `cant find runtimeid by projectpath`。停止继续修改业务补丁，重新打开/编译隔离工程，确认 wx.cloud 与运行实例恢复。执行器新增每进程唯一ticket和启动防重入，工具失败最多三次重试；重试同一浏览器启动不会重新发云请求，结果读取也不重发。云请求失败或ticket丢失直接停止。

本地：[1009/1009全套及源码哈希](../../qa/d04-cloud/local-transport-20261008/report.json)、[测试输出](../../qa/d04-cloud/local-transport-20261008/tests.txt)。静态381个文件，主包/features/legacy源估算1392/153/45 KiB；实际包大小以微信编译为准。新增测试覆盖SDK重试后重读、冲突耗尽脱敏、明确/非明确重复键、诊断脱敏、丢启动回复不重发、轮询恢复、云失败不重发、三次工具上限及非法DSL。

<a id="d04-cloud-repair-2026-10-08--云实验"></a>
## 云实验

- test：`dinner-cook-test-d5e320u981ec341`，上海，同 AppID `wx154f791a17268ace`。
- 单个 Event 函数：`jjl-d04-probe`，Nodejs20.19、SDK4.0.2；代码更新回读 Active/Available、CodeResult=success，无触发器。
- 最终run：`d04-transport-1791448249568`；授权截止香港17:07:14.200保持不变，受控原生主体未改变，不自动延期。
- 最终[真实微信云证据](../../qa/d04-cloud/native-1791448816127.json)：55个响应，16断言全部通过，errorCode=null，transportRetries为空，执行器exit=0。
- 通过：7写原子占用、prepare不清零、7个逐写故障回滚、同键并发一次占用、原键重放、同键异参拒绝、最后库存/时段竞争、自取3与配送1独立容量、复合唯一冲突。
- 唯一实验：第一条平台requestId `9000a016-2919-4fea-974a-5ce7408363e9`；第二条 `6302bd0b-1d0d-41a8-a056-447af5e5431e` 返回明确冲突。没有把任意写失败改为成功断言。

保留历史证据：首轮12/16为 `native-1791443939898.json`；并发修复15/16为 `native-1791447378118.json`；工具中断部分记录为 `native-1791446851841.json`、`native-1791447898898.json`、`native-1791448386901.json`。最终run曾在只读START时无任何响应，恢复运行实例后重新执行时先回读确认空资源；未清零旧run，不删除任何测试文档。

<a id="d04-cloud-repair-2026-10-08--仍未验收"></a>
## 仍未验收

这些记录为能力实验的 OPERATION/LOG/RESERVATION，不是正式订单。正式orders/order_items/order_logs保存、完整读取集和查询谓词保护、平台事务预算及购物袋上限、真实断网丢响应、真机、客户端实际读写拒绝均不由16项实验覆盖，保持 NOT_RUN。日志旧接口已下线，新日志服务未启用/未就绪的阻塞仍存在，未购买或开通CLS。

下一步继续 D04 的正式业务事务适配及独立验收，不能直接宣布阶段二或订单链路完成。

工具已恢复 development `cloudbase-d8gwtxzm64150b7e0` / ap-shanghai，auth(status)实际回读READY。共享小程序配置不改，无删除、管理员授权、支付、Git提交推送或上传发布。

---

<a id="d04-cloud-run-2026-10-08"></a>

## 原记录：D04-CLOUD-RUN-2026-10-08.md

<a id="d04-cloud-run-2026-10-08--d04-首轮真实云实验"></a>
# D04 首轮真实云实验

**后续已修复并复验：能力实验16/16通过，见[D04修复记录](phase-2.md#d04-cloud-repair-2026-10-08)。以下12/16保留为首轮真实失败记录；D04整体仍PARTIAL。**

环境：dinner-cook-test-d5e320u981ec341，微信模拟器原生 wx.cloud；SDK4.0.2。run：d04-20261008070714200-ba2d4765。

**结果：12/16通过，D04未通过。** 原始证据：[native-1791443939898.json](../../qa/d04-cloud/native-1791443939898.json)。执行器exit=1，errorCode=null表示已完成全部断言并有失败项，不能解释为执行成功。

通过：七写原子占用、不重置已有占用、七个逐写点故障回滚、同键并发一次占用、原键重放、同键异参拒绝。

失败：stock-last-race、slot-last-race、independent-pickup-delivery-capacity、compound-unique-conflict。竞争失败请求出现 CLOUD_DOCUMENT_OPERATION_FAILED；部分请求与回读已有正常资源占用/售罄响应，但不能以这些局部事实通过整项。unique第二个不同文档ID插入也返回通用错误，未得到明确 CLOUD_UNIQUE_CONFLICT，不从拒绝写入推断唯一冲突原因。

当前先处理[问题04：并发错误取证](phase-2.md#issue-handoff-04-d04-concurrency-logs)，唯一错误随后单项安排。保留所有run测试文档及证据，不清零、不清理、不重跑旧run。环境配置问题01–03已复核通过；后端和真实验收由主流程负责。

正式业务订单保存、完整查询谓词保护、事务预算、真实断网丢响应、真机和客户端实际读写拒绝均未由本次能力实验验收，不更新为通过。本轮未修改UI、development、正式业务数据或支付资源。

---

<a id="d04-cloud-sdk-acceptance-plan"></a>

## 原记录：D04-CLOUD-SDK-ACCEPTANCE-PLAN.md

<a id="d04-cloud-sdk-acceptance-plan--d04-真实-sdk-验收安排"></a>
# D04 真实 SDK 验收安排

**最新状态：SDK_CAPABILITY_PASS / D04_PARTIAL。独立test及验收入口已准备，主流程真实16/16通过，本地1009/1009；见[D04复验](phase-2.md#d04-cloud-repair-2026-10-08)。本文下方PREPARED/NOT_RUN、缺test等为历史准备记录；正式订单持久化/查询谓词/预算/真实丢响应及真机仍未通过。**

日期：2026-10-08。依据 DEVELOPMENT-PLAN D04、TRANSACTIONS 与 ORDER-CLOUD-ACCEPTANCE。本轮用户映射只证明真实读取/首次事务提交，不等于订单保存或资源并发通过。当前状态 **PREPARED / NOT_RUN**。

<a id="d04-cloud-sdk-acceptance-plan--交环境窗口的前置任务"></a>
## 交环境窗口的前置任务

后续实现已落地：cloud-transaction-probe.js、隔离Event入口、prepare-transaction-cloud.js和verify-transaction-native.js；16项断言覆盖多文档/7写点故障/同键重放/资源竞争/模式独立/唯一冲突。已生成独立本地包，**没有部署或云写入**。本地新增20项，全套1000/1000、静态366，见[报告](../../qa/identity-cloud-2026-10-08/local-1791439919289/report.json)。仍为PREPARED/NOT_RUN，代码存在不代表云通过。

原生执行器会在微信运行时发出并行调用，local fixture明确为串行内存；唯一实验只有显式重复标记才可通过，通用错误不冒充唯一冲突。失败保留部分证据，已有run拒绝复用，不清零。实验使用三个probe集合内的简化OPERATION/LOG/RESERVATION，不等于正式业务订单保存；后者及完整读集/谓词/预算/断网场景继续待补。

**环境窗口现在已有精确清单**：[D04测试资源与配置交接](phase-2.md#d04-probe-environment-handoff)。test环境确认后，按该任务单准备三个空probe集合/规则、一个唯一索引与单个Event函数；不按下面历史R3候选列表创建正式集合，不写数据。当前缺test条件，不在development执行实验。

主流程后续已准备 [cloud-document-transaction.js](../../../cloudfunctions/_shared/cloud-document-transaction.js) 作为SDK文档事务基础层：固定集合/可变字段名单、缺记录null读取、add插入且不覆盖、version更新与stats.updated=1回执检查、每次SDK重试独立缓存、存储错误脱敏。没有删除/upsert/任意查询，没有领域鉴权/订单处理器，不复制进现有user/store，不部署。本地SDK形状夹具验证不能证明真实提交保护/唯一性/回滚。订单域的完整读取集和查询谓词保护仍须单独适配和实测。

本地补充9项契约测试通过，覆盖多集合读写形状、受控字段名单/名单快照、重复ID/旧版本/零回执、传输/提交错误、夹具内回滚及读取副本隔离。全套 **980/980**、静态 **357**、git diff --check通过；源包估算main/features/legacy 1392/153/45 KiB。[本地报告](../../qa/identity-cloud-2026-10-08/local-1791438666703/report.json)、[测试日志](../../qa/identity-cloud-2026-10-08/local-1791438666703/tests.txt)。这9项是SDK形状夹具测试，不是云端并发或实际回滚证据。该基础层仅支持受控JSON文档/文档ID与固定变更字段；领域完整schema/授权/查询防幻读不由它提供。

2026-10-08实际环境查验：账号级ap-shanghai列表仅development；ap-guangzhou列表为空；ap-singapore查询AUTH_REQUIRED，不能推断该地域不存在环境。独立test仍未确认，不把未知地域状态写作全局“只有一个环境”。

[环境查验脱敏记录](../../qa/identity-cloud-2026-10-08/d04-environment-inventory.json)。未启动新的登录/建环境/建集合操作，环境配置交既定窗口处理。

提供同一小程序下已创建并关联的独立 **test EnvId**；AppID 使用 wx154f791a17268ace。独立环境有自己的数据库/函数/存储，不是代码里给 development 再起一个名字。最小 development 链路已通过，暂无必要重做。不要提供密码/私钥。

主流程冻结测试执行包及索引后，再给该环境创建精确资源的清单。R3 中 orders/order_items/order_logs/reservations/slot_inventory/inventory_resources/idempotency_records 是相关候选，**本文件不是现在创建全部集合的指令**；实际适配与完整 schema 未冻结前不批量建库、不导 fixtures。不向 development 写测试订单/PAID/退款或修改既有顾客。云函数必须读取真实平台当前调用上下文，复用实例仍关闭伪造身份。

<a id="d04-cloud-sdk-acceptance-plan--主流程逐项执行与通过依据"></a>
## 主流程逐项执行与通过依据

| 次序 | 场景 | 必须保存的实际断言 |
|---|---|---|
| 1 | SDK/运行时基线、缺文档读取与插入语义 | 实际 Node/SDK/EnvId；missing 的真实形状；add 显式 _id 不覆盖；提供商错误不是 missing |
| 2 | 复合唯一约束 | 在独立测试记录上，以不同 _id 插入相同逻辑唯一元组被拒；原记录不变；索引字段/方向/unique 读回；存在索引不足以标通过 |
| 3 | 多文档原子提交 | 订单、行、资源预留、时段、日志、幂等回执同提交；逐条读取真实结果；无半条订单 |
| 4 | 每一写点故障 / 提交失败 | 精确 runId 文档清单和写前/写后计数；所有相关写回滚，原库存/时段/回执不残留；不注入平台业务记录 |
| 5 | 同主体同 command/key 并发、响应丢失重试 | 一笔结果/订单/日志/预留；原键能恢复；同键异参拒绝；不依赖本地串行锁冒充数据库冲突 |
| 6 | 最后 1 份库存 / 最后 1 个时段的并发 | 多个真实并行调用最多一单成功，计数不负、不超容量；另模式时段保持独立；以技术测试资源表达，不替代正式经营值 |
| 7 | 完整读集、缺记录与查询竞争 | 读后竞争修改/新增到提交之间无法绕过版本/唯一/资源约束；SDK 无法保护谓词时冻结守卫记录策略后重验 |
| 8 | SDK 事务预算及最大行数 | 按实际读/写数、字段大小、实际平台限制决定支持范围；超预算拒绝在写前；不得猜官方限额或经营上限 |

测试入口仅限指定 test 环境、受控真实主体和有限 runId，不能由客户端任意提供要故障的业务文档 ID、金额/角色/PAID 状态。事务内不调用支付、地图或其他外部 API。管理端如果没有本次微信身份，不可绕过鉴权充当顾客。

仅用合成测试资源证明资源原子性；不把结果标为真实商品可售、付款成功或经营容量验收。清理须验收后按 **精确文档清单与原版本**形成方案，不按集合全删、不模糊前缀删，保留所需审计。当前没有执行创建、竞争、故障或清理。

<a id="d04-cloud-sdk-acceptance-plan--记录格式与分工"></a>
## 记录格式与分工

每场景保存 AppID/EnvId、SDK/运行时、runId、输入业务摘要、平台/业务 requestId、实际断言、数据副作用及 NOT_RUN 项。不得记录原始 OPENID、电话、地址、环境秘密或支付材料。

环境窗口负责 test 创建/关联与收到冻结清单后的集合/索引/规则操作；本窗口负责 SDK 适配、执行器、故障点、并发调度和真实结果核验。UI/动效窗口无需介入此项。D04 后依次补 D05 配置/地图、D06 私有业务/角色、D07 种子与实际业务网络入口，不跨阶段宣称云验收完成。

---

<a id="d04-order-document-session-2026-10-09"></a>

## 原记录：D04-ORDER-DOCUMENT-SESSION-2026-10-09.md

<a id="d04-order-document-session-2026-10-09--d04-正式订单数据库-session-映射"></a>
# D04 正式订单数据库 session 映射

本轮完成 `cloudfunctions/_shared/order-document-session.js`，连接已有订单服务与文档事务基础层。它是内部服务端模块，没有新增客户端 handler，没有部署或写入云数据。D04 整体仍为 PARTIAL。

<a id="d04-order-document-session-2026-10-09--当前实现"></a>
## 当前实现

- 固定映射 users / idempotency_records / checkout_quotes / stores / store_config / carts / products / skus / addresses / inventory_resources / slot_inventory / orders / order_items / reservations / order_logs。
- 先核验报价所有权，再沿报价关联读取门店、现行配置、本人购物袋、选中行的商品与 SKU、库存、预约时段及配送地址。相同文档读取去重；不读取完整目录、不扫描全部库存、不跟随他人报价继续读取私有引用。
- 读取现行选中行及 SKU 的库存需求，并纳入报价记录的资源需求；由原有报价重验拒绝版本/内容变化，不拿旧报价快照替代当前数据库商品。
- 资源计数通过 versioned update 修改；订单头/明细/预留/日志/回执使用显式新增；报价消费保持 ACTIVE、未消费、未过期、本人同店约束，并将 patch.version 交给基础层统一递增。
- 构造必须传入 `protectReads`、`findOrderByNumber`、正整数 `maxReadDocuments`，缺少任一项直接拒绝。未提供默认 true 或空查询的降级实现。
- 新增 `assertReplayReads` 订单服务义务：幂等回放也必须保护本次读取的用户、回执和订单，不能绕过提交前读取保护。

<a id="d04-order-document-session-2026-10-09--sdk-提供方仍须实现的义务"></a>
## SDK 提供方仍须实现的义务

这些 hook 尚未连接真实 SDK，函数存在不等于通过云验收。

`protectReads(documentSnapshots, conditions, queryPredicates)` 必须使用**同一个事务**，保护所有已读文档的内容/版本和不存在状态直到提交。构造 session 应在每次 SDK 重试回调中重新执行，不能复用前一尝试的读取缓存。不能用立即重新读取或比较版本就声称提交前安全，也不能忽略幂等回放的用户禁用/权限变更。

`findOrderByNumber(orderNo)` 必须在同一事务执行受控精确查询，真实 orders.orderNo 唯一索引仍是最终写入约束。session 将查询条件、结果或空结果提交给 protectReads；完整谓词保护需实际验证，不能只保护已存在的文档。

`maxReadDocuments` 仅限制 session 加载的不同文档数，不包含基础层新增前的缺失检查、查询返回、保护写入或重试，因此不是完整平台事务预算。值必须由服务端配置，测试夹具 50 不是正式上限。

正式 handler 还需绑定原生身份、正确 EnvId、可验证商品图片和配送位置、正式经营配置、部署级限额及错误投影。当前服务输出继续 `cloudVerified:false / checkoutAllowed:false / paymentAllowed:false`。

<a id="d04-order-document-session-2026-10-09--验证"></a>
## 验证

新增 10 项 SDK 形状的本地执行器测试：自取/配送完整 9 次业务写入、9 个故障位置整体回滚、他人报价早期拒绝、读取上限、保护失败、缺配置/伪造 principal、商品变化及他人地址/袋拒绝、无副作用回放、回放保护失败、去重及不加载无关数据、无效订单号查询结果拒绝。

夹具的事务暂存、读取保护和配送可信位置均为显式测试实现，不是云端并发或地图真实性证据。全套 **1025/1025**、静态 **389** 个文件通过；主包/features/legacy源估算1392/153/45 KiB。日志 `qa/d04-cloud/local-session-20261009/tests.txt`。此前 16/16 云探针结果不扩展为本次正式订单通过。

CloudBase 语义复核：本模块无身份/环境/密钥回显，不新增 Web auth guard；复用受控 principal 与 owner 校验。完整读取快照只交给内部提供方，不能进入客户端响应或普通日志。

<a id="d04-order-document-session-2026-10-09--下一项"></a>
## 下一项

先实测真实 SDK 对只读依赖变化和空查询的提交保护，再确定 protectReads 的真实实现和预算；冻结隔离业务集合/索引/规则清单后执行正式订单云验收。不要直接传入 `protectReads:()=>true` 部署本模块。

---

<a id="d04-order-write-budget-2026-10-09"></a>

## 原记录：D04-ORDER-WRITE-BUDGET-2026-10-09.md

<a id="d04-order-write-budget-2026-10-09--d04-正式订单写入预算准备"></a>
# D04 正式订单写入预算准备

本轮补充服务端业务写入清单和前置限额检查；D04 整体仍为 PARTIAL。未部署函数、创建集合、写入云数据或修改 UI。昨日隔离探针授权截止已过，不续用该窗口。

<a id="d04-order-write-budget-2026-10-09--实现及验证"></a>
## 实现及验证

`cloudfunctions/_shared/order-write-budget.js` 统计订单计划中各资源计数更新、预留记录、订单头、明细、日志、报价消费和幂等回执。单明细、一个库存资源加一个时段共 9 次业务写入；每新增明细增加 1 次，每新增库存资源及对应预留增加 2 次。购买数量增加不直接增加明细写入次数。

`order-transaction-service.js` 在第一次业务写入及 `assertCreationReads` 之前检查完整计划，超限抛出固定错误 `ORDER_WRITE_BUDGET_EXCEEDED`。成功回放保持不再写入的路径。部署方通过服务构造参数 `transactionLimits` 配置 `maxWrites`、`maxPayloadBytes`、`maxTotalPayloadBytes`；全部必须为正安全整数，配置在构造时复制冻结，不接受订单客户端传参。

默认 `transactionLimits=null` **只统计，不启用限额拒绝**。尚未确定平台及业务限额，不把测试值 9、100 或字节数用作真实经营限制，也不据此开放购买。

字节数为实际业务写入 JSON 负载的 UTF-8 大小，更新记录只计 patch；不包含 BSON 编码、协议、索引开销、SDK 重试、读取、查询、依赖保护写入及数据库原文档体积。返回统计不含文档 ID、商品或地址内容。因此这不是完整 SDK 事务预算证明，仍须后续适配和云端实测。

新增 6 项测试覆盖多明细/多资源计数、精确边界、三类超限、中文字节数、重复写入目标拒绝、配置验证及冻结、超限先于依赖保护/写入、创建和幂等回放。相关 20 项通过，全套 **1015/1015**；静态 **387** 个文件通过，主包/features/legacy 源估算 **1392/153/45 KiB**。全套日志保存在 `qa/d04-cloud/local-budget-20261009/tests.txt`。

CloudBase 代码复核：SEC001 无环境变量、完整上下文或身份回显；AUTH001 不适用于此次内部订单预算方法，原有可信 principal 校验继续保留。未新增客户端入口或绕过身份、资源、报价校验。

<a id="d04-order-write-budget-2026-10-09--下一步"></a>
## 下一步

1. 完成正式订单 SDK session 映射和明确的逐文档读取集合。
2. 验证用户/商品/配置/购物袋/地址/报价等读取依赖在提交前受保护，不能把本地整个数据库快照保护视为 SDK 实证。
3. 加入 SDK 读取及保护操作预算，确认真实平台限制后决定购物袋上限。
4. 冻结隔离业务测试集合、索引、规则和测试数据清单，再部署新的限时验收入口；正式订单保存、逐写回滚、唯一索引、并发资源占用逐项真实复验。

真实断网丢响应、真机及完整客户端读写权限仍待验收。此前 16/16 是技术探针能力结果，不能代替正式业务订单验收。

---

<a id="d04-probe-environment-handoff"></a>

## 原记录：D04-PROBE-ENVIRONMENT-HANDOFF.md

<a id="d04-probe-environment-handoff--d04-验收包环境窗口精确任务单"></a>
# D04 验收包：环境窗口精确任务单

日期：2026-10-08。来源：[D04计划](phase-2.md#d04-cloud-sdk-acceptance-plan)、本轮SDK基础层与隔离验收执行器。本窗口负责后端及验收；环境窗口负责独立test环境、集合/索引/规则和测试函数配置。本文不表示资源已创建、已部署或云验收通过。

<a id="d04-probe-environment-handoff--前置条件与资源范围"></a>
## 前置条件与资源范围

同一AppID `wx154f791a17268ace` 下已关联的独立test EnvId；不得等于 development `cloudbase-d8gwtxzm64150b7e0`。2026-10-08本轮ap-shanghai实查仍仅确认development。环境创建按用户既有分工处理，不需要密码/私钥。

**仅三个测试集合，不创建正式业务集合，不导入fixtures，不修改development：**

| 集合 | 客户端规则 | 指定索引 |
|---|---|---|
| jjl_d04_probe_resources | read=false、write=false | 仅保留平台默认索引 |
| jjl_d04_probe_records | read=false、write=false | 仅保留平台默认索引 |
| jjl_d04_probe_receipts | read=false、write=false | uq_d04_probe_command：runId ASC、caseId ASC、commandKey ASC，unique=true |

逻辑索引规格须转换为实际管理工具字段；创建后读回字段顺序/方向/unique及平台可用的构建状态。索引存在不等于冲突验证通过。已有同名资源先读取，发现差异/数据先回报；不删除、重建或覆盖，不删除默认_id/_openid索引。普通客户端全拒绝，服务器仍须执行原生鉴权和测试主体白名单。

全部receipt均包含上述三个非空索引字段，避免多个缺失/null值被误用为唯一键；[官方索引说明](https://docs.cloudbase.net/database/data-index)说明唯一字段的空值限制。仅明确的 `DATABASE_DUPLICATE_WRITE` 标记被归一为CLOUD_UNIQUE_CONFLICT；[官方错误定义](https://docs.cloudbase.net/error-code/DATABASE_DUPLICATE_WRITE)将其用于索引键重复。若SDK隐藏该标记，仅返回通用错误，实验保持未通过，不从一次写失败推断唯一索引有效。

<a id="d04-probe-environment-handoff--测试函数与配置"></a>
## 测试函数与配置

函数名：`jjl-d04-probe`，Event/index.main，SDK4.0.2及现有锁文件，云运行时Nodejs20.19。无需HTTP入口或定时触发器。不部署到development/production，不修改已通过的user/store。

源码：[transaction-probe.js](../../../scripts/cloud-checks/transaction-probe.js)，依赖包准备：[prepare-transaction-cloud.js](../../../scripts/prepare-transaction-cloud.js)。本轮已生成忽略的 `artifacts/d04-cloud-probe/functions/jjl-d04-probe`；脚本只创建本地独立包，目录已存在时拒绝覆盖，不意味着部署完成。部署需安装锁定依赖，并确认Active/Available与代码结果。

| 变量 | 服务端配置依据 |
|---|---|
| JJL_APP_ID | wx154f791a17268ace |
| JJL_CLOUD_ENV / JJL_TEST_ENV | 两者为同一个已核验独立test EnvId |
| JJL_STAGE | test |
| JJL_DEVELOPMENT_ENV | cloudbase-d8gwtxzm64150b7e0，服务强制与test不同 |
| JJL_PROBE_RUN_ID | 本轮唯一16–48位字母/数字/_/-；整个实验固定，重开实验换新run，不覆盖旧数据 |
| JJL_PROBE_EXPIRES_AT | 操作人限定的验收授权截止时间，Unix毫秒；过期后包括重试均拒绝，不自动延期 |
| JJL_PROBE_USER_ID | 受控操作人的可信原生identityFromPlatform完整64位稳定用户ID；不得填客户端自称ID或把第一个访客自动授权 |

主体配置步骤：先在隔离微信工程原生调用 `{action:'probe',payload:{operation:'identify',caseId:'atomic'}}`。此操作仅在正确test配置/有限run/未过期条件下返回当前调用人的稳定subjectId，**无数据库读写，不建立授权**。环境操作人核对该原生调用是指定验收人后，把其ID配置到JJL_PROBE_USER_ID。普通访客即使能读取本人ID，也不能通过prepare/hold/read/unique白名单。不要让客户端修改配置，不存储/回显OPENID或环境秘密。

<a id="d04-probe-environment-handoff--主流程如何执行"></a>
## 主流程如何执行

环境配置完成、原生验收人已授权后，本窗口在隔离微信工程编译并确认wx.cloud可用；共享UI工程保持现状。已有独立工程 `artifacts/cloud-env-validation-20261008` 可由环境窗口按test范围准备，执行器不写入项目配置。

运行命令（占位参数须替换为实际值）：

```powershell
node scripts/verify-transaction-native.js --project="D:\dinner cook\artifacts\cloud-env-validation-20261008" --test-env=ACTUAL_TEST_ENV --run-id=ACTUAL_UNIQUE_RUN_ID
```

脚本拒绝development EnvId、共享根工程、错误AppID和不合法参数。首个read核对服务端runId与全新atomic场景，再写入固定测试文档；旧run已有资源时拒绝，不清零或接着覆盖。并行场景在**微信运行时**通过Promise.all同时发出wx.cloud.callFunction，而非在本地串行队列伪装云并发。结果记录平台/业务requestId、限定输入、公开回读、失败及断言；中途失败保留已收到的部分证据。

16项断言：7写点原子占用、prepare不清零、7个逐写故障回滚、同键并发一次占用、原键重放、同键异参拒绝、最后库存/时段竞争、两种履约容量独立、复合唯一冲突。read每次只读固定8文档；命令0–7、固定场景与模式，客户端不能选任意业务文档/失败点/价格/库存。实际平台事务预算尚未测得，不以8读/7写宣称官方限额。

测试records保存的是OPERATION/LOG/RESERVATION能力实验记录，**不是正式orders/order_items/order_logs**；不会出现付款成功或可购买反馈。原键重放不等于已测试断网丢响应；真实业务订单保存、完整查询谓词保护、事务预算与网络丢响应仍在结果中标NOT_RUN。

<a id="d04-probe-environment-handoff--交付和清理"></a>
## 交付和清理

环境窗口返回test EnvId/地域/关联、三个集合规则读回、唯一索引规格/状态、函数运行时/SDK/部署状态及脱敏请求标识。只配置资源与指定原生主体，不写测试数据；主流程执行器随后写自己的run范围。

不自动清理。每次read返回精确collection/_id/exists/version；实际存在的文档及原版本汇总后才能提出逐文档清理清单。潜在ID或模糊run前缀不是已存在文档的删除授权。保留必要证据/审计，不删除用户或其他run。函数后续按精确名称退役，不加入生产业务目录。

---

<a id="issue-handoff-01-test-environment"></a>

## 原记录：ISSUE-HANDOFF-01-TEST-ENVIRONMENT.md

<a id="issue-handoff-01-test-environment--问题-01独立测试云环境准备"></a>
# 问题 01：独立测试云环境准备

日期：2026-10-08。状态：待环境窗口执行；主流程暂不推进下一项。

主流程复核更新：已收到[问题 01 回报](phase-2.md#issue-result-01-test-environment)及查询证据，目前 `BLOCKED`：没有独立 test，当前 MCP 创建接口不提供 NoSQL，UI 操作进程启动失败。已要求环境窗口检查 CloudBase CLI 的受支持替代入口，仍只处理问题 01；未通过验收，问题 02 不启动。

用户要求：问题一个一个处理，其他窗口解决后同步给主流程。此次只交接独立 test 环境；D04 集合、索引、函数及实验留到问题 02。

用户随后明确授权：“你直接指挥‘验证开发云环境最小链路’窗口，我给你完整权限。”主流程可直接派发任务、要求修正、核验回报并按顺序交接下一项，无需用户中转消息。该协调授权不改变每一项任务的操作边界；平台确有付费选择或自动审批阻塞时，回报实际情况。

<a id="issue-handoff-01-test-environment--接手窗口和已知事实"></a>
## 接手窗口和已知事实

- 执行窗口：**验证开发云环境最小链路**（`01a11950-f667-7903-bc6e-971eaf9a4a6e`）。
- 回报窗口：**项目推进主流程**（`01a101b8-2f61-70e1-95fb-6e30056bd0e1`）。
- 工作目录：`D:\dinner cook`；保留全部未提交、未跟踪改动。
- 小程序 AppID：`wx154f791a17268ace`。
- 已确认 development：`cloudbase-d8gwtxzm64150b7e0`，上海地域，NoSQL。
- 目前未确认独立 test EnvId。已查询上海只有 development；不能据此断言整个账号所有地域均无其他环境。
- development 的 user/store 和 R1 资源已有真实验收，不重复部署、不清空数据。

独立测试环境指拥有独立数据库、函数和存储资源的另一云环境，并关联同一个小程序 AppID。把 development EnvId 同时填入 test 配置不能实现隔离。

<a id="issue-handoff-01-test-environment--此次唯一任务"></a>
## 此次唯一任务

1. 阅读本文件及 `CLOUD-ENVIRONMENT-HANDOFF-2026-10-08.md`，核对当前 Git 状态、平台登录和现有环境列表。
2. 如已有适用的独立测试环境，核验后复用；如没有，准备创建并关联独立测试环境。实际操作若要求用户确认具体套餐、付费或登录操作，报告平台呈现的具体选择及阻塞，不能猜测或替用户作未授权选择。
3. 验证实际 EnvId 与 development 不同、环境可用、数据库为项目需要的 NoSQL，并验证微信小程序 `wx154f791a17268ace` 的关联列表包含该环境。若模式不符，回报问题，不自行迁移或改变项目数据库方案。
4. 将证据和结果写入下述回报文件；只在确认满足条件后标记 `READY_FOR_MAIN_REVIEW`，由主流程复核后关闭问题。

优先使用显式 EnvId 查询。需要切换工具当前环境时记录切换前后绑定，避免其他窗口误操作 development；不改共享小程序运行配置来完成验证。不需要提供账号密码、密钥或经营资料。

<a id="issue-handoff-01-test-environment--操作边界"></a>
## 操作边界

本次不创建业务或 probe 集合、索引、规则，不部署函数，不运行事务写入实验，不改 UI/动效或共享运行配置，不授予管理员、不接支付、不删除资源、不提交或推送 Git、不上传或发布小程序。不得覆盖其他窗口改动。若环境创建自带默认资源，仅如实记录，不额外清理。

`D04-PROBE-ENVIRONMENT-HANDOFF.md` 是后续资源清单，**本次只作为背景阅读，不执行其中集合、索引、函数及配置任务**。

<a id="issue-handoff-01-test-environment--验收与回报"></a>
## 验收与回报

回报文件：`docs/ISSUE-RESULT-01-TEST-ENVIRONMENT.md`。
证据目录：`docs/qa/issue-01-test-environment/`。保存必要的平台查询结果或脱敏截图；不写入密码、密钥、访问令牌或无关个人资料。

回报必须包含：

| 字段 | 必须说明 |
|---|---|
| 状态 | `READY_FOR_MAIN_REVIEW` 或 `BLOCKED`；不能自行写成主流程已验收 |
| 环境 | 实际 test EnvId、名称、地域、可用状态、数据库模式 |
| 隔离 | test EnvId 与 development 不同的证据 |
| 关联 | 同 AppID 的微信关联查询及证据路径 |
| 操作 | 复用还是新建、实际新增或修改了哪些资源 |
| 工具绑定 | 操作前后当前环境，是否恢复，是否影响其他窗口 |
| 未解决事项 | 具体阻塞和所需用户动作；没有则明确写无 |
| 验收边界 | D04 云事务、唯一冲突、资源竞争及故障回滚仍为 `NOT_RUN` |

完成或阻塞后，向主流程同步一次简要结果、回报文件和证据路径，随后停止，不自行执行问题 02。人类用户在主流程已明确授权“让其他窗口去解决问题，解决完和你同步进度”；可读取主流程最新用户消息核实回报授权。若跨窗口回报工具不可用，先完成共享回报文件，并在本窗口最终回复说明。

<a id="issue-handoff-01-test-environment--顺序"></a>
## 顺序

| 顺序 | 内容 | 当前安排 |
|---|---|---|
| 01 | 独立 test 创建或复用、关联及就绪证明 | 本次唯一执行项 |
| 02 | D04 三个 probe 集合、唯一索引与单个验收函数配置 | 等主流程复核 01 后再交接 |
| 后续 | D04 真实实验及其他阶段云补验收 | 主流程按计划逐项安排 |

真机验证、正式经营资料和支付配置等其他未完成事项此次不并行派发。环境就绪不等于业务云验收通过。

---

<a id="issue-handoff-02-d04-database"></a>

## 原记录：ISSUE-HANDOFF-02-D04-DATABASE.md

<a id="issue-handoff-02-d04-database--问题-02d04-测试数据库资源配置"></a>
# 问题 02：D04 测试数据库资源配置

日期：2026-10-08。状态：待环境窗口执行。

问题 01 已经主流程复核关闭。此次只准备 D04 的三个集合、安全规则及一个唯一索引；函数部署和原生验收主体配置留到问题 03，事务实验由主流程执行。

<a id="issue-handoff-02-d04-database--执行范围"></a>
## 执行范围

执行窗口：验证开发云环境最小链路。回报主流程：`01a101b8-2f61-70e1-95fb-6e30056bd0e1`。

唯一目标：`dinner-cook-test-d5e320u981ec341`，上海地域，NoSQL，同 AppID `wx154f791a17268ace`。development `cloudbase-d8gwtxzm64150b7e0` 不作任何修改。

先读 `D04-PROBE-ENVIRONMENT-HANDOFF.md` 的数据库部分，核对实际目标 EnvId。管理工具如须切换绑定，先记录绑定并避免与其他窗口冲突，完成后恢复并验证 development 绑定。共享小程序配置不改。

| 集合 | 客户端安全规则 | 索引 |
|---|---|---|
| jjl_d04_probe_resources | read=false、write=false | 保留平台默认索引 |
| jjl_d04_probe_records | read=false、write=false | 保留平台默认索引 |
| jjl_d04_probe_receipts | read=false、write=false | uq_d04_probe_command：runId ASC、caseId ASC、commandKey ASC，unique=true |

创建前查询是否已有同名集合、数据及索引。有匹配的空资源可复用；有数据或配置差异先回报，不删除、重建或覆盖。新建集合后设置并回读规则，创建唯一索引后回读字段顺序、方向、unique 和可用构建状态。保留默认索引。不要插入数据来证明唯一性，实际冲突验证留给主流程。

<a id="issue-handoff-02-d04-database--边界与回报"></a>
## 边界与回报

本次不部署函数、不配置验收主体、不运行 probe，不创建正式业务集合或导入 fixtures，不改 UI、业务代码、共享运行配置，不授予角色、不支付、不删除、不提交推送发布。保留全部既有改动。

写入 `docs/ISSUE-RESULT-02-D04-DATABASE.md`；脱敏证据放 `docs/qa/issue-02-d04-database/`。记录实际 EnvId、资源新建或复用、三个集合空数据状态、规则原文、唯一索引完整规格和构建状态、实际请求标识、工具绑定前后、具体阻塞。

完成标记 `READY_FOR_MAIN_REVIEW`；阻塞标记 `BLOCKED`。配置回读不等于客户端读写拒绝或唯一冲突已通过，D04 实际实验保持 `NOT_RUN`。直接同步主流程后停止，等待复核和问题 03 指令。用户已授权主流程直接指挥与接收回报，不需要用户中转。

---

<a id="issue-handoff-03-d04-function"></a>

## 原记录：ISSUE-HANDOFF-03-D04-FUNCTION.md

<a id="issue-handoff-03-d04-function--问题-03d04-验收函数部署及受控主体配置"></a>
# 问题 03：D04 验收函数部署及受控主体配置

日期：2026-10-08。状态：待环境窗口执行。问题 02 数据库配置已经主流程复核；实际唯一冲突尚未验收。

执行窗口：验证开发云环境最小链路。回报主流程：`01a101b8-2f61-70e1-95fb-6e30056bd0e1`。

<a id="issue-handoff-03-d04-function--单项目标"></a>
## 单项目标

只在 `dinner-cook-test-d5e320u981ec341`（ap-shanghai、AppID `wx154f791a17268ace`）部署 Event 函数 `jjl-d04-probe`，配置有限期限及指定原生验收主体，为主流程真实实验准备入口。

先阅读 `D04-PROBE-ENVIRONMENT-HANDOFF.md` 的函数与配置部分及适用 cloud-functions/miniprogram 技能。development 不部署，不更新 user/store，不改共享 UI 工程。工具隐式绑定须提前通知主流程、修改前确认目标，结束后恢复 development 并回读。

<a id="issue-handoff-03-d04-function--操作步骤"></a>
## 操作步骤

1. 检查已有忽略目录 `artifacts/d04-cloud-probe/functions/jjl-d04-probe`，与 `scripts/prepare-transaction-cloud.js` 列出的源文件逐项比对；若不一致先报告，不能部署旧代码或覆盖既有成果。依锁文件安装依赖，确认 wx-server-sdk=4.0.2。
2. 查询 test 是否有同名函数。有未知来源或配置差异先报告；不存在时部署单个函数，Event/index.main，Nodejs20.19；不创建 HTTP、定时或其他触发器。
3. 配置 JJL_APP_ID=wx154f791a17268ace、JJL_CLOUD_ENV=JJL_TEST_ENV=dinner-cook-test-d5e320u981ec341、JJL_STAGE=test、JJL_DEVELOPMENT_ENV=cloudbase-d8gwtxzm64150b7e0。生成本轮唯一16–48位字母数字/_/-的 JJL_PROBE_RUN_ID；JJL_PROBE_EXPIRES_AT 为配置时起两小时的确切 Unix 毫秒时间，记录时区/截止时间。到期不自动延期，报告主流程安排。
4. 使用本地隔离微信工程；可复用 `artifacts/cloud-env-validation-20261008`，检查是否正被使用、保留原配置和成果，不修改根工程。以显式 test 初始化 wx.cloud，原生调用 `{action:'probe',payload:{operation:'identify',caseId:'atomic'}}`。此操作无数据库读写。核对调用来自受控验收人，配置其可信64位稳定 subjectId 到 JJL_PROBE_USER_ID；不得以任意首访者自动授权，不采用客户端自称ID，不收集或公开 OPENID/令牌。
5. 回读函数 Active/Available、运行时、配置和 SDK；可进行受控原生 identify 及管理端伪造身份拒绝检查，但不得调用 prepare/hold/read/unique，也不写 probe 数据、不运行事务执行器。再次确认三个集合保持空，记录配置已生效和所用隔离工程。

完整稳定 subjectId 如主流程执行器不需要，不放公开回报；回报中脱敏，环境变量实际值由平台保存。runId 和截止时间要准确回报，主流程执行实验必须使用同一 run。

<a id="issue-handoff-03-d04-function--交付与停止条件"></a>
## 交付与停止条件

写 `docs/ISSUE-RESULT-03-D04-FUNCTION.md`，证据放 `docs/qa/issue-03-d04-function/`。记录 EnvId、函数名、部署请求标识、代码比对/SDK/运行时、状态、触发器、配置回读（身份脱敏）、runId/截止时间、原生 identify 请求标识/结果、受控主体配置依据、隔离工程绝对路径、集合空状态、绑定恢复及具体阻塞。

完成标 `READY_FOR_MAIN_REVIEW`，阻塞标 `BLOCKED`，直接同步主流程后停止。函数部署成功不等于云事务或 D04 通过；实验由主流程随后执行。本次不改业务代码/UI、不批量建业务资源、不删除、不授权管理员、不支付、不提交推送上传发布。保留其他窗口改动。

---

<a id="issue-handoff-04-d04-concurrency-logs"></a>

## 原记录：ISSUE-HANDOFF-04-D04-CONCURRENCY-LOGS.md

<a id="issue-handoff-04-d04-concurrency-logs--问题-04d04-并发通用错误取证"></a>
# 问题 04：D04 并发通用错误取证

日期：2026-10-08。执行窗口：验证开发云环境最小链路。回报主流程：`01a101b8-2f61-70e1-95fb-6e30056bd0e1`。

主流程已执行一次真实微信模拟器 wx.cloud 事务实验。证据：`docs/qa/d04-cloud/native-1791443939898.json`。结果12/16通过，D04未通过；问题01–03环境配置已关闭。

此次单项是定位并发失败请求的可用平台证据，**只读取证，不修改业务代码、配置或数据，不重新实验**。唯一冲突失败留到后续单项，不能把两个错误视为同因。

<a id="issue-handoff-04-d04-concurrency-logs--目标与请求"></a>
## 目标与请求

EnvId=`dinner-cook-test-d5e320u981ec341`，ap-shanghai，函数 `jjl-d04-probe`，run=`d04-20261008070714200-ba2d4765`。查本轮约香港15:14–15:19的请求；按实际原始证据时间调整查询窗，不以推测时间替代平台记录。

| 场景 | 平台 requestId | 实际响应 |
|---|---|---|
| stock-last，command1 | 7963c6ab-bc80-43e7-8463-611b98a5f210 | CLOUD_DOCUMENT_OPERATION_FAILED |
| slot-last，command1 | ce277c90-061f-4505-a1d9-1eee40236c32 | CLOUD_DOCUMENT_OPERATION_FAILED |
| mode-independent，command0 | 0044ee14-220b-4ffb-9c53-311af8bf6a71 | CLOUD_DOCUMENT_OPERATION_FAILED |
| mode-independent，command4 | f0ff8da1-6254-4e49-8918-e0f50d8a8ae7 | CLOUD_DOCUMENT_OPERATION_FAILED |

查受支持的函数日志/调用详情/错误详情，收集是否有原始SDK code、errCode、错误类别及冲突或重试信息。日志入口未开通或只留公开通用错误时，记录工具及具体缺失；不新建CLS/购买服务、不伪造原始错误、不从数据竞争推断已证明的根因。

现有适配器 provider() 会归一化 SDK 错误，可能丢失诊断信息；这仅是代码观察，不证明失败都是锁冲突。后端诊断/修复由主流程承担。环境窗口可指出所需最小诊断，但不能自行改包或重新部署。

<a id="issue-handoff-04-d04-concurrency-logs--回报与边界"></a>
## 回报与边界

写 `docs/ISSUE-RESULT-04-D04-CONCURRENCY-LOGS.md`，脱敏证据 `docs/qa/issue-04-d04-concurrency-logs/`。每条请求明确实际查到什么、哪些原始字段不可见，区分事实与假设；返回 `READY_FOR_MAIN_REVIEW` 或具体 `BLOCKED`。

如只读日志工具必须切绑定，提前通知，确认test，结束恢复development并回读。不修改共享工程或运行环境，不删除测试文档，不自动延长17:07:14.200的probe截止时间，不创建日志资源、不提交推送发布。完成或阻塞直接同步后停止。不得使用旧run重跑全套，它已有占用数据。

---

<a id="issue-result-01-test-environment"></a>

## 原记录：ISSUE-RESULT-01-TEST-ENVIRONMENT.md

<a id="issue-result-01-test-environment--问题-01独立-test-环境执行结果"></a>
# 问题 01：独立 test 环境执行结果

**主流程最终复核：CLOSED / PASS（2026-10-08）。** 已核对文末用户创建后的实际回读及 `test-ready-evidence.json`：test NORMAL、NoSQL RUNNING、同 AppID 关联，数据库实例、存储桶及函数命名空间均与 development 不同。下文 BLOCKED 与 READY_FOR_MAIN_REVIEW 保留为历史记录。关闭仅代表环境就绪，不代表 D04 业务验收通过。

**最新状态：READY_FOR_MAIN_REVIEW。用户新建 test 已通过状态、NoSQL、AppID 关联及资源隔离复核；此前阻塞解除。详见文末最新复核。**

历史首次执行状态：**BLOCKED**。记录时间：2026-10-08T06:44:11.958Z（UTC；Asia/Hong_Kong +08:00）。本轮重新查询，不沿用旧环境快照。来源：[交接任务](phase-2.md#issue-handoff-01-test-environment)。

<a id="issue-result-01-test-environment--本轮实际核验"></a>
## 本轮实际核验

| 项目 | 结果 |
|---|---|
| test EnvId、名称、地域、状态、模式 | 尚未取得，不能标 READY_FOR_MAIN_REVIEW |
| 账号与微信登录 | CloudBase 国内站账号级 READY；微信 loginExpired=false，CLI 0.3.11/versionRelation=equal |
| 上海环境 | TotalCount=1/HasMore=false，仅 development cloudbase-d8gwtxzm64150b7e0，NORMAL |
| 广州环境 | TotalCount=0/HasMore=false |
| 新加坡环境 | 首次未明确站点返回 AUTH_REQUIRED；随后显式 auth(status,site=domestic)，重新查询 TotalCount=0/HasMore=false。不能将首次错误当空列表 |
| 同 AppID 关联 | 微信 cloud_env_list(appid=wx154f791a17268ace) exit=0，仅返回 development |
| development 实际数据库 | info 明确 RuntimeMode=nosql，RuntimeBackends={postgresql:false,nosql:true,mysql:false}，Source=miniapp，WxAppId 一致 |
| 环境隔离 | 没有第二 EnvId，独立数据库/函数/存储隔离证明 NOT_RUN |
| 创建或复用 | 没有候选可复用；未创建资源，未发起购买或关联 |
| 操作前后工具绑定 | 均为 development，ap-shanghai；未执行 set_env，未切换绑定。显式查询国内站后最终 status 回读仍 READY |
| D04 集合/索引/函数/云事务、唯一冲突、资源竞争、故障回滚 | 全部 NOT_RUN；本轮不执行问题 02 |

区域结论限于工具支持的上述三个地域与当前微信 AppID 关联列表，不断言所有账号/全部地域都没有环境。info 请求 ID：a65ddd77-f1c2-4df1-ae06-e584c9b6c6e1。

<a id="issue-result-01-test-environment--具体阻塞与可执行下一步"></a>
## 具体阻塞与可执行下一步

1. **创建能力与所需数据库不符。** 本会话 manageEnv(create) 的实际 schema 仅允许 storage/function/postgresql，并明确“不再包含 flexdb(文档数据库)：新建环境不会创建 NoSQL 实例”。因此即使选套餐、确认购买，也不能据此交付本任务要求的 NoSQL test。未用 PostgreSQL 替代，不通过猜测底层 API 参数绕过工具。
2. **微信 CLI 未暴露创建/关联入口。** 本轮读取 wechatide --help，云环境工具只有 cloud_env_list；数据库结构/函数工具不能创建第二个环境。
3. **UI 执行通道不可用。** 按 Computer Use 技能（当时的本机路径已失效，原路径保存在源快照ZIP） 初始化 @oai/sky，node_repl 启动失败：windows sandbox failed: helper_unknown_error: setup refresh had errors。浏览器 cua.getState 首次进程退出，重试同样沙箱错误，未进入控制台、未点击创建。当前未看到微信创建页，不能断言该页可用套餐/免费资格或实际收费。
4. **套餐只有 API 原始报价，无具体购买授权。** listPackages 本轮返回个人版 baas_personal 的 UnitPrice="39.9"、入门版 starter 的 "99" 等，未出现免费套餐；这里只记录原始字段，不推定币种、优惠或微信侧价格。工具说明要求付费 create 执行前展示配置摘要并等待确认，本交接也明确具体套餐/付费需要选择；本轮未下单。套餐确认不是当前唯一阻塞，需先找到支持微信 NoSQL 的创建入口。

所需动作：主流程安排用户或可用的原生操作窗口，在同 AppID 的微信云开发控制台创建/复用第二个支持 NoSQL 的独立环境（优先上海）；如创建页要求购买，应先记录具体套餐、价格与时长并取得确认。不要把现有 development 作为 test。环境创建后回报实际 EnvId，本窗口即可重新查询 NORMAL、RuntimeBackends.nosql=true、微信关联列表包含该 EnvId，以及资源独立性，再提交 READY_FOR_MAIN_REVIEW。无需提供账号密码、密钥或经营数据。

曾有一次只读 shell 审批超时，按返回说明重试成功；它不是当前阻塞，没有持续的自动审批拒绝。实际阻塞是创建工具的 NoSQL 能力边界和 UI 进程沙箱启动失败。

<a id="issue-result-01-test-environment--证据及改动边界"></a>
## 证据及改动边界

[本轮脱敏查询证据](../../qa/issue-01-test-environment/environment-evidence.json)包含站点/登录/绑定前后、三个地域列表、微信关联、development 模式、套餐摘要、能力说明和 UI 启动错误。不保存完整 OPENID、用户昵称头像、账号标识、令牌或密钥。

本轮仅新增本结果文件及证据。保留 Git 原有改动；未修改共享配置、业务代码、UI，未创建集合/索引/函数，未删除数据，未上传/发布小程序，未提交/推送。已验证用户在主流程授权直接协调与同步，将此结果直接回报项目推进主流程后停止；问题 02 等待另行交接。

<a id="issue-result-01-test-environment--最后一轮替代入口核查cloudbase-cli2026-10-08t065137652z"></a>
## 最后一轮替代入口核查：CloudBase CLI（2026-10-08T06:51:37.652Z）

**仍为 BLOCKED；补充发现：不能把 MCP 的 NoSQL 限制泛化为所有 CLI/API 均不支持。**

已阅读本地 cloudbase-cli/SKILL.md、references/core.md 和 nosql.md。Get-Command tcb/cloudbase 无结果；常见 npm 全局、Program Files/nodejs、捆绑 Node/bin 位置均无 tcb.cmd；.codex 包/入口搜索及既有 artifacts 工具缓存文件名搜索未找到已安装 CLI。搜索范围有限，不断言磁盘任意目录都没有。本机 CLI 版本 NOT_AVAILABLE，实际 --help 为 NOT_RUN；没有全局安装。

官方 npm 元数据当前版本 **@cloudbase/cli 3.8.5**。为核实官方能力，仅下载发布包到既有忽略目录 artifacts/cloud-env-tools/cli-source-3.8.5.tgz，在内存静态读取 standalone/cli.js；没有执行包内代码、安装依赖、登录、切环境或调用任何写 API。

- EnvCreateCommand 的真实 help 参数定义包括 alias/package/region/duration/auto-renew/postgresql/external-storage/platform-id；未见创建时的微信 AppID 或关联入口。
- 默认 doCreate 请求 Resources=[flexdb,storage,function]，带 --postgresql 才追加 postgresql。这与本会话 MCP 的资源白名单不同，说明 CLI 源码确实意图请求 NoSQL；不能说 CLI 只能创建 PG。
- [Manager SDK 官方文档](https://docs.cloudbase.net/api-reference/manager/node/env)同样列 flexdb 创建参数，但没有建立指定 WxAppId 的 createEnv 参数；describeEnvs 的 WxAppId 是查询筛选，不是关联动作。静态参数不是本账号实际发货成功证据，NoSQL 实际开通仍 NOT_RUN。
- [官方 CLI 环境文档](https://docs.cloudbase.net/cli-v1/envs/basement)提供普通创建命令。[官方创建说明](https://docs.cloudbase.net/quick-start/create-env)说明微信工具创建自动关联当前小程序；腾讯云侧现有环境需账户绑定后在微信工具选择/转换。普通 CLI 创建本身不能据此视为已关联。

仅供后续具备可运行 CLI 且完成报价确认后的普通环境配置草案：别名 dinner-cook-test（建议名，尚未创建）、ap-shanghai、duration=1、package待实际报价/选择，不开启自动续费、不指定外部共享桶。官方命令形状为 tcb env create --alias dinner-cook-test --package <已确认套餐ID> --region ap-shanghai --duration 1；这是不完整的采购/关联方案，**本轮未执行**，没有加入 --yes。旧 listPackages 的 UnitPrice=39.9 不能替代 CLI 创建链路的实际询价或微信页面费用确认。

[CLI 核查摘要](../../qa/issue-01-test-environment/cli-evidence.json)、[最小源码参数证据](../../qa/issue-01-test-environment/cli-source-excerpts.txt)。Node 直接 fetch 取发布包失败，改用 PowerShell Invoke-WebRequest 下载成功；这不是云 API 失败。未反复尝试此前失败 UI。

<a id="issue-result-01-test-environment--用户完成此单项的最短步骤"></a>
### 用户完成此单项的最短步骤

1. 在已登录的微信开发者工具打开 AppID 为 wx154f791a17268ace 的项目，进入工具上方“云开发”（官方文档确认该入口）；共享工程仍保持 shell。
2. 在云开发控制台找到新增独立环境的入口，创建第二个环境，优先上海，建议名称 dinner-cook-test；确认具备文档型 NoSQL 数据库。不要重命名或替换当前 development。本会话未见现有控制台页面，不猜第二环境按钮文案；若无新增入口或没有 NoSQL 选项，回报实际提示即可。
3. 如要求收费，先把页面实际套餐、价格、时长交主流程确认；本记录不预选购买、不承诺免费资格。创建后等待平台资源就绪，不建集合、不部署函数、不改共享配置。
4. 只需回传第二个环境的实际 EnvId。我们会查询环境状态/数据库模式、同 AppID 关联和资源隔离；用户不用提供密码、密钥或经营资料。

CLI 本轮没有提供已验证的完整自动创建及关联路径；问题 01 保持 BLOCKED，由主流程协调上面单项操作。问题 02 和 D04 实验仍 NOT_RUN。

<a id="issue-result-01-test-environment--用户创建-test-后的实际复核2026-10-08t065816049z"></a>
## 用户创建 test 后的实际复核（2026-10-08T06:58:16.049Z）

状态：**READY_FOR_MAIN_REVIEW**，等待主流程复核关闭问题 01；此前 BLOCKED 为历史记录，现已解除。

| 验收项 | 实际结果 |
|---|---|
| test | dinner-cook-test-d5e320u981ec341；名称 dinner-cook-test；ap-shanghai；NORMAL；IsDefault=false |
| 数据库模式 | RuntimeMode=nosql；RuntimeBackends={postgresql:false,nosql:true,mysql:false}；数据库 RUNNING |
| AppID 关联 | info 的 WxAppId=wx154f791a17268ace、Source=miniapp；微信 cloud_env_list 同时返回 development 和 test |
| EnvId 隔离 | test 与 cloudbase-d8gwtxzm64150b7e0 不同 |
| 数据库隔离 | test tnt-if33ogxaq；development tnt-m100muyvs，不同实例 |
| 存储隔离 | test 6469-dinner-cook-test-d5e320u981ec341-1501710237；development 636c-cloudbase-d8gwtxzm64150b7e0-1501710237，不同桶；外部共享存储均 Enabled=false |
| 函数隔离 | test Namespace=dinner-cook-test-d5e320u981ec341；development Namespace=cloudbase-d8gwtxzm64150b7e0 |
| 新建或复用 | 用户新建，本窗口只读核验，未额外创建/清理任何资源；数据库、桶、函数命名空间为平台创建资源回读 |
| 工具绑定 | 前后均 development/ap-shanghai，未执行 set_env，无需恢复；共享运行配置未修改 |
| 具体阻塞 | 本项无；不代表 D04 或整体 I03/I07 通过 |
| D04/问题02 | 集合、索引、规则、函数部署、事务/唯一冲突/竞争/回滚仍 NOT_RUN，等待主流程下一项交接 |

本轮查询 requestId：test abcdf71c-7eff-4021-931e-74d7258c63f6；development 4ec58b76-79fb-4b95-9fd0-266ddd56a641。证据：[就绪与隔离回读](../../qa/issue-01-test-environment/test-ready-evidence.json)。

没有安装/执行 CLI、进行付费、写入云数据、修改共享配置或 UI、部署函数、提交/推送/上传。保留历史失败和现有未提交改动。直接同步主流程后停止。

---

<a id="issue-result-02-d04-database"></a>

## 原记录：ISSUE-RESULT-02-D04-DATABASE.md

<a id="issue-result-02-d04-database--问题-02d04-测试数据库资源配置结果"></a>
# 问题 02：D04 测试数据库资源配置结果

**主流程复核：CLOSED / CONFIG_PASS（2026-10-08）。** 已核对结果与 `database-evidence.json`：三个空集合、客户端全拒绝规则、指定复合唯一索引规格及 development 绑定恢复符合配置任务。工具未暴露索引构建状态；实际唯一冲突及客户端权限测试仍 NOT_RUN，不宣称 D04 实验通过。

状态：**READY_FOR_MAIN_REVIEW**。记录时间：2026-10-08T07:02:55.172Z（UTC；Asia/Hong_Kong +08:00）。
唯一操作环境 dinner-cook-test-d5e320u981ec341，上海 NoSQL，同 AppID wx154f791a17268ace。依据 [问题02交接](phase-2.md#issue-handoff-02-d04-database)。等待主流程复核，不自行写 CLOSED/PASS。

<a id="issue-result-02-d04-database--实际创建与回读"></a>
## 实际创建与回读

创建前集合列表 Total=0，三个同名集合不存在，没有已有数据或配置差异。按清单新建，未复用或覆盖已有资源。

| 集合 | 最终文档数 | 权限与安全规则原文 | 最终索引 |
|---|---:|---|---|
| jjl_d04_probe_resources | 0 | CUSTOM；{"read":false,"write":false} | 仅平台默认 _id_、_openid_1 |
| jjl_d04_probe_records | 0 | CUSTOM；{"read":false,"write":false} | 仅平台默认 _id_、_openid_1 |
| jjl_d04_probe_receipts | 0 | CUSTOM；{"read":false,"write":false} | 两个默认索引＋uq_d04_probe_command |

指定唯一索引实际回读：Name=uq_d04_probe_command；Keys 按 runId、caseId、commandKey 顺序，每项 Direction="1"；Unique=true、Sparse=false、PartialFilterExpression=""、Size=8192。字段顺序/方向/unique 均一致，未降为普通索引；没有删除默认索引。

**可用构建状态限制：** describeCollection/listIndexes 没有返回 Building/Ready/Failed 等显式状态，记录 NOT_EXPOSED_BY_TOOL，不能把 Size 或 Accesses.Since 当构建完成证明。索引已存在及配置回读成功；实际唯一冲突与有效性为 NOT_RUN，留给主流程。默认 _id_ 的 Unique=false 是平台原始返回，不修改，也不据此推断确定性 _id 并发语义。

<a id="issue-result-02-d04-database--请求标识"></a>
## 请求标识

| 动作 | resources | records | receipts |
|---|---|---|---|
| 创建 | ac40fa48-337a-40ed-bb21-95b68e0dc518 | 1f27c6a5-4727-4627-b390-2ddf82451c6f | 02fe2622-b194-41b2-b07b-502b1262965b |
| 设置规则 | 0c092904-09e0-434f-b146-e6cd8463d46a | 181202db-f887-4895-9157-3bb2bb40e4dd | e4f5bc5a-7629-485c-a045-db2fbec1e986 |
| 回读规则 | e530c1dc-4c85-4c54-9eee-8c1350e9fe8f | 70cdef87-c55f-4479-bd82-779a14dba0af | 315cfe98-afe8-44a5-9291-7b1de609b39a |
| 回读索引 | c720fdc7-6429-4995-9d62-1350fd7f4fee | 40822621-e8d1-488f-8d64-0223ac063697 | 388cd704-9c22-44cc-bfdb-51140657e88e |

索引创建 2bb600d3-456e-4c56-ad31-56a143013d8a；初始集合列表 926ec28d-a9f4-4ae3-baef-b4c2bd76f384；最终空数据列表 b75ec3f6-64bf-4290-b536-8903d950fd35。各操作 success=true，无平台错误码。

<a id="issue-result-02-d04-database--工具绑定与边界"></a>
## 工具绑定与边界

操作前 current_env_id=cloudbase-d8gwtxzm64150b7e0，ap-shanghai。因管理工具不提供逐次 EnvId，通知主流程后执行 set_env(test)，响应 ENV_READY/实际 test EnvId；主流程回复暂停隐式绑定及并行云操作。三个规则写入回包均含 test EnvId，回读前 auth(status) 再确认 test。主流程“每次修改前确认绑定”的补充到达时本轮写操作已完成；没有伪造逐次 auth 证据，此后无写操作。

完成回读后 set_env(development) 成功；最终 auth(status,site=domestic) 确认 READY、development/ap-shanghai，**已恢复**。本轮所有云资源修改仅在 test，未修改 development 或共享小程序运行配置。

[完整资源及绑定证据](../../qa/issue-02-d04-database/database-evidence.json)。本轮仅新增本结果/证据文件；git diff --check 通过，原有未提交/未跟踪改动保留。未部署函数、配置主体、插入 probe 数据、运行实验、创建正式业务集合、删除数据、授予角色、支付、提交/推送或上传发布。

具体阻塞：本轮指定配置无阻塞；显式索引构建状态未由工具暴露，作为验收限制保留。客户端实际读写拒绝、唯一冲突、云事务/竞争/故障回滚、问题03函数及主体配置均 **NOT_RUN**。规则配置回读不代替客户端拒绝验证。直接回报主流程后停止。

---

<a id="issue-result-03-d04-function"></a>

## 原记录：ISSUE-RESULT-03-D04-FUNCTION.md

<a id="issue-result-03-d04-function--问题-03d04-验收函数及受控主体配置"></a>
# 问题 03：D04 验收函数及受控主体配置

**主流程复核：CLOSED / CONFIG_PASS（2026-10-08）。** 已核对部署、代码比对、原生 SDK/身份回读、管理端拒绝、配置期限、空集合及绑定恢复证据。环境配置准备完成；D04 实际事务实验由主流程使用同一 run 在期限内执行，不能以此配置复核宣称 D04 通过。

状态：**READY_FOR_MAIN_REVIEW**，等待主流程复核。记录时间 2026-10-08T07:12:32.757Z（UTC，香港 +08:00）。
唯一环境 dinner-cook-test-d5e320u981ec341，函数 jjl-d04-probe。

<a id="issue-result-03-d04-function--已完成"></a>
## 已完成

- prepare-transaction-cloud.js 清单中的11个文件逐字一致（包括入口、8个shared模块、package.json与lock），已保存SHA256；未覆盖或部署旧包。独立包 npm ci --ignore-scripts --no-audit --no-fund exit=0，102 packages，SDK锁定4.0.2。云端实际两次identify也回报sdkVersion=4.0.2。
- test部署前 cloud_fn_list total=0，仅新建指定Event/index.main，Nodejs20.19、timeout=20秒。最终Active/Available、CodeResult=success，Triggers=[]；未创建HTTP路由、定时器或层。创建请求bec219c5-9d06-47a0-91a5-49b668f08971，主体配置请求349542e9-baaa-407c-bb36-8d84c87c9817。
- 原隔离工程页面会自动调用development user/store，完整保留未复用；本轮新增独立工程 **D:/dinner cook/artifacts/d04-identify-validation-20261008**。正确AppID、显式test初始化/调用，页面只执行identify，不含prepare/hold/read/unique。共享根工程和原工程未修改。
- 本窗口通过本机已登录微信开发者工具主动发起原生调用，主流程明确回复认可此受控会话作为验收主体。核对真实identify返回64位稳定subjectId及当前run后，仅配置服务端JJL_PROBE_USER_ID；不是授权首个任意访客或客户端自称身份。完整subjectId/OPENID/令牌未保存至公开结果和证据。
- 配置更新曾处于Updating，随后回读Active；环境变量均与指定值匹配，JJL_PROBE_USER_ID实际值与原生返回一致，证据仅保存subjectMatchesNative=true/脱敏占位。配置后第二次原生identify同一主体、同一run，成功。
- 三集合最终Count均0；没有插入测试数据或执行事务。代码审查确认identify在授权/期限/原生上下文检查后直接返回，无数据库读写；业务操作仍受指定主体和期限约束，未开放匿名/管理端伪造身份。

<a id="issue-result-03-d04-function--有限授权配置与真实调用"></a>
## 有限授权配置与真实调用

| 配置 | 实际回读 |
|---|---|
| JJL_APP_ID | wx154f791a17268ace |
| JJL_CLOUD_ENV / JJL_TEST_ENV | dinner-cook-test-d5e320u981ec341 |
| JJL_STAGE | test |
| JJL_DEVELOPMENT_ENV | cloudbase-d8gwtxzm64150b7e0 |
| JJL_PROBE_RUN_ID | d04-20261008070714200-ba2d4765 |
| JJL_PROBE_EXPIRES_AT | 1791450434200 |
| 起始/截止香港时间 | 2026-10-08 15:07:14.200 → 17:07:14.200（+08:00），恰好2小时 |
| UTC截止 | 2026-10-08T09:07:14.200Z |
| JJL_PROBE_USER_ID | 已配置可信64位subjectId，脱敏；匹配真实原生会话 |

到期不自动延期，主流程需在同一run/截止时间内安排实验；超过期限不得直接继续，另行授权安排。

| 核验 | 平台请求ID | 业务requestId | 结果 |
|---|---|---|---|
| 原生identify | b69dc2c7-0de8-4f91-b07f-fb8d87214c0d | ecae7107-c3b8-4ef4-9a86-5560a22adf25 | IDENTIFIED、SDK4.0.2 |
| 配置后原生identify | 9cf8fa47-924b-4a4c-bfe2-9ba3853d4fce | d6055bb5-2ce7-4714-a44d-b8db3eca9bb8 | IDENTIFIED、同主体/同run、SDK4.0.2 |
| 管理端事件伪造openid/role | 60c81147-860e-4934-a11c-1aba7ff7b0b0 | dadf7f5f-40b8-4bdb-b1cf-fd48a94c6940 | AUTH_REQUIRED |

首次读取及配置后编译紧接读取分别出现automator超时，未记为成功；后续读取真实结果成功，历史限制保留。错误不是云业务拒绝证据。最终函数回读requestId dd4e4028-7914-4b2f-8727-732c4f663a76；空集合回读2f1fe469-66d0-4863-bca2-6bb58d79557c。

<a id="issue-result-03-d04-function--绑定证据与范围"></a>
## 绑定、证据与范围

提前通知主流程暂停隐式MCP操作，切换test；创建、配置更新及管理端拒绝调用前均auth(status)确认test。结束set_env(development)成功，auth(status)确认READY/cloudbase-d8gwtxzm64150b7e0/ap-shanghai，已恢复。development资源、user/store、UI、业务源码及共享配置没有修改。

[脱敏完整证据](../../qa/issue-03-d04-function/function-evidence.json)。无具体阻塞；函数就绪不等于D04通过。prepare/hold/read/unique、事务/竞争/唯一冲突/故障回滚以及客户端权限实际验收均NOT_RUN，由主流程随后安排。保留现有未提交改动，无删除、管理员授权、支付、提交/推送/上传发布。直接同步主流程后停止。

---

<a id="issue-result-04-d04-concurrency-logs"></a>

## 原记录：ISSUE-RESULT-04-D04-CONCURRENCY-LOGS.md

<a id="issue-result-04-d04-concurrency-logs--问题-04d04-并发错误只读取证结果"></a>
# 问题 04：D04 并发错误只读取证结果

**主流程后续：并发业务故障已修复并真实复验通过，见[D04修复记录](phase-2.md#d04-cloud-repair-2026-10-08)。原始历史日志仍不可取得，下文BLOCKED记录不抹去、不写成日志服务已恢复。此轮由主流程本窗口完成后端修复和验收，不继续派单。**

状态：**BLOCKED（原始日志不可取得）**。记录时间 2026-10-08T07:24:22.802Z（UTC，香港 +08:00）。仅test dinner-cook-test-d5e320u981ec341 / jjl-d04-probe / run d04-20261008070714200-ba2d4765。来源 [问题04交接](phase-2.md#issue-handoff-04-d04-concurrency-logs)。

<a id="issue-result-04-d04-concurrency-logs--实际查询结果"></a>
## 实际查询结果

原始实验记录 time=2026-10-08T07:18:59.898Z，即香港15:18:59.898，为证据落盘时间，不推定每次调用发生时刻。日志列表查询窗香港15:10–15:25，覆盖交接所述15:14–15:19；接口未返回调用时间。

| 场景 | 平台请求ID | 已知客户端响应 | 本轮详情 |
|---|---|---|---|
| stock-last command1 | 7963c6ab-bc80-43e7-8463-611b98a5f210 | CLOUD_DOCUMENT_OPERATION_FAILED | 接口已下线，未取得详情 |
| slot-last command1 | ce277c90-061f-4505-a1d9-1eee40236c32 | CLOUD_DOCUMENT_OPERATION_FAILED | 接口已下线，未取得详情 |
| mode-independent command0 | 0044ee14-220b-4ffb-9c53-311af8bf6a71 | CLOUD_DOCUMENT_OPERATION_FAILED | 接口已下线，未取得详情 |
| mode-independent command4 | f0ff8da1-6254-4e49-8918-e0f50d8a8ae7 | CLOUD_DOCUMENT_OPERATION_FAILED | 接口已下线，未取得详情 |

四条 getFunctionLogDetail 各返回 success=false/isError=true，message：“getFunctionLogDetail 已废弃：底层 GetFunctionLogDetail 接口已下线，请使用 env.getLogService().searchClsLog() 查询云函数日志”。未反复重试该入口。

替代 listFunctionLogs(functionName,startTime,endTime,limit=100,offset=0) 同样返回 success=false：“getFunctionLogsV2 已废弃：底层 GetFunctionLogs 接口已下线，请使用 env.getLogService().searchClsLog() 查询云函数日志”。

queryLogs(checkLogService) 成功返回 enabled=false，message“日志服务未开通或仍在初始化中”。工具不能区分这两个原因，不写成确定从未开通。遵守边界，未新建CLS/购买日志服务，未执行不能工作的CLS检索或调用猜测底层接口。

现有微信CLI没有云函数日志入口。只读现有隔离模拟器控制台 grep CLOUD_DOCUMENT_OPERATION_FAILED 返回空字符串：只是该筛选没有命中，不代表全部console为空或平台没有日志。初次含多个ID的grep在wechatide.cmd包装器中被管道符解析打断；改为单一无管道grep成功，无云端操作。

**四条原始 code、errCode、错误类别、事务冲突、回调尝试次数和SDK重试行为均 NOT_OBTAINED。** 没有错误详情或新日志请求标识可引用，不能把工具废弃错误当实验错误码，也不能认定锁冲突为根因。

<a id="issue-result-04-d04-concurrency-logs--代码观察及下一步"></a>
## 代码观察及下一步

只读当前 cloud-document-transaction.js provider()：已有内部错误直接抛出；明确duplicate(error)映射唯一冲突；其他SDK错误统一fail(CLOUD_DOCUMENT_OPERATION_FAILED)，未保留原始SDK code/errCode。这能解释公开响应缺少细分诊断，**不能证明四个请求是同一种SDK故障，不能证明冲突发生或SDK是否重试**。唯一冲突错误仍留后续单项，不与本问题合并。

主流程可在后端单独安排最小诊断：保留安全白名单的SDK code/errCode、操作类别、关联requestId以及事务回调尝试次数，并核对原始错误与SDK重试语义。不要输出事件/用户身份/凭证/完整错误消息或数据。是否重新部署、设置日志入口或用新run复验由后续授权任务决定；本窗口没有实施修复。旧run已有占用数据，不重跑或清零。

<a id="issue-result-04-d04-concurrency-logs--绑定证据与边界"></a>
## 绑定、证据与边界

通知主流程后set_env(test)响应ENV_READY；随后只读指定请求和日志入口。完成后set_env(development)成功，auth(status)回读READY/cloudbase-d8gwtxzm64150b7e0/ap-shanghai，已恢复。

[逐请求及工具原始返回证据](../../qa/issue-04-d04-concurrency-logs/log-evidence.json)。本轮仅新增本结果与证据；无代码/配置/数据变更，无CLS开通、probe调用、延期、清理、提交/推送或发布。D04保持12/16及未通过，不因取证结束改变验收结论。主流程收到此具体阻塞后安排后端诊断；本窗口停止。

---

<a id="phase-2-cloud-revalidation-2026-10-08"></a>

## 原记录：PHASE-2-CLOUD-REVALIDATION-2026-10-08.md

<a id="phase-2-cloud-revalidation-2026-10-08--阶段二身份持久化与鉴权实际云补验收"></a>
# 阶段二：身份持久化与鉴权实际云补验收

**后续D04能力实验已真实16/16通过，见[D04修复复验](phase-2.md#d04-cloud-repair-2026-10-08)。独立test已关联可用；下文只证明单用户事务/缺test是身份切片历史，正式业务订单、谓词保护、事务预算及真实断网仍NOT_RUN，阶段整体仍PARTIAL。**

日期：2026-10-08。按原执行计划顺序补此前缺云的内容；本轮为 D02/D04/D06 的首个真实数据切片，不是整阶段验收。已保留其他窗口的 UI、业务及所有未提交成果。

<a id="phase-2-cloud-revalidation-2026-10-08--实现与实际副作用"></a>
## 实现与实际副作用

开发 AppID wx154f791a17268ace、EnvId cloudbase-d8gwtxzm64150b7e0，SDK 4.0.2、Event/Nodejs20.19。R1 的 users/admin_roles/audit_logs、拒绝客户端读写规则和指定索引由环境窗口准备，见 [资源回执](phase-2.md#cloud-resource-r1-result-2026-10-08)。本窗口没有另建业务集合或导入 fixtures。

user.me 现已接入 [身份仓储](../../../cloudfunctions/_shared/cloud-identity-repository.js)：可信 environment/AppID/OPENID 的确定性完整哈希主键；真实 runTransaction 读取，不存在时 add({data}) 创建完整默认顾客。默认 status=ACTIVE、version=0、隐私同意/头像/默认地址为空，不代表已同意隐私条款、认证电话或获得商家权限。已有记录只读不覆盖；禁用/损坏身份拒绝；存储异常关闭访问并脱敏。返回形状保持 authenticated/subjectHash/customer，无原始身份或 Profile。

本轮实际首次原生调用创建 **1 条 development 顾客记录**，后续复读均不增条数。最终管理端实查 users=1、admin_roles=0、audit_logs=0；伪造事件 openId 查询为 0。没有订单/库存/资金/管理员写入。该顾客留存用于后续原生验收，未自动删除。

<a id="phase-2-cloud-revalidation-2026-10-08--复用实例身份缺陷与修复"></a>
## 复用实例身份缺陷与修复

实测 SDK 4.0.2 的 getWXContext 从 process.env 读取 WX_*。正常微信调用之后，同实例管理端调用的当前 SCF environment 没有 WX_OPENID/WX_APPID，但 SDK 仍可能保留旧身份。修复前独立验收函数因此返回成功，业务 requestId=9578a6cf-05d1-43cd-ab16-68ba6dedcb80。此前冷实例管理端拒绝的证据不能覆盖这一情况。

user/store 和两项独立验收函数已统一使用 [native-context.js](../../../cloudfunctions/_shared/native-context.js)：只从平台主函数第二参数解析 **本次** environment，要求 request_id/namespace，再与 SDK 当前元组逐项一致；缺失/损坏/不一致均拒绝，不接受 event 中的任何上下文字段。user 的仓储绑定校验后本次身份快照，异步事务不重新读取全局残留身份。runtime 内部上下文作为处理器第二参数，避免混入公开业务参数/返回值；日志仅固定 code/requestId/stage。

修复后在真实复用实例上再次观察：sdkHasNativeOpenId=true、sdkHasNativeAppId=true，而本次 hasNativeOpenId=false、hasNativeAppId=false；函数返回 AUTH_REQUIRED，业务 requestId=e4b4c54e-4308-4e59-8e25-96149976895b，平台 requestId=1b8574b9-b6c9-4e52-ad4a-4ae14255bdfd。诊断只返回有限布尔值，不回显环境/身份/密钥。**该复现缺陷已关闭**；不能据此声称全部 D06 权限场景已通过。

<a id="phase-2-cloud-revalidation-2026-10-08--实际结果与证据"></a>
## 实际结果与证据

| 场景 | 结果 | 证据 |
|---|---|---|
| 首次 native 用户创建、同人稳定主键、完整默认记录、真实事务提交 | PASS，firstCreated=true | [首次落库](../../qa/identity-cloud-2026-10-08/native-1791429400366.json) |
| 重复 SDK 读取不创建、平台元组一致、数据库单用户 | PASS，firstCreated=false，5 项断言 | [修复后原生复验](../../qa/identity-cloud-2026-10-08/native-1791430764555.json) |
| 客户端直接读取 users/admin_roles/audit_logs | PASS，3 项均 -502003 权限拒绝 | 同上；**没有进行客户端写拒绝实验** |
| 实际 user/store、伪造角色/身份、无效 action/payload | PASS，正常为 customer；无效请求 INVALID_REQUEST | [最小链路复验](../../qa/initialization-cloud-2026-10-08/native-context-guard-1.json) |
| 云运行时缺配置/错 AppID/错 EnvId | PASS，三项固定错误码 | 同上，独立 I03 验收函数 |
| 管理端无当前微信身份调用四个函数 | PASS，全部 AUTH_REQUIRED | [云端请求与复用实例证据](../../qa/identity-cloud-2026-10-08/cloud-guard-evidence.json) |
| 云端部署及状态读回 | PASS，四函数 Active/Available，CodeResult=success | 同上；正常函数 user/store，另两个仅 development 验收 |

部署包包含全部 shared 依赖；user/store 的 SDK 与锁文件未更换。没有创建 HTTP 路由/触发器或上传小程序。两个验收函数分别 jjl-i03-rejection-20261008、jjl-d06-identity-20261008，仅 development；后续由环境窗口按精确名称退役，不放入生产发布清单。

本地重点测试 41/41；全套 **971/971**、静态 **354** 文件通过，源估算 main/features/legacy 1392/153/45 KiB。[本地报告](../../qa/identity-cloud-2026-10-08/local-1791430881431/report.json)、[测试记录](../../qa/identity-cloud-2026-10-08/local-1791430881431/tests.txt)、[静态记录](../../qa/identity-cloud-2026-10-08/local-1791430881431/static.txt)。后续仅更新契约状态标记，api-contract/admin-acceptance 17/17 通过；该标记不增加网络入口。

保留测试失败事实：首次入口夹具跨 VM realm 被模型拒绝，改为同 realm 加载真实依赖；全套旧 A07 夹具未提供新平台第二参数/仓储，首次 970/971，补真实依赖与事务形状后 971/971，不移除安全断言。微信自动化曾出现 APPID_ERROR，重跑实际成功后保存新证据。失败不计 PASS。

CloudBase code-review 已复核：原生微信身份，不接 Web/匿名认证；缺资源/存储错误不伪造成功；SEC001 不回显 event/context/env/OPENID 或提供商错误；不自动初始化角色。AUTH001 的 Web session 模式不替代 wx.cloud 原生身份。

<a id="phase-2-cloud-revalidation-2026-10-08--剩余门禁与下一项"></a>
## 剩余门禁与下一项

阶段一 I03 真机/设备版本、I06 完整日志服务、I07 独立环境仍 PARTIAL。D02 只落地 R1；D04 仅证明本次单用户事务提交，唯一冲突、并发、负读/多文档保护、逐写故障回滚与资源占用 **NOT_RUN**。D06 仅身份及三个集合客户端读拒绝通过：两顾客地址/袋/订单隔离、客户端写拒绝、实际管理员加载/撤销/范围仍 NOT_RUN。D07 种子及其他业务 handler 未 apply，购买门禁继续关闭。

下一项按 [D04 SDK 验收安排](phase-2.md#d04-cloud-sdk-acceptance-plan) 准备真实事务/唯一/资源竞争。独立 test 环境的日常创建关联交环境窗口；不索取账号密码/私钥。缺隔离条件时只完成代码与验收准备，不能在 development 用正式/混合业务资源做故障、竞争或资金实验。

早先仅为同步 runtime 的 store 部署被自动审批拒绝，理由是超出当时 user 身份持久化范围；当时停止该操作。随后真实复现共享鉴权缺陷、说明必要 user/store 修复范围后，该安全修复部署获准并已完成。没有通过换函数名称绕过拒绝。

---

<a id="phase-2-execution"></a>

## 原记录：PHASE-2-EXECUTION.md

<a id="phase-2-execution--阶段二执行记录数据模型"></a>
# 阶段二执行记录：数据模型

最新D04推进：已准备隔离验收服务、真实入口、打包和16项原生断言执行器；新增20项本地回归，全套1000/1000、静态366，[本轮证据](../../qa/identity-cloud-2026-10-08/local-1791439919289/report.json)。独立test未确认，未部署或执行云故障/资源竞争。环境窗口已可按[精确任务单](phase-2.md#d04-probe-environment-handoff)准备三个空probe集合及唯一索引；正式订单保存/完整读集与谓词/预算/真实断网仍待。未改UI、共享运行配置或已部署user/store。

后续D04准备：新增cloud-document-transaction.js文档事务基础层，不创建handler、不接入user/store、不改云数据。9项本地契约通过，全套980/980、静态357；真实唯一冲突/完整读取保护/资源竞争/故障回滚仍NOT_RUN。见[D04实际安排与记录](phase-2.md#d04-cloud-sdk-acceptance-plan)。

2026-10-08补验收更新：R1已完成配置，user.me已部署并真实事务创建/读取默认顾客。SDK复用实例残留身份缺陷已修复并云端复验；三集合客户端读拒绝通过。实查users=1、admin_roles=0、audit_logs=0。全套971/971、静态354；真机、完整业务权限、唯一冲突/多文档/资源并发/逐写回滚仍待补，不据单用户事务宣称整阶段完成。详见[真实结果](phase-2.md#phase-2-cloud-revalidation-2026-10-08)、[下一项D04](phase-2.md#d04-cloud-sdk-acceptance-plan)与[67 Task台账](phase-2.md#cloud-backfill-tracker-2026-10-08)。

日期：2026-10-03。当前工作分支：`codex/phase-1-initialization`，保留前一轮未提交的 Hero 修复；未自动 commit / push。

<a id="phase-2-execution--推进依据与边界"></a>
## 推进依据与边界

用户在本轮反馈“我真机测试后没有问题，请你继续往下做”。已登记本轮真机检查通过，并在尚无云开发环境的条件下推进阶段二可离线完成的设计 / 校验。阶段一 I03 / I07 的云身份、独立部署及 I08 的账号 / 资料核验继续待补，阶段一整体门禁没有被宣称通过。

阶段二也不能仅凭本地测试通过：D04 的真实 SDK 事务 / 并发、D06 的真实越权 / 安全规则和 D07 的云种子验收仍需要实际开发环境。

<a id="phase-2-execution--当前-task-状态"></a>
## 当前 Task 状态

| Task | 状态 | 本地交付 / 剩余条件 |
|---|---|---|
| D01 | 本地模型验收通过 | 用户已确认取消 / 退款政策；三轴、角色、异常矩阵、纯模型、代码 / 文档一致性审查与回归完成；真实接入由后续对应 Task 验证 |
| D02 | 本地设计验收通过 | 完整字段 / 快照 / 关系 / 金额 / 隐私字典及内部工具错误契约完成；22 个基线集合 + 3 个支撑集合为目标设计；未建库，下一项 D03 |
| D03 | 本地模型验收通过；经营配置待确认 | 三分类合法 SKU、逐行留言 / 合并、数量 / 行数 / 版本 / 所有权纯模型及 17 项回归完成；E05 / E06 正式值与资源分配仍待确认 |
| D04 | 离线设计 / 工具验证通过；云验收待外部条件 | 确定性 ID、规范请求指纹、幂等裁决、整单资源计划及 12 项回归；索引 / 事务预算已设计；真实 SDK、并发 / 回滚依赖 I07 |
| D05 | 本地履约模型验收通过；资料 / 云接入待补 | 用户已确认 30 分钟、自取 3 / 配送 1、20km 含边界 / 0 费、08:00–21:00；14 项回归通过；最新已确认每天营业及高德原始点；可信坐标转换 / 核验、提前量 / 窗口 / 支付保留等及真实云服务待补 |
| D06 | 本地身份 / 权限模型验证通过；云验收待外部条件 | 稳定用户映射、本人与门店能力 / 撤销校验、用户订单命令包装、25 集合拒绝直接 CRUD 草案与 16 项回归通过；实际越权、撤销竞争和规则生效依赖 I03 / I07 |
| D07 | 本地契约 / 工具验证通过；云种子及整体门禁待补 | 60目标action、DTO/权限/错误/幂等/分页/交易时序、HMAC游标、五个DRAFT记录只新增规划与本地CLI；22项回归；实际handler/SDK查询/云apply未实现 |

<a id="phase-2-execution--d01--冻结交易与状态规则"></a>
## D01 / 冻结交易与状态规则

```text
Task Goal           全额付款、自提 / 配送、取消审批与退款有一致、可测试的状态模型
Scope               三条状态轴、角色 / 异常矩阵、金额与退款预算、服务端纯模型、文档和回归
Affected Domain     Order / Payment / Refund / Identity / Resource boundary
Files               cloudfunctions/_shared/trade-model.js、tests/trade-model.test.js、模型 / 契约 / 执行记录
Data Flow           未来可信身份与资金证据 → 持久化快照 → 纯模型计划 → 领域事务及资金处理器
Dependencies        I08 的取消退款政策已由用户明确确认；实际云、门店资料仍按对应 Task 待补
Acceptance Criteria 自提 / 配送与异常矩阵齐全；非法状态 / 角色 / 金额被拒绝；旧定金隔离；未决条件明确
```

冻结政策的原始用户回复：付款后取消一律由商家审批；商家拒单全额退款；其他退款金额由商家审批。实施版本为 `v1-2026-10-03`。

可审查交付：[交易规则](../../TRANSACTION-RULES.md)、[D01 字段与约束](../../DATA_MODEL.md)、[内部调用 / 错误契约](../../API_CONTRACT.md)、[纯模型](../../../cloudfunctions/_shared/trade-model.js)、[回归测试](../../../tests/trade-model.test.js)。

覆盖：自提 / 配送正常路径、本人收货确认、跨门店 / 非本人拒绝、跳级 / 复活拒绝、付款后取消申请不改履约、制作后商家批准零 / 部分 / 全额退款、拒单补全剩余退款、未知付款不释放、迟到款不恢复订单、退款失败保留预算、超退款 / 非整数金额 / 旧版本拒绝。

模型只产生计划；没有网络接口、实际下单、资金调用或数据库事务，也不能伪装这些能力已验收。当前 user / store 函数没有接入本模块；主包没有新增业务代码。后续函数部署必须携带实际需要的共享模块，不使用包外 require。

验证命令：

```powershell
node --test tests/*.test.js
node scripts/check.js
git diff --check
```

本轮检查（2026-10-03）：全部 **42 / 42** 测试通过，其中 D01 新增 **13 项**；静态检查 **122 个 JS / JSON / WXML 文件**通过；主包源文件估算仍为 **1947 / 2048 KiB**；`git diff --check` 通过。政策、角色矩阵和代码已逐项核对。没有改动页面、上传或部署。

本机汇总：[D01 检查记录](../../../artifacts/phase-2-qa/report.json)。D01 已完成本轮本地验收，下一项为 D02 完整字段字典和快照关系；后续真实云证据不会用离线测试替代。

<a id="phase-2-execution--d02--原交接时的进行中状态历史"></a>
## D02 / 原交接时的进行中状态（历史）

已新增 `cloudfunctions/_shared/order-facts.js` 和 `tests/order-facts.test.js`：安全整数金额计算、订单金额一致性、商品 / 门店 / 联系人 / 地址 / 预约 / 运费 / 购物袋选中行快照的白名单复制与深冻结。输入仍须由未来服务端验证身份、报价、SKU、地址与经营规则；此工具不是完整字段校验器或真实订单接口。

原交接时 `DATA_MODEL.md` 尚未扩展为 D02 完整字段字典；集合、嵌套对象、隐私映射、关系和真实持久化约束仍待完成。没有创建数据库集合、部署云函数或接入资金能力。

交接前检查（2026-10-03）：全部 **48 / 48** 测试通过（原有 29 项 + D01 13 项 + D02 6 项）；静态检查 **124 个 JS / JSON / WXML 文件**通过；主包源文件估算 **1947 / 2048 KiB**；`git diff --check` 通过。主包估算不是微信实际上传包大小。本机 Node 不在 PATH，执行时使用 [交接文档](../../HANDOFF.md) 中的绝对路径命令。

用户本轮要求生成交接文档并转交另一个窗口，因此在 D02 进行中处停止开发。接手顺序与未提交改动见 [HANDOFF.md](../../HANDOFF.md)，不能把本节的测试结果视为 D02 整体完成或云验收通过。

<a id="phase-2-execution--d02--本轮本地设计验收完成"></a>
## D02 / 本轮本地设计验收完成

2026-10-03，用户要求读取 HANDOFF.md、保留未提交改动并继续 D02，中断后再次要求继续。沿原分支完成授权范围；本轮没有改业务代码、测试、Home 或其他页面，也没有提交 / 推送 / 上传 / 部署。

```text
Task Goal           完整字段、关系与金额 / 不可变订单事实有统一可审查基线
Scope               集合与嵌套字典、金额与流水对应、引用与版本、隐私读模型、内部工具契约
Affected Domain     Identity / Catalog / Cart / Checkout / Order / Payment / Resource / Admin
Files               DATA_MODEL.md、API_CONTRACT.md、总计划 / 本执行记录 / HANDOFF / README
Data Flow           未来可信服务解析事实 → quote → 重校验 → 原子订单头 / 行 / 资源 / 资金计划
Dependencies        D01 已完成；实际经营值 E04–E08 等留空 / 草稿，真实云能力待 E01 / E03
Acceptance Criteria 每字段类型 / 必填 / 默认 / 单位 / 可变性 / 隐私可查；白名单与代码一致；金额与快照已有回归通过
```

交付：[完整字段字典](../../DATA_MODEL.md) 覆盖计划内 22 个集合，并正式记录 inventory_resources / media_assets / refund_attempts 三个支撑集合的目标设计与采用理由；共 25 个，**均未创建**。所有集合共用 _id/schemaVersion/version/createdAt/updatedAt，明确纯模型 id 的映射、稳定 users ID 与 trace 摘要的区别。嵌套字段包括规格、购物袋行、时间 / 配送 / 费用 / 容量规则、全部代码快照、角色、资金证据与审计。

订单创建载荷 items 原子拆到 order_items，订单头不另存可编辑副本；事实与状态分界、默认地址单一指针、报价过期与创建重校验、库存不被报价占用、图片不可覆盖版本与历史保留要求均已明确。实收 / 成功退款 / 未决退款预算与资金意图对应；失败不释放，异常资金隔离而不被丢弃。真实经营值和资源单位未编造。

[内部契约](../../API_CONTRACT.md) 记录三个工具的输入输出、默认、错误码、传播与限制；文档更强的日期 / 坐标 / 电话 / SKU / 规则约束明确是未来服务前置条件，现有工具没有被报告为完整业务验证器或真实下单接口。

本轮验证：全部 **48 / 48** 测试通过（原有 29、D01 13、D02 6）；静态检查 **124 个 JS / JSON / WXML 文件**通过；主包源文件估算 **1947 / 2048 KiB**；`git diff --check` 通过。另对未跟踪的 D02 文档检查格式、相对链接、代码白名单、状态枚举与嵌套类型：25 个集合、82 项快照字段检查、37 个嵌套类型通过。82 是字段检查次数（含根对象引用），不是数据库字段总数。没有新增业务代码，因此沿用已有有意义的模型回归。

本机证据：[D02 字典检查](../../../artifacts/phase-2-qa/d02-dictionary-audit.json)、[D02 汇总](../../../artifacts/phase-2-qa/d02-report.json)，检查脚本及接手基线哈希同目录保存；artifacts 被 Git 忽略，不是已提交或换机可用证据。校验命令见 HANDOFF.md（Node 不在 PATH）。文档一致性检查不代表数据库 schema 已部署。

D02 完成本轮本地设计验收，下一项 **D03：合法 SKU 与购物袋行模型**。D03 可继续离线建模，但正式价格 / 图片 / 数量 / 留言上限、资源单位及共享策略仍须 E05 / E06。D04 SDK 事务并发、D06 权限、D07 云种子与阶段门禁继续待真实环境；没有把旧演示测试或离线检查写成新 V1 云验收。

<a id="phase-2-execution--审核期继续离线开发的授权"></a>
## 审核期继续离线开发的授权

2026-10-03，用户告知微信小程序正在审核、预计需要几天，并在确认可先做本地开发后要求“继续往下推”。因此继续 D03 和 D04 可离线部分，真实云 / 支付 / 权限验收保持待外部条件；不为了等待云环境而停掉所有本地工作，也不跳过最终门禁。尚无新的云环境、商户或正式经营资料。

<a id="phase-2-execution--d03--本轮本地模型验收通过经营配置待确认"></a>
## D03 / 本轮本地模型验收通过，经营配置待确认

```text
Task Goal           合法 SKU 和逐行留言 / 合并规则可执行、可测试，不凭组笛卡尔积造 SKU
Scope               三分类例、完整规格匹配、留言技术规范、数量 / 行数与版本、库存引用聚合
Affected Domain     Catalog / Specification / Cart / Checkout fact boundary
Files               catalog-model.js、cart-model.js、对应测试、tests/fixtures/catalog.js、规则 / 字典 / 契约
Data Flow           未来可信目录 / 配置 / 袋 → SKU 与留言解析 → 冻结袋计划 → 后续实际事务
Dependencies        D02 本地基线；E05 / E06 的正式值仍缺失，用明确离线测试参数验证算法
Acceptance Criteria 三分类可解析；未知组合拒绝；同 SKU 不同留言共存；面包无蛋糕步骤；独立 / 共享资源结构明确
```

交付：[D03 规则](../../CATALOG-CART-RULES.md)、[目录纯模型](../../../cloudfunctions/_shared/catalog-model.js)、[袋命令纯模型](../../../cloudfunctions/_shared/cart-model.js)。技术规范 unicode-nfc-trim-codepoints-v1：NFC、trim 首尾、Unicode 码点计数，完整 SHA-256 指纹，null 与空串区别保留；只同 SKU / 规范版本 / 文本行合并。未知规范版本不静默改旧留言。MAX 行数 / 数量来自配置，无正式默认经营值。

resolveSku 使用完整可信 SKU 表，未知 / 歧义 / 下架 / 缺配置拒绝，客户端价格和 label 不作权威。ADD 合并 / 新行、UPDATE 绝对数量 / 留言、REMOVE 删除均有 owner 与版本检查；下架行可删除，不把袋当库存预留。UNKNOWN 的配置 / schema / 规范版本须显式兼容，不靠删除绕过损坏数据验证。

已验证三分类离线例、NFC / emoji、缺经营值、非法 / 重复组合、同留言累加不能越上限、不同留言分行、旧袋 / 行版本、删除不复活、输入不变 / 输出冻结、资源乘加溢出 / 稀疏输入。新增 **17 项**通过，包含真实 D03 袋 → D02 订单事实回归。

E05 / E06 未确认正式 SKU / 价格 / 图片、数量 / 行数 / 留言上限、库存资源单位与分配策略。技术模型兼容独立与共享，并未代商家决定真实方案。D03 只标本地模型验收通过；正式经营冻结与 C03 / B01–B04 的页面 / 网络 / 持久化验收没有完成。

<a id="phase-2-execution--d04--离线设计与工具通过云验收待条件"></a>
## D04 / 离线设计与工具通过，云验收待条件

```text
Task Goal           后续订单 / 资源 / 资金有可审查的幂等、唯一性与原子写入方案
Scope               确定性 ID、请求 JSON 指纹、幂等重放裁决、全部资源 HELD 计划、候选索引 / 事务预算
Affected Domain     Order / Payment / Resource / Cart / Identity
Files               idempotency-model.js、resource-model.js、对应测试、TRANSACTIONS.md、字典 / 契约
Data Flow           可信命令 → 幂等查找 / 裁决 → 当前资源快照 → 冻结全部预留计划 → 未来实际 SDK 事务
Dependencies        D02 / D03；E01 / I07 SDK、云并发 / 回滚、实际索引仍未具备
Acceptance Criteria 离线算法 / 异常与预算设计可查；不得把纯计划作为真实云原子性证据
```

交付：[事务设计](../../TRANSACTIONS.md)、[幂等工具](../../../cloudfunctions/_shared/idempotency-model.js)、[资源预留计划](../../../cloudfunctions/_shared/resource-model.js)。规范 JSON 排键并拒绝非法输入 / getter；ID 分域且使用完整哈希；同键异参拒绝，终态仅重放白名单结果，过期租约仍先核实未知资金。预留计划统一付款截止、一资源一个需求，至少一个库存与唯一时段；同店、版本、余额、计数与版本溢出均检查。

25 集合候选索引 / 逻辑唯一性已列明；订单头 / 行 / 预留 / 计数 / 日志 / 报价消费 / 幂等为原子边界，基础写预算 4+n+2k（其它袋 / 审计 / 媒体等另计）；没有假设云 unique 索引支持或编造 SDK 操作上限。外部支付 / 退款始终在事务外，先持久化意图 / 预算，再可恢复处理。

新增 **12 项**离线回归通过。专门验证同一旧快照能两次产生计划，证明纯工具没有获取锁；库存 1 两人仅一成功、真正失败回滚、取消 / 回调竞争与权限依赖真实环境，**D04 整体未验收**。planResourceHolds 也不是完整时段 / 配送 / 资金验证器；现有 user/store 云函数尚未接入新增模块。

<a id="phase-2-execution--本轮联合验证与下一项"></a>
## 本轮联合验证与下一项

全部 **77 / 77** 测试通过：原有 29 + D01 13 + D02 6 + D03 17 + D04 12；静态 **133 个 JS / JSON / WXML 文件**通过；主包估算 **1947 / 2048 KiB**，与接手一致；`git diff --check` 和 D02 25 集合 / 82 次字段 / 37 嵌套类型一致性检查通过。D03/D04 导出 / 错误码契约、文档格式 / 相对链接及接手文件保护核对见本机报告。

本机证据：[D03 / D04 汇总](../../../artifacts/phase-2-qa/d03-d04-report.json)、[契约检查](../../../artifacts/phase-2-qa/d03-d04-contract-audit.json)，接手哈希同目录保存；artifacts 被忽略，不能当已提交或云端证据。

本轮新增模型 / 测试 / 文档，不改既有 Home、主包、D01 / D02 工具或旧演示，不 commit / push / 上传 / 部署。接手文件按基线保护，文档只增补本轮事实。

下一项本地工作为 **D05：门店时间、预约与配送规则模型**。D03 经营配置、D04 真实 SDK、D06 实际权限及 D07 云种子继续待对应资料 / 云环境；审核完成后须另行核验可用条件，不能视为自动通过全部云门禁。

<a id="phase-2-execution--d05--用户确认履约政策本地模型通过原验收记录"></a>
## D05 / 用户确认履约政策，本地模型通过（原验收记录）

2026-10-03，用户明确确认两种履约和 30 分钟时段、自取 3 / 配送 1 单独立容量、门店自行配送无骑手、20 km 含边界 / 0 元、预计配送时段与云端最终核验。用户随后提供门店地址描述“安徽省合肥市庐江县泥河镇沙溪邮电局对面”和营业 08:00–21:00；按中国当地时间 Asia/Shanghai 记录。地址描述不是经纬度，没有猜测中心点。

```text
Task Goal           已确认履约政策可执行与回归，预约 / 范围 / 容量边界一致
Scope               版本化 V1 政策、当地日期 / 营业网格 / 提前量 / 窗口 / 覆盖、真实 slot 校验、20km / 0费
Affected Domain     Store / Checkout / Order / Resource / Delivery
Files               fulfillment-model.js、fulfillment-model.test.js、FULFILLMENT-RULES.md、字典 / 契约 / 记录
Data Flow           未来可信门店 / 发布日历 / 商品提前量 / 位置 / slot → 模型复核 → D04 全资源事务
Dependencies        D02–D04；未确认位置 / 营业日 / 提前量 / 窗口 / 占用时长不以测试值代替
Acceptance Criteria 30分钟 / 3与1 / 独立容量 / 满额拒绝 / 范围含边界 / 0费 / 预计时间语义可检验
```

交付：[履约规则](../../FULFILLMENT-RULES.md)、[模型](../../../cloudfunctions/_shared/fulfillment-model.js)、[回归](../../../tests/fulfillment-model.test.js)。政策版本 v1-fulfillment-2026-10-03；完整正常营业日每模式 26 段，末段 20:30–21:00；当日是否营业必须从明确日历取值。当前 V1 只支持现代 Asia/Shanghai 和同日营业，拒绝跨午夜 / 重叠 / 30 分钟网格外 / 营业范围外输入。

未知门店 / 商品提前量、最大预约天数和支付保留时长拒绝，不默认 0 / 14 / 15。选中商品取最大提前量；付款截止不晚于提前量边界。slot ID 按环境 / 门店 / 模式 / 真实时段确定，不包含 policyVersion，避免改配置重开容量。只有真实资源记录匹配当前定义、OPEN 且 HELD+CONFIRMED+CONSUMED 未满才能取得 quantity=1 的 D04 slot 请求；没有执行占用，也没有解决实际并发。

配送以可信服务统一 WGS84 的版本化球面直线算法判断，0 费 / 含边界 / STORE_SELF / ESTIMATED 语义固定；缺坐标、非法 / 未转换位置拒绝。增加非零纬度精确边界回归时发现过小浮点容差，已修复为机器精度级容差（约 9.1e-8 米），超出 1 mm 仍拒绝。没有地图服务、坐标转换或正式中心点。源码 source/verifiedAt 只是结构输入，真实可信链必须在云端核验。

新增 **14 项**针对性测试通过；全套 **91 / 91**（原有 29 + D01 13 + D02 6 + D03 17 + D04 12 + D05 14）；静态 **135 个 JS / JSON / WXML 文件**通过；主包源文件估算仍 **1947 / 2048 KiB**；`git diff --check` 及文档 / 契约 / 字典核对通过。D02 快照白名单不变，更新字典为 25 个集合 / 82 次字段检查 / 38 个嵌套类型（增加模式容量类型）。

证据：[D05 汇总](../../../artifacts/phase-2-qa/d05-report.json)、[测试日志](../../../artifacts/phase-2-qa/d05-tests.txt)、[静态日志](../../../artifacts/phase-2-qa/d05-static.txt)、[契约核对](../../../artifacts/phase-2-qa/d05-contract-audit.json)，均仅本机 artifacts，被 Git 忽略，不是云证据。

D05 本地模型通过，资料 / 云接入待补：门店经纬度及来源、是否每天 / 休息日、正式电话、门店 / 商品提前量、未来窗口、支付保留时长、已付取消 slot 回补与真实身份 / 位置链仍未齐。已发异步澄清，尚无答复，不把沉默作确认。不改 Home / 主包 / 原模型或现有测试，没有 commit / push / 上传 / 部署。

下一项可推进 **D06 离线身份 / 权限方案**；D04 的 SDK 并发、D05 真实云最终核验、D06 越权、D07 云种子和阶段门禁依然待真实环境。上云前必须重校验地址范围、时段与容量，客户端判断不作权威。

<a id="phase-2-execution--d05-后续资料补充"></a>
## D05 后续资料补充

2026-10-03 最新补充：用户确认地址“安徽省合肥市庐江县X085沙溪派出所南侧约50米”，纬度 31.1498、经度 117.2886，来源高德地图；常规营业日每天，营业时间延续 08:00–21:00（Asia/Shanghai）。覆盖此前邮电局地址与营业日待确认状态。原始高德点按 GCJ-02 登记；当前距离模型只接收可信 WGS84，地图服务转换 / 核验仍待接入，stores.location / center 暂保持 null，不编造 verifiedAt。正式电话、临时停业覆盖、提前量、最大预约天数、支付保留与已付取消回补策略仍待配置。

已同步规则、字典、契约、外部条件与交接。本次仅更新文档，保留既有未提交成果；此前本地验证报告保持历史含义，无云部署或 UI 修改。下一项本地工作仍为 D06。

<a id="phase-2-execution--d06--身份所有权与门店能力本地验证通过"></a>
## D06 / 身份、所有权与门店能力，本地验证通过

2026-10-03，按用户继续授权完成离线权限方案。交付 [AUTHORIZATION-RULES.md](../../AUTHORIZATION-RULES.md)、[authorization-model.js](../../../cloudfunctions/_shared/authorization-model.js)、[16 项针对性回归](../../../tests/authorization-model.test.js)、[25 集合安全规则草案](../../../cloudfunctions/database/security-rules.draft.json)。

可信平台元组经完整分帧哈希映射用户，必须匹配持久化 ACTIVE 记录；缺用户不伪造身份。模块内 principal 防止直接接受客户端 actor，个人数据以真实 ownerId 校验；商家须同一条当前角色覆盖门店 / 全部能力。退款审批与普通履约分开，撤销 / 缩范围 / 移除能力拒绝下一次校验；用户包装器禁止付款证据与系统命令。复用 D01 / D03，不修改原模型。

规则清单明确所有目标集合普通客户端直接 CRUD=false，公开资料只由未来接口投影。草案尚未部署；真实网络身份、用户初始化、DTO 投影、角色管理 / 审计原子写入和撤销事务竞争仍待 I03 / I07 / A01 / 相关领域。当前 D06 为本地可验证部分通过，两个真实账号和云数据库安全规则验收未完成。

全套 **107 / 107** 测试通过（此前 91 + D06 16）；静态 **138 个 JS / JSON / WXML 文件**通过；主包源文件估算仍 **1947 / 2048 KiB**。执行日志为 artifacts/phase-2-qa/d06-tests.txt 与 d06-static.txt；保护基线和汇总报告同目录保存，仅本机、Git 忽略。

本轮保留既有 Home / 主包 / 原模块 / 测试与全部未提交成果，没有 commit / push / 上传 / 部署。下一项可推进 **D07 离线 API 契约、分页 / 错误与受控开发种子计划**；真实云事务、权限、种子与模型阶段门禁继续待外部条件。

<a id="phase-2-execution--d07--目标api分页开发草稿种子本地验证通过"></a>
## D07 / 目标API、分页、开发草稿种子，本地验证通过

2026-10-03，用户要求继续推进。本轮完成 [目标网络契约](../../API_NETWORK.md)、[种子方案](../../DEVELOPMENT-SEED.md)、[阶段模型评审](phase-2.md#phase-2-review)，新增api-contract.js / pagination-model.js / development-seed.js、plan-development-seed.js与三个测试文件。

目标60action逐项列身份、输入/输出、幂等、错误、分页；只有user.me/store.health现有最小逻辑，其余58项PLANNED。包含首次用户bootstrap自然唯一键、草稿管理读取、退款查询与条件能力边界；未新增网络handler或客户端开放。基础schema过滤客户端身份/价格/状态，未代替完整领域校验。

分页按技术默认20/最大50、15分钟游标；绑定可信环境/主体/action/规范查询/排序，HMAC防篡改，_id打破同时间边界。目录可变排序不声明跨页快照，SDK查询/索引待实际验证。开发seed仅三分类+门店+配置五个草稿；保持缺值null、GCJ02原点只在参考元数据，已有记录跳过不覆盖，不生商品价/管理员/资金；CLI仅生成本地计划，未apply。

D07新增22项（API8、分页7、seed7）通过，全套129/129（此前107+22），静态145文件通过，主包仍估算1947/2048KiB。本机artifacts/phase-2-qa/d07-tests.txt、d07-static.txt、d07-report.json、d07-contract-audit.json及保护基线；本地示例计划artifacts/development-seed/d07-plan.json，均Git忽略，不当云端证据。

阶段二可离线基线已完成本轮评审；D03正式经营、D04真实事务、D05地图/完整配置、D06实际越权、D07真实种子及整体门禁未通过。保留全部未提交成果、Home/主包和原模块，无commit/push/上传/部署。下一项阶段三C01可先推进本地目录/素材草稿管线，正式商品与实拍图仍需E05。

---

<a id="phase-2-review"></a>

## 原记录：PHASE-2-REVIEW.md

<a id="phase-2-review--阶段二模型评审本地基线与待云验收"></a>
# 阶段二模型评审：本地基线与待云验收

日期：2026-10-03。本轮 D07 完成可离线部分；**阶段二整体门禁尚未通过**。工作分支 codex/phase-1-initialization，全部成果仍未提交，无上传 / 部署 / 云数据或资金调用。

<a id="phase-2-review--本地结论"></a>
## 本地结论

全套 129/129 测试、145 个 JS/JSON/WXML 静态检查通过，主包源文件估算 1947/2048 KiB 不变；包含旧演示回归，不能把所有129项都描述成 V1 云端业务测试。D07 22 项为 API 基础 schema / 公开错误、HMAC分页与只新增的 seed 规划及 CLI 本地输出。

| Task | 已验证本地范围 | 尚未验收 |
|---|---|---|
| D01 | 13项交易三轴 / 全额分金额 / 取消审批 / 拒单全退 / 退款预算 / 迟到付款纯计划 | 真实资金与领域执行 |
| D02 | 25集合字典、82次快照字段核对、38嵌套类型、6项金额 / 事实捕获回归 | 实际集合 / 完整业务字段验证 / 历史素材保留 |
| D03 | 17项合法SKU / 留言 / 量限 / 袋合并 / 共享需求纯模型 | 正式商品 / 价格 / 素材 / 库存单位与持久化 |
| D04 | 12项分帧哈希 / 规范指纹 / 幂等 / 全资源计划；候选索引、事务预算 | SDK多文档事务、真实并发 / 回滚、索引与预算实测 |
| D05 | 14项当地日期 / 时间网格 / 3与1容量 / 提前量 / 截止 / 20km含边界 | 可信地图 / GCJ02转换、完整正式经营配置、云最终校验 |
| D06 | 16项稳定身份匹配 / owner / 门店能力 / 撤销 / 系统命令拒绝；25集合拒绝直写草案 | 实际平台身份 / 双账号 / 直写拒绝 / 撤销竞态与角色初始化 |
| D07 | 60目标action输入 / 输出 / 身份 / 幂等 / 错误、完整交易时序；22项基础schema / 游标 / 草稿seed | 所有目标业务 handler / DTO投影 / SDK查询 / 实际种子与真实模型门禁 |

输入白名单不是领域校验，纯函数冻结不是原子事务，命令计划不是已执行动作。现有客户端与两个最小函数继续仅 me/health，不能用 registry 已声明解释为已经开放60个接口。

<a id="phase-2-review--本轮评审与剩余风险"></a>
## 本轮评审与剩余风险

本地已实现范围审查未发现未关闭的资金 / 越权 / 丢单 P0；这不是对实际云服务的 P0 验收结论。以下外部 / 待实现条件持续阻塞整体完成：

- E01 / I03 / I07：云环境、可信 SDK 上下文、独立函数依赖、规则读回、事务冲突语义、索引与操作限额。
- E03：真实支付接入二选一、商户关联、签名 / 加密 / 唤起参数及受控实付退款证据。
- E04 / E05 / E06 / E07 / E08：正式电话、SKU价格 / 图片 / 留言 / 数量限制、库存单位、预约提前量 / 未来窗口、报价与支付时效、已付取消回补、可信地图坐标与地址来源。
- E10 / E12 / E13：提货凭证形式 / 限速、初始管理员真实身份、隐私 / 售后与素材资料。
- 分页是稳定seek，不是对可变sortOrder/updatedAt/状态的跨页快照；真实join/门店数组查询不能凭本地计划推断SDK支持。
- seed 仅五个DRAFT记录与参考元数据，无apply；真实重复执行 / 唯一键并发 / 受控运维权限尚未验证。
- user.bootstrap、所有目标handler、公开DTO、角色管理与审计、支付 / 退款处理器尚未实现；不得绕过D06直接调用原D01并接受客户端actor。

<a id="phase-2-review--证据与继续入口"></a>
## 证据与继续入口

本机 artifacts/phase-2-qa/d07-tests.txt、d07-static.txt、d07-report.json、d07-contract-audit.json、d07-baseline.json；草稿输入 / 计划在 artifacts/development-seed/d07-input.json 与 d07-plan.json。artifacts 被 Git 忽略，只代表本机离线证据。

规则与目标接口见 [API_NETWORK.md](../../API_NETWORK.md)、[DEVELOPMENT-SEED.md](../../DEVELOPMENT-SEED.md)、[AUTHORIZATION-RULES.md](../../AUTHORIZATION-RULES.md)、[TRANSACTIONS.md](../../TRANSACTIONS.md)。门店最新已确认每天08:00–21:00及高德原始点；未转换坐标仍不作为 WGS84。

下一项阶段三 C01 可先准备目录 / 素材的本地数据加载与草稿管线；正式商品与图片、云发布等待 E05 / 环境，不将 tests/fixtures/catalog.js 或 UI预览当正式目录。阶段二云门禁随条件补验，不重建工程或改已验收Home。

---

<a id="authorization-rules"></a>

## 原技术文档的验收/过程记录：AUTHORIZATION-RULES.md

# D06：身份、所有权与数据库权限

日期：2026-10-03。权限方案版本 v1-access-2026-10-03。状态：服务端纯模型 / 离线回归与安全规则草案；未部署，未接入现有 user.me / store.health。实际云身份 I03、两个真实账号越权、即时撤销和直写拒绝仍待环境。初始管理员真实身份 E12 尚未提供。

## 身份来源与持久化边界

信任链为 cloud.getWXContext() → 匹配服务端 AppID / environment / stage → 本环境 users 记录 → 本人或当前门店授权 → 领域校验 → 事务 → 白名单 DTO。OPENID / APPID / ENV 必须来自 SDK 的可信上下文，不从 event、payload、URL、缓存角色或旧 staff PIN 取值。[微信服务端 SDK 类型定义](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/index.d.ts)列出了这些上下文字段；本项目实际部署时仍需 I03 核验上下文与调用来源。

identityFromPlatform(context,settings) 产生内部映射对象 _id/environment/appId/openId；_id 为 D04 scopedDocumentId('user',[environment,appId,openId])，完整 SHA-256 与 JSON 元组分帧，不用 16 位 subjectHash，不把 unionId 当本应用 owner。该对象含平台标识，不返回客户端或打印日志。平台元组在 users 字典中已有，不新增集合字段。

首次登录需未来 User 服务按该确定性 ID 原子创建一次 users；并发登录不得覆盖已有 profile / 默认地址 / status / version。不得由客户端指定用户 ID、status 或权限。当前没有写库，缺记录抛 USER_NOT_PROVISIONED，不返回伪造 ACTIVE 用户。已有记录必须与完整平台元组及确定性 ID 相符；不自动迁移未知旧 ID。

resolveCustomer(context,settings,user) 只接受匹配的 schemaVersion=1、非负安全整数 version 和 ACTIVE 用户，DISABLED 拒绝；返回冻结内部 principal：type=CUSTOMER、subjectId、environment、appId、userVersion。WeakSet 标记限制复制 / JSON 反序列化 / 自造对象被当作本模块已解析身份，不能代替平台认证。context/settings/user/roles 仍必须由可信服务构造；服务若把请求身份当 SDK 上下文传入，纯模型无法识别。

每个请求重新加载 users，principal 不跨请求缓存或持久化，不是客户端 session / token。敏感修改须在事务中重查用户及角色，并核验相应版本；userVersion / roleVersion 仅是计划证据，不是已经实现的数据库锁。

## 个人与公共读取

requireOwner(principal,record) 对可信数据库记录比较 ownerId=subjectId，并返回 D01 / D03 接口使用的 CUSTOMER actor。不接受请求自报 ownerId 来替换数据库字段；先由正确环境中的服务读取实体。地址、袋、收藏、报价、订单使用同一边界，顾客请求中的 userId/ownerId/role/status/金额不写入模型。

列表服务端强制 ownerId 条件，分页游标绑定同环境 / 主体 / 查询与排序；先限权再分页，不能全表读取后按前端条件筛选。未找到与无权访问实体在网络 handler 层采用统一公开结果，防止猜 ID 泄露；当前纯模型 FORBIDDEN 为内部错误。

order_items / order_logs / cancellation_requests / payments / refunds 等关联记录先加载父订单并检查本人或对应门店能力，再按 orderId 查询和投影；不能用 requireOwner 检查一个没有 ownerId 的子记录来代替父记录授权。地址更新不改变已创建订单快照；自提结果剔除配送隐私。

公共目录及门店资料通过接口投影，不直接公开原文档。发布分类、ON_SALE 商品与其同店 ON_SALE SKU、正式门店必要资料才可返回；下架 / 草稿不可通过详情 ID 绕过。价格 / 规格由 D03 校验，媒体只输出公开引用。完整配置、原始资源需求 / 计数、角色 / 平台映射、成本、资金报文、地理评估指纹不进公共 DTO。字段清单沿用 [DATA_MODEL.md 读模型](../../DATA_MODEL.md#客户端读模型与隐私边界)；投影 handler 与完整 DTO 留 D07 / 后续领域，当前没有新公开读取接口。

## 商家能力与门店范围

admin_roles 每次敏感操作按可信 subjectId 查询本环境最新记录。能力词表严格六项，无 wildcard，空能力不放行。ACTIVE 必须 revokedAt=null；REVOKED 必须有正整数撤销时间且无访问权限。角色 _id / schemaVersion / version / subjectId / 门店与能力数组需有效；重复门店 / 能力 / 角色 ID 或未知能力拒绝。

requireStoreCapability(principal,roles,storeId,requiredCapabilities) 必须由同一条 ACTIVE 授权同时覆盖用户、该门店和全部要求能力；不拼接不同门店或拆分授权组合能力。返回 STORE actor 只含本次门店 / 能力以及 grant{roleId,roleVersion,userVersion}，不散播整份授权范围。多条授权可用于不同职责，但复合操作需明确完整授权。

| 操作 / 读取 | 必要能力与范围 |
|---|---|
| 商家订单列表 / 详情、接单、制作、就绪、配送、核销、确认送达、拒绝取消申请 | ORDER_OPERATE + 当前订单 storeId |
| 批准已付取消（含批准 0 元退款）、商家拒单全额退款 | 同一角色 ORDER_OPERATE + REFUND_APPROVE + 当前订单 storeId |
| 独立售后退款审批、必要退款异常摘要 / 经服务核实的重试编排 | REFUND_APPROVE + 当前订单 storeId；金额 / 幂等 / 资金证据仍需领域校验 |
| 商品 / SKU / 素材发布维护 | CATALOG_WRITE + 目标 storeId |
| 门店 / 预约 / 配送配置维护 | CONFIG_WRITE + 目标 storeId |
| 角色授权 / 撤销 | ROLE_MANAGE + 目标角色所有门店；另需委派边界校验 |
| 脱敏审计读取 | AUDIT_READ + 查询 storeId；无关门店与全局初始化审计不可自动放行 |

能力是技术词表，不替用户选择人员职责。CATALOG_WRITE / CONFIG_WRITE / ROLE_MANAGE / AUDIT_READ 不隐含 ORDER_OPERATE 或 REFUND_APPROVE。退款审批不能伪造实收 / 退款成功事件，不授权读取平台原始报文或密钥。商家个人地址 / 袋仍按 CUSTOMER 本人权限访问。

planUserOrderCommand(order,command,principal,roles,args) 先按上表解析 actor，再复用 D01 planOrderCommand 的状态、金额、版本与 requiredEffects。本人允许 CANCEL_UNPAID / REQUEST_CANCELLATION / COMPLETE_DELIVERY；自提核销须门店 ORDER_OPERATE 和未来有效凭证。PAYMENT_CONFIRMED / 过期任务不在用户命令白名单，六项商家能力也不能调用。原 D01 函数保留为内部工具，网络入口不能跳过包装接受 event.actor。系统处理器验证与支付入口在对应领域落实，当前没有可调用的 SYSTEM 身份工厂。

## 授权与撤销流程设计

初始管理员由受控运维流程核验真实微信身份，指定最小门店 / 能力，并写授权与审计；E12 缺身份，不生成管理员、白名单或示例 PIN。初始化不能作为普通客户端 action，不从首次访问者自动授予管理员。

角色管理服务除 ROLE_MANAGE 外，保证目标门店和委派能力不超过操作者当前授权；禁止本人通过此流程修改自身角色、追加无关门店或扩张能力。撤销不删除记录：按版本设 REVOKED、revokedAt、version+1 并审计。全局授权需独立受控运维入口。2026-10-06 [A01](phase-8.md#a01-admin-authorization) 已补内部离线事务：同一当前授权覆盖完整委派范围，角色 / 脱敏审计 / 回执原子；初始化独立受控 / 一次性。真实人员 / 入口 / SDK 仍未接入，不能只调用 requireStoreCapability 就直接写 admin_roles。基础 D06 guard 保持原兼容边界，A01 服务额外校验环境、应用、角色主键、时间与审计引用。

撤销后下一次操作重新读角色即拒绝，不信任登录时角色或入口状态。进行中的敏感事务需角色 / 用户版本与状态的并发校验，和业务写入原子提交；若 SDK 无法保证读集冲突，须验证可用写入栅栏 / CAS 方案，不凭纯函数保证撤销竞态。检查失败或资金状态未知不继续副作用。管理入口显隐只改善体验，直接打开页面、调用函数也要鉴权。

## 数据库安全规则草案

[security-rules.draft.json](../../../cloudfunctions/database/security-rules.draft.json) 是本地清单，25 个目标集合全部普通客户端直接 read/write/create/update/delete=false；包含公开目录集合，因为公开读取经投影接口进行。新增集合默认拒绝，先补清单 / 字典。初始化规则须在集合可访问前完成并逐集合读回核验。

清单外层 schemaVersion/policyVersion/status/clientAccess/collections 是本项目元数据，不是可整体提交的腾讯 API 参数。将每个 collections[name] 规则对象单独配置到集合，明确 false 的五项操作，避免相反的 create/update/delete 覆盖。当前没有创建集合、上传规则或执行管理 API。

[CloudBase 官方规则说明](https://cloud.tencent.com/document/product/876/123478)支持 JSON 布尔规则，create/update/delete 未配置时继承 write。[官方云函数示例](https://docs.cloudbase.net/recipes/secure-database-multi-tenant-rules)说明客户端规则不能替代管理员身份运行的云函数内鉴权，因此还需服务端所有权 / 能力检查。草案格式不代表开发环境已验证有效。

云函数调用权限与数据库权限分别管理；I03 / I07 核验实际入口 / SDK / SOURCE 及服务账户。用户入口不得提供任意集合读写。回调、定时任务、受控初始化独立入口，客户端无管理密钥。支付回调 HTTP 入口仍需验签、商户 / 应用 / 金额 / 事件身份与幂等证据。云存储公开素材 / 上传规则另按媒体领域设计，本草案不代表文件权限已完成。

## 离线与真实验收

[authorization-model.js](../../../cloudfunctions/_shared/authorization-model.js) 与 [authorization-model.test.js](../../../tests/authorization-model.test.js) 覆盖稳定身份、环境隔离、禁用 / 缺用户、伪造 principal、跨用户记录、门店 / 能力隔离、撤销、复合退款权限、系统命令拒绝、D01 / D03 衔接、不可变输出及 25 集合清单。身份、用户、角色、订单参数均为隔离测试资料。

真实环境仍需以下证据，不能用离线通过标 D06 整体验收：

| 实际用例 | 期望 / 证据 |
|---|---|
| 两顾客 A / B，经接口管理地址 / 袋及查看报价 / 订单 | 本人成功；互查 / 互改和子记录猜 ID 失败，无资源 / 财务副作用 |
| 伪造 openid / userId / actor / role / ownerId / 价格 / nextStatus | 可信主体不变，非法字段拒绝或白名单丢弃；不存在提权 |
| 非管理员直开管理页面 / 调函数，目录角色请求退款 | 入口及服务端拒绝，日志不泄露隐私 |
| 门店 A 管理员访问门店 B | 列表 / 详情 / 修改拒绝，传 storeId 不绕过 |
| 撤销 / 禁用后下一次操作，以及与敏感事务竞争 | 最新授权生效，事务冲突 / 重试不能使用旧权限 |
| 客户端 SDK 对 25 集合执行直读 / 直写 | 拒绝；特别核验角色、订单、价格、财务、支付事件；不能用管理员 SDK 测试 |
| 公开接口查询草稿 / 下架 / 内部字段 | 只返回发布投影，无完整配置、角色、资源或隐私 |
| 假回调 / 用户调用系统证据入口 | 拒绝，真实入口按独立认证机制核验 |

当前没有改现有函数部署包、Home / 主包或云配置。下一项 D07 可推进离线 API 契约 / 开发种子计划；完整接口、真实部署与阶段门禁仍受外部条件约束。


---

<a id="development-seed"></a>

## 原技术文档的验收/过程记录：DEVELOPMENT-SEED.md

# D07：开发种子与可重复计划

日期：2026-10-03。revision=development-draft-v1-2026-10-03。当前是本地无副作用规划器与只写 JSON 的 CLI；**未创建云集合 / 写入云数据 / 执行管理员初始化**。

实现：[development-seed.js](../../../cloudfunctions/_shared/development-seed.js)、[plan-development-seed.js](../../../scripts/plan-development-seed.js)、[回归](../../../tests/development-seed.test.js)。测试目录中的 catalog.js 明确 OFFLINE TEST ONLY，不能被 seed 引入。

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

---

<a id="d04-read-protection-20261009"></a>
## D04 SDK读取保护实测与接入决策（2026-10-09）

来源：本轮用户在test探针更新、配置起两小时和最多9个隔离文档的明确范围后要求继续推进；不复用昨日授权。环境`dinner-cook-test-d5e320u981ec341`，AppID`wx154f791a17268ace`，wx-server-sdk=4.0.2，run=`d04-read-20261009-1791514384-3d87b5`。原生identify主体与原白名单一致，管理端调用不代替微信身份。

每个实验先让事务A读取依赖并暂存独立decision，再由事务B修改该依赖并提交，最后提交A。两事务操作均指向本轮确定的探针文档；手动事务不自动重试实验。query-empty使用同一事务内限定scope/run/case/owner/type的where查询，不用事务外查询补结果。

| 读取依赖 | A读到的状态 | B提交后状态 | A提交及落库事实 | 云函数requestId |
| --- | --- | --- | --- | --- |
| 已有文档 | version=0 | version=1 | 提交成功，decision仍记observedVersion=0 | dc3050c7-ca1f-4d62-b678-e99fdc5ac2d7 |
| 不存在文档 | null | version=1新文档 | 提交成功，decision仍记observedVersion=null | 94b4db3d-9f55-49c7-a4a7-6d9a5479274c |
| 空查询 | 空匹配集 | 新增匹配记录version=1 | 提交成功，decision仍记observedVersion=null | d1b2c849-d017-49cf-80fc-183869d43581 |

三项均为STALE_COMMIT，读取保护断言0/3；这是事务能力的负向实测，不能写成保护验收通过。事务内where在该部署实际可执行，与文档列出的限制不同，但空谓词没有阻止新匹配记录。原生传输无重试，不能以此证明真实丢响应恢复。

接入决策：SDK快照读、重读比较及唯一索引均不足以完成protectReads；保护已有依赖与缺失/查询谓词需分别建立实际提交约束，并覆盖所有相关写路径及额外操作预算。不能仅把现有读取包装成返回true的hook后开放购买。这里不选定未经云验证的字段或新集合方案。

原始证据：[三次原生响应/平台请求标识](../../qa/d04-cloud/native-1791514800945.json)、[三集合按run精确读取](../../qa/d04-cloud/read-protection-20261009/documents.json)、[授权](../../qa/d04-cloud/read-protection-20261009/authorization.json)、[原生主体](../../qa/d04-cloud/read-protection-20261009/identity-cli.json)、[部署回读](../../qa/d04-cloud/read-protection-20261009/deployment.json)。本轮落库resources=3、records=6、receipts=0，共9个隔离文档；无正式订单。保留原文档及证据，不进行清理。

窗口原截止香港12:53:04，实验结束后于11:02:18提前设为过期；原生同一合法操作返回PROBE_NOT_AUTHORIZED，请求标识及配置恢复见[原生关闭验证](../../qa/d04-cloud/read-protection-20261009/closure-cli.json)、[环境恢复原记录](../../qa/d04-cloud/read-protection-20261009/environment-recovery.json)。当前进度、阻塞和下一步仅维护在[CURRENT-STATUS](../../CURRENT-STATUS.md)。

<a id="d04-write-protection-20261009"></a>
## D04实际写入保护与事务终止判定（2026-10-09）

来源：用户明确同意只更新test的jjl-d04-probe、原操作者白名单、最多2小时、现有3集合及最多22个新文档。run=`d04-write-20261009-1791515997-acb5d0`。代码新增实际版本写入与协作保护记录；用不参与保护记录的写入作为反例。不改正式订单session/入口/字段，不把原生读取当完整保护。

事务A读旧依赖并暂存独立决策；早写场景先改变已有依赖版本，其他场景等事务B改变依赖后再写保护版本。缺失/查询使用预先存在的READ_FENCE记录，协作方B在同事务改变该记录后插入依赖。所有保护写均改变version，未用相同值更新。手动事务不自动重试；已使用案例不重跑。执行器可指定严格校验的子集，并明确complete=false和notRun，避免将部分取证当完整套件通过。

| 场景 | 原生结果 | 按run只读回查 | 证据 |
| --- | --- | --- | --- |
| write-existing-early | PROBE_ROLLBACK_UNCONFIRMED | 依赖version=0，无决策 | [原始响应](../../qa/d04-cloud/native-1791516078363.json) |
| write-existing-late | PROBE_ROLLBACK_UNCONFIRMED | 竞争方依赖version=1，无决策 | [原始响应](../../qa/d04-cloud/native-1791516260558.json) |
| fence-missing | PROBE_ROLLBACK_UNCONFIRMED | 保护记录version=1，新依赖version=1，无决策 | [脱敏诊断响应](../../qa/d04-cloud/native-1791516626647.json) |
| fence-query-empty | NOT_RUN | 没有该案例文档 | [执行记录](../../qa/d04-cloud/write-protection-20261009/execution.json) |
| bypass-missing | STALE_COMMIT，反例预期成立 | 保护记录和依赖version=1，决策仍记null | [两个反例响应](../../qa/d04-cloud/native-1791516685407.json) |
| bypass-query-empty | STALE_COMMIT，反例预期成立 | 保护记录和依赖version=1，决策仍记null | [两个反例响应](../../qa/d04-cloud/native-1791516685407.json) |

fence-missing诊断：先按严格DATABASE_TRANSACTION_CONFLICT标记识别读取方冲突；后续rollback报DATABASE_TRANSACTION_FAIL，消息经分类为TRANSACTION_TERMINAL。primary诊断仅完整字段匹配，因此输出providerCode=UNKNOWN、numericErrCode=-501001；不能把该UNKNOWN解释为没有触发冲突。未记录完整SDK消息/上下文/身份/凭据。尚缺精确终止语义及接受条件：不能仅凭文字分类或没有决策文档就承认保护成功。另一方回滚失败也必须尝试清理本方，本地测试已覆盖。

结论：3个协作保护案例同类回滚未确认，停止增量补丁；整体应复核冲突后终止状态、诊断代码提取、清理双方及最终持久化证据的接受规则，再验证保护协议。两个反例证明共享保护记录必须覆盖所有相关写路径，但不证明协作协议整体已通过。正式protectReads/findOrderByNumber仍未接通，正式订单/支付门禁保持关闭。

执行取证：日志服务未开启，旧函数日志接口已下线，未开通新服务。自动化通道3次超时后只关闭/重开原d04-identify test工程窗口s1并编译identify页，恢复后原生运行版本确认d04-write-guard-diagnostic-1。首次诊断部署后响应未带diagnostic，未把原因确定为版本延迟；最终有版本标记的响应保留。最终独立包artifacts/d04-write-protection-revision-20261009的11文件与源码哈希一致，完整回归1062/1062、87文件、静态415；见[执行/验证记录](../../qa/d04-cloud/write-protection-20261009/execution.json)。

授权与收尾：[授权](../../qa/d04-cloud/write-protection-20261009/authorization.json)、[资源/权限](../../qa/d04-cloud/write-protection-20261009/preflight.json)、[原生身份](../../qa/d04-cloud/write-protection-20261009/identity-cli.json)、[首次部署及配置回读](../../qa/d04-cloud/write-protection-20261009/deployment.json)。共resources=8、records=7、receipts=0，新增15个，低于22上限；全部保留。[原始文档](../../qa/d04-cloud/write-protection-20261009/documents.json)。香港11:31:42提前关闭，原生合法操作返回PROBE_NOT_AUTHORIZED，工具恢复development；[关闭回读](../../qa/d04-cloud/write-protection-20261009/closure.json)。

