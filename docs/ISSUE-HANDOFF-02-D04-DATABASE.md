# 问题 02：D04 测试数据库资源配置

日期：2026-10-08。状态：待环境窗口执行。

问题 01 已经主流程复核关闭。此次只准备 D04 的三个集合、安全规则及一个唯一索引；函数部署和原生验收主体配置留到问题 03，事务实验由主流程执行。

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

## 边界与回报

本次不部署函数、不配置验收主体、不运行 probe，不创建正式业务集合或导入 fixtures，不改 UI、业务代码、共享运行配置，不授予角色、不支付、不删除、不提交推送发布。保留全部既有改动。

写入 `docs/ISSUE-RESULT-02-D04-DATABASE.md`；脱敏证据放 `docs/qa/issue-02-d04-database/`。记录实际 EnvId、资源新建或复用、三个集合空数据状态、规则原文、唯一索引完整规格和构建状态、实际请求标识、工具绑定前后、具体阻塞。

完成标记 `READY_FOR_MAIN_REVIEW`；阻塞标记 `BLOCKED`。配置回读不等于客户端读写拒绝或唯一冲突已通过，D04 实际实验保持 `NOT_RUN`。直接同步主流程后停止，等待复核和问题 03 指令。用户已授权主流程直接指挥与接收回报，不需要用户中转。
