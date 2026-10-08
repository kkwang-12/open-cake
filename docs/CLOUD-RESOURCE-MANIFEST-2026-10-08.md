# 主流程云资源清单：分批创建与验收

日期：2026-10-08。来源：[数据模型](DATA_MODEL.md)、[事务与候选索引](TRANSACTIONS.md)、[权限契约](AUTHORIZATION-RULES.md)。本文件交给环境窗口执行资源配置；不表示已创建资源或通过云验收。

## R0：最初 user/store 最小链路（历史范围）

**初始R0集合0、业务索引0、种子记录0。** 当时user/store仅验证平台身份；后续R1已准备，user.me已接入真实users事务，见[最新复验](PHASE-2-CLOUD-REVALIDATION-2026-10-08.md)。不能手填users代替可信原生创建。真机最小链路仍不需要正式商品或管理员。

开发 EnvId `cloudbase-d8gwtxzm64150b7e0`、AppID `wx154f791a17268ace`。无需再索取账号密码、私钥或令牌。待提供独立已关联 test EnvId，不能复用 development。真机记录由操作人填写手机型号/系统、微信版本、时间、两函数成功或失败结果及脱敏请求标识；未执行保持 NOT_RUN。

## R1：数据与权限适配的首批空集合

环境窗口可在已核验 development 环境准备下面三个**空集合**；不导入记录，不授予管理员。先读取现有结构：已有同名集合只核对，不删除、不重建、不覆盖规则。若存在业务数据、规则或索引差异，先回报差异，由主流程明确迁移方案。

| 集合 | 新集合客户端规则 | 新建索引规格 | 用途 |
|---|---|---|---|
| users | read=false、write=false | `uq_user_identity`：environment ASC、appId ASC、openId ASC；unique=true | 原生身份稳定映射；确定性 _id 与复合唯一性均需验证 |
| admin_roles | read=false、write=false | `ix_role_subject_status`：subjectId ASC、status ASC；unique=false | 当前用户授权加载；门店范围/capabilities 由服务端完整验证 |
| audit_logs | read=false、write=false | 暂只保留平台默认 _id 索引，不新增查询索引 | 后续受控身份/授权变更审计；写入与事务设计由主流程实现 |

以上为逻辑规格，**不是工具可直接上传的 JSON**。执行窗口须核对实际管理工具字段、索引能力及构建完成状态；不支持复合 unique、字段顺序不一致或构建失败时，保持阻塞并报告，不能降为普通索引后写“唯一已验收”。不删除平台默认索引。audit_logs 查询索引在真实查询适配冻结后给出。

每个新集合的规则分别设置为平台接受的拒绝客户端读写规则（逻辑为 `{"read":false,"write":false}`），并读取确认；[security-rules.draft.json](../cloudfunctions/database/security-rules.draft.json) 带有项目元数据与 create/update/delete 草稿字段，**不能整份作为平台规则上传**。平台语法/操作由环境窗口实际核验，不以本文件推断部署成功。

规则阻止普通客户端直连；服务端 SDK 仍须自行鉴权，不能据此宣布越权防护完成。索引只提供查询/唯一约束，不提供权限。主流程下一步实现可信平台身份→users 的 create-if-absent 与读取、当前角色加载及事务中的权限有效性校验；不能用 subjectHash 作为用户主键。

R1 返回证据：EnvId、三个集合是否原已存在、规则实际读回、索引字段/方向/unique/状态、创建时间及错误码。不打印集合文档或完整 OPENID。主流程真实 SDK 写读/并发验收另行记录。

## R2–R5：后续范围登记，当前不执行

以下完整业务集合来自现有模型，便于估计范围；尚未冻结实际 SDK 查询和索引，**不能一次性创建并导入 fixtures**。每批开始前主流程补具体字段、索引方向、唯一语义、测试资源和清理清单。

