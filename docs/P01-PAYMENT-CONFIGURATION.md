# P01 支付配置与环境隔离（2026-10-05）

状态：**可离线配置边界通过；真实 P01 接入及验收未完成**。E01 云环境未开通，E03 商户关联及唯一方案未选定，E14 受控实付安排未登记。没有创建支付单、加载密钥、调用资金接口、部署函数或开放付款。已有 UI 和全部未提交成果保留。

## 当前实现

`cloudfunctions/_shared/payment-configuration-model.js` 是服务端纯模型。`createPaymentConfigurationModel(manifest, runtime)` 提供冻结的 `describe()` 和 `plan(operation, serverNow)`；后者要求显式、有效且不早于配置快照的服务端时间。真实执行前仍须重新读取现行配置、密钥绑定与撤销状态，不能把冻结快照当永久授权。

提交的 `cloudfunctions/payment-settings.example.json` 只有 schemaVersion=1 和 development / test / production 三个 null，未被云入口或客户端加载。null 不回退其他阶段；DISABLED 明确清空支付字段。REAL 表示配置形状，不能证明账号可用。所有结果 accountVerified / cloudVerified / callable / paymentAllowed=false；没有模拟成功分支。

每个非空 profile 的字段为 version、stage、environment、appId、mode、route、merchantId、notifyUrls、credentials、controlledTest。绑定必须与服务端 runtime 的 stage / environment / appId 一致，三个阶段不能复用环境 ID；跨阶段回调或集成实例不得复用。同一商户号不意味着测试环境免付费。

manifest 只允许一个候选 route，**两种候选均未选定或实接**：

| 候选 | 凭证描述 | 通知信任边界 |
|---|---|---|
| CLOUDBASE_INTEGRATION_V3 | integrationId、functionName、forwardingAuthRef | 平台验签解密后，业务端仍须验证转发来源与业务字段。forwardingAuthRef 是待实现的认证边界引用，不是已验证的 CloudBase 内建令牌。 |
| WECHATPAY_DIRECT_V3 | merchantSerial、merchantPrivateKeyRef、apiV3KeyRef、verification | 服务端验证原始签名并解密，verification 显式区分 PUBLIC_KEY 与 PLATFORM_CERTIFICATE；商户请求签名私钥不能代替微信响应 / 通知验签材料。 |

密钥引用只有 environment / name / revision，不保存密钥正文，不在公开摘要返回商户、回调或密钥资料。错误固定，不回显原始配置；拒绝 getter、symbol、循环及非安全 JSON。HTTPS、无查询 / 凭证 / 本地地址等 URL 限制是项目配置约束；平台候选另核对官方回调域名 / 路径。实际集成实例、SDK、转发认证、密钥管理与轮换均待核验。

非生产 REAL 新付款须有受控实付登记引用，绑定环境 / AppID / 商户 / 配置版本、notBefore / expiresAt、maxTotalCents / maxTransactions。期限左闭右开、预算必须显式正整数；这些元数据不是人工授权证明，也未实现持久预算占用。夹具中的 100 分 / 1 次 / 60 秒仅测试样例，不能发布为实际安排。生产仍要求独立发布门禁。

CREATE 要求当前授权窗口及后续持久预算检查；QUERY / CLOSE / REFUND / REFUND_QUERY / 两类通知是仅限已有支付的恢复计划，不能因新付款授权到期而阻断。即使当前授权缺失 / 到期，也须加载原支付及原授权、核对原受控测试绑定，并通过领域权限和资金账本检查；不授予新付款或任意退款能力。当前仍没有执行器或资金调用。

## 官方资料与后续约束

资料核对仅针对公开候选接口，不代表当前账号具备能力：

- [CloudBase 小程序微信支付集成指南](https://docs.cloudbase.net/integration/wechat-pay-miniprogram)：平台提供请求 / 回调处理，但本项目仍承担订单所有权、可信金额与账本校验。当前运行时 / SDK / HTTP 调用兼容性、平台转发来源认证须真实核查，未升级工具或选定方案。
- [微信支付 JSAPI / 小程序下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791897)：商户单号为 6–32 字符且商户下唯一；内部 V1 完整摘要订单号超长，不能直接发送或截断。P02 须生成独立唯一商户单号并持久关联。接口会调整过短 / 过长的支付有效期；预支付计划登记最短 1 分钟、最长 15 天，实际适配器必须确保不延长订单原付款截止，剩余窗口不兼容时拒绝新预支付。到期并不等于已关闭，另需关单协调。
- [支付成功回调通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791902)与[微信支付公钥验签](https://pay.wechatpay.cn/doc/v3/merchant/4013053249)：直接 API 候选须校验原始通知签名、区分验签材料并解密后核对商户 / AppID / 单号 / 金额 / 币种及重复事件。客户端 success 或请求中的 verified 字段不能作为资金证据。实际加解密及幂等入账留 P03。

`plan()` 只登记所需检查与 CREATE 编号 / 截止约束，没有生成商户单号、预支付参数或支付记录。内部绑定及 controlledTestLimits 不是客户端 DTO。API action 和客户端 allowlist 未扩充，只有 user.me / store.health 可调用；没有 payment 云函数目录。

## 本地验证与待补

新增 **24 项**：空配置、环境 / AppID 错配、跨阶段冲突、单一候选、禁用 / 模拟拒绝、实付登记范围 / 时间 / 预算、复用模型新时钟、授权到期后的既有支付恢复、生产门禁、密钥作用域、两条验签边界、回调 URL、冻结 / 私密错误及客户端零支付调用。全套 **544/544**，静态 **255**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**，实际包体以微信编译为准。没有本轮 UI / 微信 / 真机 / 云验收，也没有提交 / 推送 / 上传 / 部署。

实际 P01 清单见 [支付云验收记录](PAYMENT-CLOUD-ACCEPTANCE.md)。下一项 **P02 可离线预支付意图、复用与查单恢复**；真实接入仍等待 E01 / E03 / E14，不把配置检查通过当真实 P01 完成。
