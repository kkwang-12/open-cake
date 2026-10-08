# O07 自提凭证与核销内部事务（2026-10-05）

状态：可离线部分完成。没有云环境、SDK / handler、顾客凭证展示或门店扫码页面实接，不能实际核销。E10 正式码形 / 有效期 / 尝试限制、完成后的 SLOT 政策仍待确认。

## 内部实现

`pickup-credential-model` 和 `order-pickup-service` 复用 D07 / D06 / D01 / O01。get 只接受已有 order.pickupCredential.get 的 orderId；complete 只接受 admin.order.transition 的 COMPLETE_PICKUP，维持 60 action 和当前两项客户端 allowlist。身份由可信 principal 提供，事务重新检查 ACTIVE 用户、版本及当前同店 ORDER_OPERATE 角色，顾客本人身份不替代门店权限。

当前引擎仅实现 OPAQUE_TOKEN 候选：HMAC-SHA256 值绑定环境 / AppID / 订单 / 所有人 / 门店 / 政策 / 密钥 ID / 签发与过期时间，不能从公开订单号计算。密钥由服务端显式注入、至少 32 字节，拷贝后保持在闭包中，不进订单或网络 DTO；真实秘密管理与随机密钥来源待部署。持久字段只有另一个域的 HMAC 摘要和受控元数据，不保存明文。本人返回字段仅 orderId / expiresAt / format / value，且必须在事务提交后返回。

这不是已选择的展示码 / 二维码方案，也不支持短数字码适配。政策版本、TTL、每凭证最大错码数、冷却时间、SLOT 完成策略必须显式提供；缺项拒绝构造，不发布默认值。测试夹具的 OFFLINE_TEST_ONLY / 60 秒 / 3 次 / 1 秒与 KEEP_CONFIRMED 均是隔离测试值，不能用作经营配置。

## 签发、过期与限速

- 仅本人 READY / PICKUP / PAID 订单可签发。未备妥、配送、取消、完成拒绝；重复 / 并发读取复用已提交的同一有效值，不延长期限、不清错码数。
- 仅过期后允许本人续发，签发时间 / 过期时间变化产生新值；过期边界 now >= expiresAt 拒绝核销。达到错码上限后，同一有效凭证锁定，包括本人重复读取；当前模型过期续发才重置计数，正式续发 / 解锁政策须随 E10 确认。
- 错码数和 nextAttemptAt 持久化在订单凭证内，对该凭证的所有门店操作人共享；新 key、服务重建或换操作人不能绕过冷却 / 上限。格式请求错误、权限 / 旧版本错误不计为已验证错码。
- 实际错码在同事务写计数、订单版本、内部日志与 FAILED 回执后返回内部 REJECTED，不能在事务内抛错撤销计数。同 key 同参失败重放原结果，不重复计数；冷却 / 锁定拒绝无写入。新正确尝试必须重读当前订单版本，并等待冷却。

码密钥可轮换，但必须保留有效凭证所需旧密钥。回执指纹使用独立域的 HMAC，避免未来低熵输入被无密钥 SHA 摘要猜测；fingerprintKeyId 对应密钥须保留并保持稳定，至少覆盖回执允许重试期限。政策版本不匹配、旧密钥缺失或记录损坏均拒绝，不悄悄续发 / 重置或返回假成功。多版本政策加载、正式密钥管理、服务端 API 统一指纹分派与迁移待云接入。

## 完成的原子边界

完整可信报价已消费、整单预留 / 资源须与原资源清单一致：每项 STOCK 已 CONSUMED，唯一 PICKUP SLOT 为 CONFIRMED 且 quantity=1，资源归店 / 数量 / 计数 / 版本合法。缺项 / 重复 / 错范围 / 计数不足拒绝。

在明确注入的测试 KEEP_CONFIRMED 策略下，核销记录 usedAt / usedBy、订单 COMPLETED / completedAt / 版本、最终日志和 SUCCEEDED 回执同事务。已消耗库存及 SLOT 计数保持原值，不能借核销再扣库存或恢复名额；这一测试分支不代表正式 SLOT 决策。没有外部调用或支付状态修改。

同 key 同参重放，当前用户 / 门店授权仍须有效，完成订单和 usedBy / completedAt 证据须与回执相容；响应丢失或时间随后过期仍安全重放。不同 key / 旧版本不能二次完成，公开订单号不能代替凭证。回执只保存 entityId / version / errorCode，日志不用调用方 reason / 凭证值；O01 的含明文 effectInput 只在内部检查，不能整体持久化或返回。

签发与实际错码更新订单版本，因此每次追加内部 PICKUP_CREDENTIAL_ISSUED / PICKUP_CREDENTIAL_REJECTED 日志以维持完整提交版本链。O06 验证其只能保持 READY 自提交易轴，并在公开时间线隐藏；完成仍展示固定“已完成自取”。公开详情不输出凭证摘要、尝试计数、密钥 / 角色或原始错误输入。

## 事务适配器义务

`runTransaction` 必须提交后才 resolve，失败回滚全部写；条件写必须影响 1 行。会话需要 readUser / readOrder / assertPickupReads / saveOrder / insertLog；门店核销另需 readPickupState / readReceipt / insertReceipt。

readPickupState 在同事务加载当前角色、消费报价、完整预留及资源；assertPickupReads 和真正的事务保护当前用户 / 角色（含撤销、范围、能力）、订单、回执、报价、完整预留 / 资源查询及其为空条件到提交。不能只比较传入版本而忽略实际读集。正式发布政策 / 密钥配置还需要可信加载、版本管理和生效裁决，当前静态注入只用于内部离线执行。

签发基础写为订单 + 日志 2；核销与实际错码为订单 + 日志 + 回执 3；复用 / 重放 / 限速拒绝无写。真实 SDK 权限栅栏、字节 / 重试成本另计。最后服务端时钟复核过期与时间倒退，本地证明不等于 SDK 实际提交时效证明。

## 验证与待补

新增 27 项测试：所有权 / 状态、作用域与摘要、重复签发、两种 key 竞争、一次完成、两种响应丢失、用户 / 角色撤销、共享限速、过期续发、秘密不入库、密钥轮换、损坏证据、所有写位置异常 / 零行回滚、资源变动冲突及 O06 真实本地日志链兼容。PAID / READY 生命周期只在隔离夹具中生成，未模拟真实已付订单。

全套 **493/493**；静态 **246** 个 JS / JSON / WXML 文件；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。首次专项失败来自测试短 key 和不一致交易轴，已修正测试数据并重测；没有绕过契约。

只有串行内存适配器，无真实 SDK 并发 / 持久化、秘密管理、扫码 / 展示交互或微信 / 真机验收。正式失败错误映射也未开放，不能把 OFFLINE_PICKUP_RESULT 的内部错误直接当网络响应；cloudVerified / callable / fulfillmentAllowed 均 false。所有实际用例登记在 [ORDER-CLOUD-ACCEPTANCE.md](ORDER-CLOUD-ACCEPTANCE.md)，继续待执行。

未改 UI，保留全部未提交成果，未提交 / 推送 / 上传 / 部署。下一项 **O08 配送更新 / 确认收货与订单域离线验收**，异常配送细则 E11 与阶段六正式门禁仍待补。