| 批次 | 集合 | 索引/约束重点 |
|---|---|---|
| R2 目录/个人数据/门店 | categories、products、skus、favorites、carts、addresses、stores、store_config、media_assets | 分类 code 唯一、店内发布配置版本唯一、本人收藏/购物袋唯一；发布状态/owner/store 过滤与稳定分页；SKU 合法组合与素材引用 |
| R3 报价/订单/资源 | checkout_quotes、orders、order_items、order_logs、cancellation_requests、reservations、slot_inventory、inventory_resources、idempotency_records | 订单号唯一、报价一次消费、同单明细/资源预留唯一、同店同模式时段唯一、同主体命令 key 唯一；最后库存/时段及逐写回滚 |
| R4 支付/退款 | payments、refunds、payment_events、refund_attempts、payment_test_budgets | 商户范围业务号及可信平台号去重；事件去重、未决预算与尝试序号；null/未决记录唯一语义需验证，不盲建全字段 unique |
| R5 运营查询与发布 | 复用上述集合，不额外猜建集合 | 当前角色撤销、审计分页、真实扫描/任务租约、必要查询索引与发布包验证 |

支付 provider/商户/environment 的唯一范围需接入方案明确后冻结；不能把尚未发生支付的 null 平台交易号建成错误唯一约束。订单、资源及角色的确定性 ID 仍须真实 create-if-absent/事务冲突验收。缺失文档查询、读取集保护、事务预算都不能由索引存在推断。

## 测试数据和清理边界

- R0/R1 配置阶段不写业务数据。真实用户由可信微信上下文适配创建；不手写管理员，不把测试 fixture 的 ownerId 当平台身份。
- 独立 test 环境未确认前，不执行最后库存/容量竞争、逐写故障、角色撤销竞争或资金实验。仅环境结构准备和最小链路验证不受此影响。
- test 验收使用专用 runId、固定测试主体、测试门店/商品/资源及逐文档清单，业务字段沿用真实 schema；审计不能泄漏电话/地址/OPENID。具体数据生成器由主流程提供，不从 tests/fixtures 直接全库导入。
- 测试数据只用于受控 SDK 验收，不发布到正式目录，不启用真实经营或支付。合成 PAID/退款记录只能证明模型路径，不能算实付/退款证据。
- 当前 development-seed 只支持 development，不能改 stage 来在 test 强行运行。其五条 DRAFT 计划也没有真实 executor；R2 若落库，须先完成 create-if-absent/逻辑唯一/整批事务适配，不能在控制台手工批量导入代替。
- 保持无默认清库操作。验收结束仅凭 runId 与精确文档清单提出受控清理方案；不按集合全删、不按模糊前缀删、不清用户历史/审计。

## 当前分工及下一步

更新：R1与真实身份创建/读取、客户端读拒绝已完成本轮复验，无需重复创建/清空用户/改规则。实查users=1、admin_roles=0、audit_logs=0。下一项[D04安排](D04-CLOUD-SDK-ACCEPTANCE-PLAN.md)，test配置交环境窗口，精确资源清单由主流程冻结后再执行；下段为最初分工。

环境窗口：完成 R0 的真机/工具证据，准备 R1 空集合/规则/索引并返回差异；独立 test EnvId 由环境负责人补齐。主流程窗口：实现并测试真实身份/数据库适配，补 D04/D06 实际验收，再冻结 R2/R3 和真实订单原子保存方案。UI/动效仍交其他窗口。

资源清单准备不等于数据层验收。当前 I03/I07 真机、D04 SDK/事务/唯一性、D06 当前权限/越权负读和订单持久化均保留待执行状态。

## 环境窗口 R1 执行回执

2026-10-08：三个空集合已创建，客户端 read/write 全拒绝规则已读回；两个指定索引的字段顺序/方向/unique 已读回。平台默认还提供 _openid_1，已按要求保留。显式索引构建状态未返回，SDK 唯一/事务/权限与原生拒绝验收不据此标通过；本轮原生读验证受微信工具 APPID_ERROR 阻塞。详见 [R1 独立结果与脱敏证据](CLOUD-RESOURCE-R1-RESULT-2026-10-08.md)。未导入或写入数据、未授权管理员、R2–R5 未执行。
