# A03 自提输入 / 扫码 / 确认会话（2026-10-06）

状态：可离线交互契约完成；正式页面、微信扫码、顾客凭证展示、持久恢复和云核销均未接入。E10 正式凭证 / 有效期 / 限速 / 完成 SLOT 策略未发布，A03 整体验收未通过。

## 实现与界限

新增 [pickup-session.js](../miniprogram/features/admin/pickup-session.js)，只构造 admin.order.get / order.transition 的冻结请求计划。没有 Page 接线、wx API、Storage、网络或订单写入；现有商家页面继续保持关闭，60 action 和客户端 user.me / store.health allowlist 不变。

会话构造必须显式提供 storeId / subjectId、policy.version / format=OPAQUE_TOKEN、keyFactory，可选同步 decodeScan。这些本机 scope 值只隔离交互，不能充当鉴权；服务端仍使用 A01 当前可信 principal / 角色 / 门店和 O07 原子校验。没有生产政策默认值、短数字码、默认二维码编码或从公开订单号推导凭证。

OPAQUE_TOKEN 是 O07 现有候选 HMAC 的 64 位小写十六进制值；手输允许去掉外围空白，不改内部字符或大小写。手输从已选订单的内部 orderId 开始；公开 orderNo 只作摘要，不能代替凭证。扫码需要未来显式配置 codec，仅接收 {orderId,pickupCredential}，不得附带角色 / 店 / 状态 / 权威字段。没有 codec 时拒绝；解码异常、异步返回、超出 4096 个字符的输入和非法字段拒绝。长度是本地技术保护，不是正式扫码政策。

扫描只定位待查询的订单，并不验证凭证真伪。需要先读取受权商家详情、核对门店 / 自取 / 已付款 / READY 及可核销能力，再由用户确认。摘要就绪不能显示“凭证已验证”；凭证最终只由 O07 在核销事务中验证。单独拿 token 查订单、顾客二维码生成和 wx.scanCode 的真实适配仍待正式码形。

## 会话流程

| 操作 / 状态 | 行为 |
|---|---|
| beginManual / beginScan → LOADING | 只计划 order.get；不提交核销 |
| receiveDetail → AWAITING_CONFIRMATION | 订单符合条件、候选凭证存在，允许离线演练确认步骤；真实 confirmationAllowed 仍 false |
| confirm → SUBMITTING | 显式确认后计划 COMPLETE_PICKUP，固定 orderId / expectedVersion / 原凭证 / 新幂等 key |
| 未备妥 / 无能力 / 他店 / 配送 | 不提供确认；非法详情不覆盖为可操作状态 |
| 已完成 / 已取消 | ALREADY_COMPLETED / CANCELLED；不生成核销请求，不归因于本次操作 |
| 取消待审 / 有退款 | REVIEW_REQUIRED，等待明确处理，不假审批 |
| failed / 隐藏 / 格式不明结果 | RESULT_PENDING，保留原请求；禁止换订单 / 换码 / 新 key |
| retryOriginal | 完全相同 key / version / credential；不是读取新版本后重新核销 |
| 收到成功 CommandResult | 仍 RESULT_PENDING，刷新详情核验 COMPLETED 和提交版本 |
| 成功回执 + 相符完成详情 | COMPLETION_REPORTED；演练观察值，真实成功反馈门禁仍关闭 |
| 只有已完成详情、没有原请求回执 | 不归因成功、不丢原 key，继续核验原请求 |
| 确定错码 / 锁定 / 冷却内部结果 | 清掉输入，不自动重试，不猜解锁 / 冷却截止；新输入须重新读版本 |
| destroy | 账号 / 门店 / 环境切换或销毁时清空私有内存，旧回调不能进入新实例 |

局部 ticket 是按对象身份比较的冻结令牌，包含 generation 但不以数字相同判定。它只供本机回调路由，不发给云，不克隆或序列化后交回；新实例相同 generation、旧响应或复制 ticket 都不能覆盖当前结果。

每次读会移除旧确认机会；连续输入和隐藏会使旧 ticket 失效。已发核销请求在隐藏后保留原计划供重试，但旧响应失效。正在提交不能另读 / 再确认；正在读取也不能发送另一个原请求。

## 数据、版本与结果校验

未来详情 DTO 的契约演练只接收已解包的业务数据，不接受 OFFLINE scope / cloudVerified / callable / operationsAllowed 等标记。当前 A02 服务仍返回 OFFLINE 对象；只有测试夹具投影出协议形状，应用没有剥掉门禁的适配器。availableActions 只观察服务端候选能力，不把 enabled=false 翻转为真实功能。

确认摘要只保留 orderId / orderNo / 状态与版本、门店名称、联系人姓名、预约日期 / 时间、商品名称 / SKU / 数量 / 分价及合计。电话、地址、留言、OpenID、凭证、key、日志 / 摘要 / 内部资金或媒体证据不进入 current / 页面数据。数量、整数金额、逐行单价乘数量、小计、总价和零配送费核对；历史门店 / 联系人 / 商品 / 价格 / 预约事实不能随读取变更。订单版本、已退款累计、制作进度、已确认 PAID 和终态不能回退；同版本矛盾结果拒绝。

