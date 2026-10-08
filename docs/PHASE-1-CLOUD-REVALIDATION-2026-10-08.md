# 阶段一：真实云补验收

日期：2026-10-08。依据开发计划 I01–I08 与 [历史离线记录](PHASE-1-EXECUTION.md)。用户要求从第一阶段逐项重做此前缺云环境的事项；UI/动效与日常环境配置仍按窗口分工处理。

## 实际执行与结论

**后续事实覆盖历史结论**：R1已创建，user.me真实落库已接通；SDK复用实例残留身份的缺陷已实测并修复。早先冷实例拒绝不能单独证明复用实例安全；下文“未部署身份模块/数据库为空”仅代表当时。user/store及两验收函数已更新，原生成功、固定配置拒绝与复用实例AUTH_REQUIRED通过。最新证据及971项回归见[阶段二复验](PHASE-2-CLOUD-REVALIDATION-2026-10-08.md)，真机/独立环境/日志门禁仍保留。

开发 AppID `wx154f791a17268ace`，EnvId `cloudbase-d8gwtxzm64150b7e0`，ap-shanghai，NoSQL 数据库 RUNNING。CloudBase MCP 登录 READY，实际已绑定正确环境。共享配置保持 development/shell，不影响其他窗口的 UI 预览。

本轮读取真实平台状态：user/store 为 Event、Nodejs20.19、Active/Available、index.main、CodeResult=success。接收环境窗口的云包核验记录（SDK 4.0.2、shared/runtime.js 与源文件一致），再次编译隔离工程并复验实际原生调用；未重新部署正常 user/store。

| 云端用例 | 实际结果 | 证据 |
|---|---|---|
| user.me，真实微信身份 | PASS，authenticated=true、customer | native-revalidation.json |
| store.health，真实微信身份 | PASS，available=true、正确 development EnvId | 同上 |
| 事件伪造 OPENID/role | PASS，仍 customer、sameSubject=true | 同上 |
| 无效 action / 数组 payload | PASS，两项均 INVALID_REQUEST | 同上 |
| 无可信身份的管理端伪造调用 | PASS，AUTH_REQUIRED | control-plane.json 中管理端请求标识 |
| 云端缺环境配置 | PASS，INVALID_CONFIGURATION | 原生调用独立验收函数 |
| 云端错误 AppID | PASS，APP_MISMATCH | 同上 |
| 云端错误 EnvId | PASS，ENV_MISMATCH | 同上 |

正向、伪造和无效请求使用实际 user/store；三项错误配置使用独立函数 `jjl-i03-rejection-20261008`。该函数先以真实 SDK getWXContext 与正确配置验证基线，再复用同一 runtime.js 对三套服务端固定错误配置验证拒绝。没有伪造可信上下文、修改正常函数变量或写业务数据。这证明部署运行时代码的拒绝路径，不等于切换了另一个环境，也不是完整跨环境访问试验。

验收函数源码：[initialization-rejection.js](../scripts/cloud-checks/initialization-rejection.js)；准备脚本：[prepare-initialization-cloud.js](../scripts/prepare-initialization-cloud.js)。实际包位于忽略的 artifacts/initialization-cloud-20261008/functions。平台回读入口与本地源码逐字一致。函数留在 development 供真机补验收，未建立 HTTP 路由或触发器；不纳入正式业务函数目录，发布前应按精确函数名称交给环境窗口退役，不自动删除。

复验步骤：编译打开 artifacts/cloud-env-validation-20261008 的 pages/verify/index，待该页实际 services/cloud.js 完成五项调用，再运行 [verify-initialization-native.js](../scripts/verify-initialization-native.js)。证据文件采用 exclusive create，不覆盖历史；重跑须使用新证据路径。验收脚本只读取隔离 App 的公开结果/启动原生调用，不操作商品/地址等业务存储。

## 逐 Task 状态

