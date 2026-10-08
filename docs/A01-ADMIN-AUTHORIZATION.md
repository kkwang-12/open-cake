# A01 商家受控授权、撤销与审计

日期：2026-10-06。状态：**可离线部分通过，整体及真实入口未验收**。接续 P08 离线工作；P08 真实门禁仍未通过，不开放正式运营。

## 本轮实现

新增 [admin-access-service.js](../cloudfunctions/_shared/admin-access-service.js)，只提供内部事务编排。身份来自 D06 principal，重新加载可信 users；平台映射主键、环境、AppID、状态和版本均校验。当前没有 admin 云函数、SDK 适配器或小程序接线，只有 tests 串行内存适配器。未授权真实账号。

2026-10-06 后续 A02 将完整角色 / 门店记录校验提取到 [admin-access-state.js](../cloudfunctions/_shared/admin-access-state.js) 共用，未降低本节规则；A01 32 项回归仍包含在 A02 全量 800 项中。本节 QA / 指纹是 A01 原轮次，最新整体证据见 [A02](A02-MERCHANT-ORDERS.md)。

| 方法 | 已有离线行为 | 尚未接入 |
|---|---|---|
| bootstrap(invocation) | 独立受控调用验证器 / 授权资料加载器；显式主体、门店、六项能力、资料版本和有效期；角色 / 永久初始化审计标记 / 回执同事务创建 | 真实运维身份、E12 人员核验、批准资料来源、撤销 / 版本与期限的真实提交栅栏 |
| execute(event,principal) | 沿用 admin.role.grant / role.revoke 目标契约；当前授权、委派范围、版本、幂等、审计和三写原子回滚 | admin handler、公开错误映射、SDK 事务 / 唯一约束、管理界面 |
| entrySummary(principal) | 当前用户 / 角色 / 非归档门店生成本人门店摘要；普通用户无商家角色 | 我的页入口、路由守卫和真实会话；entryAllowed 固定 false |
| requireCapability(principal,storeId,capabilities) | 当前事务重新读取身份 / 角色并复用 D06 同一授权校验，返回狭窄观察结果 | 真实业务事务仍须自行重查；观察结果不是跨请求令牌 |

所有操作结果均为 OFFLINE_ADMIN_ACCESS_RESULT；cloudVerified / callable / entryAllowed / operationsAllowed 固定 false。entrySummary 为 OFFLINE_ADMIN_ENTRY_SUMMARY，同样不开放入口。客户端 admin 请求在云服务 allowlist 前被拒绝，测试平台调用为 0。既有 UI、user.me / store.health 和 prepare-cloud 行为未改。

## 权限与生命周期

初始化不是普通 action，不接受首个访问者、客户端 role / actor / PIN。verifyBootstrapInvocation 必须明确返回 true，再由服务器 loadBootstrapAuthorization 取受控资料。测试只是对象身份比较，不是部署身份认证。资料含 schemaVersion=1、非负 version、environment、appId、authorizationId、subjectId、storeIds、capabilities、validFrom / expiresAt（UTC 毫秒）及 reason；时间采用 [validFrom,expiresAt)，须含 ROLE_MANAGE，不默认授全权。A01 测试的全能力仅为合成夹具，真实最小能力与人员仍待 E12。

角色管理不允许本人给自己授权或撤销自己。委派要求**同一条当前 ACTIVE 授权**包含全部目标门店及 ROLE_MANAGE 和全部委派能力；不拼接不同能力 / 门店授权，不将 ROLE_MANAGE 当 wildcard。撤销要求同一条 ROLE_MANAGE 授权覆盖被撤销角色全部门店，不能按请求缩小目标范围。

grant 只创建新角色，不覆盖或修改已有记录；相同主体 / 门店集合 / 能力集合已有 ACTIVE 时，另 key 报 ROLE_ALREADY_ACTIVE。不同职责授权可并存，复合操作继续沿用 D06 的同一授权规则。明确重授权需新 key / 新角色，旧 REVOKED 角色保留。revoke 只把 ACTIVE / version 0 转成 REVOKED / version 1，保留原主体、范围、能力、grantor 和审计引用；第二个新 key 的旧版本撤销拒绝。现阶段不支持原地编辑角色或无版本升级。

目标必须为已初始化、同环境 / AppID 的有效 users 映射。禁用人员不能新获授权或访问商家能力，但可被撤销。归档门店不开放入口 / 敏感观察或新授权，仍允许有范围权限者清理角色。缺失 / 错映射 / 跨店、角色损坏或不完整读集均关闭操作。每个敏感请求重查角色；已撤销下一次拒绝。旧入口摘要和观察结果不能用于下一笔业务事务。

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

## 本轮验证

新增 **32 项**专项，最终全套 **766/766**；静态 **288** 个文件通过，主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。证据见 [最终 TAP](qa/a01-2026-10-06/full-final.tap)、[静态日志](qa/a01-2026-10-06/static-final.txt)及 [摘要](qa/a01-2026-10-06/summary.md)。较早 full.tap 的 765 项是补初始化批准 / 期限栅栏前的轮次，最终以 full-final 为准。

覆盖：初始化伪造 / 首访 / 错映射 / 配置 / 时间 / 一次性、跨店和能力委派、自修改与拼接拒绝、禁用 / 归档清理、撤销即时读取、服务重建与重授权不复活、审计 / 回执损坏、原始理由隐私、三写逐位置异常 / 零行回滚、重复 / 不同 key 竞争、提交期间撤销 / 禁用 / 门店版本 / 初始化批准变更 / 期限、时钟倒退及客户端入口持续关闭。

首轮发现数组校验回调的下标误作为文本长度参数，已修正；测试夹具的未知角色读取与客户端错误形式也已纠正。之后补齐审批版本 / 提交期限栅栏与回执审计时间一致性，没有降低权限或放开真实入口。

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
