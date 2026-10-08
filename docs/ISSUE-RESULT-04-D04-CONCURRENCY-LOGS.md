# 问题 04：D04 并发错误只读取证结果

**主流程后续：并发业务故障已修复并真实复验通过，见[D04修复记录](D04-CLOUD-REPAIR-2026-10-08.md)。原始历史日志仍不可取得，下文BLOCKED记录不抹去、不写成日志服务已恢复。此轮由主流程本窗口完成后端修复和验收，不继续派单。**

状态：**BLOCKED（原始日志不可取得）**。记录时间 2026-10-08T07:24:22.802Z（UTC，香港 +08:00）。仅test dinner-cook-test-d5e320u981ec341 / jjl-d04-probe / run d04-20261008070714200-ba2d4765。来源 [问题04交接](ISSUE-HANDOFF-04-D04-CONCURRENCY-LOGS.md)。

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

## 代码观察及下一步

只读当前 cloud-document-transaction.js provider()：已有内部错误直接抛出；明确duplicate(error)映射唯一冲突；其他SDK错误统一fail(CLOUD_DOCUMENT_OPERATION_FAILED)，未保留原始SDK code/errCode。这能解释公开响应缺少细分诊断，**不能证明四个请求是同一种SDK故障，不能证明冲突发生或SDK是否重试**。唯一冲突错误仍留后续单项，不与本问题合并。

主流程可在后端单独安排最小诊断：保留安全白名单的SDK code/errCode、操作类别、关联requestId以及事务回调尝试次数，并核对原始错误与SDK重试语义。不要输出事件/用户身份/凭证/完整错误消息或数据。是否重新部署、设置日志入口或用新run复验由后续授权任务决定；本窗口没有实施修复。旧run已有占用数据，不重跑或清零。

## 绑定、证据与边界

通知主流程后set_env(test)响应ENV_READY；随后只读指定请求和日志入口。完成后set_env(development)成功，auth(status)回读READY/cloudbase-d8gwtxzm64150b7e0/ap-shanghai，已恢复。

[逐请求及工具原始返回证据](qa/issue-04-d04-concurrency-logs/log-evidence.json)。本轮仅新增本结果与证据；无代码/配置/数据变更，无CLS开通、probe调用、延期、清理、提交/推送或发布。D04保持12/16及未通过，不因取证结束改变验收结论。主流程收到此具体阻塞后安排后端诊断；本窗口停止。