receiveResult 只接受 {entityId,version,errorCode} 的内部协议形状，绑定本次订单：成功和 PICKUP_CREDENTIAL_INVALID 必须为 expectedVersion+1，锁定 / 冷却无写结果必须为 expectedVersion。未知字段、离线结果外壳、错实体、错版本或未知错误一律保留原请求，不报成功。最大安全版本不能生成溢出命令。

PICKUP_CREDENTIAL_INVALID / LOCKED / RATE_LIMITED 只是当前 O07 内部结果的演练；尚未加入网络公开错误映射。未来 handler 必须提交尝试计数后输出可信固定结果，不能把真实码 / 原错误 / stack 复制给页面。权限、版本或网络错误没有原请求回执时，不足以证明先前丢响应的调用未提交，本轮统一保持结果待核验，不擅自丢 key。

## 机密与恢复限制

原码只保留在私有闭包及显式请求计划。计划本身含敏感码，不能整体 setData、打印、埋点或写明文 Storage；ticket、摘要或按钮显隐不承担鉴权。仅内存 key 集合防本会话重复生成，真正持久请求恢复仍未实现。

destroy / 小程序进程退出会失去原请求。正式开放前必须确定 E10 的安全凭证封装、账户 / 门店 / 环境绑定的持久恢复、保留期限、受权回执查询 / 运营人工核验路径；不能拿新的 key 假装恢复。没有声明本轮完成弱网跨进程恢复、真实加密存储、wx 权限或真实二维码显示。

所有 availability / view / plan 返回 connected / callable / confirmationAllowed / fulfillmentAllowed / successFeedbackAllowed=false。即便收到合成 COMPLETED，也不允许展示真实核销成功反馈。可调用接口、handler 和服务器集合不变。

## 验证

新增 **28 项** A03 专项；与 A02 / O07 组合 **89/89**；全套 **828/828**，静态 **294**。主包 / features / legacy 源估算 **1239 / 139 / 45 KiB**：新契约放在现有 features 子包，主包不增，不需要新分包，实际包体仍以微信编译为准。

首轮 23 项通过，复查追加 3 项分别复现返回版本约束、初始金额合计与高版本付款回退缺口，已修复；再补跨会话 ticket 和安全版本 / 生命周期边界 2 项。最终全量与静态并行读取代码，执行前后源码 SHA-256 一致。证据：[修复前 3 项失败](qa/a03-2026-10-06/boundaries-before.tap)、[组合](qa/a03-2026-10-06/affected-final.tap)、[全量](qa/a03-2026-10-06/full-final.tap)、[静态](qa/a03-2026-10-06/static-final.txt)、[摘要 / 指纹](qa/a03-2026-10-06/summary.md)。较早日志保留原轮次，不覆盖最终证据。

本地组合完整接续 A01 授权、A02 制作与商家读取、O07 签发 / 错码 / 核销 / HMAC 原 key 重放：响应丢失后只完成一次、不二次消耗资源；错码回执重放不重复计数，冷却后使用当前版本的新正确输入；确认后撤销当前权限，服务器拒绝且无新增写。真实 cloud client 对两个 admin action 均在平台调用前拒绝，平台调用计数 0。全部仍是合成身份 / 订单及串行内存事务。

## 真实验收待办

| ID | 场景 | 状态 |
|---|---|---|
| PS01 | E01 / E12 实际当前商家权限、普通用户 / 他店 / 撤销拒绝 | NOT_RUN |
| PS02 | E10 正式码形 / TTL / 限速 / 密钥 / SLOT 策略和顾客凭证展示 | NOT_RUN |
| PS03 | 微信真实扫码、取消 / 拒权 / 非本店码 / 非订单码，不自动核销 | NOT_RUN |
| PS04 | 真机必要摘要、显式确认、错码 / 锁定 / 冷却及安全区视觉 | NOT_RUN |
| PS05 | 网络丢响应 / 隐藏 / 进程重启 / 切换账号环境，安全恢复原 key | NOT_RUN |
| PS06 | SDK 同时核销 / 撤销 / 取消竞争、实际一次完成和资源一致性 | NOT_RUN |
| PS07 | 已核销、取消、退款与历史事实，固定公开错误及人工核验路径 | NOT_RUN |

E01 / E12、E10 / SLOT、D06 / P08 真实门禁与 UI / 持久恢复 / SDK 验收仍待补。没有修改页面 JS / WXML / WXSS 或字体，没有微信 / 真机 / 云 / 资金 / 对外消息操作，没有 Git 提交 / 推送 / 上传 / 部署；全部既有未提交成果保留。

下一项 **A04 商品 / SKU / 库存维护的可离线部分**，复用目录 / 权限 / 事务规则，未知经营数据不补默认值。
