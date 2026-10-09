# 商家管理：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [A01-ADMIN-AUTHORIZATION.md](#a01-admin-authorization)
- [A02-MERCHANT-ORDERS.md](#a02-merchant-orders)
- [A03-PICKUP-SESSION.md](#a03-pickup-session)
- [A04-MERCHANT-CATALOG.md](#a04-merchant-catalog)
- [A05-MERCHANT-STORE.md](#a05-merchant-store)
- [A06-MERCHANT-RESOLUTION.md](#a06-merchant-resolution)
- [A07-ADMIN-ACCEPTANCE.md](#a07-admin-acceptance)
- [PHASE-8-EXECUTION.md](#phase-8-execution)

---

<a id="a01-admin-authorization"></a>

## 原记录：A01-ADMIN-AUTHORIZATION.md

<a id="a01-admin-authorization--a01-商家受控授权撤销与审计"></a>
# A01 商家受控授权、撤销与审计

日期：2026-10-06。状态：**可离线部分通过，整体及真实入口未验收**。接续 P08 离线工作；P08 真实门禁仍未通过，不开放正式运营。

<a id="a01-admin-authorization--本轮实现"></a>
## 本轮实现

新增 [admin-access-service.js](../../../cloudfunctions/_shared/admin-access-service.js)，只提供内部事务编排。身份来自 D06 principal，重新加载可信 users；平台映射主键、环境、AppID、状态和版本均校验。当前没有 admin 云函数、SDK 适配器或小程序接线，只有 tests 串行内存适配器。未授权真实账号。

2026-10-06 后续 A02 将完整角色 / 门店记录校验提取到 [admin-access-state.js](../../../cloudfunctions/_shared/admin-access-state.js) 共用，未降低本节规则；A01 32 项回归仍包含在 A02 全量 800 项中。本节 QA / 指纹是 A01 原轮次，最新整体证据见 [A02](phase-8.md#a02-merchant-orders)。

| 方法 | 已有离线行为 | 尚未接入 |
|---|---|---|
| bootstrap(invocation) | 独立受控调用验证器 / 授权资料加载器；显式主体、门店、六项能力、资料版本和有效期；角色 / 永久初始化审计标记 / 回执同事务创建 | 真实运维身份、E12 人员核验、批准资料来源、撤销 / 版本与期限的真实提交栅栏 |
| execute(event,principal) | 沿用 admin.role.grant / role.revoke 目标契约；当前授权、委派范围、版本、幂等、审计和三写原子回滚 | admin handler、公开错误映射、SDK 事务 / 唯一约束、管理界面 |
| entrySummary(principal) | 当前用户 / 角色 / 非归档门店生成本人门店摘要；普通用户无商家角色 | 我的页入口、路由守卫和真实会话；entryAllowed 固定 false |
| requireCapability(principal,storeId,capabilities) | 当前事务重新读取身份 / 角色并复用 D06 同一授权校验，返回狭窄观察结果 | 真实业务事务仍须自行重查；观察结果不是跨请求令牌 |

所有操作结果均为 OFFLINE_ADMIN_ACCESS_RESULT；cloudVerified / callable / entryAllowed / operationsAllowed 固定 false。entrySummary 为 OFFLINE_ADMIN_ENTRY_SUMMARY，同样不开放入口。客户端 admin 请求在云服务 allowlist 前被拒绝，测试平台调用为 0。既有 UI、user.me / store.health 和 prepare-cloud 行为未改。

<a id="a01-admin-authorization--权限与生命周期"></a>
## 权限与生命周期

初始化不是普通 action，不接受首个访问者、客户端 role / actor / PIN。verifyBootstrapInvocation 必须明确返回 true，再由服务器 loadBootstrapAuthorization 取受控资料。测试只是对象身份比较，不是部署身份认证。资料含 schemaVersion=1、非负 version、environment、appId、authorizationId、subjectId、storeIds、capabilities、validFrom / expiresAt（UTC 毫秒）及 reason；时间采用 [validFrom,expiresAt)，须含 ROLE_MANAGE，不默认授全权。A01 测试的全能力仅为合成夹具，真实最小能力与人员仍待 E12。

角色管理不允许本人给自己授权或撤销自己。委派要求**同一条当前 ACTIVE 授权**包含全部目标门店及 ROLE_MANAGE 和全部委派能力；不拼接不同能力 / 门店授权，不将 ROLE_MANAGE 当 wildcard。撤销要求同一条 ROLE_MANAGE 授权覆盖被撤销角色全部门店，不能按请求缩小目标范围。

grant 只创建新角色，不覆盖或修改已有记录；相同主体 / 门店集合 / 能力集合已有 ACTIVE 时，另 key 报 ROLE_ALREADY_ACTIVE。不同职责授权可并存，复合操作继续沿用 D06 的同一授权规则。明确重授权需新 key / 新角色，旧 REVOKED 角色保留。revoke 只把 ACTIVE / version 0 转成 REVOKED / version 1，保留原主体、范围、能力、grantor 和审计引用；第二个新 key 的旧版本撤销拒绝。现阶段不支持原地编辑角色或无版本升级。

目标必须为已初始化、同环境 / AppID 的有效 users 映射。禁用人员不能新获授权或访问商家能力，但可被撤销。归档门店不开放入口 / 敏感观察或新授权，仍允许有范围权限者清理角色。缺失 / 错映射 / 跨店、角色损坏或不完整读集均关闭操作。每个敏感请求重查角色；已撤销下一次拒绝。旧入口摘要和观察结果不能用于下一笔业务事务。

<a id="a01-admin-authorization--幂等审计与并发契约"></a>
## 幂等、审计与并发契约

回执作用域绑定 environment、[appId,主体]、command、key；请求 canonical SHA-256 包含完整允许输入。同 key 重建服务可重放，改输入拒绝；重放前仍校验当前操作者授权，并核对原角色 / 审计 / 回执的身份、版本、时间、范围和结果。旧 grant 重放只返回历史创建结果，不恢复已撤销角色。受控 bootstrap 同 key 可重放历史，新批准 ID 不能再次初始化；永久标记及曾有 ROLE_MANAGE 历史都阻止重置。

角色 ID 绑定 environment / appId / grantAuditId；普通授权审计 ID 绑定 scoped receipt，初始化审计为环境 / 应用唯一永久 ID。审计存真实 ActorRef、目标前后版本、status 标量变化、明确 storeIds 与单门店 storeId（多门店 null）、服务端 requestId、脱敏 reason 与 outcome。多门店 storeId=null 不代表全局公开，未来审计读取须检查整个 storeIds。用户原始 reason 仅参与摘要，交由服务器 redactReason 脱敏后保存；不保存 OPENID、PIN、电话或原始请求。

每次初始化 / 授权 / 撤销三写：角色、追加 audit_logs、SUCCEEDED idempotency_records。任一异常或非 1 行结果整体回滚。所有审计只插入，不删除或覆盖；初始化标记 / 角色历史不得 TTL 擦除。未新增集合，安全规则继续拒绝普通客户端直接写角色。

注入的 runTransaction 必须在提交后才返回，并保护：

- 最新用户、完整 environment / appId 角色读集与门店头及其版本；包含查询范围中的不存在记录，不能漏页后自报 complete=true。
- receipt / audit / 新角色的不存在及唯一条件；并发同范围新授权不能穿透空集查询。
- bootstrapAuthorization 整份受控资料快照、version、批准状态与 [validFrom,expiresAt) 到实际提交时仍有效；不能只在事务开始判断期限。
- 角色撤销 / 用户禁用与敏感写入竞争；读集冲突须重读重验，不能只 CAS 目标角色后沿用旧管理权限。

assertAccessReads 收到这些内部证据并须返回 true；角色 / 用户快照包含内部资料，禁止当 DTO 或日志输出。readAccessState 提供 complete=true、environment / appId、完整 roles 和可信同范围 stores 头（_id / scope / schemaVersion / version / status）；stores 的 scope 由可信加载器绑定，不取客户端字段。真实 SDK 需落实有界查询、读集冲突 / 写入栅栏、唯一索引及批准来源保护。测试采用整库快照保护和串行队列，**不证明实际 SDK 并发**。

<a id="a01-admin-authorization--本轮验证"></a>
## 本轮验证

新增 **32 项**专项，最终全套 **766/766**；静态 **288** 个文件通过，主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。证据见 [最终 TAP](../../qa/a01-2026-10-06/full-final.tap)、[静态日志](../../qa/a01-2026-10-06/static-final.txt)及 [摘要](../../qa/a01-2026-10-06/summary.md)。较早 full.tap 的 765 项是补初始化批准 / 期限栅栏前的轮次，最终以 full-final 为准。

覆盖：初始化伪造 / 首访 / 错映射 / 配置 / 时间 / 一次性、跨店和能力委派、自修改与拼接拒绝、禁用 / 归档清理、撤销即时读取、服务重建与重授权不复活、审计 / 回执损坏、原始理由隐私、三写逐位置异常 / 零行回滚、重复 / 不同 key 竞争、提交期间撤销 / 禁用 / 门店版本 / 初始化批准变更 / 期限、时钟倒退及客户端入口持续关闭。

首轮发现数组校验回调的下标误作为文本长度参数，已修正；测试夹具的未知角色读取与客户端错误形式也已纠正。之后补齐审批版本 / 提交期限栅栏与回执审计时间一致性，没有降低权限或放开真实入口。

<a id="a01-admin-authorization--真实验收待补"></a>
## 真实验收待补

| ID | 场景 | 状态 |
|---|---|---|
| AR01 | E12 真实人员 / 微信映射、最小能力和受控初始化批准；普通客户端调用初始化拒绝 | NOT_RUN |
| AR02 | 两普通账号直开商家页面 / 调函数 / SDK 直写角色，均拒绝且无副作用 | NOT_RUN |
| AR03 | 授权者 / 受权者的正确门店成功、他店 / 超能力 / 自修改拒绝，真实审计留痕 | NOT_RUN |
| AR04 | 撤销 / 用户禁用后的下一请求及与敏感事务竞争，不继续使用旧授权 | NOT_RUN |
| AR05 | SDK 同时初始化 / 空集授权 / 撤销，仅一次有效提交，三写失败全部回滚 | NOT_RUN |
| AR06 | 网络丢响应原 key 恢复、审计完整性、角色重授权历史、多店审计隔离 | NOT_RUN |
| AR07 | 批准变更 / 撤销 / 到期在真实提交边界生效；运行身份、规则 / 索引逐项读回 | NOT_RUN |

E01 云环境 / SDK、E12 管理员真实身份及 D06 / P08 实际门禁未齐。页面入口、角色列表 / 分页、角色管理 UI、真实公开错误、部署 / 真机及运营验收均未做，A01 整体不能标完成。没有微信 / 实际云 / 资金 / 对外消息操作，也没有提交 / 推送 / 部署。

下一项 **A02 可离线商家订单读取与履约命令编排**；复用 O01 / O08 / P06，实际运营继续保持关闭。

---

<a id="a02-merchant-orders"></a>

## 原记录：A02-MERCHANT-ORDERS.md

<a id="a02-merchant-orders--a02-商家订单读取与履约编排"></a>
# A02 商家订单读取与履约编排

日期：2026-10-06。状态：**可离线部分通过，整体 / 实际运营未验收**。当前仍无开发云环境，不新增正式 admin handler 或客户端入口，不改用户确认的 UI。

<a id="a02-merchant-orders--本轮实现"></a>
## 本轮实现

新增 [merchant-order-service.js](../../../cloudfunctions/_shared/merchant-order-service.js)，复用既定 admin.orders.list / order.get / order.transition 目标契约，API action 与客户端 allowlist 不变。A01 的完整角色 / 门店记录校验提取到 [admin-access-state.js](../../../cloudfunctions/_shared/admin-access-state.js)，A01 与 A02 共用；保留 D06 身份、所有权和同一授权能力规则。

| 操作 | 可离线行为 | 实际待接入 |
|---|---|---|
| 商家订单列表 | 当前同店 ORDER_OPERATE，跨顾客查询；状态筛选、createdAt / _id 降序与 HMAC 游标；取消 / 退款轴独立摘要 | SDK 有界查询 / 索引、handler、管理页面 / 列表 UI |
| 商家订单详情 | 先读订单头并确定门店，再鉴权后读取关联资料；历史名称 / 规格 / 整数金额 / 时段 / 地址 / 日志投影 | 真实路由守卫、履约联系界面与公开错误映射 |
| ACCEPT | PAID→ACCEPTED，订单 / 日志 / 回执同事务；不更改资源 | 真实并发接单与界面 |
| START_MAKING | ACCEPTED→MAKING，所有确认库存 CONFIRMED→CONSUMED，与订单 / 日志 / 回执原子；SLOT 保持确认 | 真实库存计量、SDK 提交与操作交互 |
| MARK_READY | MAKING→READY，核对已消耗库存及其制作日志，不再消费 | 页面 / 通知或履约流程 |
| START_DELIVERY / COMPLETE_DELIVERY | 在同一 O08 事务内增加严格 A01 scope 校验 / 读集栅栏，复用原配送服务 | E11 / SLOT 正式策略、真实门店配送操作 |
| COMPLETE_PICKUP | 在同一 O07 事务内增加严格 A01 scope 校验 / 读集栅栏，保留原凭证及 HMAC 请求指纹 | E10 / SLOT 正式策略、A03 输入 / 扫码 / 确认交互 |
| REJECT_ORDER | 仅 PAID；同一授权 ORDER_OPERATE + REFUND_APPROVE；取消 / 释放资源 / 原已付剩余退款意图 / 日志 / 回执原子 | 真实审批 / SDK、P06 平台发送与退款结果、门店拒单 UI |

自身订单所有权不替代商家授权。每个请求重读当前 users / admin_roles / 门店头，校验环境、AppID、版本和归档状态。列表不按客户端 ownerId 查询，详情的 storeId 来自可信订单头；未知与无权详情统一 NOT_FOUND，权限失败不读取关联私有记录。直接页面 / 云调用真实拒绝仍须 handler / SDK 验收。

<a id="a02-merchant-orders--读取权限和隐私"></a>
## 读取、权限和隐私

扩展 [order-read-model.js](../../../cloudfunctions/_shared/order-read-model.js) 内部共享投影，新增 createMerchantOrderReadModel；原顾客工厂和本人查询语义保持。商家工厂本身校验模块内 principal 与严格角色 scope / 时间；不制造顾客 principal 或借订单所有者身份读跨用户资料。服务在当前只读事务中再次核验完整 access 和读快照。

列表必须先 AND 可信 storeId、状态和整个 seek 分支，再排序 / 取 pageSize+1；不能先全表分页再筛选门店。limit 超出、错店 / 错状态 / anchor 范围、无关子记录或不一致详情快照拒绝。游标绑定 environment、AppID / 操作者、admin.orders.list、门店 / 状态及当前 roleId / roleVersion / userVersion；同时间以 _id 稳定排序，跨人 / 门店 / 状态 / 重授权不能复用，期限沿用分页模型。

列表只含必要商品 / 数量 / 预约 / 订单与取消退款摘要，没有联系人、地址、ownerId、平台 ID、付款交易号、资源、原始理由或内部日志。已通过门店权限的详情沿用历史履约所需 contact / DELIVERY 地址与电话；PICKUP 地址始终 null。图片仍走既有历史媒体投影，缺图 null，不从当前目录补写历史商品。

availableActions 仅表示领域 / 能力候选，全部 enabled=false。待审核取消申请的拒单候选 blockedReason=CANCELLATION_REVIEW_REQUIRED，自提 CONFIGURATION_REQUIRED，其余 SERVICE_NOT_CONNECTED；显示候选不授权后续修改。详情读取不开放购买 / 运营。退款进度与订单状态独立，CANCELLED + PENDING 不伪装已经退钱；专用退款队列 / 审批属于 A06，当前 admin 列表只有既定订单 status 筛选。

<a id="a02-merchant-orders--状态资源和资金事务"></a>
## 状态、资源和资金事务

每条修改先验证历史订单 / 明细金额及日志链、已消费 quote、完整支付与退款账本、完整资源 / 预留证据。只能沿既有冻结状态机逐段迁移，不接受 nextStatus / actor / role / 金额 / 其他领域命令。未知政策、缺字段、资金未核实或资源不一致报固定内部错误，不能任意改状态。

已付款需恰好一个同环境已付 APPLIED 原支付，其余全部可信 CLOSED；不把订单头的 PAID 当作唯一资金证据。原资金 / 退款历史保持，已有退款按 P06 账本与原配置复核；新退款也复用 validateLedger 检查审批 / 已退累计 / 未决预算。校验是可信存储资料上的离线业务核验，**不是实际来源认证或新实收**。

制作根据 consumed quote 的聚合 requiredUnits，逐个库存从 confirmedUnits 移到 consumedUnits，预留记录保存同笔 START_MAKING 日志引用 / 时间；slot 不消费或释放。全部库存及订单一起成功或回滚，重复请求不再次消耗。备妥前核验已消耗记录与真实对应制作日志。

拒单只允许尚未接单的 PAID。所有 CONFIRMED 库存 / 预约回释放，历史快照 / 实收保持；有剩余 `paidCents - refundedCents` 时创建确定性退款意图，写 PENDING / RESERVED、原 paymentId、真实受权 ActorRef、审批日志引用和服务器脱敏理由，订单仅增加 refundReservedCents，不增加 refundedCents。已全额退款则只取消 / 释放，结果 CANCELLED_REFUND_ALREADY_SETTLED、refundIntentId=null，不生成新退款。

已有未决 / 失败退款仍占预算，不能再拒单创建一笔。已有 PENDING 顾客取消申请时，新拒单报 CANCELLATION_REVIEW_REQUIRED 且不写入，避免取消请求悬空或假审批；明确取消审批执行器尚待 A06。此限制是未接通审批时的技术边界，不新增退款金额政策。

新退款号由可信 newRefundNumber 生成并符合已有 6–32 位格式；readRefundByNumber 与 insertRefund 必须保证 provider / merchantId / outRefundNo 的唯一性，不能只在客户端或插入前普通查询判空。跨环境共享保护 / 索引仍待真实 SDK；本轮无新增全局唯一数据库或实际平台调用。

own command 回执绑定 environment / [appId,操作者] / admin.order.transition / key，指纹包含完整 payload（包括 command）。重放仍重查当前权限、历史日志、角色 / 用户、原结果与版本 / 时间及退款审批关联；服务重建或后续阶段不重复写入。O07 请求继续用原 HMAC 指纹，不改成 SHA-256，不保存自提明文。O08 保留原指纹与资源 / 完成策略；options 中的原凭证 / 完成配置必须显式提供，缺失不假成功。

ACCEPT / READY 各 3 写；单库存 MAKE 5 写；单库存 + 一个 SLOT 的有退款拒单 8 写。多库存按实际资源数增长。三类记录及所有资源、预留、退款同一事务，任一写异常 / 非 1 行结果拒绝提交；历史订单事实不受当前目录 / 门店配置变化改写。

<a id="a02-merchant-orders--适配器契约和关闭门禁"></a>
## 适配器契约和关闭门禁

readAccessState 必须完整、可信地加载当前环境 / 应用的严格角色和门店头，不省略或信任客户端 complete。runReadTransaction / runTransaction 需保护当前用户、角色 / 门店、订单头和所有关联版本、完整子查询 / 不存在记录、资金 / 资源及幂等 / 退款号唯一性，提交冲突重读重验。不能仅 CAS 订单而继续使用旧商家权限。

O07 / O08 新增可选**服务器注入** authorizeMerchant 钩子；A02 自行从已有工厂构造这些服务，在原事务中先加载严格 access、调用 A01 assertAccessReads 后才读关联资源。之后原业务栅栏也必须保护该读集到提交；不能在事务外预检查代替。原服务未注入钩子的历史离线调用保持兼容，A02 路由必须使用已注入版本。

own commands 返回 OFFLINE_MERCHANT_ORDER_RESULT，cloudVerified / callable / operationsAllowed / externalRefundExecuted 全 false。商家读取为 OFFLINE_MERCHANT_ORDER_PAGE / DETAIL，同样不可调用 / 不开放。路由 O07 / O08 保留原 OFFLINE_PICKUP_RESULT / DELIVERY_RESULT 及 fulfillmentAllowed=false。没有 SDK / handler、客户端 admin allowlist、运营 UI 或实际外部退款 / 骑手调用。

<a id="a02-merchant-orders--验证与问题修复"></a>
## 验证与问题修复

新增 **34 项** A02 专项，受影响组合最终 **142/142**，全套 **800/800**、静态 **292**。主包 / features / legacy 源估算仍 **1239 / 127 / 45 KiB**，本轮不增加客户端包体或分包。最终证据：[全量 TAP](../../qa/a02-2026-10-06/full-final-v2.tap)、[静态日志](../../qa/a02-2026-10-06/static-final-v2.txt)、[摘要与指纹](../../qa/a02-2026-10-06/summary.md)。较早 full-final / static-final 保留终稿资金结果文案区分前的轮次，终稿以 v2 为准。

| 发现 | 修正 / 证据 |
|---|---|
| 只路由 O08 会丢失 A01 新增的严格环境 / 门店校验 | 在原业务事务注入鉴权与完整 access 栅栏，同时用于 O07；[修复前 2 项失败](../../qa/a02-2026-10-06/boundaries-before.tap) |
| 未授权修改先读关联资金 / 私有资料 | 读取订单头后先鉴权，再读子资料；同上失败证据 |
| 拒单可能留下 PENDING 顾客取消申请 | 明确要求取消审批，整笔不写入；[修复前 1 项失败](../../qa/a02-2026-10-06/pending-review-before.tap) |
| 已全额退款时结果仍使用“退款预留”名称 | 区分 ALREADY_SETTLED，不创建或宣称新退款；全退 / 部退组合回归通过 |

测试包括双履约完整制作 / 完成链、O07 原 key / HMAC 重放、O08 继续配送、A01 授权与撤销、当前权限 / 跨店 / 当前用户 / 资料隐私、稳定游标 / 重授权、全部写位置异常 / 零行回滚、串行管理员竞争、历史数据 / 资源 / 资金 / 原配置 / 退款号异常、请求重建 / 后续阶段重放、拒单→P06 可信结果→O06 顾客历史、全额 / 部分已退余额及待审取消阻止。都是合成订单 / 身份和串行内存，不是实际并发或实际资金证据。

<a id="a02-merchant-orders--真实验收计划"></a>
## 真实验收计划

| ID | 场景 | 状态 |
|---|---|---|
| MR01 | E01 / E12 当前真实商家与普通账号的入口、列表、详情、直调函数 / 直写拒绝 | NOT_RUN |
| MR02 | 同店多顾客 / 他店、稳定分页与电话 / 地址最小读取、撤销即时生效 | NOT_RUN |
| MR03 | 两位管理员同版本接单 / 制作，SDK 只有一次提交，资源计量完整 | NOT_RUN |
| MR04 | 每个真实写位置故障、事务期间撤销 / 禁用 / 店与资源改变，全部回滚 | NOT_RUN |
| MR05 | 已付拒单与操作竞争、剩余款退款意图及唯一号，实际 P06 退款闭环 | NOT_RUN |
| MR06 | 弱网 / 丢响应 / 页面重进原 key 恢复，商品历史与当前目录分离 | NOT_RUN |
| MR07 | E10 / E11 / SLOT 正式策略及真机自提 / 门店配送操作，不接骑手系统 | NOT_RUN |
| MR08 | 待审取消显式审批接线及退款异常运营、审计与公开错误处理 | NOT_RUN |

E01 / E12、E06、E10 / E11 / SLOT、D06 / P08 实际门禁、网络 / UI / SDK 与真实资金仍待补。A02 整体未通过，不声明已具备真实运营能力。本轮没有微信 / 真机 / 云 / 资金 / 对外消息操作，没有提交 / 推送 / 上传 / 部署；全部现有未提交成果保留。

下一项 **A03 自提码输入 / 扫码 / 核销确认的可离线交互契约**。实际凭证策略 / 真机 / 云继续待 E10 等条件，UI 调整按用户已有字体约定处理。

---

<a id="a03-pickup-session"></a>

## 原记录：A03-PICKUP-SESSION.md

<a id="a03-pickup-session--a03-自提输入--扫码--确认会话2026-10-06"></a>
# A03 自提输入 / 扫码 / 确认会话（2026-10-06）

状态：可离线交互契约完成；正式页面、微信扫码、顾客凭证展示、持久恢复和云核销均未接入。E10 正式凭证 / 有效期 / 限速 / 完成 SLOT 策略未发布，A03 整体验收未通过。

<a id="a03-pickup-session--实现与界限"></a>
## 实现与界限

新增 [pickup-session.js](../../../miniprogram/features/admin/pickup-session.js)，只构造 admin.order.get / order.transition 的冻结请求计划。没有 Page 接线、wx API、Storage、网络或订单写入；现有商家页面继续保持关闭，60 action 和客户端 user.me / store.health allowlist 不变。

会话构造必须显式提供 storeId / subjectId、policy.version / format=OPAQUE_TOKEN、keyFactory，可选同步 decodeScan。这些本机 scope 值只隔离交互，不能充当鉴权；服务端仍使用 A01 当前可信 principal / 角色 / 门店和 O07 原子校验。没有生产政策默认值、短数字码、默认二维码编码或从公开订单号推导凭证。

OPAQUE_TOKEN 是 O07 现有候选 HMAC 的 64 位小写十六进制值；手输允许去掉外围空白，不改内部字符或大小写。手输从已选订单的内部 orderId 开始；公开 orderNo 只作摘要，不能代替凭证。扫码需要未来显式配置 codec，仅接收 {orderId,pickupCredential}，不得附带角色 / 店 / 状态 / 权威字段。没有 codec 时拒绝；解码异常、异步返回、超出 4096 个字符的输入和非法字段拒绝。长度是本地技术保护，不是正式扫码政策。

扫描只定位待查询的订单，并不验证凭证真伪。需要先读取受权商家详情、核对门店 / 自取 / 已付款 / READY 及可核销能力，再由用户确认。摘要就绪不能显示“凭证已验证”；凭证最终只由 O07 在核销事务中验证。单独拿 token 查订单、顾客二维码生成和 wx.scanCode 的真实适配仍待正式码形。

<a id="a03-pickup-session--会话流程"></a>
## 会话流程

| 操作 / 状态 | 行为 |
|---|---|
| beginManual / beginScan → LOADING | 只计划 order.get；不提交核销 |
| receiveDetail → AWAITING_CONFIRMATION | 订单符合条件、候选凭证存在，允许离线演练确认步骤；真实 confirmationAllowed 仍 false |
| confirm → SUBMITTING | 显式确认后计划 COMPLETE_PICKUP，固定 orderId / expectedVersion / 原凭证 / 新幂等 key |
| 未备妥 / 无能力 / 他店 / 配送 | 不提供确认；非法详情不覆盖为可操作状态 |
| 已完成 / 已取消 | ALREADY_COMPLETED / CANCELLED；不生成核销请求，不归因于本次操作 |
| 取消待审 / 有退款 | REVIEW_REQUIRED，等待明确处理，不假审批 |
| failed / 隐藏 / 格式不明结果 | RESULT_PENDING，保留原请求；禁止换订单 / 换码 / 新 key |
| retryOriginal | 完全相同 key / version / credential；不是读取新版本后重新核销 |
| 收到成功 CommandResult | 仍 RESULT_PENDING，刷新详情核验 COMPLETED 和提交版本 |
| 成功回执 + 相符完成详情 | COMPLETION_REPORTED；演练观察值，真实成功反馈门禁仍关闭 |
| 只有已完成详情、没有原请求回执 | 不归因成功、不丢原 key，继续核验原请求 |
| 确定错码 / 锁定 / 冷却内部结果 | 清掉输入，不自动重试，不猜解锁 / 冷却截止；新输入须重新读版本 |
| destroy | 账号 / 门店 / 环境切换或销毁时清空私有内存，旧回调不能进入新实例 |

局部 ticket 是按对象身份比较的冻结令牌，包含 generation 但不以数字相同判定。它只供本机回调路由，不发给云，不克隆或序列化后交回；新实例相同 generation、旧响应或复制 ticket 都不能覆盖当前结果。

每次读会移除旧确认机会；连续输入和隐藏会使旧 ticket 失效。已发核销请求在隐藏后保留原计划供重试，但旧响应失效。正在提交不能另读 / 再确认；正在读取也不能发送另一个原请求。

<a id="a03-pickup-session--数据版本与结果校验"></a>
## 数据、版本与结果校验

未来详情 DTO 的契约演练只接收已解包的业务数据，不接受 OFFLINE scope / cloudVerified / callable / operationsAllowed 等标记。当前 A02 服务仍返回 OFFLINE 对象；只有测试夹具投影出协议形状，应用没有剥掉门禁的适配器。availableActions 只观察服务端候选能力，不把 enabled=false 翻转为真实功能。

确认摘要只保留 orderId / orderNo / 状态与版本、门店名称、联系人姓名、预约日期 / 时间、商品名称 / SKU / 数量 / 分价及合计。电话、地址、留言、OpenID、凭证、key、日志 / 摘要 / 内部资金或媒体证据不进入 current / 页面数据。数量、整数金额、逐行单价乘数量、小计、总价和零配送费核对；历史门店 / 联系人 / 商品 / 价格 / 预约事实不能随读取变更。订单版本、已退款累计、制作进度、已确认 PAID 和终态不能回退；同版本矛盾结果拒绝。

receiveResult 只接受 {entityId,version,errorCode} 的内部协议形状，绑定本次订单：成功和 PICKUP_CREDENTIAL_INVALID 必须为 expectedVersion+1，锁定 / 冷却无写结果必须为 expectedVersion。未知字段、离线结果外壳、错实体、错版本或未知错误一律保留原请求，不报成功。最大安全版本不能生成溢出命令。

PICKUP_CREDENTIAL_INVALID / LOCKED / RATE_LIMITED 只是当前 O07 内部结果的演练；尚未加入网络公开错误映射。未来 handler 必须提交尝试计数后输出可信固定结果，不能把真实码 / 原错误 / stack 复制给页面。权限、版本或网络错误没有原请求回执时，不足以证明先前丢响应的调用未提交，本轮统一保持结果待核验，不擅自丢 key。

<a id="a03-pickup-session--机密与恢复限制"></a>
## 机密与恢复限制

原码只保留在私有闭包及显式请求计划。计划本身含敏感码，不能整体 setData、打印、埋点或写明文 Storage；ticket、摘要或按钮显隐不承担鉴权。仅内存 key 集合防本会话重复生成，真正持久请求恢复仍未实现。

destroy / 小程序进程退出会失去原请求。正式开放前必须确定 E10 的安全凭证封装、账户 / 门店 / 环境绑定的持久恢复、保留期限、受权回执查询 / 运营人工核验路径；不能拿新的 key 假装恢复。没有声明本轮完成弱网跨进程恢复、真实加密存储、wx 权限或真实二维码显示。

所有 availability / view / plan 返回 connected / callable / confirmationAllowed / fulfillmentAllowed / successFeedbackAllowed=false。即便收到合成 COMPLETED，也不允许展示真实核销成功反馈。可调用接口、handler 和服务器集合不变。

<a id="a03-pickup-session--验证"></a>
## 验证

新增 **28 项** A03 专项；与 A02 / O07 组合 **89/89**；全套 **828/828**，静态 **294**。主包 / features / legacy 源估算 **1239 / 139 / 45 KiB**：新契约放在现有 features 子包，主包不增，不需要新分包，实际包体仍以微信编译为准。

首轮 23 项通过，复查追加 3 项分别复现返回版本约束、初始金额合计与高版本付款回退缺口，已修复；再补跨会话 ticket 和安全版本 / 生命周期边界 2 项。最终全量与静态并行读取代码，执行前后源码 SHA-256 一致。证据：[修复前 3 项失败](../../qa/a03-2026-10-06/boundaries-before.tap)、[组合](../../qa/a03-2026-10-06/affected-final.tap)、[全量](../../qa/a03-2026-10-06/full-final.tap)、[静态](../../qa/a03-2026-10-06/static-final.txt)、[摘要 / 指纹](../../qa/a03-2026-10-06/summary.md)。较早日志保留原轮次，不覆盖最终证据。

本地组合完整接续 A01 授权、A02 制作与商家读取、O07 签发 / 错码 / 核销 / HMAC 原 key 重放：响应丢失后只完成一次、不二次消耗资源；错码回执重放不重复计数，冷却后使用当前版本的新正确输入；确认后撤销当前权限，服务器拒绝且无新增写。真实 cloud client 对两个 admin action 均在平台调用前拒绝，平台调用计数 0。全部仍是合成身份 / 订单及串行内存事务。

<a id="a03-pickup-session--真实验收待办"></a>
## 真实验收待办

| ID | 场景 | 状态 |
|---|---|---|
| PS01 | E01 / E12 实际当前商家权限、普通用户 / 他店 / 撤销拒绝 | NOT_RUN |
| PS02 | E10 正式码形 / TTL / 限速 / 密钥 / SLOT 策略和顾客凭证展示 | NOT_RUN |
| PS03 | 微信真实扫码、取消 / 拒权 / 非本店码 / 非订单码，不自动核销 | NOT_RUN |
| PS04 | 真机必要摘要、显式确认、错码 / 锁定 / 冷却及安全区视觉 | NOT_RUN |
| PS05 | 网络丢响应 / 隐藏 / 进程重启 / 切换账号环境，安全恢复原 key | NOT_RUN |
| PS06 | SDK 同时核销 / 撤销 / 取消竞争、实际一次完成和资源一致性 | NOT_RUN |
| PS07 | 已核销、取消、退款与历史事实，固定公开错误及人工核验路径 | NOT_RUN |

E01 / E12、E10 / SLOT、D06 / P08 真实门禁与 UI / 持久恢复 / SDK 验收仍待补。没有修改页面 JS / WXML / WXSS 或字体，没有微信 / 真机 / 云 / 资金 / 对外消息操作，没有 Git 提交 / 推送 / 上传 / 部署；全部既有未提交成果保留。

下一项 **A04 商品 / SKU / 库存维护的可离线部分**，复用目录 / 权限 / 事务规则，未知经营数据不补默认值。

---

<a id="a04-merchant-catalog"></a>

## 原记录：A04-MERCHANT-CATALOG.md

<a id="a04-merchant-catalog--a04-商品--sku--库存维护2026-10-06"></a>
# A04 商品 / SKU / 库存维护（2026-10-06）

状态：可离线校验、查询与事务编排完成；正式经营资料、商家页面、云 SDK / 索引 / 并发和发布验收仍待。A04 整体验收未通过，真实操作继续关闭。

<a id="a04-merchant-catalog--当前实现"></a>
## 当前实现

新增 [merchant-catalog-model.js](../../../cloudfunctions/_shared/merchant-catalog-model.js) 和 [merchant-catalog-service.js](../../../cloudfunctions/_shared/merchant-catalog-service.js)，复用 A01 严格当前权限、C03 / D03 目录规则、媒体版本与资源计量。

| 既有目标 action | 可离线行为 |
|---|---|
| admin.products.list | 当前同店商品及明确 SKU 摘要，按 sortOrder / ID 分页，支持状态过滤 |
| admin.product.get | 当前同店商品、SKU 编辑资料白名单 |
| admin.product.save | 新建 DRAFT 或维护现有商品 / 完整 SKU 集合，原子实体 / 审计 / 回执 |
| admin.product.status.set | 显式上架、下架或归档，独立版本检查和审计 |
| admin.inventory.list | 当前同店已存在库存资源及可用量，按 createdAt / ID 分页 |
| admin.inventory.setTotal | 只改总配额和版本，不改单位、归属、状态或占用计数 |

没有新 action、admin handler、SDK / 网络 / 客户端 allowlist / UI 或实际云写入。商品 / SKU 采用既有集合与五个通用字段；资源沿用 inventory_resources。未创建、重置库存资源或发布临时开发示例。

<a id="a04-merchant-catalog--保存契约"></a>
## 保存契约

product.save 的 draft 必须完整包含 categoryCode / name / description / images / optionGroups / messagePolicy / minLeadTimeMinutes / sortOrder / skus，禁止传入产品状态、身份、scope 或元数据。门店从已存在记录核对，分类只允许 CAKE / MINI_CAKE / BREAD，已有分类和 storeId 不原地改变。

每项 SKU 包含 description / selectedOptions / currency / unitPriceCents / minQuantity / maxQuantity / stockRequirements / status。已有项另带 skuId / expectedVersion；新项不提供这两项，服务器按环境 / AppID / 父商品 / 回执 / 序号生成固定 ID。新商品 ID 也与门店及回执绑定，不接受客户端指定实体 ID。

新商品保持 DRAFT；SKU 状态按显式字段保存，父商品未上架时不会因某个 SKU 为 ON_SALE 对外可售。产品上架不自动把 SKU 全部改为 ON_SALE。已有商品保持当前状态；修改在售商品时仍须通过发布完整性校验。

已有 SKU 的 groupCode / optionCode 组合固定，换组合应建新 SKU；标签由当前配置规范化，不信任客户端标签。必选组不能缺失、组 / 选项不能重复，非归档 SKU 组合唯一，不生成笛卡尔积。选项组变更必须兼容全部当前非归档 SKU；归档 SKU 保留旧组合和完整原资料，不可复活 / 改价。省略任何已有 SKU 被拒绝，不以覆盖列表进行硬删除。

产品每次保存递增版本；只有内容变化的已有 SKU 递增版本，不变项保留原版本，新项 version=0。产品 / SKU 的创建时间、归属和服务器私有字段保留；新增 / 编辑的版本递增溢出或旧父 / 子版本一律拒绝。归档父商品不可编辑或重新上架；删除以归档表示，不删除历史记录。

草稿允许显式 null 的价格 / 数量 / 提前量、空图片 / 库存要求，保持未配置，不自动补经营值。非 null 价格为正安全整数分，数量为正整数且上下限一致，币种只允许 CNY；BREAD 不支持留言，留言策略使用既有规范版本及显式正长度。保存草稿也不能写非法组合、非法金额或不存在 / 他店资源。

<a id="a04-merchant-catalog--发布与图片保留"></a>
## 发布与图片保留

ON_SALE 需分类已发布、明确提前量、至少一条 ON_SALE 且完整合法的 SKU、明确数量 / 库存要求、已确认单位的同店 OPEN 资源和有效登记图片。所有选定发布图片必须是当前允许云路径下、PUBLISHED / REAL_PHOTO 的确切 assetId / revision / storageRef / sourceKind；临时素材、DESIGN_PREVIEW、DRAFT / RETIRED 素材或缺版本不能用于上架。真实内容核验与商家正式批准仍待 E05；测试中 REAL_PHOTO 标签只为隔离元数据夹具。

草稿引用也必须匹配已登记元数据；没有上传 / 覆盖 / 删除素材的接口。更换产品图片只更新现行引用，旧 media_assets 版本保持，历史订单 / 报价原引用不改。资产的真实文件保留和删除前完整引用扫描仍属媒体接入待办，不能把无删除代码称为已验收物理保留。

下架 / 归档不取消历史订单、不释放已确认预留、不恢复已消耗库存。归档商品保留 SKU 记录，父状态使其不对外销售；不能只依据 SKU 仍 ON_SALE 绕过父状态。要归档最后一个在售 SKU，应先显式下架父商品，避免在售父商品没有合法可售 SKU。

<a id="a04-merchant-catalog--库存和购买核验"></a>
## 库存和购买核验

setTotal 的下限为 heldUnits + confirmedUnits + consumedUnits，求和及总量必须为安全整数。等于占用量可以保存，可用量为 0；低于占用量整笔拒绝。CLOSED 资源可维护配额但不会被自动打开；单位 / storeId / 名称 / 原计数保持，不清零预留，不把退款当补货，不处理 SLOT。

版本变更由既有 B05 / X05 / O03 在下次核验识别。真实本地组合验证：保存新价格 / 下架后，已有 quote 不能创建订单；库存总量版本改变也令旧 quote 失效。当前目录新价格在 C03 投影可见，下架父商品不再返回。

本轮不遍历修改顾客 cart、quote、order、payment、reservation 或本机 Storage。购物袋中的旧产品 / SKU 版本继续交给已有核对逻辑，在下一次读取 / 结算时要求核验；客户端同步更新界面仍待真实服务接线。历史 order / order_items、金额与图片事实、日志、实付和资源预留没有被目录维护改写。

<a id="a04-merchant-catalog--权限幂等和审计"></a>
## 权限、幂等和审计

每笔事务重读当前 ACTIVE 用户、完整环境 / AppID A01 角色和门店头，用同一当前 CATALOG_WRITE 授权。实体操作先读服务器归属，再鉴权，随后才加载关联目录；不存在 / 无权实体统一内部 NOT_FOUND。普通顾客、伪造 principal、错误环境 / 他店、禁用、撤销及归档门店均拒绝，旧 key 重放也重新鉴权。

幂等 scope 为环境 + [AppID,主体] + admin.action + key，指纹绑定完整请求，改参拒绝。新建确定性 ID 与回执绑定；重放结果版本必须匹配原请求的 expectedVersion+1，新建必须为 0，不能用后来实体版本伪造原结果。当前实体须存在、版本不落后；同版本结果核对实体白名单指纹，后续正规修改后仍可重放旧结果，不再次应用改价 / 调库存。

产品 / 变化 SKU、audit_logs、idempotency_records 同事务，每个写结果必须为 1 行；单 SKU 新建 / 改价典型 4 写，未改 SKU 的产品维护或上下架 / 调库存典型 3 写，多 SKU 按实际增量。任何写异常 / 零行、完整读集或提交冲突全部回滚。

审计保存服务器 STORE ActorRef、环境 / AppID / 店、目标前后版本、action、脱敏 reason / requestId，以及 requestFingerprint / entityFingerprint 标量变化，不保存完整 draft、媒体元数据、电话或用户来源。摘要是关联证据，不是密码学身份或防篡改签名；实际审计权限、保留和读取仍待云 / A06。

<a id="a04-merchant-catalog--适配器与查询限制"></a>
## 适配器与查询限制

runTransaction 必须提交后返回，失败全部回滚。会话提供当前用户 / 完整 access、最小实体读取、readCatalogState(storeId)、回执 / 审计、条件保存 / 唯一插入和 assertCatalogReads；不能只 CAS 父商品而继续使用旧角色、SKU、资源或素材。

本轮 readCatalogState 读取明确门店的完整有限快照，含 products / skus / STOCK resources / categories / mediaAssets 和服务器 scope / complete。模型校验同店、无重复 / 孤儿、合法关联 / 版本 / 时间、资源计数与媒体元数据，商家 DTO 使用白名单。SDK 必须保护整个查询谓词及不存在 / 新增记录、父子 / 资源 / 图片 / 当前用户 / 角色 / 门店与回执 / 审计唯一性到提交；complete 只能由服务器适配器提供。

分页 cursor 使用既有 HMAC，绑定环境 / AppID / 主体 / 店 / action / 状态 / 当前 grant 与内容修订，稳定复合排序；修改内容、换人员 / grant / 条件、篡改或过期要求重读。本轮不声称实现规模化数据库分页或实际全量查询成本；未来 SDK 必须解决有界查询、完整性 / 不存在条件和并发成本，不能直接把全快照夹具当可部署适配器。

输出 OFFLINE_MERCHANT_CATALOG_RESULT、PRODUCT_PAGE / DETAIL、INVENTORY_PAGE；cloudVerified / callable / operationsAllowed 全 false。不开放真实经营或把内部错误直接加入网络响应。

<a id="a04-merchant-catalog--验证和真实待办"></a>
## 验证和真实待办

新增 **31 项** A04；受影响组合 **119/119**，全套 **859/859**，静态 **298**。主包 / features / legacy 源估算 **1239 / 139 / 45 KiB**，本轮无客户端新增包体。全量 / 静态执行前后公共源码 SHA-256 一致。

覆盖三分类 / 组合 / 空经营值、发布图 / 分类 / SKU / 资源门禁、版本 / 归档 / 显式新 SKU、逐写异常 / 零行回滚、串行双人竞争、撤销 / store / user / 资源 / 素材 / 新记录提交变化、幂等 / 重放 / 审计关联、稳定分页 / 过期 / scope、私有字段投影、图片更换版本保留、O03 旧 quote 失效与历史保存，以及 6 个 admin action 平台调用前关闭（调用数 0）。

早期 first 的 23 项失败是夹具未取到 A01 options.runTransaction，已正确接入；second 26 项通过。复查加强重放实体 / 原请求版本绑定并追加回归；replay-before / affected-after 中的失败包含测试修改了提交前旧对象引用的问题，已改为当前数据库对象，不作为实际云 / 越权复现证据。最终日志：[组合](../../qa/a04-2026-10-06/affected-final.tap)、[全量](../../qa/a04-2026-10-06/full-final.tap)、[静态](../../qa/a04-2026-10-06/static-final.txt)、[摘要 / 指纹](../../qa/a04-2026-10-06/summary.md)，较早轮次保留。

| ID | 真实场景 | 状态 |
|---|---|---|
| MC01 | E01 / E12 真实商家与普通账号 / 他店 / 撤销，直调与直写拒绝 | NOT_RUN |
| MC02 | E05 / E06 正式分类、照片、价格、SKU、留言 / 数量 / 提前量及库存单位批准 | NOT_RUN |
| MC03 | SDK 原子父子 / 审计 / 回执，双人改价 / 上下架 / 库存并发及逐写故障 | NOT_RUN |
| MC04 | 制作 / 下单占用与调低库存同时发生，完整查询 / 素材退役 / 撤销提交保护 | NOT_RUN |
| MC05 | 真机商家编辑、发布错误、顾客购物袋 / quote 更新与历史订单事实 | NOT_RUN |
| MC06 | 真实图片上传、不可覆盖版本、历史文件保留与删除前完整引用扫描 | NOT_RUN |
| MC07 | 丢响应同 key、唯一索引 / query 范围 / 成本、脱敏审计和运营恢复 | NOT_RUN |

E01 / E12、E05 / E06、D06 / P08 实际门禁和页面 / SDK / 真机仍待补。只使用合成身份 / 图片元数据、串行内存和本地订单组合，没有微信 / 云 / 真实资金 / 对外消息、Git 提交 / 推送 / 上传 / 部署；现有 UI 和全部未提交成果保留。

下一项 **A05 门店 / 营业 / 预约与配送配置维护的可离线部分**，保留已确认的每天 08:00–21:00、30 分钟、自取 3 / 配送 1、20 km 含边界、配送费 0 及云端权威校验规则。

---

<a id="a05-merchant-store"></a>

## 原记录：A05-MERCHANT-STORE.md

<a id="a05-merchant-store--a05-门店--营业--预约--配送配置维护"></a>
# A05 门店 / 营业 / 预约 / 配送配置维护

2026-10-06。**可离线部分完成，整体验收未通过**。新增内部模型 / 事务服务、组合夹具与 32 项专项；没有 admin handler / 客户端 allowlist / 商家页面或真实云调用。cloudVerified / callable / operationsAllowed 始终 false，正式经营资料仍未发布。

实现：[模型](../../../cloudfunctions/_shared/merchant-store-model.js)、[服务](../../../cloudfunctions/_shared/merchant-store-service.js)、[专项](../../../tests/merchant-store.test.js)、[隔离夹具](../../../tests/fixtures/merchant-store.js)。当前 [A01](phase-8.md#a01-admin-authorization) 用户 / principal / scope / 同店 CONFIG_WRITE 在同一事务校验；撤销后的重放也重新鉴权。先查目标头及权限再读关联配置，跨店目标返回 NOT_FOUND，不能通过 UI 显隐或客户端角色授权。

<a id="a05-merchant-store--本轮行为"></a>
## 本轮行为

复用既有 store.update、config.save / publish、slot.update、store.get、config.get、configs.list、slots.list 契约。门店允许明确维护名称 / 地址 / 电话 / 状态；时区固定 Asia/Shanghai。ARCHIVED 终态，已有营业店不能回退 DRAFT。关闭 / 归档不删除配置、订单或占用；改地址会撤销旧定位，继续 OPEN 必须有新定位和匹配发布配置。

config.save 只修改 DRAFT；新建确定性 ID，序号按本店完整配置读集 max + 1，已有草稿保留序号。PUBLISHED / RETIRED 内容不能编辑或被本轮覆盖，旧版本不会因切换指针而退役 / 删除。发布必须通过草稿 / 门店版本 CAS、本店序号单调条件和所有发布校验，在同一事务写配置状态 / 时间、门店 activeConfigId 和 version、未来已建时段变更、审计及回执。更早序号不能覆盖较新已发布版本；TimePolicy.policyVersion 同名不能换内容。

用户已确认的正常营业规则固定为每天 08:00–21:00、两种方式、30 分钟、自取 3 单 / 配送 1 单且独立计算。日期覆盖支持显式禁约或营业窗口缩短，校验真实日期、时区、30 分钟对齐、重复及重叠。客户端草稿不能改变 V1 正常营业时段、容量、半径、边界、费率、配送执行方或预计时段语义；如用户未来变更 V1，须另做政策版本迁移。

配置发布只维护**完整快照中的未来已建时段**：新政策下仍可约的资源更新实时 policyVersion / version；不再可约的资源关闭，保留原政策身份；不改已开始或过去资源。关闭过的资源不自动重新 OPEN，恢复营业后仍需显式 slot.update 并通过当前规则。每个资源原 _id / 店 / 模式 / 日期 / 起止 / capacityUnit / 容量和 held / confirmed / consumed 保留，不清零，不拆分或复制容量池。不存在的时段不会假装可选，后续受控物化器仍待接入；不能用缺行重建绕过已占用。

资源实时 policyVersion 的维护与新配置发布原子，历史订单 appointmentSnapshot.policyVersion 仍固定。此为 D02 的 A05 明确补充，资源不是订单的政策历史载体。库存资源不受影响。slot.update 先拒绝小于 held + confirmed + consumed 的总额，再限定 V1 固定 3 / 1；禁约使用 CLOSED，容量不置零。只有门店 OPEN、当前有效可约窗口且实时政策版本匹配时能重新开放。

未确认的正式提前量 / 最大预约天数、报价 TTL、付款占用时长、袋限制、回补规则不设置默认值；草稿可保留 null / 空配送规则并被拒绝发布。非空部分须完整合法，整数及毫秒运算不得溢出；预约末日须在支持的四位年份内。保存完整字段不等于经营批准，发布还需要独立的受控政策验证器批准准确内容和版本。

配送固定门店自送、半径 20000 m 含边界、0 分、ESTIMATED 和既有距离算法。只接受一个可判定 ACTIVE RADIUS / FLAT 规则，中心须与已核验门店位置逐字段相同。位置写入仅接受服务端 resolveStoreMapSelection 的受权 token 结果，token 绑定当前 scope / 人 / 店 / 版本 / 时间并纳入读栅栏。原始客户端坐标、GCJ02 不能当作 WGS84；门店位置 source / verifiedAt 也不能独立充当证明。

用户给出的地址「安徽省合肥市庐江县X085沙溪派出所南侧约50米」、高德纬度 31.1498 / 经度 117.2886 继续是待地图适配器核验的真实输入；没有复制测试点、转换结果或验证时间到正式门店。正式店名、电话及其他未提供资料仍待确认。夹具的 0 / 0、电话、提前量、天数等均 OFFLINE_TEST_ONLY。

<a id="a05-merchant-store--事务--适配器边界"></a>
## 事务 / 适配器边界

服务要求完整、有一致 scope 的有限 state：store、configs、slots 和当前 access / user，同一事务内 header / state / access-store 版本状态一致。不能将 SDK 分页的部分结果标记 complete。真实适配器须使用受控有界查询和已验证事务预算，保护集合谓词 / 完整读集 / 负读，若无法完整原子执行则拒绝操作，不能分批发布或先切指针再迁移时段。当前内存实现没有证明生产规模可行。

tx 接口包含 readUser / readAccessState、readStoreHeader / readStoreState、readReceipt / readAudit、assertStoreReads、saveStore / insertConfig / saveConfig / saveSlot、insertAudit / insertReceipt；写函数必须恰好返回 1，否则整体回滚。assertStoreReads 包含用户 / access / grant、完整业务 state、回执 / 审计 ID 与证明绑定，必须一直保护到 commit，不能只对门店 CAS。

需要时还有 resolveStoreMapSelection、validateStorePhone、verifyStoreLocation 和 verifyOperationalPolicies。后两项必须来自受控验证资料，绑定环境 / app / 店、读取和拟写门店版本、configId、**configVersion（发布序号）/ configReadVersion（读取的记录 version）/ proposedConfigVersion（拟写的记录 version）**、准确定位 / 政策摘要和时间；审批资料的有效性 / 撤销 / 不存在条件也须保护到提交。验证器不能因为请求带 source、时间戳、摘要或规则版本字符串就返回 true。电话须按已确认号码规则检查，正则只存在于测试适配器。

幂等按 environment + app / 当前人员 + action + key 隔离，changed content 拒绝。成功回执 / 当前目标版本 / 确定性新 ID / 原 expectedVersion + 1 / 审计目标与原请求一致，重放不再写配置或重开时段。审计保留 STORE actor、scope / 店、目标版本、脱敏原因 / trace 和请求 / 实体 / 关联写入摘要，不保存地图 token、电话、草稿全文或私密字段。摘要仅用于一致性检查，不是密码学来源证明。

config / slot / store 查询只投影契约字段，私密服务字段不输出；配置 HMAC 游标绑定当前人员、授权、店、完整内容修订和过期时间。服务层仍是内部离线状态，不构成真实公开查询或授权入口。

<a id="a05-merchant-store--验证与真实验收"></a>
## 验证与真实验收

32 项专项、受影响组合 157 项通过，最终全套 **891/891**，静态 **302**。源估算主包 / features / legacy **1239 / 139 / 45 KiB**，无需新分包，实际体积仍以微信编译为准。运行前后源码指纹一致，见 [证据摘要](../../qa/a05-2026-10-06/summary.md)；最终使用 full-verified / static-verified。

失败记录保留：first 26/26 失败源于夹具 / 新模型调用共享时段构造器时传空商品提前量数组（既有构造器要求非空），及组合夹具原 publishedAt 晚于新增元数据；已修正为只表达门店规则下限的 [0] 和一致测试时间，商品提前量仍在 X04 / X05 / O03 重验。second 25/26，最后失败为测试期望 QUOTE_CHANGED，而既有 O03 明确保留 SLOT_FULL_OR_CLOSED；修正测试预期，未放宽业务校验。32 项中增加极大提前量探针，arithmetic-before 复现草稿未拒绝，补齐安全算术 / 日期边界后通过。发布验证字段最后区分序号及记录版本，并重新执行全套 / 静态。

A05 → 实际本地 O03 服务组合验证门店编辑 / 配置切换后旧 quote 返回 QUOTE_CHANGED，时段关闭返回 SLOT_FULL_OR_CLOSED；未来可约摘要读到新配置，历史订单 facts / items / 金额 / 付款 / 日志 / quote / reservations 不改。A02 原服务可继续接单、开始制作关闭时段中的已确认订单；占用仍保留。没有遍历修改顾客 cart / quote，也未接 Storage / 页面刷新事件。

| 用例 | 实际验证目标 | 当前 |
|---|---|---|
| MS01 | 当前平台用户 / 同店权限 / 撤销与真实并发提交 | NOT_RUN |
| MS02 | 配置序号唯一索引、重复 key、SDK 零写 / 全回滚 | NOT_RUN |
| MS03 | SDK 完整谓词保护、发布与下单 / 占用变化冲突、事务规模预算 | NOT_RUN |
| MS04 | 真实地址 / 电话 / 高德输入、地图转换及验证凭据撤销 | NOT_RUN |
| MS05 | 正式经营政策审批 / 时间版本不可覆盖 / 停业 / 禁约 | NOT_RUN |
| MS06 | 微信页面维护后刷新预约 / 配送 / 报价，历史已付履约保持 | NOT_RUN |
| MS07 | E01 / E12 / 真实 Admin 入口与 A07 完整运营验收 | NOT_RUN |

全部真实门禁等待环境 / 索引 / SDK / 地图 / 政策 / 页面 / 真机条件。未修改 UI、操作微信 / 真机 / 云 / 资金或 Git 提交 / 推送 / 部署，既有未提交成果保留。下一项 **A06 取消 / 退款异常处理和审计读取的可离线部分**。

---

<a id="a06-merchant-resolution"></a>

## 原记录：A06-MERCHANT-RESOLUTION.md

<a id="a06-merchant-resolution--a06-取消审批--退款异常--审计读取"></a>
# A06 取消审批 / 退款异常 / 审计读取

2026-10-06。**可离线部分完成，整体真实验收未通过**。37 项专项、受影响组合 212 项通过；内部事务覆盖取消申请、审批、退款额度预留、原号重试及商家财务 / 补偿 / 审计读取。未修改现有 UI；cloudVerified / callable / operationsAllowed / externalRefundExecuted 均 false，没有 SDK / handler / 客户端 allowlist 或资金调用。

实现：[计划 / 校验](../../../cloudfunctions/_shared/merchant-resolution-model.js)、[事务服务](../../../cloudfunctions/_shared/merchant-resolution-service.js)、[财务读服务](../../../cloudfunctions/_shared/merchant-finance-read-service.js)、[测试](../../../tests/merchant-resolution.test.js)、[组合夹具](../../../tests/fixtures/merchant-resolution.js)。前置边界见 [A01](phase-8.md#a01-admin-authorization)、[A02](phase-8.md#a02-merchant-orders)、[O05](phase-6.md#o05-order-cancellation)、[P06](phase-7.md#p06-refund-recovery)、[P07](phase-7.md#p07-maintenance-reconciliation)。

<a id="a06-merchant-resolution--取消申请和审批"></a>
## 取消申请和审批

O05 已付取消此前只有计划，A06 补齐内部 requestCancellation 对既有 order.cancellation.request 的真实本地适配器保存：本人当前用户 / principal / 订单所有权、订单版本、完整日志 / 付款 / 退款 / 当前请求校验后，原子插入一个 PENDING cancellation_requests、递增订单 version、追加 REQUEST_CANCELLATION 日志、审计和回执。订单 orderStatus 不改变，不退款或释放资源。同订单只能有一个 PENDING，必须保护完整谓词到提交。原因先脱敏，不持久化测试电话。

申请 ID 由环境 / app / order / requestLogId 全元组确定，requestLogId 关联原请求日志，reviewLogId 初始 null；审批一次设置后固定。新增两字段用于严格校验来源与审批历史，旧缺字段离线记录需重建或受控迁移，不能从文案或缺失数据补造已审批事实。

复用 admin.cancellation.review。REJECT 要当前同店 ORDER_OPERATE；APPROVE 要**同一条**当前授权同时有 ORDER_OPERATE + REFUND_APPROVE，不能拼接两条角色。受权用户 / store / role 和完整订单 / review / funds / resources / logs 与负读条件保护到 commit；review 头字段或客户端 decision 不构成授权。

审批读取当前订单，不按申请时状态盲目取消。批准须显式退款整数分，可为 0，不能超过实付减已退减预留；拒绝不得带 refundCents。批准原子写请求 APPROVED / 审批人 / 时间 / 脱敏理由 / 金额 / refundId、订单取消、必要资源解占用、正金额 PENDING / RESERVED 退款意图、最终轴日志、审计与回执。拒绝只记录 REJECTED 和订单版本 / 日志，不改变履约状态、退款或占用。

订单已经履约完成时批准被拒绝，可显式拒绝申请并留下记录。请求不会因商家其他操作静默删除。制作前 CONFIRMED 库存 / SLOT 按原模型释放；已经 CONSUMED 的库存不回补，制作后 SLOT 回补需要注入已确认策略。没有正式策略时拒绝；测试的 RETAIN / RELEASE_UNCONSUMED 不是已发布经营批准。禁约 CLOSED 资源在解占用时保持 CLOSED，不重新开放。

admin.refund.approve 仅需当前同店 REFUND_APPROVE，沿用 V1 STORE_APPROVED_AMOUNT：明确金额批准退款，不改履约状态、商品 / 地址 / 预约历史或占用。同一订单最多一笔未决预算，PENDING / FAILED 期间拒绝另建退款；已确认部分到账后可再批准剩余金额。所有金额从完整 paid payment / refunds / ordered logs 重验，不以 UI 或客户端成功回调为证据。

<a id="a06-merchant-resolution--退款异常处理"></a>
## 退款异常处理

复用既有 admin.refund.retry（输入 refundId / expectedVersion / reason / idempotencyKey），没有新增客户端 SUBMIT / QUERY 选择权。当前同店 REFUND_APPROVE，加载原付款身份 / 归档 profile、完整退款账本、当前退款版本及尝试集合后，在**同一个 A06 事务**内调用 P06 计划：

- 无尝试时登记首个 SUBMIT；可信结果证明 FAILED 且最新尝试也 FAILED 时，才能登记同号 SUBMIT。
- 已发送、未知、已受理或其他未决结果先 QUERY，不另建 refund、不换 outRefundNo、不增额度预留、不放回余额。
- 查询在途且未到注入 queryRetryAfterMs 时不再登记尝试；超时只重查同号，不取得第二次发送权。
- 已 SUCCEEDED 不再发送或记账。P06 接收独立可信结果后才可原子到账，重复结果不重复增加 refundedCents。

新增尝试、商家审计和成功回执原子；查询在途 / 已完成的观察只写审计 / 回执。退款 version 本轮重试不递增，CommandResult.version 是输入时的当前退款 version，区别于批准操作的订单 expectedVersion + 1。尝试 ID 使用环境 / refund / operation / A06 receiptId，保持 P06 连续 sequence；原请求重放验证当前用户 / 角色 / 账本并重现原标识，**transportRequired=false**，丢响应不能触发二次 SUBMIT。新 key 仍由当前 P06 状态决定查询或发送。

没有实际 transportPlan / 钱款执行、平台响应认证或任务发送器。transportRequired 仅表达可信服务端接线需求，运营 / 成功反馈仍关闭；后续发送器须按尝试持久状态处理发送占权、丢响应和查询恢复，不能把接口返回当成已退款。不会人工把 P07 job 标记 DONE / 清租约 / 重置尝试或宣称补偿成功。

<a id="a06-merchant-resolution--财务--补偿--审计读取"></a>
## 财务 / 补偿 / 审计读取

refunds.list / refund.get 要 REFUND_APPROVE。完整同店有限快照逐订单校验资金、连续日志、review 来源及退款尝试；不能只看 refund.status 推断资金。退款 DTO 只有订单号 / ID、状态、金额 / 预算、到账时间和白名单尝试摘要，省略电话、地址、付款交易号、平台退款号、profile / 原因全文 / 原始异常；错误只投影已知 REFUND_PROVIDER_FAILED，其余不透传原始字符串。

本轮新增**仅 PLANNED** 的 admin.exceptions.list，REFUND_APPROVE、storeId、CREATED_DESC 分页；目标 registry 现为 **61** 项（2 个最小旧函数、59 个 PLANNED）。此前文档按历史轮次保留 60 项记录，最新契约以 [API_NETWORK](../../API_NETWORK.md) / registry 为准。allowlist 不变。exceptions.list 校验 P07 job 与当前同店 order / payment / refund、环境 / app / merchant / provider、确定性 ID 和当前实体版本；返回未 DONE 的在途 / 待审任务和租约是否过期，**不返回 leaseToken**，lastOutcome 仅受控枚举。

REFUND_QUERY 指向原退款重试需求，其 enabled=false；付款查询、付款异常和已关闭付款的 ORDER_CANCELLATION_REVIEW 指向 P04 / O05 服务器恢复，无退款动作，不虚构订单已取消。跨店来源、不完整资金、未知任务 / scope / 原始 outcome 被拒绝；不执行补偿、改账或发告警。运行日志 / 告警送达 / 分配负责人 / 人工处置 UI 和真实任务仍待 P07 / A07 接线。

audit.list 单独要求 AUDIT_READ，不因拥有退款权限自动可读审计。校验 scope、storeIds、目标 / 版本、真实 actor、时间和结果，投影动作、当前请求门店、目标版本、脱敏依据和 trace；多店审计不泄露其他 storeIds，原 changes 不直接透出。A01 / A04 / A05 的旧审计没有 outcome 时返回 null，不推断成功；A06 已提交审计显式 SUCCEEDED。网络拒绝 / 失败尝试的固定 code / requestId 记录和实际运营入口仍待 handler，不声称已保存回滚事务的失败审计。

分页 HMAC 绑定环境 / app / 当前人员 / grant / 店 / 筛选 / 完整投影修订与过期时刻；授权撤销、筛选或数据变化使旧游标失效。退款 / 审计 / 补偿页无顾客联系方式；确有履约需要的联系方式仍通过已有受权订单详情独立读取。

<a id="a06-merchant-resolution--事务与验证边界"></a>
## 事务与验证边界

写服务适配器要求 readUser / readAccessState / readOrder / readRefundHeader / readResolutionState、receipt / audit / refund-number 读取、assertResolutionReads、insert / saveCancellation、insertRefund / insertAttempt、updateResource / updateReservation、saveOrder / insertLog / insertAudit / insertReceipt。相关集合、唯一号 / 未存在日志 / 回执 / 审计、原付款 profile 和当前权限均须一致并保护至 commit；每写必须恰好 1 行。不能先审批后另开事务预留资金，不能用独立 P06.prepare 绕过原权限事务。

读服务单独 readFinanceState / readScopedAudits / assertFinanceReads；明确 complete=true 的**可信有限快照**，不能接受客户端或把 SDK 分页片段标为完整。生产有界查询、预算、索引、完整谓词与证据一致性尚待真实 SDK。本轮仅串行内存，不能证明实际并发。订单和付款历史投影复用既有服务；没有 UI / Storage 接线。

典型申请 / 退款批准 5 写、两类资源的制作前正金额取消批准 10 写、发送 / 查询尝试 3 写；在途 / 已完成重试观察 2 写。原 key 重放校验原 expectedVersion、log 轴的具体转换、request / intent / attempt 的确定性身份和完整记录链。不能把 self-consistent digest 当成来源证明，已用篡改 effect 和 transition 的负向测试验证。

37 项专项、受影响组合 **212/212**；最终全套 **928/928**、静态 **307**，主包 / features / legacy **1239 / 139 / 45 KiB** 不变。执行前后源码指纹一致，见 [证据](../../qa/a06-2026-10-06/summary.md)。

失败证据保留：first 27/28，剩余是测试错误地要求回滚 beforeCommit 外部订单版本变化，已改为保留外部变化并断言新退款未提交。replay-before 2 个探针复现新实现未拒绝已改 effect.reviewId 与自洽但错误的原 transition，已加具体操作 / 金额 / 状态绑定。affected-first 204/205 的失败为新增 retry 定义与既有定义重复、计数误期待 62；已移除重复，实际只新增 exceptions.list，61 项。affected-final 209/210 剩余是模拟履约更新未来于夹具时钟，校正测试时间；最终 affected-verified 全通过。复查补齐 P07 的 CLOSED 付款订单任务映射与财务已付来源、原始异常白名单。上述不是云端 / 真机事故。

| 真实用例 | 验收目标 | 当前 |
|---|---|---|
| RF01 | 平台身份、跨店 / 顾客 / 撤销、当前角色直到提交 | NOT_RUN |
| RF02 | SDK 原子审批、唯一 PENDING / 退款号、回滚与订单履约竞争 | NOT_RUN |
| RF03 | 已消费库存 / SLOT 正式回补策略，禁约 / 停业后的历史处置 | NOT_RUN |
| RF04 | 原号退款 / 查单、网络丢响应、回调 / 查询 / 并发重复真实资金 | NOT_RUN |
| RF05 | 归档商户 profile、真实 P07 补偿 / 对账 / 告警和租约竞争 | NOT_RUN |
| RF06 | 微信请求 / 审批 / 退款页、实际提示、分页与日志脱敏 | NOT_RUN |
| RF07 | E01 / E12 / P08 / A07 完整实际运营门禁 | NOT_RUN |

真实资料 / 云 / SDK / 索引 / 资金 / 页面 / 真机及 RF01–RF07 全部待补。没有 Git 提交 / 推送、prepare-cloud、部署或资金 / 对外消息操作，所有既有未提交成果保留。下一项 **A07 Admin 可离线阶段评审及真实运营 / 旧入口退役清单**。

---

<a id="a07-admin-acceptance"></a>

## 原记录：A07-ADMIN-ACCEPTANCE.md

<a id="a07-admin-acceptance--a07-admin-离线阶段评审与旧入口退役清单"></a>
# A07 Admin 离线阶段评审与旧入口退役清单

日期：2026-10-06。**可离线评审通过，A07 整体及阶段八真实运营验收未通过。** 用户允许在云环境未开通时继续推进；本记录没有授权真实人员、调用资金接口或部署云函数。

<a id="a07-admin-acceptance--当前交付边界"></a>
## 当前交付边界

A01–A06 是可组合的内部服务及串行内存事务回归。商家页面 `miniprogram/features/admin/admin.js` 仍是未开放的 Shell；A03 自提会话没有 Page / wx / Storage / 网络接线。客户端 `miniprogram/services/cloud.js` 只允许 `user.me` 和 `store.health`。`cloudfunctions/admin/` 不存在，`scripts/prepare-cloud.js` 只同步 user / store 的最小 runtime；不能拿该脚本部署整个业务。

商品 / 门店维护已在实际本地 A04 / A05 → O03 服务组合中验证：改价、上下架、库存 / 门店 / 配置 / 时段版本改变，使旧报价失效；当前预约摘要使用新配置，历史订单与占用保留。**顾客页面仍使用 development Shell 示例，尚未同步商家改动**，测试中的组合与协议投影不是客户端适配器。

当前 V1 保持每日 08:00–21:00、30 分钟预约、自取 3 单 / 配送 1 单独立容量、门店自行配送、20 km 含边界、0 元配送费、预计配送时段。正式目录 / 库存单位 / 提前量 / 预约窗口 / 凭证 / 回补 / 完成策略及地图来源仍按外部条件登记，不用测试值补成发布默认。

<a id="a07-admin-acceptance--可重复执行的离线证据"></a>
## 可重复执行的离线证据

```powershell
npm run verify:admin:offline -- --name a07-new-evidence-name
```

必须使用新的 `docs/qa/` 子目录名。脚本只读取固定代码 / 公开素材范围、执行本地 Node 测试、静态 / SVG 检查和隔离平台探测；旧 HTTP 回归会在回环地址启动临时测试服务，不启动 `server/index.js` 或写经营数据。脚本不读取 `.env`、本地私有配置或密钥，不使用微信 / 云 SDK，不发送消息、提交、上传或部署。

复用 P08 的严格 TAP 校验、60 秒单步骤期限、输出上限、目录独占创建和源码指纹。Admin 组至少 203 项、旧基线至少 19 项；非零退出、缺 / 重复汇总、跳过 / 取消 / TODO、空测试、平台门禁开启或执行前后代码变化均拒绝通过。中断保留 `RUNNING / offlinePassed=false` 报告；禁止覆盖旧目录。指纹只覆盖固定代码 / 公开素材，文档、私有配置与经营数据不在范围。

报告 scope=`OFFLINE_ADMIN_ACCEPTANCE_EVIDENCE`。`offlinePassed` 只表示本次本地检查；`realAcceptance` 的云 / 管理员 / 页面 / 真机 / 并发 / 资金 / 旧包退役字段始终 false。

本次新增 9 项 A07 回归，证据 [首轮](../../qa/a07-2026-10-06/first.tap)及[最终报告](../../qa/a07-2026-10-06-final/summary.json)。最终数量及指纹以报告和 [证据说明](../../qa/a07-2026-10-06/summary.md)为准。

| 评审项 | 实际离线证据 | 仍欠的真实能力 |
|---|---|---|
| 当前身份、初始化 / 最小授权 / 撤销 | A01 32 项；实际 user handler 忽略伪造 staff / PIN / openid，仍返回 customer | 真实平台主体、独立批准来源、初始授权、即时撤销并发 |
| 接单 / 制作 / 备妥与自提 | A02 / A03 / O07；A07 取消申请明确拒绝后，确认核销、丢响应原 key 重放，资源不重复消耗 | 顾客凭证展示、商家页面 / 扫码、持久恢复、正式核销策略 |
| 门店人工配送 | A02 / O08；A07 请求拒绝→配送完成→部分退款，原配送 key 重放、地址 / 商品 / 资源保留 | 真实地址 / 地图 / 电话 / 责任政策、页面及真机 |
| 商品 / SKU / 库存 / 目录 | A04 31 项，含实际 O03 旧 quote 失效与历史保留 | 正式经营资料、真实媒体 / 库存、顾客 / 商家页面、SDK 查询 |
| 营业 / 预约 / 配送配置 | A05 32 项，含发布切换 / 禁约及历史订单继续履约 | 真实定位 / 经营批准、完整有界查询与发布事务预算 |
| 取消 / 退款 / 审计 | A06 37 项；A07 批准取消后不得接单，UNKNOWN 只查原退款号、独立结果一次到账；角色撤销拒绝原 retry 回执重放与财务读取 | 真实 P06 认证结果 / 资金 / 调度、当前权限提交栅栏、运营页面 |
| 普通用户与旧入口隔离 | A01–A06 权限回归；全部 59 个 PLANNED action 在实际 client 中均被拒，平台调用 0；旧接口 11 个禁用配置组合均拒绝 | 真实云 handler / 数据库规则拒绝、正式包剔除演示与运行时攻击测试 |

<a id="a07-admin-acceptance--新旧入口退役清单"></a>
## 新旧入口退役清单

这里的“关闭”是当前运行时拒绝，“退役”是正式发布包与服务不存在可用演示链路。两者分别记录；本 Task 不批量删除代码或改变已确认 UI。

| 旧路径及关键位置 | 当前证据 / 状态 | 正式发布前处理与替代 |
|---|---|---|
| `miniprogram/legacy/utils/api.js:4` / `:9`、`legacy/config.js` | 实际 guard 只在 development + shell + enableLegacyDemo===true 放行；当前 false；HTTP 配置仍指向 127.0.0.1 | Q01 用可审查打包配置剔除 legacy；不得把 apiBase 改成生产域名伪装新服务 |
| `miniprogram/app.json` legacy-demo 子包 | 7 页仍注册 / 随源包保留；未物理退役 | 删除正式产物的旧注册 / 路由 / 依赖后验证包内容；回归依据保留在开发基线 |
| `miniprogram/pages/account/account.js` legacy 方法 | 三项配置检查后才导航；当前不放行 | 正式产物移除开发跳转；新商家入口依据可信本人能力摘要显示，服务器每次另验权限 |
| `legacy/pages/staff/staff.js:7`、旧 `jjl_staff` token | PIN 换本机演示会话，不是 A01 角色；云 user 返回固定 customer | 不迁移旧 token / PIN；A01 平台主体 + 受控批准 + 门店最小角色替代 |
| `legacy/pages/checkout/checkout.js`、旧 order 页 `:11` / `:12` / `:21` | 单商品预订、定金 / 尾款、线下登记、模拟支付 / 退款均为演示路径 | V1 购物袋→可信 quote→O03→全额支付→可信查单 / 通知与 P06；不得搬旧状态或模拟成功反馈 |
| `server/app.js:54` / `:55` / `:74` / `:79` / `:93` | demo customer、PIN、模拟支付 / 退款 / 线下尾款仍存在；工厂自身不是云生产门禁 | 只保留隔离测试用途，不部署为正式 API、不导入云 handler；无需在 A07 删除旧 HTTP 回归 |
| `server/index.js:16` / `:17` / `:22` | 默认回环地址；production / live 启动拒绝；局域网演示需自定义口令 | 该条件不是全面发布防护，不把此进程列入 V1 服务；复查正式启动 / 镜像 / 域名清单 |
| `web/app.js:28` / `:122` / `:135` / `:152` | 旧 PC / Web 演示角色、PIN 和模拟资金仍存在 | 不作为商家生产后台；V1 只使用受权小程序商家服务 |
| `data/store.json`、旧 token / 商品 / 订单资料 | 演示数据库；本轮未读取 / 修改本地经营文件 | 不自动导入正式用户 / 资金 / 订单；确需迁移另列来源、映射、去重与核对方案 |

字面依赖扫描覆盖非 legacy 的 JS 相对 require、canonical routes 和 localhost URL。它不是完整程序分析或正式产物扫描；Account 仍有受配置保护的显式开发跳转，不能据“没有 legacy require”宣称演示已从包中删除。

旧基线 `tests/domain.test.js`、`http.test.js`、`repository.test.js`、`wxml.test.js` 19 项继续单独执行；测试旧语义不等于 V1 使用定金、PIN、模拟资金或人工逐单配送范围确认。

<a id="a07-admin-acceptance--真实联合验收矩阵"></a>
## 真实联合验收矩阵

所有项目目前 **NOT_RUN**。负责人和测试账号由实际受控运维登记，不从夹具推断授权；证据必须脱敏，并附环境 / 发布版本 / 请求 ID / 原 key 摘要 / 订单版本 / 日志与资源计数。受控实付须按 E14 的实际范围及预算，不能用本记录批准。

| ID | 执行条件 / 负责人 | 要验什么、留下什么证据 |
|---|---|---|
| AG01 | E01 / E12、运维 + 商家 | 真微信初始授权，普通用户直开页面 / 伪造 role / PIN / 直调全部敏感 action 拒绝；角色与审计当前版本 |
| AG02 | D06 / P08、商家 + 顾客 | 自提购买实付→接单 / 制作 / 备妥→展示码 / 手输 / 扫码→确认→Completed；顾客与商家同单、一次核销 / 库存消耗 |
| AG03 | 地图 / 电话 / 配送政策、商家 + 顾客 | 配送实付→人工配送→完成，20 km 含边界和超范围拒绝、30 分钟 / 0 费 / 独立容量、双方状态与历史 |
| AG04 | E05 / E06、商家 + 测试 | 实际商品改价 / 下架 / 库存维护同步顾客云读取，旧 quote 拒绝，已有订单 / 素材 / 占用不变 |
| AG05 | 正式地图 / 政策批准、运维 + 商家 | 实际配置发布、禁约 / 停业后客户端重新读取；原订单继续履约，容量不低于占用，无分批指针切换 |
| AG06 | P06 / E14、财务 + 运维 | 请求拒绝 / 获批、制作后回补政策、额度与原号失败 / 未知恢复、真实到账一次，审计及对账核准 |
| AG07 | 真实 SDK / 索引 / 查询栅栏、测试 + 运维 | 双商家 / 最后一份资源 / 撤销 / 提交期限 / 同 key 并发；订单、日志、审计、预算与资源一致，非串行夹具 |
| AG08 | 有限查询 / 隐私规则、测试 + 财务 | 同店与跨店财务 / 审计权限分离，分页游标主体 / 内容变化失效；电话 / 地址 / 原始错误 / 平台标识不越界 |
| AG09 | 真机 / 持久恢复、测试 + 商家 | 核销与退款失响应、切账号、页面隐藏、重启 / 断网后原请求安全恢复，未知不二次发送或显示成功 |
| AG10 | Q01 产物 / 配置 / 进程清单、运维 | 发布包无 legacy / PIN / localhost / 演示客户 / 模拟资金入口，旧服务不在部署清单；保留源码 / 回归基线 |

先完成真实云 / 可信身份 / SDK 适配与经营资料，再进行页面联调及受控资金链；最后验证并发、恢复、隐私和发布产物。任一真实证据缺失都不能把 A07 或阶段八改为已验收。

下一步 **Q01 可离线干净构建、独立部署依赖与配置核对准备**。真实新环境部署、数据库索引 / 规则、权限配额与全链路仍待 E01 / I07；不因进入阶段九而开放当前购买 / 商家 / 资金门禁。

---

<a id="phase-8-execution"></a>

## 原记录：PHASE-8-EXECUTION.md

<a id="phase-8-execution--阶段八-admin-执行记录"></a>
# 阶段八 Admin 执行记录

日期：2026-10-06。当前按用户授权推进可离线部分；P08 真实门禁和 E01 / E12 仍待条件，正式运营未开放。

A07 最新：203 + 19 + 715 = **937/937**，静态 **310**、SVG **41**，源包体 **1239 / 139 / 45 KiB** 不变。新增 9 项联测首轮通过，源码前后指纹一致。59 个 PLANNED action 实际 client 拒绝、平台调用 0；11 个禁止旧演示配置组合拒绝。60 个非 legacy JS 字面依赖 / localhost 与 canonical routes 通过；目录越界 / 复用退出 1，原报告不覆盖。

自提原 key 恢复、配送完成后部分退款 / 原履约重放、取消获批后禁止接单 / UNKNOWN 只查原号、撤销后退款与财务拒绝通过。商家仍 Shell，顾客页面未接入 A04 / A05 维护同步；旧子包仍注册，保留演示及 19 项基线不等于正式产物退役。

见 [A07](phase-8.md#a07-admin-acceptance) / [证据](../../qa/a07-2026-10-06/summary.md)。AG01–AG10 全部 NOT_RUN，A07 整体及阶段八运营未验收，真实验收字段 false。未改 UI 或操作云 / 资金 / Git 提交 / 推送 / 部署，原未提交成果保留。下一项 **Q01 可离线构建 / 独立部署依赖 / 配置核验准备**。下文按日期保留历史记录。

| Task | 可离线状态 | 整体验收 |
|---|---|---|
| A01 | 受控初始化、委派 / 撤销 / 审计事务及本人入口摘要通过，32 项专项 | 待真实管理员 / SDK / 页面 / 越权 / 撤销并发；未通过 |
| A02 | 商家同店列表 / 历史详情、接单 / 制作 / 备妥 / 拒单事务与 O07 / O08 / P06 编排；34 项专项通过 | 页面 / SDK / 唯一 / 并发 / 真机 / 退款仍待，整体未通过 |
| A03 | 输入 / 显式扫码 codec / 摘要确认 / 原请求恢复契约；28 项专项、A01 / A02 / O07 组合通过 | 正式政策 / 页面 / wx 扫码 / 持久恢复 / SDK / 真机仍待；整体未通过 |
| A04 | 目录 / 完整 SKU 保存、上下架 / 归档、库存总额、商家读取 / 审计 / 幂等；31 项专项通过 | 正式资料 / 页面 / SDK / 索引 / 并发 / 真机仍待；整体未通过 |
| A05 | 门店 / 草稿 / 版本发布 / 禁约时段、当前规则校验 / 商家读取 / 审计 / 幂等；32 项专项通过 | 正式资料 / 地图 / 政策 / 页面 / SDK / 索引 / 并发待补；整体未通过 |
| A06 | 已付取消申请 / 明确审批、退款预留 / 原号重试、财务 / 补偿 / 审计读取；37 项专项通过 | 正式策略 / SDK / 索引 / 权限 / 资金 / 页面 / 并发待补；整体未通过 |
| A07 | 联合流程 / 入口隔离、旧基线与一键离线证据通过；9 项新增，全套 937 项 | 真实云 / 身份 / 页面 / 资金 / 并发及正式产物待 AG01–AG10，整体未通过 |

A01 复用 D06 principal 和能力校验、目标 admin API 契约与既有角色 / 审计 / 回执集合。禁止自修改，委派的全部门店和能力由同一当前授权覆盖；初始角色来自独立受控资料并保留永久一次性审计标记。角色与日志 / 回执原子，旧 grant 重放不复活撤销角色。入口摘要及能力观察均保持不可调用 / 不开放，不把 UI 显隐当鉴权。

最终全套 **766/766**、静态 **288**，源包体 **1239 / 127 / 45 KiB**。完整逻辑、适配器约束、证据和 AR01–AR07 真实用例见 [A01](phase-8.md#a01-admin-authorization)。仅串行内存和对象身份来源验证，未新增正式 admin handler 或客户端 allowlist，没有授权真实账号、UI 改动、微信 / SDK / 云 / 资金操作或 Git 提交 / 推送 / 部署。全部既有未提交成果保留。

2026-10-06 A02 最新记录：新增商家查询及履约事务，历史投影复用 O06；当前 A01 严格 scope 校验共用，O07 / O08 路由在原事务保留完整 access 栅栏与原 HMAC / 资源规则。CONFIRMED 库存开始制作后 CONSUMED；已付拒单仅预留剩余退款，不虚构成功，待审取消需 A06 明确审批。34 项专项及组合 142 项通过，全套 **800/800**、静态 **292**，源包体不变。真实门禁和 MR01–MR08 全部 NOT_RUN。见 [A02](phase-8.md#a02-merchant-orders)；下一项 A03 可离线交互契约，不改既有 UI 或开放真实运营。

2026-10-06 A03 最新记录：当前候选长凭证的手输 / 显式扫码解码、受权摘要、用户确认、错码 / 锁定 / 冷却及原 key 结果恢复契约通过。28 项专项、组合 89 项，全套 **828/828**、静态 **294**，主包 / features / legacy **1239 / 139 / 45 KiB**。执行前后源码指纹一致。只在测试中投影协议形状；真实确认 / 核销 / 成功反馈门禁全部 false，未接 Page / wx / Storage / 云；PS01–PS07 全部 NOT_RUN。见 [A03](phase-8.md#a03-pickup-session)；下一项 A04 商品 / SKU / 库存维护可离线部分。

2026-10-06 A04 最新记录：当前同店 CATALOG_WRITE 事务、完整合法 SKU 编辑 / 固定组合、新建 DRAFT、完整发布门禁、上下架 / 归档、库存总配额不低于 held + confirmed + consumed、审计 / 回执与当前商家分页通过。新增 31 项，组合 **119/119**，全套 **859/859**、静态 **298**，源包体 **1239 / 139 / 45 KiB** 不变；执行前后指纹一致。O03 旧报价失效与订单 / 图片 / 占用历史保持本地通过。没有正式 SDK / handler / 客户端接线，MC01–MC07 全部 NOT_RUN。见 [A04](phase-8.md#a04-merchant-catalog)；下一项 A05 门店 / 营业 / 预约 / 配送配置可离线维护。

2026-10-06 A05 最新记录：当前同店 CONFIG_WRITE、门店信息 / 停业、配置草稿 / 不可覆盖发布版本 / 单调序号与指针切换、未来已建时段版本维护 / 禁约、不低于占用和 V1 固定容量、服务端定位 / 经营政策验证边界、读取 / 分页 / 审计 / 回执通过。用户确认的每日 08:00–21:00、自取 3 / 配送 1、30 分钟、20 km 含边界 / 0 费保持；未知经营值不补默认。新增 **32 项**，组合 **157/157**，最终全套 **891/891**、静态 **302**，源包体 **1239 / 139 / 45 KiB** 不变，执行前后指纹一致。实际 O03 旧报价拒绝、新配置可约摘要和 A02 已确认订单接单 / 制作保持通过。SDK / 地图 / 政策审批 / 页面 / 真机及 MS01–MS07 全部 NOT_RUN；没有开放真实操作。见 [A05](phase-8.md#a05-merchant-store)，下一项 A06 取消 / 退款异常及审计读取可离线部分。

2026-10-06 A06 最新记录：已付本人取消申请 / PENDING 唯一、同店明确审批、具体状态 / 金额 / 原请求重放、资源 / 退款预算原子处理、原号 P06 重试 / 查询恢复、商家财务 / P07 异常 / AUDIT_READ 独立读取通过。新增 37 项，组合 **212/212**，全套 **928/928**、静态 **307**，源包体 **1239 / 139 / 45 KiB** 不变；执行前后指纹一致。只新增 PLANNED exceptions.list，registry 61 项，真实 allowlist 不变。未知结果先 QUERY，失败保留预留，成功只由独立可信结果入账；制作后 SLOT 策略缺失拒绝。RF01–RF07 全部 NOT_RUN。见 [A06](phase-8.md#a06-merchant-resolution)，下一项 A07 可离线阶段评审与真实运营 / 旧入口退役清单。
