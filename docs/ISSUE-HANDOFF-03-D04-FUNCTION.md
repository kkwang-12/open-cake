# 问题 03：D04 验收函数部署及受控主体配置

日期：2026-10-08。状态：待环境窗口执行。问题 02 数据库配置已经主流程复核；实际唯一冲突尚未验收。

执行窗口：验证开发云环境最小链路。回报主流程：`01a101b8-2f61-70e1-95fb-6e30056bd0e1`。

## 单项目标

只在 `dinner-cook-test-d5e320u981ec341`（ap-shanghai、AppID `wx154f791a17268ace`）部署 Event 函数 `jjl-d04-probe`，配置有限期限及指定原生验收主体，为主流程真实实验准备入口。

先阅读 `D04-PROBE-ENVIRONMENT-HANDOFF.md` 的函数与配置部分及适用 cloud-functions/miniprogram 技能。development 不部署，不更新 user/store，不改共享 UI 工程。工具隐式绑定须提前通知主流程、修改前确认目标，结束后恢复 development 并回读。

## 操作步骤

1. 检查已有忽略目录 `artifacts/d04-cloud-probe/functions/jjl-d04-probe`，与 `scripts/prepare-transaction-cloud.js` 列出的源文件逐项比对；若不一致先报告，不能部署旧代码或覆盖既有成果。依锁文件安装依赖，确认 wx-server-sdk=4.0.2。
2. 查询 test 是否有同名函数。有未知来源或配置差异先报告；不存在时部署单个函数，Event/index.main，Nodejs20.19；不创建 HTTP、定时或其他触发器。
3. 配置 JJL_APP_ID=wx154f791a17268ace、JJL_CLOUD_ENV=JJL_TEST_ENV=dinner-cook-test-d5e320u981ec341、JJL_STAGE=test、JJL_DEVELOPMENT_ENV=cloudbase-d8gwtxzm64150b7e0。生成本轮唯一16–48位字母数字/_/-的 JJL_PROBE_RUN_ID；JJL_PROBE_EXPIRES_AT 为配置时起两小时的确切 Unix 毫秒时间，记录时区/截止时间。到期不自动延期，报告主流程安排。
4. 使用本地隔离微信工程；可复用 `artifacts/cloud-env-validation-20261008`，检查是否正被使用、保留原配置和成果，不修改根工程。以显式 test 初始化 wx.cloud，原生调用 `{action:'probe',payload:{operation:'identify',caseId:'atomic'}}`。此操作无数据库读写。核对调用来自受控验收人，配置其可信64位稳定 subjectId 到 JJL_PROBE_USER_ID；不得以任意首访者自动授权，不采用客户端自称ID，不收集或公开 OPENID/令牌。
5. 回读函数 Active/Available、运行时、配置和 SDK；可进行受控原生 identify 及管理端伪造身份拒绝检查，但不得调用 prepare/hold/read/unique，也不写 probe 数据、不运行事务执行器。再次确认三个集合保持空，记录配置已生效和所用隔离工程。

完整稳定 subjectId 如主流程执行器不需要，不放公开回报；回报中脱敏，环境变量实际值由平台保存。runId 和截止时间要准确回报，主流程执行实验必须使用同一 run。

## 交付与停止条件

写 `docs/ISSUE-RESULT-03-D04-FUNCTION.md`，证据放 `docs/qa/issue-03-d04-function/`。记录 EnvId、函数名、部署请求标识、代码比对/SDK/运行时、状态、触发器、配置回读（身份脱敏）、runId/截止时间、原生 identify 请求标识/结果、受控主体配置依据、隔离工程绝对路径、集合空状态、绑定恢复及具体阻塞。

完成标 `READY_FOR_MAIN_REVIEW`，阻塞标 `BLOCKED`，直接同步主流程后停止。函数部署成功不等于云事务或 D04 通过；实验由主流程随后执行。本次不改业务代码/UI、不批量建业务资源、不删除、不授权管理员、不支付、不提交推送上传发布。保留其他窗口改动。
