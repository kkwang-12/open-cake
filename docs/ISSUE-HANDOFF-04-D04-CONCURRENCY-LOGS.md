# 问题 04：D04 并发通用错误取证

日期：2026-10-08。执行窗口：验证开发云环境最小链路。回报主流程：`01a101b8-2f61-70e1-95fb-6e30056bd0e1`。

主流程已执行一次真实微信模拟器 wx.cloud 事务实验。证据：`docs/qa/d04-cloud/native-1791443939898.json`。结果12/16通过，D04未通过；问题01–03环境配置已关闭。

此次单项是定位并发失败请求的可用平台证据，**只读取证，不修改业务代码、配置或数据，不重新实验**。唯一冲突失败留到后续单项，不能把两个错误视为同因。

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

## 回报与边界

写 `docs/ISSUE-RESULT-04-D04-CONCURRENCY-LOGS.md`，脱敏证据 `docs/qa/issue-04-d04-concurrency-logs/`。每条请求明确实际查到什么、哪些原始字段不可见，区分事实与假设；返回 `READY_FOR_MAIN_REVIEW` 或具体 `BLOCKED`。

如只读日志工具必须切绑定，提前通知，确认test，结束恢复development并回读。不修改共享工程或运行环境，不删除测试文档，不自动延长17:07:14.200的probe截止时间，不创建日志资源、不提交推送发布。完成或阻塞直接同步后停止。不得使用旧run重跑全套，它已有占用数据。