| Task | 当前真实状态 | 尚缺 |
|---|---|---|
| I01/I02 | 保留历史本地验收；本轮未发现新增云待办 | 不因本轮重复改工程/UI |
| I03 | 工具真实成功、伪造拒绝及云端配置拒绝已复验 | 真机 user/store 与设备/微信版本；整体仍 PARTIAL |
| I04/I05 | UI/设备窗口负责；本窗口未改界面 | 原计划跨设备/长中文/导航证据按 UI 验收补齐 |
| I06 | 错误码/requestId、管理调用脱敏输出及本地质量检查通过 | 平台独立日志查询接口已废弃；CLS 尚未开通，完整日志查询/留存能力待环境方案 |
| I07 | 独立部署/依赖证据已核对；云端缺配置和错环境拒绝已执行 | 独立 test/production 实例互不串用尚未实测，不虚填 EnvId；整体保留 PARTIAL |
| I08 | 开发云条件明确，不再索要密码/密钥 | 实际商户/支付方案与经营资料责任人等原未决项 |

**阶段一仍未整体验收通过**，但工具链路与三项云端拒绝不再是 NOT_RUN。test 环境是同一小程序下独立云资源，当前最小链路不要求立即创建；隔离的破坏/并发/恢复场景后续安排，不能把同一 EnvId 填两遍充当环境隔离。说明参考 [官方环境说明](https://docs.cloudbase.net/quick-start/create-env)。

## 工具限制及本地验证

微信 automation_evaluate 的页面栈接口 getCurrentPages 触发 APPID_ERROR（Cannot read properties of undefined），停止沿该接口反复修补；改为隔离 App 状态及原生 wx.cloud 调用。CLI 对嵌套双引号的转发亦有问题，脚本使用单行函数/内部单引号，并解析 result.result.result。失败不作为成功证据，最终通过有新平台/业务请求标识。

queryFunctions/listFunctionLogs 实际返回底层 GetFunctionLogs 已废弃，不能把此错误算 handler 失败或声称已读取全部云日志。管理端 invoke 的日志仅出现 code/requestId/stage 与固定拒绝响应；环境没有 CLS 日志服务，未自行开通新的服务。

本地针对性验证 **32/32**：cloud 7、authorization-model 16、新验收函数 3、新身份适配 6。静态检查 **332** 文件、4 主包/16 分包页面；源估算 main/features/legacy **1392/153/45 KiB**。数字仅代表本轮检查，不替代 SDK 数据事务或真机证据；未重新宣称历史全套 937 项当前通过。

CloudBase code-review：SEC001 通过，验收函数不回显完整 event/context/env、OPENID 或秘密；开发阶段门禁关闭其他阶段；使用真实 wx.cloud/getWXContext，无 Web/匿名身份替代。身份适配遵循 SDK 包内实际接口 add({data}) 与 throwOnNotFound=false，不用 set/upsert 覆盖用户。

## 下一步与证据入口

已准备 [cloud-identity-repository.js](../cloudfunctions/_shared/cloud-identity-repository.js)：稳定主键、原生上下文、首次事务插入、读取现有用户、禁用/身份损坏拒绝、存储异常脱敏。**该模块未部署或接入 user.me**；6 项测试为 SDK 形状的本地契约夹具，未证明真实事务冲突/回滚/索引能力。

数据库列表实际为空，环境窗口需先按 [R1 清单](CLOUD-RESOURCE-MANIFEST-2026-10-08.md) 准备三个空集合/规则/索引；主流程再补身份落库与 D04/D06 实际验收。不得因适配文件存在直接开放业务或初始化管理员。

- [本轮原生成功及配置拒绝证据](qa/initialization-cloud-2026-10-08/native-revalidation.json)
- [实际平台回读、空数据库与管理端拒绝](qa/initialization-cloud-2026-10-08/control-plane.json)
- [环境窗口包与部署交付](CLOUD-ENVIRONMENT-RESULT-2026-10-08.md)
- [全部 67 Task 补验收台账](CLOUD-BACKFILL-TRACKER-2026-10-08.md)

本轮未修改 UI/动效、共享配置、user/store 正常代码，未创建集合、导入数据、删除资源、授予管理员、操作资金、上传/发布小程序或提交推送。新增独立验收 Event 函数及后端适配/测试/记录；原未提交成果保留。
