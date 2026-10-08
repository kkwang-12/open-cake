# 问题 02：D04 测试数据库资源配置结果

**主流程复核：CLOSED / CONFIG_PASS（2026-10-08）。** 已核对结果与 `database-evidence.json`：三个空集合、客户端全拒绝规则、指定复合唯一索引规格及 development 绑定恢复符合配置任务。工具未暴露索引构建状态；实际唯一冲突及客户端权限测试仍 NOT_RUN，不宣称 D04 实验通过。

状态：**READY_FOR_MAIN_REVIEW**。记录时间：2026-10-08T07:02:55.172Z（UTC；Asia/Hong_Kong +08:00）。
唯一操作环境 dinner-cook-test-d5e320u981ec341，上海 NoSQL，同 AppID wx154f791a17268ace。依据 [问题02交接](ISSUE-HANDOFF-02-D04-DATABASE.md)。等待主流程复核，不自行写 CLOSED/PASS。

## 实际创建与回读

创建前集合列表 Total=0，三个同名集合不存在，没有已有数据或配置差异。按清单新建，未复用或覆盖已有资源。

| 集合 | 最终文档数 | 权限与安全规则原文 | 最终索引 |
|---|---:|---|---|
| jjl_d04_probe_resources | 0 | CUSTOM；{"read":false,"write":false} | 仅平台默认 _id_、_openid_1 |
| jjl_d04_probe_records | 0 | CUSTOM；{"read":false,"write":false} | 仅平台默认 _id_、_openid_1 |
| jjl_d04_probe_receipts | 0 | CUSTOM；{"read":false,"write":false} | 两个默认索引＋uq_d04_probe_command |

指定唯一索引实际回读：Name=uq_d04_probe_command；Keys 按 runId、caseId、commandKey 顺序，每项 Direction="1"；Unique=true、Sparse=false、PartialFilterExpression=""、Size=8192。字段顺序/方向/unique 均一致，未降为普通索引；没有删除默认索引。

**可用构建状态限制：** describeCollection/listIndexes 没有返回 Building/Ready/Failed 等显式状态，记录 NOT_EXPOSED_BY_TOOL，不能把 Size 或 Accesses.Since 当构建完成证明。索引已存在及配置回读成功；实际唯一冲突与有效性为 NOT_RUN，留给主流程。默认 _id_ 的 Unique=false 是平台原始返回，不修改，也不据此推断确定性 _id 并发语义。

## 请求标识

| 动作 | resources | records | receipts |
|---|---|---|---|
| 创建 | ac40fa48-337a-40ed-bb21-95b68e0dc518 | 1f27c6a5-4727-4627-b390-2ddf82451c6f | 02fe2622-b194-41b2-b07b-502b1262965b |
| 设置规则 | 0c092904-09e0-434f-b146-e6cd8463d46a | 181202db-f887-4895-9157-3bb2bb40e4dd | e4f5bc5a-7629-485c-a045-db2fbec1e986 |
| 回读规则 | e530c1dc-4c85-4c54-9eee-8c1350e9fe8f | 70cdef87-c55f-4479-bd82-779a14dba0af | 315cfe98-afe8-44a5-9291-7b1de609b39a |
| 回读索引 | c720fdc7-6429-4995-9d62-1350fd7f4fee | 40822621-e8d1-488f-8d64-0223ac063697 | 388cd704-9c22-44cc-bfdb-51140657e88e |

索引创建 2bb600d3-456e-4c56-ad31-56a143013d8a；初始集合列表 926ec28d-a9f4-4ae3-baef-b4c2bd76f384；最终空数据列表 b75ec3f6-64bf-4290-b536-8903d950fd35。各操作 success=true，无平台错误码。

## 工具绑定与边界

操作前 current_env_id=cloudbase-d8gwtxzm64150b7e0，ap-shanghai。因管理工具不提供逐次 EnvId，通知主流程后执行 set_env(test)，响应 ENV_READY/实际 test EnvId；主流程回复暂停隐式绑定及并行云操作。三个规则写入回包均含 test EnvId，回读前 auth(status) 再确认 test。主流程“每次修改前确认绑定”的补充到达时本轮写操作已完成；没有伪造逐次 auth 证据，此后无写操作。

完成回读后 set_env(development) 成功；最终 auth(status,site=domestic) 确认 READY、development/ap-shanghai，**已恢复**。本轮所有云资源修改仅在 test，未修改 development 或共享小程序运行配置。

[完整资源及绑定证据](qa/issue-02-d04-database/database-evidence.json)。本轮仅新增本结果/证据文件；git diff --check 通过，原有未提交/未跟踪改动保留。未部署函数、配置主体、插入 probe 数据、运行实验、创建正式业务集合、删除数据、授予角色、支付、提交/推送或上传发布。

具体阻塞：本轮指定配置无阻塞；显式索引构建状态未由工具暴露，作为验收限制保留。客户端实际读写拒绝、唯一冲突、云事务/竞争/故障回滚、问题03函数及主体配置均 **NOT_RUN**。规则配置回读不代替客户端拒绝验证。直接回报主流程后停止。
