# P05 支付会话与结果恢复契约（2026-10-06）

本轮完成可离线会话模型及回归。没有接入云端 payment.create / state.get、预支付参数、wx.requestPayment、订单按钮或成功页；P05 整体与阶段七实际门禁尚未通过。沿用 V1 全额支付，用户已确认的 UI 保持原值。

## 实现与输入边界

`miniprogram/features/payment/payment-session.js` 仅输出冻结的 OFFLINE_PAYMENT_SESSION / OFFLINE_PAYMENT_REQUEST_PLAN。connected / callable / paymentAllowed / successPageAllowed 恒 false；不存在网络、Storage、付款、订单取消、资源释放或退款调用。

创建实例绑定一个 orderId，幂等键工厂显式注入。beginRecovery 生成 payment.state.get `{orderId}` 计划；beginCreate 仅在刚收到合法未付、无活动意图状态且未到截止时生成 payment.create `{orderId, expectedVersion, idempotencyKey}` 计划，不转发金额或客户端成功字段。基础请求经原 D07 白名单测试，没有扩展云 handler 或客户端 allowlist。

receiveState 消费的是未来受信任后端适配器所需的**候选归一化摘要**，不是已部署 PaymentState DTO，也不是资金来源认证。测试手工输入摘要只验证客户端决策，不能证明实际订单已付款。字段为 orderId / version / orderStatus / paymentStatus / refundStatus / currency / totalCents / paidCents / refundedCents / refundReservedCents / paymentDeadlineAt / activePaymentState。字段精确白名单、整数分与资金 / 退款轴一致性校验；OFFLINE scope、跨订单、内部交易号 / 预支付签名等未知字段拒绝。

未来 activePaymentState 的 NONE / PENDING / UNKNOWN / CLOSED 必须由后端完整本人意图查询及受保护读集推导；查询失败、结果不完整或隔离资金不可默认 NONE。旧意图全部关闭也不归一化为可新付；实际关闭后重新付款规则仍未实现。

## 状态、重试与生命周期

- 所有客户端付款返回路径均只生成 state.get：success / cancel / fail 都不能标 PAID。createFinished 只安排恢复查询，不消费预支付参数，更不直接唤起付款。
- PENDING / EXCEPTION / 活动意图 PENDING 或 UNKNOWN、请求失败和无效摘要均保持 CONFIRMING；隐藏旧摘要，不开放另一笔支付。可显式刷新，没有后台轮询或定时任务。
- 合法已付摘要仅得到 PAID_REPORTED，实际成功页仍关闭；取消、退款中 / 失败 / 已退进入 ORDER_ATTENTION，不误展示普通购买成功。CLOSED 禁止重新收费。
- ticket 阻止旧查询和离页前回调覆盖新请求；invalidate 清在途状态及可见摘要，但保留实例内版本基线与重试键。
- 同订单版本、已核验可重试时复用原 key；不同版本才申请新 key，同实例不同版本生成重复 key 拒绝。创建响应丢失后必须先查状态，不直接重新付款。
- 订单版本不得回退；同版本订单事实不得变化。activePaymentState 可以独立变化，不要求每次观察都增加订单版本。已付 / 已关闭不回退未付，CANCELLED / COMPLETED 终态及 refundedCents 累计不回退，历史总额 / 截止不能改写。关闭意图观察跨 UNKNOWN 中间态及 invalidate 保留，不能重新归一化为可付的 NONE；之后可信 PAID 仍可恢复。
- 客户端截止只用于保守禁用；实例内一旦观察到截止，时钟回退不重新开放。不会本机取消订单或释放资源，之后仍可恢复已付摘要；真正期限与新付款资格由服务端最终校验。

键仅保存在实例内 Map：**没有跨实例 / 跨设备恢复或持久去重保证**。实际接入前必须先实现账号 / 环境隔离的请求持久化、写入失败拒绝发送、服务端幂等恢复及退出登录清理，不能直接用本模型替代。

## 验证与剩余工作

新增 19 项测试，涵盖丢响应 / 重复点击、各类客户端返回、未决 / 关闭 / 退款、乱序 / 失效回调、同版本意图观察、不可变金额 / 截止、已付倒退、时钟回退与白名单。全套 **675/675**，静态 **274**，SVG 索引及引用 **41 个通过**；主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。最新 UI 引入的 17 项测试包含在基线 656 中，不计作 P05 新增。

没有微信 / 真机 / 实付或云 SDK 验收，没有提交 / 推送 / 上传 / 部署。实际 handler / 本人查询、完整意图一致性、来源认证、预支付会话 DTO / 参数及期限、跨实例 key、订单继续支付与成功页仍待 E01 / E03 / E14 和真实 P01–P04 接入。品牌成功页需要再读本人 order.detail 的历史明细 / 履约快照，资金确认不得取客户端或当前目录替代。

下一项 **P06 可离线退款意图执行边界、查询恢复与退款预算一致性**；不执行资金退款。实际 P05 与阶段七门禁继续按 [支付云验收](PAYMENT-CLOUD-ACCEPTANCE.md) 补齐。
