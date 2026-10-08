# 阶段二：身份持久化与鉴权实际云补验收

**后续D04能力实验已真实16/16通过，见[D04修复复验](D04-CLOUD-REPAIR-2026-10-08.md)。独立test已关联可用；下文只证明单用户事务/缺test是身份切片历史，正式业务订单、谓词保护、事务预算及真实断网仍NOT_RUN，阶段整体仍PARTIAL。**

日期：2026-10-08。按原执行计划顺序补此前缺云的内容；本轮为 D02/D04/D06 的首个真实数据切片，不是整阶段验收。已保留其他窗口的 UI、业务及所有未提交成果。

## 实现与实际副作用

开发 AppID wx154f791a17268ace、EnvId cloudbase-d8gwtxzm64150b7e0，SDK 4.0.2、Event/Nodejs20.19。R1 的 users/admin_roles/audit_logs、拒绝客户端读写规则和指定索引由环境窗口准备，见 [资源回执](CLOUD-RESOURCE-R1-RESULT-2026-10-08.md)。本窗口没有另建业务集合或导入 fixtures。

user.me 现已接入 [身份仓储](../cloudfunctions/_shared/cloud-identity-repository.js)：可信 environment/AppID/OPENID 的确定性完整哈希主键；真实 runTransaction 读取，不存在时 add({data}) 创建完整默认顾客。默认 status=ACTIVE、version=0、隐私同意/头像/默认地址为空，不代表已同意隐私条款、认证电话或获得商家权限。已有记录只读不覆盖；禁用/损坏身份拒绝；存储异常关闭访问并脱敏。返回形状保持 authenticated/subjectHash/customer，无原始身份或 Profile。

本轮实际首次原生调用创建 **1 条 development 顾客记录**，后续复读均不增条数。最终管理端实查 users=1、admin_roles=0、audit_logs=0；伪造事件 openId 查询为 0。没有订单/库存/资金/管理员写入。该顾客留存用于后续原生验收，未自动删除。

## 复用实例身份缺陷与修复

实测 SDK 4.0.2 的 getWXContext 从 process.env 读取 WX_*。正常微信调用之后，同实例管理端调用的当前 SCF environment 没有 WX_OPENID/WX_APPID，但 SDK 仍可能保留旧身份。修复前独立验收函数因此返回成功，业务 requestId=9578a6cf-05d1-43cd-ab16-68ba6dedcb80。此前冷实例管理端拒绝的证据不能覆盖这一情况。

user/store 和两项独立验收函数已统一使用 [native-context.js](../cloudfunctions/_shared/native-context.js)：只从平台主函数第二参数解析 **本次** environment，要求 request_id/namespace，再与 SDK 当前元组逐项一致；缺失/损坏/不一致均拒绝，不接受 event 中的任何上下文字段。user 的仓储绑定校验后本次身份快照，异步事务不重新读取全局残留身份。runtime 内部上下文作为处理器第二参数，避免混入公开业务参数/返回值；日志仅固定 code/requestId/stage。

修复后在真实复用实例上再次观察：sdkHasNativeOpenId=true、sdkHasNativeAppId=true，而本次 hasNativeOpenId=false、hasNativeAppId=false；函数返回 AUTH_REQUIRED，业务 requestId=e4b4c54e-4308-4e59-8e25-96149976895b，平台 requestId=1b8574b9-b6c9-4e52-ad4a-4ae14255bdfd。诊断只返回有限布尔值，不回显环境/身份/密钥。**该复现缺陷已关闭**；不能据此声称全部 D06 权限场景已通过。

## 实际结果与证据

| 场景 | 结果 | 证据 |
|---|---|---|
| 首次 native 用户创建、同人稳定主键、完整默认记录、真实事务提交 | PASS，firstCreated=true | [首次落库](qa/identity-cloud-2026-10-08/native-1791429400366.json) |
| 重复 SDK 读取不创建、平台元组一致、数据库单用户 | PASS，firstCreated=false，5 项断言 | [修复后原生复验](qa/identity-cloud-2026-10-08/native-1791430764555.json) |
| 客户端直接读取 users/admin_roles/audit_logs | PASS，3 项均 -502003 权限拒绝 | 同上；**没有进行客户端写拒绝实验** |
| 实际 user/store、伪造角色/身份、无效 action/payload | PASS，正常为 customer；无效请求 INVALID_REQUEST | [最小链路复验](qa/initialization-cloud-2026-10-08/native-context-guard-1.json) |
| 云运行时缺配置/错 AppID/错 EnvId | PASS，三项固定错误码 | 同上，独立 I03 验收函数 |
| 管理端无当前微信身份调用四个函数 | PASS，全部 AUTH_REQUIRED | [云端请求与复用实例证据](qa/identity-cloud-2026-10-08/cloud-guard-evidence.json) |
| 云端部署及状态读回 | PASS，四函数 Active/Available，CodeResult=success | 同上；正常函数 user/store，另两个仅 development 验收 |

部署包包含全部 shared 依赖；user/store 的 SDK 与锁文件未更换。没有创建 HTTP 路由/触发器或上传小程序。两个验收函数分别 jjl-i03-rejection-20261008、jjl-d06-identity-20261008，仅 development；后续由环境窗口按精确名称退役，不放入生产发布清单。

本地重点测试 41/41；全套 **971/971**、静态 **354** 文件通过，源估算 main/features/legacy 1392/153/45 KiB。[本地报告](qa/identity-cloud-2026-10-08/local-1791430881431/report.json)、[测试记录](qa/identity-cloud-2026-10-08/local-1791430881431/tests.txt)、[静态记录](qa/identity-cloud-2026-10-08/local-1791430881431/static.txt)。后续仅更新契约状态标记，api-contract/admin-acceptance 17/17 通过；该标记不增加网络入口。

保留测试失败事实：首次入口夹具跨 VM realm 被模型拒绝，改为同 realm 加载真实依赖；全套旧 A07 夹具未提供新平台第二参数/仓储，首次 970/971，补真实依赖与事务形状后 971/971，不移除安全断言。微信自动化曾出现 APPID_ERROR，重跑实际成功后保存新证据。失败不计 PASS。

CloudBase code-review 已复核：原生微信身份，不接 Web/匿名认证；缺资源/存储错误不伪造成功；SEC001 不回显 event/context/env/OPENID 或提供商错误；不自动初始化角色。AUTH001 的 Web session 模式不替代 wx.cloud 原生身份。

## 剩余门禁与下一项

阶段一 I03 真机/设备版本、I06 完整日志服务、I07 独立环境仍 PARTIAL。D02 只落地 R1；D04 仅证明本次单用户事务提交，唯一冲突、并发、负读/多文档保护、逐写故障回滚与资源占用 **NOT_RUN**。D06 仅身份及三个集合客户端读拒绝通过：两顾客地址/袋/订单隔离、客户端写拒绝、实际管理员加载/撤销/范围仍 NOT_RUN。D07 种子及其他业务 handler 未 apply，购买门禁继续关闭。

下一项按 [D04 SDK 验收安排](D04-CLOUD-SDK-ACCEPTANCE-PLAN.md) 准备真实事务/唯一/资源竞争。独立 test 环境的日常创建关联交环境窗口；不索取账号密码/私钥。缺隔离条件时只完成代码与验收准备，不能在 development 用正式/混合业务资源做故障、竞争或资金实验。

早先仅为同步 runtime 的 store 部署被自动审批拒绝，理由是超出当时 user 身份持久化范围；当时停止该操作。随后真实复现共享鉴权缺陷、说明必要 user/store 修复范围后，该安全修复部署获准并已完成。没有通过换函数名称绕过拒绝。
