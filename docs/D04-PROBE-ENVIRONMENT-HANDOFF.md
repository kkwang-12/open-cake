# D04 验收包：环境窗口精确任务单

日期：2026-10-08。来源：[D04计划](D04-CLOUD-SDK-ACCEPTANCE-PLAN.md)、本轮SDK基础层与隔离验收执行器。本窗口负责后端及验收；环境窗口负责独立test环境、集合/索引/规则和测试函数配置。本文不表示资源已创建、已部署或云验收通过。

## 前置条件与资源范围

同一AppID `wx154f791a17268ace` 下已关联的独立test EnvId；不得等于 development `cloudbase-d8gwtxzm64150b7e0`。2026-10-08本轮ap-shanghai实查仍仅确认development。环境创建按用户既有分工处理，不需要密码/私钥。

**仅三个测试集合，不创建正式业务集合，不导入fixtures，不修改development：**

| 集合 | 客户端规则 | 指定索引 |
|---|---|---|
| jjl_d04_probe_resources | read=false、write=false | 仅保留平台默认索引 |
| jjl_d04_probe_records | read=false、write=false | 仅保留平台默认索引 |
| jjl_d04_probe_receipts | read=false、write=false | uq_d04_probe_command：runId ASC、caseId ASC、commandKey ASC，unique=true |

逻辑索引规格须转换为实际管理工具字段；创建后读回字段顺序/方向/unique及平台可用的构建状态。索引存在不等于冲突验证通过。已有同名资源先读取，发现差异/数据先回报；不删除、重建或覆盖，不删除默认_id/_openid索引。普通客户端全拒绝，服务器仍须执行原生鉴权和测试主体白名单。

全部receipt均包含上述三个非空索引字段，避免多个缺失/null值被误用为唯一键；[官方索引说明](https://docs.cloudbase.net/database/data-index)说明唯一字段的空值限制。仅明确的 `DATABASE_DUPLICATE_WRITE` 标记被归一为CLOUD_UNIQUE_CONFLICT；[官方错误定义](https://docs.cloudbase.net/error-code/DATABASE_DUPLICATE_WRITE)将其用于索引键重复。若SDK隐藏该标记，仅返回通用错误，实验保持未通过，不从一次写失败推断唯一索引有效。

## 测试函数与配置

函数名：`jjl-d04-probe`，Event/index.main，SDK4.0.2及现有锁文件，云运行时Nodejs20.19。无需HTTP入口或定时触发器。不部署到development/production，不修改已通过的user/store。

源码：[transaction-probe.js](../scripts/cloud-checks/transaction-probe.js)，依赖包准备：[prepare-transaction-cloud.js](../scripts/prepare-transaction-cloud.js)。本轮已生成忽略的 `artifacts/d04-cloud-probe/functions/jjl-d04-probe`；脚本只创建本地独立包，目录已存在时拒绝覆盖，不意味着部署完成。部署需安装锁定依赖，并确认Active/Available与代码结果。

| 变量 | 服务端配置依据 |
|---|---|
| JJL_APP_ID | wx154f791a17268ace |
| JJL_CLOUD_ENV / JJL_TEST_ENV | 两者为同一个已核验独立test EnvId |
| JJL_STAGE | test |
| JJL_DEVELOPMENT_ENV | cloudbase-d8gwtxzm64150b7e0，服务强制与test不同 |
| JJL_PROBE_RUN_ID | 本轮唯一16–48位字母/数字/_/-；整个实验固定，重开实验换新run，不覆盖旧数据 |
| JJL_PROBE_EXPIRES_AT | 操作人限定的验收授权截止时间，Unix毫秒；过期后包括重试均拒绝，不自动延期 |
| JJL_PROBE_USER_ID | 受控操作人的可信原生identityFromPlatform完整64位稳定用户ID；不得填客户端自称ID或把第一个访客自动授权 |

主体配置步骤：先在隔离微信工程原生调用 `{action:'probe',payload:{operation:'identify',caseId:'atomic'}}`。此操作仅在正确test配置/有限run/未过期条件下返回当前调用人的稳定subjectId，**无数据库读写，不建立授权**。环境操作人核对该原生调用是指定验收人后，把其ID配置到JJL_PROBE_USER_ID。普通访客即使能读取本人ID，也不能通过prepare/hold/read/unique白名单。不要让客户端修改配置，不存储/回显OPENID或环境秘密。

## 主流程如何执行

环境配置完成、原生验收人已授权后，本窗口在隔离微信工程编译并确认wx.cloud可用；共享UI工程保持现状。已有独立工程 `artifacts/cloud-env-validation-20261008` 可由环境窗口按test范围准备，执行器不写入项目配置。

运行命令（占位参数须替换为实际值）：

```powershell
node scripts/verify-transaction-native.js --project="D:\dinner cook\artifacts\cloud-env-validation-20261008" --test-env=ACTUAL_TEST_ENV --run-id=ACTUAL_UNIQUE_RUN_ID
```

脚本拒绝development EnvId、共享根工程、错误AppID和不合法参数。首个read核对服务端runId与全新atomic场景，再写入固定测试文档；旧run已有资源时拒绝，不清零或接着覆盖。并行场景在**微信运行时**通过Promise.all同时发出wx.cloud.callFunction，而非在本地串行队列伪装云并发。结果记录平台/业务requestId、限定输入、公开回读、失败及断言；中途失败保留已收到的部分证据。

16项断言：7写点原子占用、prepare不清零、7个逐写故障回滚、同键并发一次占用、原键重放、同键异参拒绝、最后库存/时段竞争、两种履约容量独立、复合唯一冲突。read每次只读固定8文档；命令0–7、固定场景与模式，客户端不能选任意业务文档/失败点/价格/库存。实际平台事务预算尚未测得，不以8读/7写宣称官方限额。

测试records保存的是OPERATION/LOG/RESERVATION能力实验记录，**不是正式orders/order_items/order_logs**；不会出现付款成功或可购买反馈。原键重放不等于已测试断网丢响应；真实业务订单保存、完整查询谓词保护、事务预算与网络丢响应仍在结果中标NOT_RUN。

## 交付和清理

环境窗口返回test EnvId/地域/关联、三个集合规则读回、唯一索引规格/状态、函数运行时/SDK/部署状态及脱敏请求标识。只配置资源与指定原生主体，不写测试数据；主流程执行器随后写自己的run范围。

不自动清理。每次read返回精确collection/_id/exists/version；实际存在的文档及原版本汇总后才能提出逐文档清理清单。潜在ID或模糊run前缀不是已存在文档的删除授权。保留必要证据/审计，不删除用户或其他run。函数后续按精确名称退役，不加入生产业务目录。
