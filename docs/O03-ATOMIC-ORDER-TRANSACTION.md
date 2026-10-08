# O03：整单库存 / 预约预留与原子事务服务

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。用户已确认开发 / 测试云环境尚未开通，并授权恢复离线推进。**内部事务服务及本地适配器验证通过；真实 SDK、数据库保存 / 唯一索引 / 并发仍未验收。** 现有 UI 与未提交成果保留。

## 实现与完整边界

`cloudfunctions/_shared/order-transaction-service.js` 的 createOrderTransactionService({runTransaction,now,buildContext,newRequestId}) / execute(event,principal) 通过注入的事务会话执行完整应用流程。当前唯一执行器位于 tests/fixtures/order-transaction.js，使用独立内存数据和可回滚串行事务，没有云 SDK 适配器、handler、小程序调用或正式数据写入。

1. 复用 O02 prepareOrderCreationRequest 解析固定 quoteId / expectedQuoteVersion / key，以 D06 真正签发的 principal 定位请求 / 回执；服务端生成 trace，不采用前端角色或时间。
2. 事务内重读用户，核对当前 ACTIVE、AppID / 环境 / schema / 版本；读取幂等回执，同键终态重放前读取本人订单并匹配确定性 ID / 报价，未决拒绝为 BUSY。
3. 事务内加载报价、本人袋、门店 / 配置、目录、地址、资源，并由可信 buildContext 提供号码 / 备注 / 图片 / 地图及数量政策。复用 O02 / X05 重新核验，不使用事务外的旧创建计划。
4. 从完整重核验的 resourceVersions 生成每种库存及唯一 SLOT 请求，复用 D04 planResourceHolds 整单计算。库存按真实 unitsPerItem × quantity 聚合；每单只占一个时段单位，模式独立 3 / 1。任意不足在写入前拒绝。
5. 检查订单 ID / 编号不存在，并要求适配器保护所有读取依赖到提交；写资源计数 / 版本、全部 HELD 预留、订单头 / 全明细、首日志、ACTIVE 报价消费、成功回执。各写入必须返回受影响数量 1，零行或未知结果抛错，不悄悄成功。
6. 回调返回前再次核对服务端时间，报价过期或付款截止已到则整笔拒绝。runTransaction 必须等待实际提交后才返回；任意异常必须回滚全部已暂存效果。

付款截止读取发布配置并受预约最大提前量边界约束；每条预留 expiresAt 等于订单 paymentDeadlineAt。预留为 HELD，付款 / 制作后的 CONFIRMED / CONSUMED 及到期 / 取消释放留后续任务，不在本轮自动模拟资金成功或恢复已消耗库存。

## 事务会话契约

| 会话能力 | 必须保证 |
|---|---|
| readUser / readReceipt / readCreationState / readOrder / readOrderByNumber | 读取本环境真实记录，缺记录显式 null，数据来源一致；不得返回客户端实体 |
| assertCreationReads(conditions) | 当前用户、目录、配置、袋、地址、报价、资源读取依赖保护到提交；仅返回 true 不是 SDK 能力证据 |
| updateResource(change,now) | 检查 expectedVersion / 现行状态，更新全部计数与版本 / 时间，不无条件覆盖 |
| insertReservation / insertItem / insertLog / insertReceipt | create-if-absent，追加历史不覆盖，写失败抛错或返回非 1 |
| insertOrder | 同时保护确定性 _id 与唯一 orderNo；实际唯一索引 / 并发支持仍须验证 |
| consumeQuote(consumption,conditions) | 比较本人 / 同店 / ACTIVE / 未消费 / 未过期 / 版本，消费与订单同事务 |

资源请求只使用报价整单所需资源，不把额外库存误纳入 D04 的精确集合。读取与写入条件、索引及权限保护最终依赖实际适配器；普通分步 set、事务回调先返回后保存或缺读依赖保护均不满足本契约。真实 SDK 的重试、事务预算、并发撤销和提交延迟仍须专门验证；回调末尾的时间预检不能代替实际平台提交边界测试。

首次 ORDER_CREATED 日志采用 before=null 表示此前没有订单；after 为真实待付三轴 / 金额 / version=0。后续命令日志 before 仍必填非空交易轴。已在 DATA_MODEL 明确此创建例外，避免虚构此前状态。日志只存可信 actor / trace 和固定进度文案，不存凭证、电话、请求载荷或幂等键。

内部返回 OFFLINE_ORDER_TRANSACTION_RESULT，cloudVerified / checkoutAllowed / paymentAllowed 均 false，CREATED / REPLAY 的 result 只有 entityId / version / errorCode。这些是测试适配器中的事务结果，不是正式网络回执或页面成功提示。未删除袋、创建支付单、调用云或开放购买。

## 本地证据

新增 14 项：双履约完整提交、最后库存 / 最后自取或配送名额竞争、独立容量、多资源全有或全无、9 个暂存写位置逐个失败及返回零行回滚、用户停用 / 版本 / 提交前撤销、时间到期 / 付款截止、共享库存单位、同键并发重放与报价只消费一次、编号冲突 / 缺适配器 / 伪造身份拒绝。

测试适配器将请求排队、复制暂存、提交前比较读依赖、拒绝异常后不应用暂存；它验证服务的整单调用 / 失败处理契约，**不证明云平台具有相同串行化、索引或事务行为**。首次专项中一条断言预期过期错误，但报价消费已先推进版本，应返回 QUOTE_CHANGED；按既定版本优先顺序修正断言后重测通过，没有为测试改变业务顺序。

全套 **409/409**；静态 **232 个文件**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只新增服务端模块和测试，UI / 存储数据未操作，没有新微信 / 真机 / 云验收；未提交 / 推送 / 上传 / 部署。下一项 **O04：实际幂等恢复契约、响应丢失重试与购物袋按行版本精确同步**，继续离线；云环境开通后按 [ORDER-CLOUD-ACCEPTANCE.md](ORDER-CLOUD-ACCEPTANCE.md) 补真实证据。
