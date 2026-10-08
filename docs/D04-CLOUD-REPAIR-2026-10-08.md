# D04 并发、唯一冲突与执行器复验

日期：2026-10-08。此轮全部由主流程本窗口完成，没有调用子 agent 或向其他窗口派发任务；保留现有未提交改动，未修改 UI、development 业务资源或已部署 user/store。

**结果：隔离 SDK 能力实验 16/16 通过；D04 整体仍 PARTIAL。**

## 修复及真实证据

1. 事务适配层此前把操作阶段的 `DATABASE_TRANSACTION_CONFLICT` 转为通用错误，底层 SDK 因失去精确 code 无法触发冲突重试。现在将明确冲突标记交还 SDK；每次回调仍重建读取缓存，耗尽重试后返回固定脱敏错误。已安装 SDK 的 `@cloudbase/database/dist/commonjs/transaction/index.js` 明确按此 code 重试，wx-server-sdk 的 transaction 包装调用该底层实现。
2. wx-server-sdk 将实际重复键错误包装为 `DATABASE_REQUEST_FAILED/-502001`。适配层补充识别明确 `DATABASE_DUPLICATE_WRITE`、原生数字11000或完整 `E11000 duplicate key error` 标记；通用请求失败、普通duplicate字样或不完整E11000仍失败，不作为唯一冲突证据。依据：[MongoDB错误码](https://www.mongodb.com/docs/manual/reference/error-codes/)、[CloudBase重复写错误](https://docs.cloudbase.net/error-code/DATABASE_DUPLICATE_WRITE)。本次真实响应归一为 `CLOUD_UNIQUE_CONFLICT`，诊断为 `MONGO_DUPLICATE_KEY/-502001`，且回读证明两个不同_id只有第一条存在。
3. 测试入口仅返回固定provider分类、数字错误码、操作类别和尝试次数，不输出原始消息、用户身份、凭证、event或context。主流程检视了鉴权和敏感数据路径。
4. 微信工具读取曾中断，后续取得明确 `cant find runtimeid by projectpath`。停止继续修改业务补丁，重新打开/编译隔离工程，确认 wx.cloud 与运行实例恢复。执行器新增每进程唯一ticket和启动防重入，工具失败最多三次重试；重试同一浏览器启动不会重新发云请求，结果读取也不重发。云请求失败或ticket丢失直接停止。

本地：[1009/1009全套及源码哈希](qa/d04-cloud/local-transport-20261008/report.json)、[测试输出](qa/d04-cloud/local-transport-20261008/tests.txt)。静态381个文件，主包/features/legacy源估算1392/153/45 KiB；实际包大小以微信编译为准。新增测试覆盖SDK重试后重读、冲突耗尽脱敏、明确/非明确重复键、诊断脱敏、丢启动回复不重发、轮询恢复、云失败不重发、三次工具上限及非法DSL。

## 云实验

- test：`dinner-cook-test-d5e320u981ec341`，上海，同 AppID `wx154f791a17268ace`。
- 单个 Event 函数：`jjl-d04-probe`，Nodejs20.19、SDK4.0.2；代码更新回读 Active/Available、CodeResult=success，无触发器。
- 最终run：`d04-transport-1791448249568`；授权截止香港17:07:14.200保持不变，受控原生主体未改变，不自动延期。
- 最终[真实微信云证据](qa/d04-cloud/native-1791448816127.json)：55个响应，16断言全部通过，errorCode=null，transportRetries为空，执行器exit=0。
- 通过：7写原子占用、prepare不清零、7个逐写故障回滚、同键并发一次占用、原键重放、同键异参拒绝、最后库存/时段竞争、自取3与配送1独立容量、复合唯一冲突。
- 唯一实验：第一条平台requestId `9000a016-2919-4fea-974a-5ce7408363e9`；第二条 `6302bd0b-1d0d-41a8-a056-447af5e5431e` 返回明确冲突。没有把任意写失败改为成功断言。

保留历史证据：首轮12/16为 `native-1791443939898.json`；并发修复15/16为 `native-1791447378118.json`；工具中断部分记录为 `native-1791446851841.json`、`native-1791447898898.json`、`native-1791448386901.json`。最终run曾在只读START时无任何响应，恢复运行实例后重新执行时先回读确认空资源；未清零旧run，不删除任何测试文档。

## 仍未验收

这些记录为能力实验的 OPERATION/LOG/RESERVATION，不是正式订单。正式orders/order_items/order_logs保存、完整读取集和查询谓词保护、平台事务预算及购物袋上限、真实断网丢响应、真机、客户端实际读写拒绝均不由16项实验覆盖，保持 NOT_RUN。日志旧接口已下线，新日志服务未启用/未就绪的阻塞仍存在，未购买或开通CLS。

下一步继续 D04 的正式业务事务适配及独立验收，不能直接宣布阶段二或订单链路完成。

工具已恢复 development `cloudbase-d8gwtxzm64150b7e0` / ap-shanghai，auth(status)实际回读READY。共享小程序配置不改，无删除、管理员授权、支付、Git提交推送或上传发布。
