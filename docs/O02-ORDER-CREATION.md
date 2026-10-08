# O02：订单创建与不可变快照

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。**离线创建模型验收通过，尚未实际保存订单、占用库存 / 时段或开放付款。** 现有 UI 和全部未提交工作保留。

## 受控创建与现行数据

`cloudfunctions/_shared/order-creation-model.js` 的 planOrderCreation(state,event,principal,context) 仅接受 D07 order.create 的 quoteId / expectedQuoteVersion / idempotencyKey。价格、身份、地址、时间、订单号及付款状态不接受客户端传入。principal 必须 D06 真正签发；报价、订单回执、门店 / 发布配置、本人袋、目录、地址、库存、时段与上下文均须可信一致读取。工具不能证明记录已持久化；测试以隔离 X05 记录替代读库。

同键裁决后，重新检查本人报价 ID / 版本 / 时间 / ACTIVE / 未消费及同店。复用 X05 重核袋行、规格、留言、当前价格 / 实拍、地址 / 配送范围、预约提前量 / 容量、资源和配置版本。旧报价金额不会默默替换；报价及袋 / SKU 变化返回 QUOTE_CHANGED，要求重新确认。过期、资源不足、范围未核验、无权及配置缺失保留对应领域错误。

仅准备幂等元数据和 CREATE / BUSY / REPLAY 决策，没有回执保存、去重或超时恢复。终态决策不因报价后来过期而重新创建；返回实体前仍须读取并验证当前本人订单，不把 decision 当实际成功。

## 不可变历史事实

有效报价生成 proposedOrder 为 PENDING_PAYMENT / UNPAID / NONE，实付 / 已退 / 退款预算均 0，付款 / 取消 / 完成时间、取消原因与自提凭证初值 null。

- 订单头含交易政策、选中袋证据、门店 / 联系人 / 地址 / 预约 / 费率、订单备注及可信整数金额；自取地址 null，配送保留范围溯源，V1 运费 0。
- proposedItems 独立保存 orderId / position 及商品、SKU、规格、图片、版本、单价、数量、小计、逐行留言，按报价选择顺序排列，排除未选袋行。
- 订单头不另存 items 或可改 id 副本；id=_id 仅临时用于 D01 金额核验。留言与订单备注独立。
- 深复制 / 深冻结保证现行商品、图片、价格、地址、门店、费率、袋及报价修改不改变已生成历史快照；数据库不可变性仍待权限 / 服务验证。

## 编号、截止与原子边界

orderId 使用 D04 完整确定性摘要，parts 为 environment / ownerId / ORDER_CREATE / key；明细 ID 为 environment / orderId / lineId。内部 orderNo 为 `V1-` 加完整 64 位大写摘要，不截断、不依赖日期或随机数，不用作授权秘密 / 核销凭证。这是当前实现格式，不是已确认的商家短单号格式。

同键稳定、不同键 / 用户逻辑隔离；**实际唯一性仍依订单 create-if-absent、orderNo 唯一索引 / 事务检查**。唯一冲突必须拒绝或核实回执，不能覆盖。没有实际 SDK 唯一性或并发证据。

付款截止读取发布配置 paymentHoldMinutes，复用 D05，不晚于 startAt − 最大提前量；缺失 / 零值 / 无效参数拒绝，没有默认保留分钟。报价在创建时有效并被消费，付款期限独立，不错误沿用报价 TTL；测试 15 分钟仅 OFFLINE_TEST_ONLY。

输出 OFFLINE_ORDER_CREATION_PLAN，callable / checkoutAllowed / paymentAllowed 均 false，stockReserved / capacityReserved 均 false；含报价消费补丁及用户 / 门店 / 配置 / 地址 / 袋 / 资源版本条件。requiredAtomicEffects 要求同事务重核报价、整单资源预留、订单 / 明细创建、首日志、ACTIVE 报价消费和回执。任意失败不得留下半订单或局部占用，不能单独保存 proposedOrder 就报成功。O03 接资源 / 原子执行；O04 接实际幂等 / 恢复 / 按袋行版本精确同步。本轮没有删除袋、保存日志或生成支付会话。

## 验收

新增 10 项覆盖双履约、金额 / 完整快照、后续资料修改不变、多行顺序 / 留言 / 未选排除、请求 / 身份、报价过期 / 消费 / 版本 / 篡改、现行资料变化、付款参数 / 提前量截止、编号、回执决策、失败无部分结果，并与 O01 未付取消契约组合。

O02 / X05 / O01 专项 **33/33**、全套 **395/395**、静态 **229 个文件**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。只验证离线模型，真实唯一索引 / 事务回滚 / 资源竞争仍待补；没有页面 / 字体变化或本轮微信 / 真机 / 云 SDK 验收，未提交 / 推送 / 上传 / 部署。下一项 **O03 库存与预约名额原子预留、支付截止及事务边界**。
