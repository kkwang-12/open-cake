# 支付与退款：历史记录

历史事实和技术决策按原轮次保留；进度与下一步只查[当前状态](../../CURRENT-STATUS.md)。禁止据此复用旧授权。原文件逐字备份在[源快照ZIP](../source-snapshots-2026-10-09.zip)，校验见[清单](../records-manifest.json)。按目录定位单个记录，不默认全文读取。

- [P01-PAYMENT-CONFIGURATION.md](#p01-payment-configuration)
- [P02-PAYMENT-INTENTS.md](#p02-payment-intents)
- [P03-PAYMENT-NOTIFICATIONS.md](#p03-payment-notifications)
- [P04-PAYMENT-RECOVERY.md](#p04-payment-recovery)
- [P05-PAYMENT-SESSION.md](#p05-payment-session)
- [P06-REFUND-RECOVERY.md](#p06-refund-recovery)
- [P07-MAINTENANCE-RECONCILIATION.md](#p07-maintenance-reconciliation)
- [P08-PAYMENT-ACCEPTANCE.md](#p08-payment-acceptance)
- [PHASE-7-EXECUTION.md](#phase-7-execution)
- [PHASE-7-REVIEW-2026-10-06.md](#phase-7-review-2026-10-06)

---

<a id="p01-payment-configuration"></a>

## 原记录：P01-PAYMENT-CONFIGURATION.md

<a id="p01-payment-configuration--p01-支付配置与环境隔离2026-10-05"></a>
# P01 支付配置与环境隔离（2026-10-05）

状态：**可离线配置边界通过；真实 P01 接入及验收未完成**。E01 云环境未开通，E03 商户关联及唯一方案未选定，E14 受控实付安排未登记。没有创建支付单、加载密钥、调用资金接口、部署函数或开放付款。已有 UI 和全部未提交成果保留。

<a id="p01-payment-configuration--当前实现"></a>
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

<a id="p01-payment-configuration--官方资料与后续约束"></a>
## 官方资料与后续约束

资料核对仅针对公开候选接口，不代表当前账号具备能力：

- [CloudBase 小程序微信支付集成指南](https://docs.cloudbase.net/integration/wechat-pay-miniprogram)：平台提供请求 / 回调处理，但本项目仍承担订单所有权、可信金额与账本校验。当前运行时 / SDK / HTTP 调用兼容性、平台转发来源认证须真实核查，未升级工具或选定方案。
- [微信支付 JSAPI / 小程序下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791897)：商户单号为 6–32 字符且商户下唯一；内部 V1 完整摘要订单号超长，不能直接发送或截断。P02 须生成独立唯一商户单号并持久关联。接口会调整过短 / 过长的支付有效期；预支付计划登记最短 1 分钟、最长 15 天，实际适配器必须确保不延长订单原付款截止，剩余窗口不兼容时拒绝新预支付。到期并不等于已关闭，另需关单协调。
- [支付成功回调通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791902)与[微信支付公钥验签](https://pay.wechatpay.cn/doc/v3/merchant/4013053249)：直接 API 候选须校验原始通知签名、区分验签材料并解密后核对商户 / AppID / 单号 / 金额 / 币种及重复事件。客户端 success 或请求中的 verified 字段不能作为资金证据。实际加解密及幂等入账留 P03。

`plan()` 只登记所需检查与 CREATE 编号 / 截止约束，没有生成商户单号、预支付参数或支付记录。内部绑定及 controlledTestLimits 不是客户端 DTO。API action 和客户端 allowlist 未扩充，只有 user.me / store.health 可调用；没有 payment 云函数目录。

<a id="p01-payment-configuration--本地验证与待补"></a>
## 本地验证与待补

新增 **24 项**：空配置、环境 / AppID 错配、跨阶段冲突、单一候选、禁用 / 模拟拒绝、实付登记范围 / 时间 / 预算、复用模型新时钟、授权到期后的既有支付恢复、生产门禁、密钥作用域、两条验签边界、回调 URL、冻结 / 私密错误及客户端零支付调用。全套 **544/544**，静态 **255**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**，实际包体以微信编译为准。没有本轮 UI / 微信 / 真机 / 云验收，也没有提交 / 推送 / 上传 / 部署。

实际 P01 清单见 [支付云验收记录](../../PAYMENT-CLOUD-ACCEPTANCE.md)。下一项 **P02 可离线预支付意图、复用与查单恢复**；真实接入仍等待 E01 / E03 / E14，不把配置检查通过当真实 P01 完成。

---

<a id="p02-payment-intents"></a>

## 原记录：P02-PAYMENT-INTENTS.md

<a id="p02-payment-intents--p02-本人支付意图--复用--未知结果恢复2026-10-05"></a>
# P02 本人支付意图 / 复用 / 未知结果恢复（2026-10-05）

**可离线范围通过，真实 P02 预支付与查单未接入。** 新增 payment-intent-model / payment-intent-service，只有注入的串行内存事务适配器；没有 payment handler、真实 SDK、外部请求或支付唤起参数。P01 实际方案 / 商户关联、E01 云与 E14 实付安排继续待补。既有 UI 和全部未提交成果保留。

<a id="p02-payment-intents--事务与恢复"></a>
## 事务与恢复

`prepare(event, principal)` 沿用 payment.create 白名单，仅 orderId / expectedVersion / idempotencyKey。可信本人身份、当前用户 / 版本、订单状态 / 金额 / 币种 / 截止、原报价消费关系及整单 HELD 资源由服务端读取；金额、商户号、单号、provider 和 success 等请求字段拒绝。复用 O05 完整预留验证，不执行其资源释放计划；订单三轴 / 版本和资源计数不变。

第一笔意图在同一事务写受控测试预算占用、payments.PENDING / UNAPPLIED / PREPARED 及仅实体引用的幂等回执。生产没有测试预算默认值，独立发布门禁及真实账号 / provider 检查仍未实现。payment.create 的 SUCCEEDED 回执只证明内部意图准备完成，**不是付款成功**。payInvocation 恒 null，state=PENDING_CONFIRMATION，cloudVerified / callable / paymentAllowed=false。

同键重放校验原输入；异参拒绝。另一个键也复用唯一未决意图，不再生成编号或重复占预算。重放仍检查当前用户及本人订单，不向已取消 / 已付单返回唤起参数。旧版本同键可核对已创建意图，新键需当前订单版本；回执不含 provider 参数、密钥、联系人或支付状态证据。

`claimDispatch(orderId, paymentId, principal)` 是内部协调接口，**不是客户端 action**。再次检查当前授权 / 绑定 / 订单 / HELD / 原预算及剩余有效期，然后条件写 PREPARED→REQUESTED、dispatchToken / dispatchStartedAt / version，提交后才返回内部 PREPAY_REQUEST_REQUIRED。真实执行器未来须重新满足账号 / SDK / 发布门禁，在事务外调用一次；当前结果仍不可执行。

REQUESTED 表示“可能已经发出”，不证明实际请求或支付成功。发送标记提交后，即使程序崩溃或响应丢失，后续同 / 不同键、同 / 新服务只得到 QUERY_REQUIRED，不再领发送权或新建意图。UNKNOWN 兼容未来未知请求记录，保持 PENDING，不能写成可重新收费的失败。未发出的 PREPARED 到期也先协调查询；没有自动释放预算或资源。

仅返回查单要求，**本轮未实际查单，也未处理 NOT_FOUND / 未支付 / 已付 / 已关结果**。结果可信归一化、旧配置归档加载、关单或查单后重试同号 / 新意图，以及资金入账分别留 P03 / P04。CLOSED / EXCEPTION 摘要或异常资金要求协调，不擅自复位交易轴；已关闭后重付是明确待补项。

<a id="p02-payment-intents--编号有效期与预算"></a>
## 编号、有效期与预算

- 服务端独立生成 16 字节随机值的 32 位十六进制商户单号，持久关联完整 payment ID / orderId；不截断内部 V1 摘要。校验 6–32 字符允许集，冲突拒绝整笔事务，不随重试变号。实际唯一性还要求商户范围的唯一约束 / 注册；相同商户跨环境时须覆盖所有环境，随机性不替代约束。
- 外部 expiry 为原订单截止与当前候选最大窗口的较小值，再向下取整到秒。准备及发送提交前核对有效期、最短窗口与显式 dispatchSafetyMs，剩余不足拒绝，不延长原订单截止 / 资源占用。安全余量由未来可信适配器显式配置；夹具 2000ms 不是正式网络保证，实际发送前还须检查耗时与外部时钟。
- 非生产真实新意图必须读取已初始化的 payment_test_budgets。scope ID 和完整授权摘要绑定 P01 授权窗口、商户 / AppID / 环境 / 配置版本与金额 / 次数上限；reserved + used + 新意图均为安全整数且不超限。预算和意图同事务，原预算引用 / 摘要存到 payment；重放 / 发送不二次占用，未知不返还。原安排、预算初始化、消耗 / 关闭后的对账及撤销仍未部署，退款不在本轮自动重置额度。

候选接口规则来源：[微信支付小程序下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791897)与[商户单号查询订单](https://pay.wechatpay.cn/doc/v3/merchant/4012791900)。本轮只核对约束，未选定正式支付方案或冻结其传输参数。

<a id="p02-payment-intents--真实适配器义务"></a>
## 真实适配器义务

runTransaction 必须提交后才返回，任何异常 / 零行完整回滚；保护用户、订单、原消费报价、全部预留 / 资源、当前配置 / 授权、预算、完整支付查询及查询为空的条件直到提交。insertPayment 须同时保证唯一 ID、商户单号和每单唯一未决意图，不能只查询后普通写入。实际 SDK 若不能保护查询不存在条件，须提供同事务固定守卫记录及相应索引方案，当前未假设部分唯一索引可用。

模型读取明细后不改订单三轴；O05 必须继续读取完整 payments，因此 order.paymentStatus=UNPAID 但已有未决意图时不能走“无支付”释放。成功后的金额、订单 / 资源确认、日志、事件去重与预算消耗留 P03；异步任务不能靠客户端或过去用户权限代替服务身份，留 P04 / P07。预算 / 配置 / 内部发送资料只在服务端，不直接暴露客户端。

<a id="p02-payment-intents--验证"></a>
## 验证

新增 **30 项**，专项 **30/30**、全套 **574/574**、静态 **259**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。覆盖双履约、所有权 / 伪造输入、当前撤销与版本、同 / 不同键竞争、不同订单争抢预算、逐写异常 / 零行回滚、两种响应丢失 / 服务重建、一次发送权、窗口 / 提交时到期、配置变更、原预算 / 编号冲突、坏预留及 O05 协调兼容。

首次专项发现共用 validatePayments 未导出及 prepare 同步抛错的接口问题，已补导出并统一异步拒绝；短测试 key 修正到既有 16 字符规则，授权到期用例调整为与订单截止分开的边界，未放宽守卫。后续专项及全套通过。数据库规则草案增加 payment_test_budgets 的客户端全 CRUD 拒绝，共 26 个目标集合，仍未部署。

没有 UI 变动、微信 / 真机 / 真实云或资金验收，没有提交 / 推送 / 上传 / 部署。下一项 **P03 可离线可信通知业务核验、事件去重与原子入账**；P01 / P02 整体真实接入未通过，见 [支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)。

---

<a id="p03-payment-notifications"></a>

## 原记录：P03-PAYMENT-NOTIFICATIONS.md

<a id="p03-payment-notifications--p03-通知业务核验--去重--原子入账2026-10-05"></a>
# P03 通知业务核验 / 去重 / 原子入账（2026-10-05）

**离线范围通过，真实通知接入及资金验收未完成。** 新增 payment-notification-model / service，只使用注入的串行内存事务与 OFFLINE_TEST_ONLY 来源验证夹具。没有实现真实签名 / 解密、平台转发认证、HTTP 回调 / 应答或外部资金调用；不部署 payment 云函数，不开放付款，现有 UI 和所有未提交工作保留。

<a id="p03-payment-notifications--来源与业务核验分离"></a>
## 来源与业务核验分离

服务端注入 verifyAndNormalize(raw, receivedAt)。未来直接 API 适配器必须对原始字节验签并解密；平台候选则必须确认平台验签链及业务转发来源。调用方 raw 中的 verified / signatureValid、用户身份或客户端 success 没有授权意义。本轮没有提供真实适配器或选择接入方案。

注入函数返回 null 仅表示明确来源拒绝；抛错视为验证器不可用，固定重试错误，不伪记成付款失败。经过白名单检查的归一化结果保存在实例私有 WeakMap，只产生不可序列化复制的凭证；另一模型、普通 JSON 或布尔字段无法伪造。每次重放仍经过来源适配器。它是服务端内部边界，不是可向客户端分发的资金凭证；夹具以对象身份代替来源验证，**不是密码学证明**。

来源拒绝按独立 namespace 保存 REJECTED / QUARANTINED 事件，providerEventId=null，不占用真实通知 ID 或交易号。只保留输入摘要和固定错误，不保存报文 / 签名 / token；实际入口的大小限制、限流与留存需随所选适配器核验。测试 16384 字节为显式夹具限制，不是微信限制。

正常归一化包含 providerEventId、可信 callback 配置 binding / verificationMethod 及 MoneyEvidence 白名单。业务层再核对环境、provider、原 AppID / 商户 / profileVersion、商户单号、本人用户稳定映射 / 付款者摘要、CNY / 订单整数分全额、成功码、业务时间及未决意图。用户当前 DISABLED 或新付款授权到期不丢弃已发生资金；这里不授予用户新下单权限。

VERIFIED 表示当前**注入适配器认可的来源事实**，不是金额 / 订单匹配或真实平台已验收。错范围、金额、币种、付款者、单号、缺字段或坏意图保存隔离证据，不改变订单 / 资源；在本门店商户 / AppID 范围内的有效成功交易，还登记不可重复占用的交易守卫，后续不同事件不能悄悄替换其金融事实。异常需 P04 / P07 核实，协调标记不是退款授权。

<a id="p03-payment-notifications--去重及原子效果"></a>
## 去重及原子效果

- 通知 `_id` 为 payment-notification(environment, provider, merchantId, providerEventId) 范围摘要。重复同事件同事实读原结果，不重复改订单 / 资源 / 预算。
- 同一事件 ID 的事实冲突追加 EVENT_CONFLICT，以原事件和业务摘要唯一定位；保留原事件 / 资金，不覆盖，重复冲突只一条。
- 交易守卫 `_id` 为 payment-transaction(provider, merchantId, transactionId) 范围摘要，存于 payment_events，recordType=TRANSACTION_GUARD、providerEventId=null。不同事件同交易号只能重复确认原付款；跨订单或事实变化隔离，不第二次入账。商户跨环境时实际注册须覆盖全部环境，当前没有全局 SDK 证明。
- 语义摘要包括原绑定及白名单业务事实，排除原报文摘要与通知 ID；重发加密报文变化但事实一致不产生第二笔资金。存储记录还校验自身事实摘要、角色和时间，损坏守卫不信任。

正常处理在一个事务内保存通知与交易守卫、支付 PAID / APPLIED、受控预算 reserved→used、整单库存及独立时段 HELD→CONFIRMED、订单 PAID / paidCents / paidAt / version 和最终 PAYMENT_CONFIRMED 日志。库存尚未 CONSUMED，计数总占用不增加，不重扣或释放；历史商品、价格、地址、时段、门店与退款轴保持原值。系统能力由来源边界提供，不能由 raw.role 创建。

payment.create 先写 PENDING 意图，真实发送结果仍未知；只有上述可信处理才能入账。源通知金额取归一化的订单总金额，不用客户端金额；实际 provider 的总额 / 用户实付 / 优惠与结算字段需适配器明确映射，本轮没有虚构传输格式或新增优惠业务。

按时支付但晚收到通知，只要原完整 HELD 仍存在可原子确认。已取消、已关闭、越过付款结束边界或资源 / 日志异常时，匹配资金保存支付 PAID / QUARANTINED 和交易守卫，预算可核实则消费一次，但不恢复订单或确认已释放资源。原预算无法核实时保留资金证据 / 原计数，不自动重置额度。第二笔异常资金保留额外交易守卫，不把订单 paidCents 增至超额。真实退款意图 / 补偿与预算异常对账留 P04 / P06 / P07。

已隔离事件 / 交易重放保持隔离；不因数据后来修改就自动变为已入账。实际重新核实与修复需要 P04 的受控事务。数据库写失败不对部分资金 / 资源报成功；当前没有 HTTP ACK，未来必须在原子处理或可信证据 / 待办持久化提交后才能成功应答，不能仅凭 sourceAccepted 提前应答。

<a id="p03-payment-notifications--时间精度"></a>
## 时间精度

MoneyEvidence 显式保留 occurredAtPrecisionMs（当前内部 1 或 1000），秒级值必须对齐整秒，其区间为 occurredAt 至 occurredAt+999。付款区间必须与意图 / 发送创建时间相容；不伪造原始消息毫秒，未来时刻或完全早于意图的证据隔离。外部 expiry 已向下取整到秒，截止边界仍拒绝正常入账。

payments.confirmedAt / 事件 occurredAt 保留平台原时间；orders.paidAt 为经核验的成功时间下界，取原时间与已验证创建 / 发送时间的较大值，保证历史读模型时间不倒退。原值与精度留在资金证据，不能把派生下界宣称为精确实际分钟。

规则参考[微信支付通知文档](https://pay.wechatpay.cn/doc/v3/merchant/4012791902)：原始签名、解密后的字段、成功时间、重入与查询均有独立要求。本轮 CloudBase 指南抓取超时；平台候选沿用 [P01](phase-7.md#p01-payment-configuration) 的待核边界，没有声称重新核实集成实例 / 接口或内建认证令牌。

<a id="p03-payment-notifications--适配器及验证"></a>
## 适配器及验证

runTransaction 必须提交后返回，保护原配置 / 旧密钥绑定、事件 / 商户全局交易守卫不存在条件、意图 / 全部订单支付查询、订单、用户映射、原报价 / 全部资源预留、预算及日志直到提交。真实数据库不能防幻读时需固定同事务守卫与唯一注册，不能靠先查后普通写；实际能力待云。没有读取现行目录改写历史订单。

新增 **28 项**，全套 **602/602**、静态 **263**，主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。覆盖双履约、两候选链、伪造 / 跨实例凭证、业务字段错误、同 / 不同事件与跨订单交易竞争、响应丢失 / 新服务、正常 10 个与隔离 4 个写位置异常 / 零行回滚、原预算、用户撤销 / 到期、迟到 / 取消 / 关闭、资源 / 日志异常、坏守卫、秒级边界、隐私及 O03 快照 / O06 历史详情兼容。

首轮业务专项通过；组合详情用例初次因两套夹具相差 8 小时时钟导致隔离，已显式对齐夹具时间 / 作用域后通过，不放宽守卫。VERIFIED / APPLIED 仅本地隔离记录，不能代替真实付款。没有 UI、微信 / 真机 / 云或实际资金验收，没有提交 / 推送 / 上传 / 部署。

下一项 **P04 可离线主动查单 / 关单协调、取消竞争与迟到款补偿意图**。P01–P03 整体实际接入与阶段七门禁仍未完成，见 [支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)。

---

<a id="p04-payment-recovery"></a>

## 原记录：P04-PAYMENT-RECOVERY.md

<a id="p04-payment-recovery--p04-查单--关单协调与迟到款补偿意图2026-10-05"></a>
# P04 查单 / 关单协调与迟到款补偿意图（2026-10-05）

**可离线范围通过，实际资金与云验收未完成。** 新增 payment-recovery-model / service，只有串行内存事务与 OFFLINE_TEST_ONLY 身份 / 来源夹具。没有真实查询 / 关单 / 退款请求、任务调度、告警发送或 payment handler；付款门禁不开放，没有修改 UI、提交 / 推送 / 部署，既有未提交工作保留。

<a id="p04-payment-recovery--可信恢复请求与结果"></a>
## 可信恢复请求与结果

prepareQuery / prepareClose / compensateLate 都要求服务器注入 verifyRecoveryInvocation；其上下文包括操作、支付 ID 和用途。客户端 SYSTEM / verified 字段无效。实际任务 / 领域取消的来源、订单本人或到期授权须由未来适配器核验，不提供客户端可选系统身份的入口。

先原子保存 RECOVERY_REQUEST，再输出内部 transportPlan。请求固定原环境 / AppID / 商户 / provider / profileVersion、意图 / 原商户单号、支付版本、操作及用途。没有执行器；transportPlan 不是 PaymentSession、公开 DTO 或允许支付的参数。查询为安全恢复读取；关闭以已验证未支付观察为依据确定请求 ID。同依据重复 / 响应丢失只 QUERY_REQUIRED，不再次给发送权。关闭未知后取得新查询结果，可以另建可追溯的关闭请求。

acceptResponse 先经过服务器注入 verifyRecoveryResponse，再核验白名单结果与已存请求。直接 API 候选要求 SERVER_AUTHENTICATED_PROVIDER_RESPONSE，平台候选要求 PLATFORM_AUTHENTICATED_PROVIDER_RESULT；均是待实际实现的认证链，本轮对象身份夹具不是响应签名或平台调用认证。原配置 / 用户映射 / 订单、完整支付 / 退款、报价 / 资源 / 日志 / 预算及请求 / 事件读集保护到提交。

结果为内部归一化 QUERY（SUCCESS / CLOSED / NOTPAY / UNKNOWN）或 CLOSE（ACKNOWLEDGED / ALREADY_PAID / UNKNOWN）。这些不是冻结的微信传输字段或错误码映射，实际适配器必须从认证后的响应正确归一化；超时 / 不存在 / 处理中 / 未映射错误不能当 CLOSED。严格核对请求 / 操作、绑定和商户单号；错误来源 / 配置不写资金。响应不可在同请求 ID 下更换事实，重查须新请求。原始报文 / OPENID / 密钥不进结果或记录。

缺少业务核验字段时继续待核验，不把已知订单金额填成平台返回值。未知 / 未支付观察重放仍要求协调，不因为已经记过观察就误报资金已解决。

<a id="p04-payment-recovery--查单复用-p03-与关闭顺序"></a>
## 查单复用 P03 与关闭顺序

SUCCESS 进入 P03 的业务核验 / 原子入账共用实现，使用 QUERY 来源和独立 payment-query-result namespace。语义摘要与交易守卫仍跨通知 / 查询共用；同交易号先收到查询或通知，都只确认一次资金 / 预算 / 资源。观察记录与资金处理同事务，不出现已记“处理完”但只写半笔的情况。

NOTPAY 只能成为版本匹配的关闭依据，不标 CLOSED、不释放预算 / 资源，也不能让 O05 走无支付取消。EXPIRE 必须精确达到订单截止；CANCEL 依赖受信任领域授权。关闭占权时写 closeRequestedAt，阻止仍 PREPARED 的意图首次发送；订单保持待付。

关闭 ACK、已支付提示或未知都只要求进一步查询，不能把缺少业务事实的空应答当作订单资金事实。只有认证后与原金额 / 币种 / 单号对应的 QUERY CLOSED，且原支付版本未变，才同事务写支付 CLOSED、预算释放及订单 CLOSED 摘要 / PAYMENT_CLOSED 日志。平台查询不提供关闭业务时间时，closedAt 是服务端确认关闭的时间，不冒充平台精确关闭时刻。

全部支付意图关闭后订单摘要才 CLOSED；单个意图关闭但其他未知继续占用。O05 在后续独立事务重读全部支付与资源，再取消 / 释放，重放不多释放。中间失败保留可恢复 CLOSED 待取消状态，不能为了模拟跨网络原子事务先释放。已付款通知抢先提交或支付版本改变，旧 CLOSED / NOTPAY 观察只记 STALE_QUERY，不倒退 PAID。

受控测试关闭仅释放原 reserved 金额 / 次数，used 从不重置。释放后的迟到款，P03 根据原关闭 / 释放证据直接记 used 一次，原 reserved 不再扣；若新占用已耗尽原授权上限，保留真实匹配资金 / 原预算计数进入人工核实，不扩大限额。已有资金恢复不因用户禁用或新付款授权到期关闭；实际授权来源 / 初始化 / SDK 仍待 E14。

<a id="p04-payment-recovery--迟到款全额补偿意图"></a>
## 迟到款全额补偿意图

只自动规划已通过来源 / 归属 / 全额 / 时间 / 原预算核验且原因明确为 CANCELLED_ORDER_PAYMENT 或 LATE_OR_CLOSED_PAYMENT 的隔离资金。其他错金额 / 付款者 / 预算 / 资源 / 日志、第二笔未知资金须继续受控核实，不自行推定退款对象或金额。

compensateLate 保护原交易守卫 / 所有支付 / 订单退款意图、预算及完整历史日志 / 资源。已取消订单保持取消；尚待付款但已越期限或可信关闭的订单转取消并按 HELD 证据释放。确认原收款摘要后，同事务将订单 paidCents / PAID 与全额 refundReservedCents / PENDING、支付入账、守卫处理元数据、独立退款意图、资源释放和最终日志一起写入。库存 / SLOT 不恢复 CONFIRMED，不进入制作。

退款意图按环境 / 支付 / 交易号确定 ID，outRefundNo 独立服务端生成并要求商户范围唯一；状态 PENDING、budgetState=RESERVED，providerRefundId / settledAt=null，没有退款调用或假 SUCCEEDED。approvalLogId / SYSTEM 依据固定关联最终日志。同原资金只一个意图、总预算不超原实付；另有退款或未知支付时拒绝自动重建。执行 / 查询 / 失败恢复留 P06。

原资金证据与语义摘要保持不变；交易守卫允许在这个受控事务内更新 processingStatus、处理时间 / version 和 reconciliationEventId，追加 LATE_PAYMENT_COMPENSATION 记录审计依据。原异常通知 / 查询事件不覆盖。补偿记录含 requiresAlert=true，表示持久告警需求，实际发送 / 负责人 / 任务留 P07 / E14。退款不是购买页成功反馈。

O06 增加两种日志的严格轴校验及固定文案，完整 O03 下单快照仍可读；不暴露交易号、请求凭据或原报文。没有修改订单页面或字体。

<a id="p04-payment-recovery--原子性证据与剩余条件"></a>
## 原子性、证据与剩余条件

查询成功：两资源非生产夹具共 **11 写**（观察 1 + P03 正常 10）。可信关闭 **5 写**（观察 / 预算 / 支付 / 订单 / 日志），关闭占权 **2 写**。未取消迟到款补偿 **10 写**，已取消且资源已释放补偿 **6 写**。每个位置异常 / 零行逐一回滚；重放重新验证当前授权 / 原记录，响应丢失可用已存结果恢复。串行内存并行调用只证明模型行为，不证明真实 SDK 并发、幻读或商户全局唯一。

新增 **37 项**，全套 **639/639**，静态 **267**；主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**。覆盖双履约 / 两候选链、丢通知与查询恢复、重复与冲突 / 来源伪造、关闭三类非最终结果、精确到期 / O05 两步协调、付款竞争及旧观察、正常 / 已取消迟到款、关闭预算释放与额度异常、逐写回滚、用户禁用 / 授权到期、记录损坏及 O03 / O06 历史读兼容。

首次共用接线失败来自误将含配置函数的服务上下文传给 JSON 状态模型，以及观察计划缺少空资源数组，已显式投影 / 补齐。后续测试修正了配置更新需同时匹配授权 profileVersion、取消重试必须重用原 expectedVersion，以及异步认证调用顺序不等于事务提交顺序的断言；未放宽业务规则。

实现核对了官方[商户订单号查询](https://pay.wechatpay.cn/doc/v3/merchant/4012791900)与[关闭订单](https://pay.wechatpay.cn/doc/v3/merchant/4012791901)入口；完整页面抓取部分失败，检索摘要 / 同 API 产品官方文档确认了查询状态及空应答边界。未据此声称已选方案、核实 SDK 或账号，平台集成仍待实际适配器。E01 / E03 / E14、原配置归档、任务 / 取消来源认证、真实跨环境唯一、客户端 state.get 与真实查询 / 关单 / 退款 / 对账告警继续待[云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)。

下一项 **P05 可离线支付会话、继续支付与付款结果恢复契约**；真实唤起 / 成功页及真机验收待条件，P01–P04 整体与阶段七正式门禁未通过。

---

<a id="p05-payment-session"></a>

## 原记录：P05-PAYMENT-SESSION.md

<a id="p05-payment-session--p05-支付会话与结果恢复契约2026-10-06"></a>
# P05 支付会话与结果恢复契约（2026-10-06）

本轮完成可离线会话模型及回归。没有接入云端 payment.create / state.get、预支付参数、wx.requestPayment、订单按钮或成功页；P05 整体与阶段七实际门禁尚未通过。沿用 V1 全额支付，用户已确认的 UI 保持原值。

<a id="p05-payment-session--实现与输入边界"></a>
## 实现与输入边界

`miniprogram/features/payment/payment-session.js` 仅输出冻结的 OFFLINE_PAYMENT_SESSION / OFFLINE_PAYMENT_REQUEST_PLAN。connected / callable / paymentAllowed / successPageAllowed 恒 false；不存在网络、Storage、付款、订单取消、资源释放或退款调用。

创建实例绑定一个 orderId，幂等键工厂显式注入。beginRecovery 生成 payment.state.get `{orderId}` 计划；beginCreate 仅在刚收到合法未付、无活动意图状态且未到截止时生成 payment.create `{orderId, expectedVersion, idempotencyKey}` 计划，不转发金额或客户端成功字段。基础请求经原 D07 白名单测试，没有扩展云 handler 或客户端 allowlist。

receiveState 消费的是未来受信任后端适配器所需的**候选归一化摘要**，不是已部署 PaymentState DTO，也不是资金来源认证。测试手工输入摘要只验证客户端决策，不能证明实际订单已付款。字段为 orderId / version / orderStatus / paymentStatus / refundStatus / currency / totalCents / paidCents / refundedCents / refundReservedCents / paymentDeadlineAt / activePaymentState。字段精确白名单、整数分与资金 / 退款轴一致性校验；OFFLINE scope、跨订单、内部交易号 / 预支付签名等未知字段拒绝。

未来 activePaymentState 的 NONE / PENDING / UNKNOWN / CLOSED 必须由后端完整本人意图查询及受保护读集推导；查询失败、结果不完整或隔离资金不可默认 NONE。旧意图全部关闭也不归一化为可新付；实际关闭后重新付款规则仍未实现。

<a id="p05-payment-session--状态重试与生命周期"></a>
## 状态、重试与生命周期

- 所有客户端付款返回路径均只生成 state.get：success / cancel / fail 都不能标 PAID。createFinished 只安排恢复查询，不消费预支付参数，更不直接唤起付款。
- PENDING / EXCEPTION / 活动意图 PENDING 或 UNKNOWN、请求失败和无效摘要均保持 CONFIRMING；隐藏旧摘要，不开放另一笔支付。可显式刷新，没有后台轮询或定时任务。
- 合法已付摘要仅得到 PAID_REPORTED，实际成功页仍关闭；取消、退款中 / 失败 / 已退进入 ORDER_ATTENTION，不误展示普通购买成功。CLOSED 禁止重新收费。
- ticket 阻止旧查询和离页前回调覆盖新请求；invalidate 清在途状态及可见摘要，但保留实例内版本基线与重试键。
- 同订单版本、已核验可重试时复用原 key；不同版本才申请新 key，同实例不同版本生成重复 key 拒绝。创建响应丢失后必须先查状态，不直接重新付款。
- 订单版本不得回退；同版本订单事实不得变化。activePaymentState 可以独立变化，不要求每次观察都增加订单版本。已付 / 已关闭不回退未付，CANCELLED / COMPLETED 终态及 refundedCents 累计不回退，历史总额 / 截止不能改写。关闭意图观察跨 UNKNOWN 中间态及 invalidate 保留，不能重新归一化为可付的 NONE；之后可信 PAID 仍可恢复。
- 客户端截止只用于保守禁用；实例内一旦观察到截止，时钟回退不重新开放。不会本机取消订单或释放资源，之后仍可恢复已付摘要；真正期限与新付款资格由服务端最终校验。

键仅保存在实例内 Map：**没有跨实例 / 跨设备恢复或持久去重保证**。实际接入前必须先实现账号 / 环境隔离的请求持久化、写入失败拒绝发送、服务端幂等恢复及退出登录清理，不能直接用本模型替代。

<a id="p05-payment-session--验证与剩余工作"></a>
## 验证与剩余工作

新增 19 项测试，涵盖丢响应 / 重复点击、各类客户端返回、未决 / 关闭 / 退款、乱序 / 失效回调、同版本意图观察、不可变金额 / 截止、已付倒退、时钟回退与白名单。全套 **675/675**，静态 **274**，SVG 索引及引用 **41 个通过**；主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。最新 UI 引入的 17 项测试包含在基线 656 中，不计作 P05 新增。

没有微信 / 真机 / 实付或云 SDK 验收，没有提交 / 推送 / 上传 / 部署。实际 handler / 本人查询、完整意图一致性、来源认证、预支付会话 DTO / 参数及期限、跨实例 key、订单继续支付与成功页仍待 E01 / E03 / E14 和真实 P01–P04 接入。品牌成功页需要再读本人 order.detail 的历史明细 / 履约快照，资金确认不得取客户端或当前目录替代。

下一项 **P06 可离线退款意图执行边界、查询恢复与退款预算一致性**；不执行资金退款。实际 P05 与阶段七门禁继续按 [支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md) 补齐。

---

<a id="p06-refund-recovery"></a>

## 原记录：P06-REFUND-RECOVERY.md

<a id="p06-refund-recovery--p06-已有退款意图执行边界与恢复2026-10-06"></a>
# P06 已有退款意图执行边界与恢复（2026-10-06）

本轮新增内部 refund-model / refund-service，处理已获审批或 P04 补偿依据、已经占用额度的退款意图。不是实际退款接口：所有结果为 OFFLINE_REFUND_RESULT，cloudVerified / callable / externalRefundExecuted=false，没有 handler、SDK、HTTP 通知、后台调度、商家页面或资金调用。

<a id="p06-refund-recovery--账本与授权"></a>
## 账本与授权

加载完整订单 / 原付款 / 全部付款与退款、审批日志链及本意图全部尝试。原付款必须全额 PAID + APPLIED，其他意图均已 CLOSED；隔离或未知资金拒绝执行。历史金额、订单付款轴、原配置绑定、完整日志链、审批日志对应的 RESERVED 增量、审批 actor 与意图一致性必须通过。

累计 SUCCEEDED + SETTLED 金额等于 orders.refundedCents，所有 RESERVED 金额等于 refundReservedCents；累计成功与占用不超原实付，最多一个 RESERVED 意图。PENDING / FAILED 都继续 RESERVED；RELEASED 没有处置入口。订单退款摘要从完整意图集合校验；成功后累计增加本意图金额、占用等量减少，失败保持原额度。付款记录、受控实付 used 额度、履约状态与历史快照不改，不返还库存或时段。

prepare 的 verifyRefundInvocation 由未来服务器适配器实现当前同店商家 REFUND_APPROVE / 合法任务权限及撤销校验，授权范围包含 refundId / operation / key。测试仅认实例私有对象身份，不是管理员角色实测。已存在审批意图是执行前提；实际商家审批 / 拒单 / 取消审批事务创建意图仍需 A02 / A06 与 O05 编排实接。零金额审批没有意图，不能进入本服务；部分 / 全额意图及多次部分退款预算在夹具中组合验证。

<a id="p06-refund-recovery--尝试与发送占权"></a>
## 尝试与发送占权

- SUBMIT / QUERY 先在事务内插入 refund_attempts：序号连续、requestId、原 outRefundNo、startedAt、STARTED。随后仅返回内部 transportPlan，没有外部调用。
- 同请求重放返回已有 attempt；SUBMIT 首次占权后，不同 key 也先查结果。旧 STARTED / 受理 / 未知不另给发送权。最新 QUERY 的 STARTED 尚未达到服务器显式 queryRetryAfterMs 时返回 QUERY_IN_FLIGHT；到期可用新请求键查询原号，不将旧查询自动记为失败，不重新 SUBMIT 或释放额度。测试 1000ms 仅合成策略。
- 经可信 FAILED 结果且它是最新尝试时，受权重试可建立新 attempt，但复用原退款意图 / outRefundNo，不再占额度。实际供应商是否支持该失败状态原号重试、错误映射和受理语义尚未确认，适配器不得把普通超时 / 未映射错误归一化为 FAILED。
- 进程退出、结果丢失、没有回包都不自动终结 STARTED。本模型已允许超时后的再次 QUERY，自动调度及 P07 领域接线仍未实现。

<a id="p06-refund-recovery--来源去重与成功入账"></a>
## 来源、去重与成功入账

acceptResult 先限输入体积，再经服务器注入 verifyRefundResult，核对结果与原尝试、环境 / AppID / 商户 / 原配置、付款单号 / 交易号、原退款号、CNY 原实付与退款金额。直接 API / 平台集成分别要求对应的服务器认证结果形状；夹具仅以对象身份模拟来源，不是验签、解密或真实查询证据。

ACCEPTED / UNKNOWN 不标退款成功或释放额度；携带可信平台号时原子绑定意图身份 / 事件引用，后续不同非空平台号拒绝。SUCCESS 必须有稳定平台号、可信时间和显式 occurredAtPrecisionMs（1 / 1000）；时间区间与某次 SUBMIT 相容，时间下界不晚于当前服务端。秒级时间必须整秒对齐，保留原时间与精度，不伪造毫秒。查询前已成功合法，不把查询 startedAt 当退款下界；refunds.settledAtPrecisionMs 成功时同步，其他状态 null。真实字段映射仍需适配器落实。

事件 ID / 事实摘要去重，平台退款号在商户范围以 payment_events 中 REFUND_GUARD 保护，不允许同号归属另一意图。相同事件的异参拒绝；成功后的失败仅观察，不能倒退 SUCCEEDED，成功重复不再次增加金额。旧负面结果不覆盖更晚尝试，旧查询的可信成功仍可结清实际资金。已结清后平台号或成功时间冲突拒绝，不覆盖原事实。

成功事务包含：结果事件、首次平台号守卫、尝试终态、退款 SUCCEEDED / SETTLED、订单累计与退款摘要、最终 REFUND_CONFIRMED 日志；失败事务是结果 / 尝试 / FAILED 意图 / 摘要 / REFUND_FAILED 日志。O06 增加严格资金轴检查与固定公开文案，内部单号 / 原因 / 证据不进入历史时间线。P04 迟到款补偿仍保持 CANCELLED / RELEASED，退款成功不恢复履约。

事务适配器必须保护完整退款 / 尝试查询、审批 / 订单 / 付款 / 配置读集和结果 / 平台号不存在条件；版本更新零行均拒绝，外部请求在事务外。真实 outRefundNo 商户范围唯一索引、SDK 幻读保护与并发证明待云验收，串行内存不能替代。

<a id="p06-refund-recovery--验证"></a>
## 验证

新增 **19 项**：部分 / 全额与双履约、原号重试 / 丢响应 / 服务重建、未知及两种来源候选、事件冲突、旧失败与成功竞争、每个成功 6 写 / 失败 5 写位置异常和零行回滚、授权伪造、预算 / 审批损坏、多次部分退款，以及 O03 完整快照 → P04 迟到款 → P06 退款 → O06 历史详情组合。全套 **694/694**，静态 **278**、SVG **41 个**通过；主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。

首轮组合测试错误来自简化付款夹具不含订单明细，已补 O03 完整订单快照及明细后重测；没有放宽业务检查。没有修改 UI 或本机 Storage，没有微信 / 真机 / 云 / 实际退款验收，未提交 / 推送 / 上传 / 部署，全部已有改动保留。

P06 整体未完成：实际商家授权 / 审批创建意图、平台退款提交 / 通知与查询认证、持久失败重试 / 超时调度、唯一索引和真实退款资金闭环仍待 [支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)。下一项 **P07 可离线补偿任务 / 对账 / 告警边界**，不自动发送告警或操作资金。

2026-10-06 顺序复审：查询超时、平台身份及时间精度三项已修复。P06 当前 25 项专项，全套 729/729；新 ACCEPTED 四写原子性、超时竞争与旧结果保序通过，详见 [P01–P07 复审](phase-7.md#phase-7-review-2026-10-06)。历史 694/694 是原轮次结果。

---

<a id="p07-maintenance-reconciliation"></a>

## 原记录：P07-MAINTENANCE-RECONCILIATION.md

<a id="p07-maintenance-reconciliation--p07-补偿任务--对账--告警离线边界2026-10-06"></a>
# P07 补偿任务 / 对账 / 告警离线边界（2026-10-06）

新增内部 payment-maintenance-model / service。没有定时触发器部署、真实账单下载、支付 / 退款 SDK 或通知渠道；callable / cloudVerified / moneyAdjusted / messageSent 恒 false。本轮不改 UI、本机 Storage 或用户已确认的样式。

<a id="p07-maintenance-reconciliation--候选任务与领域分工"></a>
## 候选任务与领域分工

可信事务适配器提供完整、当前环境 / AppID / 商户 / provider 的未决快照。PENDING / EXCEPTION 支付只建 PAYMENT_QUERY；已付款但未 APPLIED 建 PAYMENT_REVIEW；未完成退款建 REFUND_QUERY；订单待付、摘要 CLOSED 且全部原意图已关建 ORDER_CANCELLATION_REVIEW。跨环境 / 重复记录 / 不完整快照、旧实体版本不得登记任务。

任务只提供领域提示，不直接调用 P04 / P06，也不把任务状态当成资金状态。真正处理时必须重新核验实体当前版本、原配置 / 授权与完整读集，再交给原领域服务。PAYMENT_REVIEW 不默认“自动退款”，REFUND_QUERY 不自动再提交，取消复核不直接释放资源。当前没有扫描分页 / 自动逐项登记 / 任务到领域服务的执行适配器。

<a id="p07-maintenance-reconciliation--租约重放与运行记录"></a>
## 租约、重放与运行记录

任务 ID 固定环境 / AppID / 商户 / provider / kind / entityId / entityVersion，同版本登记幂等。任务 PENDING → RUNNING → DONE / PENDING / REVIEW，读取版本与条件保存防重复占权；租约 token + 任务版本共同保护。过期可以重领，旧 worker 不能确认新租约；提交前再次检查时钟与租约截止，写入过程中到期整笔回滚。

claim 同事务保存任务与 MAINTENANCE_RUN，安全 requestId 为确定运行 ID，包含实体引用、版本、开始 / 租约截止和结果，不含联系人、地址、原报文、交易单号或 leaseToken。finish 把运行终态与任务状态同事务提交；丢响应后读取任务终态，不重复处理资金。历史租约到期的运行记录保留 STARTED + leaseUntil，未假称领域请求失败或自动改资金，后续审计可据租约判过期。

retryDelayMs / leaseMs / maxAttempts / alertAfterMs 必须显式注入，测试 100 / 200 / 3 / 300 只是合成毫秒策略，非正式运营值。未知 / 可重试结果按延迟重新候选，超过次数转 REVIEW、保留告警需求，不擅自关单或放弃资金恢复。策略发布、暂停恢复、批量扫描和重试负责人待实际配置 / P08 验收。

verifyInvocation / verifyOutcome 是未来服务器注入的任务身份与领域结果来源验证；不得把普通脚本返回 success 或客户端 SYSTEM 字段当可信 RESOLVED。夹具仅对象身份验证。DONE 只表示这个任务的受信任结果报告已结束，不证明实付或已退款。

<a id="p07-maintenance-reconciliation--对账"></a>
## 对账

verifyStatement 由服务器实际账单 / 查询适配器实现来源认证，事务加载对应范围的完整本地归一化账本。两侧都须明确包含 environment / appId / merchantId / provider，并逐项与服务配置一致；两侧完整、startAt / endAt 相同且范围已结束才比较。本地 scope 缺失 / 错配不能因记录相同而 matched。当前窗口定义与归一化 reference / providerId 映射是候选契约，实际账期 / 时区、分页完整性、平台字段与原付款 / 退款映射仍待实现。

分别核对 payments / refunds 的 reference、整数分、CNY、状态和平台流水号。缺本地记录、缺平台记录、金额 / 状态 / 平台号不符分开报告；重复业务引用或成功平台流水号拒绝，不用 Map 覆盖重复记录来假称一致。只比较通过白名单的归一化字段，不把手机号 / 备注等原始列写进报告。reference 在结果中替换为摘要，报告 ID 对确定字段及字典序排序计算，不依赖系统地区排序或输入顺序。

不自动用平台账单覆盖订单、支付或退款。matched 只是当前已认证候选完整窗口的比较结论，不代表真实账单验收或账号资金已核实；真实认证当前未实现。

<a id="p07-maintenance-reconciliation--持久告警需求"></a>
## 持久告警需求

长期未决、次数耗尽、领域要求复核与对账差异保存 ALERT_REQUIREMENT：固定 reason、jobId / reportId、OPEN、requiresOperator=true、messageSent=false。同原因 / 同任务或同报告去重；不调用邮箱、短信、微信订阅消息或其他消息工具。当前未配置负责人 / 渠道、送达回执、人工确认 / 关闭，不能声称告警已发送或处置完成。

任务 / 运行 / 告警 / 报告复用 payment_events 内部 recordType，没有新增集合或实际建库。SDK 必须保护候选、任务与运行版本、告警 / 报告不存在条件，零行写回滚；实际索引、范围扫描幻读与多 worker 并发待云验收。对象身份与串行内存不能替代来源认证和数据库并发证明。

<a id="p07-maintenance-reconciliation--验证及剩余工作"></a>
## 验证及剩余工作

新增 **23 项**，全套 **717/717**；静态 **281**、SVG **41 个通过**，主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。覆盖任务重复登记、租约竞争与边界 / 提交中到期、旧 worker、丢响应 / 重建、延迟与次数 / 长期告警、任务 / 运行 / 告警逐写异常及零行回滚、来源伪造、缺完整范围、重复流水、各类差异、顺序稳定及报告 / 告警原子性。不改资金账本。

未操作微信 / 真机、云、真实账单 / SDK / 资金或对外消息，未提交 / 推送 / 上传 / 部署，所有既有改动保留。P07 整体未通过；真实扫描 / 调度、领域服务接线 / 超时查询恢复、认证账单、经营策略与告警负责人 / 送达 / 处置待补。

下一项 **P08 阶段七离线评审、可复现证据与真实验收清单**。无实际受控实付 / 退款前不得标阶段七整体完成，不进入真实购买 / 管理员运营发布。

---

<a id="p08-payment-acceptance"></a>

## 原记录：P08-PAYMENT-ACCEPTANCE.md

<a id="p08-payment-acceptance--p08-payment-阶段验收与可复现证据2026-10-06"></a>
# P08 Payment 阶段验收与可复现证据（2026-10-06）

状态：**离线验收与证据工具通过；P08 整体待真实云 / 商户 / 资金条件，未验收通过。** 本轮接续 [P01–P07 顺序复审](phase-7.md#phase-7-review-2026-10-06)，保留所有未提交改动和已确认 UI。

<a id="p08-payment-acceptance--本轮交付"></a>
## 本轮交付

新增 `scripts/verify-payment-offline.js` 和 `npm run verify:payment:offline`。固定使用当前 Node 执行文件、参数数组和仓库工作目录，不经过 shell 拼接，不运行部署、配置生成、图标写入、支付或退款。旧 HTTP 用例仅启动本机 loopback 演示服务，仍与 V1 隔离。

一次执行分三组，每个测试文件只跑一次：支付专项、初始化旧基线、其他回归；再执行静态及 SVG 检查。非零退出、缺少 / 重复 TAP 汇总、0 用例、旧基线少于 19 项、失败、跳过、取消或 TODO 均不能生成 offlinePassed=true。

执行前 / 后对固定公开源码、资源和测试根目录计算 SHA-256。指纹包含未提交 / 未跟踪代码，不仅绑定 Git HEAD；执行期间源码变化时离线结果失败。报告只保存相对路径和摘要，不读取 `.env`、私有配置、密钥目录或本机业务数据。没有扫描整个用户目录或修改 Git。

客户端门禁探测注入一个虚构配置环境及不执行网络的 stub，验证 payment.create / state.get 在云初始化之前就被 allowlist 拒绝，平台调用次数为 0；同时检查示例三个支付配置均为 null、旧演示入口关闭、实际 payment 函数目录不存在及会话付款 / 成功页门禁关闭。该探测不是云连接或真实付款测试。

报告使用 OFFLINE_PAYMENT_ACCEPTANCE_EVIDENCE；真实云、来源认证、资金、真机及并发字段均保持 false。输出目录在 `docs/qa/` 下独占创建；路径跳转、复用目录或符号链接拒绝，不覆盖之前的记录。

<a id="p08-payment-acceptance--复跑方式"></a>
## 复跑方式

仓库根目录，Node >=22：

```powershell
npm run verify:payment:offline
<a id="p08-payment-acceptance--或直接使用已安装的-node"></a>
# 或直接使用已安装的 Node：
node scripts/verify-payment-offline.js
<a id="p08-payment-acceptance--指定新的证据目录名只能是-docsqa-的直接子目录不能复用"></a>
# 指定新的证据目录名（只能是 docs/qa 的直接子目录，不能复用）：
node scripts/verify-payment-offline.js --name p08-new-run
```

默认新目录名包含 UTC 时间；脚本输出逐组结果、summary.json 位置和真实验收未通过提示。异常或失败退出码非零；未生成 summary.json 的中断执行也不能算通过。运行超时 / 输出过大时判失败。日志只应作为内部开发证据；真实平台凭证或私人业务内容不能塞入夹具。

报告内 checks 的每个日志都有 SHA-256，sourceSnapshot 包含源码摘要清单及总摘要；sourceUnchanged 核验执行期间变化，totalTests 为三组汇总。后续修改源码必须重新执行，不能沿用旧报告证明新代码。

<a id="p08-payment-acceptance--本次结果"></a>
## 本次结果

最终证据目录：[p08-2026-10-06-final](../../qa/p08-2026-10-06-final/summary.json)。环境 Node **v24.19.0 / win32**；所有分组 0 失败 / 跳过 / 取消 / TODO，前后源码指纹一致。首轮目录保留原结果，验收引用本次最终报告。

| 检查 | 本次结果 | 证据 |
|---|---|---|
| P01–P07 支付专项 | 192 / 192 | [payment.tap](../../qa/p08-2026-10-06-final/payment.tap) |
| 初始化旧基线 | 19 / 19；旧演示语义保留，不能替代 V1 全额支付 | [legacy-baseline.tap](../../qa/p08-2026-10-06-final/legacy-baseline.tap) |
| 其他回归及 P08 证据防误判 | 523 / 523 | [other-regressions.tap](../../qa/p08-2026-10-06-final/other-regressions.tap) |
| 全部测试 | **734 / 734** | [summary.json](../../qa/p08-2026-10-06-final/summary.json) |
| 静态 / 主分包 | **283 文件通过**；4 主包页面 / 16 分包页面；1239 / 127 / 45 KiB 源估算 | [static.txt](../../qa/p08-2026-10-06-final/static.txt) |
| SVG 索引 / 引用 | **41 个通过** | [icons.txt](../../qa/p08-2026-10-06-final/icons.txt) |
| 当前付款门禁 | 平台调用 0、实际购买及成功页关闭 | summary.json runtimeBoundary |
| 真实实付 / 退款 | **未执行** | [真实验收记录](../../PAYMENT-CLOUD-ACCEPTANCE.md) |

新增 5 项 P08 回归：退出码优先、跳过 / 空执行不能通过、缺失 / 重复 / 矛盾汇总不能通过、旧基线少于 19 项拒绝、已配置环境也不能绕过支付 allowlist。另实跑目录越界 / 复用负面检查，两者退出码 1，没有覆盖原证据。前轮的 8 项复审问题已关闭；本次离线测试未发现资金 P0。实际 SDK / 验签 / 资金仍无证据，不能据此排除真实接入问题。

<a id="p08-payment-acceptance--阶段验收矩阵"></a>
## 阶段验收矩阵

| Task | 当前离线证据 | 正式验收仍缺 |
|---|---|---|
| P01 | 24 项；配置作用域 / 单一候选、授权窗口、密钥引用及恢复边界 | 选定方案 / 商户关联、实际凭证 / 撤销、旧配置与原授权归档 |
| P02 | 31 项；本人意图、预算、幂等复用、商户号 / 期限、一次发送占权 | handler / SDK、商户全局唯一、真实 prepay 参数和发送期限 |
| P03 | 29 项；来源注入、金额 / 本人 / 时间、双去重、资金 / 资源原子性 | 原字节验签解密或可信平台转发、HTTP 应答、SDK 并发 |
| P04 | 37 项；查单 / 关单、取消竞争、迟到款全额意图、预算 / 资源 | 真实查询 / 关闭、平台结果映射、实际竞争与恢复调度 |
| P05 | 22 项；回调仅查询、未知不另付、终态 / 累计不回退、乱序与期限 | 本人 DTO / 读集、持久请求、唤起参数、订单入口 / 成功页及真机 |
| P06 | 25 项；退款预算、原号恢复、平台号绑定、秒级精度、逐写回滚 | 商家授权 / 审批创建、实际提交 / 查询 / 通知、原号限频及资金 |
| P07 | 24 项；候选 / 租约 / 运行、完整 scope 对账、未发送告警 | 真实扫描 / 账期 / 分页、领域接线、可信账单、负责人 / 送达 / 处置 |
| P08 | 一键离线证据、旧 19 项基线、734 全套、源码指纹与验收清单 | 至少一笔允许环境受控小额真实付款及退款，核对平台金额与账本 |

没有页面更改或本轮截图。P05 真机和实际包体不能用静态 / Node 检查替代。所有原子竞争测试为串行内存 / 注入失败，不能证明实际云数据库的唯一索引、幻读保护或跨实例竞争。

<a id="p08-payment-acceptance--真实验收执行顺序与记录模板"></a>
## 真实验收执行顺序与记录模板

下表是待执行计划，**全部 NOT_RUN**。当前不操作资金。先完成 E01 / E03 / E14，登记版本、权限、实付金额 / 次数 / 时间窗与退款安排；不能用示例预算或隐含授权代替。原始回调、密钥、签名和完整手机号 / 地址不进入公开证据，使用内部脱敏业务记录引用。

每次记录至少包含：UTC 执行时间 / 本地时区、stage / environment / AppID、唯一 provider / 商户关联凭据引用、部署版本及源码指纹、授权安排引用、操作者及门店作用域、脱敏 order / payment / refund / event / requestId 引用、币种 / 总额 / paid / refunded / reserved、各版本及资源前后计数、平台账单引用、实际结果 / 差异 / 处置责任人。未知状态如实保留，不能填“已退款”或“已关单”。

| 场景 | 操作与实际应核对结果 | 当前 |
|---|---|---|
| R01 配置 / 权限 | 验证 AppID–商户–环境关联、凭证范围；两顾客互查 / 代付订单拒绝，撤销角色敏感操作拒绝，客户端直写财务集合拒绝。 | NOT_RUN |
| R02 正常付款 | 受控小额订单，金额取云报价；只一笔实收，订单 PAID、库存及独立时段 HELD→CONFIRMED、预算 reserved→used、日志一致。工具 / 真机各留证据。 | NOT_RUN |
| R03 重复 / 丢响应 | 相同 / 不同 key、多设备并发或预支付响应丢失；只一笔未决意图 / 发送权 / 实收；查询恢复原号，不盲建第二笔。 | NOT_RUN |
| R04 来源 / 业务异常 | 伪造来源、错商户 / AppID / 单号 / 金额 / 币种 / 付款者；拒绝正常入账，真实本店异常资金持久隔离；不得释放或恢复履约。 | NOT_RUN |
| R05 丢 / 重复通知 | 未收到通知时主动查单恢复；通知和查询并发、重复事件及同交易不同事件，付款 / 资源 / 预算只入账一次；持久处理后才应答。 | NOT_RUN |
| R06 取消 / 关单竞争 | 支付与关单 / 取消并发；NOTPAY、ACK 或未知都不释放。只在可信 CLOSED 后取消释放一次；已付按实收处理，资源与资金可解释。 | NOT_RUN |
| R07 迟到款 | 已关闭 / 取消后资金到账；保留取消，登记唯一全额退款意图并生成可操作告警，已释放资源不恢复制作；实际退款后核对金额。 | NOT_RUN |
| R08 部分 / 全额退款 | 合法同店审批；拒单退足实付，部分 / 多次部分累计加预留不超实付；受理不作成功。至少一笔真实退款与平台账单、意图、订单一致。零金额无资金意图。 | NOT_RUN |
| R09 退款弱网 / 乱序 | 提交或查询丢响应、重启、重复结果、旧失败晚到；查询超时仍可查原号，不多退；平台号及秒级成功时间稳定，FAILED 保留额度。 | NOT_RUN |
| R10 真机继续支付 / 成功页 | success / cancel / fail 都查询后端；未知显示确认中，跨实例请求恢复；后端 PAID 才展示历史商品 / 履约 / 时段 / 门店 / 地址的成功页。 | NOT_RUN |
| R11 补偿 / 对账 / 告警 | 真实定时任务、租约竞争 / 重启，领域服务重读当前版本；完整认证账单与同 scope 本地窗口对齐。差异、长未知、补偿失败有负责人 / 送达 / 处置记录。 | NOT_RUN |
| R12 SDK 原子性 / 唯一性 | 商户号 / 交易号 / 退款号跨环境全局唯一、完整查询 / 不存在条件保护；实际并发及故障注入没有半笔订单 / 预算 / 资源 / 日志。 | NOT_RUN |

P08 整体通过条件：上述适用场景有真实证据；至少一笔受控实付及真实退款与平台金额闭环；可信通知 / 查询 / 关闭 / 退款及恢复链可核对；旧基线 / 新回归通过；没有未关闭资金 P0。负责人应核对 evidence 的实际版本，不能自动把 offlinePassed 转为正式通过。

<a id="p08-payment-acceptance--下一步"></a>
## 下一步

用户已授权外部条件缺失期间继续离线开发。下一项可推进 **A01 商家角色 / 授权 / 撤销的离线边界**；正式管理员入口、授权执行和资金运营依赖 P08 / D06 实际门禁，不能因为转入下一阶段就标为开放。继续沿用 V1 全额支付，不回退旧 staff PIN / 模拟付款。

---

<a id="phase-7-execution"></a>

## 原记录：PHASE-7-EXECUTION.md

<a id="phase-7-execution--阶段七-payment-执行记录2026-10-05"></a>
# 阶段七 Payment 执行记录（2026-10-05）

沿用开发计划 P01–P08。V1 全额支付，无定金 / 尾款，不开放模拟付款。用户允许先推进离线工作；真实账号 / 云与资金门禁保留。

| Task | 当前结果 |
|---|---|
| P01 支付方案 / 配置隔离 | 服务端配置形状、单一候选、环境 / 密钥作用域、实付授权 / 恢复边界本地通过；实际选型 / 账号关联 / 接入 / 验收待补 |
| P02 本人预支付 / 复用 / 查单恢复 | 内部意图 / 独立商户单号、预算事务、跨 key 复用 / 一次发送占权 / 未知要求查单本地通过；真实预支付 / 查单 / READY 参数和 SDK 待补 |
| P03 通知 / 原子入账 | 来源注入边界、业务核验、通知 / 交易双去重、原子入账 / 资源确认及异常资金隔离离线通过；真实验签 / 转发认证、HTTP 应答 / SDK 与资金验收待补 |
| P04 查单 / 关单 / 迟到款 | 内部查询恢复、关闭占权 / 可信 CLOSED、O05 两步释放及全额补偿意图 / 告警需求离线通过；真实查询 / 关闭 / SDK / 资金竞争与调度待补 |
| P05 真机支付 / 成功页 | 支付会话 / 继续支付请求 / 结果恢复契约离线通过；真实预支付参数、持久请求、唤起 / 页面与真机验收待补 |
| P06 退款 | 已有意图发送占权、原号重试、可信结果入账 / 查询恢复与预算一致性离线通过；真实审批 / SDK / 退款资金闭环待补 |
| P07 补偿 / 对账 / 告警 | 候选任务 / 租约、运行记录、完整归一化窗口对账和告警需求离线通过；真实扫描 / 领域接线 / 账单认证 / 调度 / 消息处置待补 |
| P08 阶段验收 | 离线矩阵 / 一键证据通过：734 测试、旧 19 项、源码指纹 / 关闭门禁；整体未通过，真实小额付款 / 退款及 SDK / 真机证据缺失，见 [P08](phase-7.md#p08-payment-acceptance) |

P01 新增纯模型和全部 null 的示例配置，未注入 handler 或客户端。明确两种未选定候选验签链、受控新付款的范围 / 时间 / 预算与既有资金恢复分离，计划恒不可执行。官方接口核对发现内部摘要订单号超出商户号长度、外部接口会调整付款有效期；登记独立唯一编号及不延长原订单截止的 P02 要求。

新增 24 项，全套 544/544，静态 255；源包体 1213 / 97 / 45 KiB。没有 UI 变化、微信 / 真机或真实云验收，没有提交 / 推送 / 上传 / 部署，既有未提交成果保留。详见 [P01](phase-7.md#p01-payment-configuration)及[支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)。下一项 **P02 可离线预支付意图、复用与查单恢复**，P01 整体仍未验收完成。

P02 追加内部意图模型 / 事务服务。创建原子占预算 / 写唯一意图 / 引用回执，一次发送权先提交；重放、跨 key 与响应丢失只复用或要求查单，不再编号或占预算。期限取整不延长原订单，O05 不走无支付释放；没有外部适配器 / 真实查询 / READY 参数 / 已关闭重付。受控预算集合与权限草案追加为 26 集合，未部署。

新增 30 项，专项 30/30、最新全套 574/574、静态 259，包体不变。详见 [P02](phase-7.md#p02-payment-intents)。保留全部工作，没有 UI / 微信 / 云或资金验收与提交 / 推送 / 上传 / 部署。下一项 **P03 可离线可信通知业务核验、事件去重与原子入账**；实际 P01 / P02 与整个阶段门禁未完成。

P03 新增内部通知模型 / 事务服务。来源验证由受信任适配器注入，夹具仅以对象身份模拟，不是密码学验签；客户端布尔字段 / success 无效。业务核对原绑定、单号 / 本人映射、CNY 全额、成功时间及意图；事件 / 商户交易守卫双去重，正常支付 / 预算 / 整单 CONFIRMED / 订单 / 最终日志同事务。错业务及取消 / 迟到 / 已关闭等异常资金隔离，不恢复履约，不假退款；同秒成功保留原时间 / 精度并计算合法 paidAt 下界。

新增 28 项，全套 **602/602**、静态 **263**；源估算 1213 / 97 / 45 KiB。逐写异常 / 零行全回滚、重复与响应丢失、资金异常 / 撤销 / 预算、秒级时间及 O03 / O06 兼容通过。没有真实来源适配器、HTTP / SDK / 资金验收或 UI / 微信 / Git 操作。见 [P03](phase-7.md#p03-payment-notifications)。下一项 **P04 可离线主动查单 / 关单协调、取消竞争与迟到款补偿意图**；P01–P03 整体实际门禁仍未完成。

P04 追加内部恢复模型 / 服务；先记 QUERY / CLOSE 请求，认证结果关联原绑定 / 单号 / 版本。成功查询复用 P03 资金入账与交易守卫；NOTPAY / 关闭 ACK 或未知不释放，CLOSED 后 O05 重读取消。关闭预算只返 reserved，已付 / 迟到不会重置 used；补偿保留取消、释放 HELD、记全额 PENDING / RESERVED 退款意图与告警需求，不执行退款或告警。O06 两条新增日志及历史快照兼容。

新增 **37 项**，全套 **639/639**、静态 **267**；源包体 1213 / 97 / 45 KiB。共用接线、原版本重试与异步认证提交顺序的首轮问题已修复 / 校正，不放宽规则。详见 [P04](phase-7.md#p04-payment-recovery)。没有实际来源 / SDK / 调度 / 资金验收、UI / 微信或 Git 操作。下一项 **P05 可离线支付会话、继续支付与付款结果恢复契约**；实际唤起与真机 / 成功页、P01–P04 整体与正式门禁仍待补。

P05（2026-10-06）完成离线 payment-session：本人订单绑定候选状态摘要、版本 / 金额 / 截止与资金轴校验、同版本幂等键复用及 ticket 失效。客户端付款 success / cancel / fail 与预支付完成均只要求 state.get，未知不开放另一笔付款；PAID_REPORTED 仍不能进入实际成功页，取消 / 退款提示独立。意图观察可同订单版本变化，已付 / 已关闭不回退，客户端到期锁存不因时钟回退重新开放。

新增 19 项，最新全套 **675/675**、静态 **274**、SVG **41 个**通过，主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。基线已包含本次 UI 的 17 项新回归。模型只生成不可调用计划，键仅实例内存；实际 DTO / handler / 完整意图读集、跨实例持久恢复、参数 / 真机 / 成功页均待补。详见 [P05](phase-7.md#p05-payment-session)。没有 UI 变动、微信 / 云 / 资金验收或提交 / 推送 / 上传 / 部署，保留全部既有未提交改动。下一项 **P06 可离线退款意图执行边界 / 查询恢复 / 预算一致性**，P05 整体与阶段七真实门禁未通过。

P06（2026-10-06）新增内部 refund-model / service：已有获批 RESERVED 意图原号发送占权、尝试与结果去重、未知只查询、失败不释放、可信成功减少占用并增加累计已退。完整本人订单资金 / 审批日志 / 全部意图核对、版本读集保护及平台退款号守卫；旧失败不覆盖新尝试或成功。O06 两种退款日志与固定公开提示、双履约 O03 / P04 迟到补偿历史详情组合通过，不改变履约 / 资源。

新增 19 项，全套 **694/694**、静态 **278**、SVG **41 个**通过；源包体 **1239 / 126 / 45 KiB**。仅串行内存 / 对象身份来源夹具，实际审批创建、商家角色、退款提交 / 查询 / 通知、原号重试平台能力、超时调度 / SDK / 唯一索引与资金验收均待补。详见 [P06](phase-7.md#p06-refund-recovery)。没有 UI / 微信 / 云 / 资金操作或 Git 提交 / 推送，全部现有工作保留；P06 整体与阶段七门禁未通过。下一项 **P07 可离线补偿 / 对账 / 告警边界**。

P07（2026-10-06）新增内部 maintenance-model / service：完整可信未决快照选支付查询 / 退款查询 / 资金或关闭复核；同实体版本任务去重，租约 / token / 版本及提交前截止保护、延迟重试 / 上限转人工需求。运行日志与任务终态原子，恢复未知不直接再收费 / 退款。完整相同范围的归一化账本核对业务引用 / 金额 / CNY / 状态 / 平台号，重复流水拒绝，差异报告及脱敏未发送告警持久化，不改账。

新增 23 项，全套 **717/717**，静态 **281**、SVG **41 个**通过；源包体 **1239 / 126 / 45 KiB**。仅串行内存 / 对象身份来源及候选策略，真实扫描 / 定时部署、领域服务与超时接线、账单认证 / 窗口映射、角色 / SDK 并发、告警负责人 / 渠道与处置尚未接通。没有 UI / 微信 / 云 / 资金或对外消息、没有 Git 提交 / 推送，保留全部改动。详见 [P07](phase-7.md#p07-maintenance-reconciliation)。下一项 **P08 阶段七离线评审 / 可复现证据 / 真实验收清单**；P07 和阶段七整体门禁未通过。

<a id="phase-7-execution--p01p07-顺序代码复审2026-10-06"></a>
## P01–P07 顺序代码复审（2026-10-06）

用户要求从 P01 逐部分审查。顺序检查模型、服务、共享校验、客户端契约、夹具及阶段记录，修复 8 项：P02 发送遗漏完整支付历史；P03 选中意图未匹配完整读集；P05 终态 / 关闭观察及已退累计回退；P06 查询无超时出口、受理平台号未绑定、秒级时间误拒；P07 本地账本 scope 缺校验。P01 / P04 未发现新的确定性缺陷，P04 同步新退款精度字段。

新增 12 项回归，修复前两批分别复现 7 / 2 项失败（关闭观察追加路径属于同一问题）；修复后全套 **729/729**，支付专项 **192 项**，静态 **281**；主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。详情、代码定位、失败 / 最终 TAP 证据及真实接入缺项见 [顺序复审报告](phase-7.md#phase-7-review-2026-10-06)。

内部退款服务必填 queryRetryAfterMs，仅允许超时重查原号，不重新 SUBMIT 或释放。退款证据新增 occurredAtPrecisionMs，意图新增 settledAtPrecisionMs（未成功 null，成功 1 / 1000）；保留原时间。受理时绑定平台身份并原子持久化，不入账。对账两侧必填四项 scope。未部署数据库，旧缺字段离线记录应重建，不默认推断精度。

没有改页面 UI，没有微信 / 真机 / 云 / 资金 / 对外消息、提交 / 推送 / 部署。全部既有未提交改动保留。P01–P07 代码复审完成，整体实际验收仍未通过；下一步以报告整理 P08 离线证据，真实门禁仍按支付云验收待 E01 / E03 / E14。

<a id="phase-7-execution--p08-离线阶段验收2026-10-06"></a>
## P08 离线阶段验收（2026-10-06）

一键证据脚本与 5 项防误判回归落地。最终三组 192 / 19 / 523，共 734/734；静态 283、SVG 41，源码前后指纹一致，源包体 1239 / 127 / 45 KiB。目录越界 / 复用拒绝、付款平台探测调用 0。见 [P08](phase-7.md#p08-payment-acceptance)及[最终报告](../../qa/p08-2026-10-06-final/summary.json)。

P08 离线部分通过；真实实付 / 退款、来源认证、SDK / 并发 / 真机和阶段七整体未验收，真实场景 R01–R12 全部 NOT_RUN。没有改 UI、提交 / 推送 / 部署或资金操作。下一项 A01 可离线商家权限；正式运营继续待实际门禁。

---

<a id="phase-7-review-2026-10-06"></a>

## 原记录：PHASE-7-REVIEW-2026-10-06.md

<a id="phase-7-review-2026-10-06--p01p07-顺序代码复审2026-10-06"></a>
# P01–P07 顺序代码复审（2026-10-06）

按 P01 → P07 阅读模型、事务服务、客户端会话、共享校验、夹具、测试及阶段记录，确认并修复 **8 项代码缺口**，新增 **12 项回归**。全套 **729/729**，静态 **281**；主包 / features / legacy 源估算 **1239 / 127 / 45 KiB**。没有改页面 UI，没有微信 / 真机、真实云 SDK / 来源认证或资金验收，没有提交 / 推送 / 部署。既有未提交成果保留。

结论限于当前离线实现。模型依赖尚未实现的可信身份、密码学来源验证和数据库适配器；串行内存事务及对象身份夹具不能证明真实平台资金或并发安全。**P01–P07 整体及 P08 阶段验收仍未通过。**

<a id="phase-7-review-2026-10-06--逐项结果"></a>
## 逐项结果

| 部分 | 审查内容 | 本轮结果 | 专项测试数 |
|---|---|---|---:|
| P01 配置 | 环境 / AppID / 单一方案、凭证引用、授权窗口、冻结快照、恢复与新收费边界 | 未发现新的确定性代码缺陷。重新核对官方下单有效期；真实方案 / 门禁继续待补。 | 24 |
| P02 意图 | 本人权限、完整支付历史、幂等、唯一意图 / 商户号、预算、发送占权和提交期限 | 修复发送前遗漏损坏历史记录。 | 31 |
| P03 通知 | 来源边界、字段 / 付款者 / 时间、双去重、隔离及订单 / 预算 / 资源原子性 | 修复选中意图未与完整支付集合核对一致性。 | 29 |
| P04 恢复 | 请求持久化、可信查询、关闭占权、取消竞争、迟到款补偿及重放 | 未发现新的确定性代码缺陷；补偿意图同步初始化新增时间精度字段。 | 37 |
| P05 会话 | 乱序 / 生命周期、固定金额 / 截止、客户端返回、不可逆状态、退款累计 | 修复终态 / 已观察关闭意图回退、累计已退金额回退两个问题。 | 22 |
| P06 退款 | 审批依据、原支付 / 预算、尝试竞争、丢响应、平台号、时间精度、原子入账 | 修复查询永久占用、受理平台号未绑定、秒级时间误拒三个问题。 | 25 |
| P07 维护 | 候选 scope、租约 / 运行日志、延迟 / 上限、完整对账、未发送告警 | 修复只验证平台侧范围，遗漏本地账本 scope。 | 24 |

合计支付专项 **192 项**，包含在全套 729 项中。“未发现”不等于无缺陷保证，也不等于真实验收通过。

<a id="phase-7-review-2026-10-06--已修复问题与定位"></a>
## 已修复问题与定位

严重性按未来实接后的业务影响评估；当前运行门禁关闭，没有证实已发生资金损失。

| 编号 | 风险 | 复现与影响 | 修复位置 |
|---|---|---|---|
| R01 | P2 | P02 选中意图合法，但完整查询中另有金额错误的 CLOSED 历史，仍能领取发送计划。 | `cloudfunctions/_shared/payment-intent-service.js:74`：发送前验证完整 payments，异常整笔拒绝。 |
| R02 | P2 | P03 按商户号读到意图，完整支付查询却为空或同 ID 不同版本，仍能入账。 | `cloudfunctions/_shared/payment-notification-model.js:154`：选中意图必须精确存在于完整集合，否则隔离证据，订单 / 预算 / 意图 / 资源不变。 |
| R03 | P2 | P05 CANCELLED → 较高版本未付、COMPLETED → PAID，或 CLOSED → UNKNOWN → NONE，接受回退摘要；后者可重新生成付款计划。 | `miniprogram/features/payment/payment-session.js:37`、`:60`：终态不可回退；关闭观察标记跨查询 / invalidate 保留，之后可信 PAID 仍可恢复。 |
| R04 | P2 | P05 部分退款后较高版本可把 refundedCents 清零，覆盖已核验累计事实。 | `miniprogram/features/payment/payment-session.js:62`：已退累计不可减少，冲突进入 CONFIRMING 并隐藏摘要。 |
| R05 | P1 | P06 查询写 STARTED 后丢响应，没有超时出口，后续一直 QUERY_IN_FLIGHT，恢复可能永久阻塞。 | `cloudfunctions/_shared/refund-model.js:76`、`refund-service.js:11`：必填服务器 queryRetryAfterMs 到期后可创建新 QUERY；不改旧尝试终态、不授予新 SUBMIT、不释放额度。 |
| R06 | P1 | P06 ACCEPTED 已返回平台号，但只写守卫、不绑定意图；同意图另一个平台号仍可能被接纳。 | `cloudfunctions/_shared/refund-model.js:148`：受理时原子保存身份 / 事件引用；之后不同非空平台号拒绝，受理仍不是成功。 |
| R07 | P1 | P06 5500ms 提交、平台秒级成功时间为 5000ms，被误当成早于提交而拒绝。 | `cloudfunctions/_shared/refund-model.js:33`、`:90`：显式 1 / 1000ms 精度，核验区间与 SUBMIT 相容；保留原时间 / 精度，不伪造毫秒。 |
| R08 | P1 | P07 本地账本缺 scope 或属于其他环境 / AppID / 商户 / provider，只要记录相同即可 matched。 | `cloudfunctions/_shared/payment-maintenance-model.js:94`：两侧都明确绑定四项 scope；缺失 / 错配不写报告。 |

<a id="phase-7-review-2026-10-06--回归证据"></a>
## 回归证据

新增用例先运行于修复前代码。第一批 99 项中 7 项失败；第二批 51 项中 2 项失败。关闭观察经过 UNKNOWN 的追加复现属于 R03，不另计问题。秒级陈旧 / 未对齐时间的拒绝用例原本就通过，保留为反向边界。随后补查询超时竞争、ACCEPTED 四个写位置异常 / 零行回滚。

- [首批修复前结果](../../qa/payment-review-before.txt)：失败堆栈及摘要。
- [额外边界修复前结果](../../qa/payment-review-boundaries-before.txt)：通知完整集合与关闭观察中间态复现。
- [最终全套 TAP 结果](../../qa/payment-review-full.txt)：729 项通过，0 失败 / 跳过。
- 静态检查：281 个 JS / JSON / WXML，路由 / 组件 / 依赖 / 模板 / 样式及分包归属通过；包体仍以微信编译为准。

仓库根目录可复跑：

```powershell
node --test --test-reporter=tap tests/*.test.js
node scripts/check.js
```

同时复跑原逐写回滚、通知 / 查单共享交易守卫、关闭 / 取消竞争、迟到款 → 退款 → 历史详情、预算抢占、服务重建和丢响应用例。没有真实 SDK 并发、密码学验签或真实资金证据。

<a id="phase-7-review-2026-10-06--契约调整"></a>
## 契约调整

1. `createRefundService` 必填 `queryRetryAfterMs` 正安全整数。测试 1000ms 是合成策略，正式限频与调度负责人待定。到期只重查同一退款号；旧失败不覆盖新尝试，旧可信成功可结清一次。
2. 退款证据新增必填 `occurredAtPrecisionMs`（1 / 1000）；`refunds.settledAtPrecisionMs` 未成功时 null、成功时同原精度。秒级时间必须整秒对齐；完全早于提交、未对齐及未来时间拒绝。P04 创建意图初始化 null。旧离线记录缺字段应重新生成，不可默认伪造精度；未部署数据库，无线上迁移。
3. ACCEPTED / UNKNOWN 携带合法平台号可仅更新意图身份 / 事件引用，订单资金、预算及履约不改；事件 / 守卫 / 尝试 / 身份更新同事务。
4. 本地窗口与平台窗口都必填 `environment / appId / merchantId / provider`。可信事务适配器负责提取，不接受客户端自报 scope / complete。

<a id="phase-7-review-2026-10-06--真实接入仍待补"></a>
## 真实接入仍待补

- **P01：**唯一方案 / 商户关联、密钥与撤销、旧配置 / 原授权归档。现行 profile 禁用、移除或轮换后的旧付款恢复需真实配置策略，不能强行用新绑定替代。
- **P02–P04：**云事务、全局商户编号 / 交易号唯一性、完整查询与不存在条件保护；真实预支付 / 查单 / 关单、验签解密 / 转发认证及持久处理后的 HTTP 应答。
- **P05：**本人 state.get / 完整意图归一化、按账号 / 环境持久化请求、参数来源 / 期限、wx.requestPayment、订单按钮 / 成功页及真机。
- **P06：**当前商家权限 / 审批意图创建、提交 / 查询 / 通知、错误映射、原号重试 / 限频、时间字段及真实退款。内部 transportPlan 含两个付款引用，实际微信请求必须按官方要求选择 transaction_id / out_trade_no 之一，不可原样发送。
- **P07：**扫描 / 账期 / 时区 / 分页完整性、P04 / P06 接线、可信结果、经营策略、负责人 / 告警渠道及送达 / 处置。RESOLVED 和 matched 不能当资金成功证明。

官方重新核对：[JSAPI 下单](https://pay.wechatpay.cn/doc/v3/merchant/4012791897)的 1 分钟 / 15 天边界；[退款申请](https://pay.wechatpay.cn/doc/v3/merchant/4012791903)的受理 / 终态、原号重试及限频；[退款查询](https://pay.wechatpay.cn/doc/v3/merchant/4012791904)的平台号与秒级 RFC3339 时间。CloudBase 指南本轮读取失败，未据此确认转发能力，仍待核。

下一步以此报告作为 P08 离线证据整理输入；真实门禁仍按 [支付云验收](../../PAYMENT-CLOUD-ACCEPTANCE.md)等待条件。本轮不将 P08 或阶段七整体标为完成。

---

<a id="payment-cloud-acceptance"></a>

## 原技术文档的验收/过程记录：PAYMENT-CLOUD-ACCEPTANCE.md

# 支付真实接入验收记录（2026-10-05）

**所有真实项待补，没有实际支付 / 退款记录。** 用户授权云未开通期间继续离线开发，不等于受控真实资金测试安排已登记。[P01](phase-7.md#p01-payment-configuration) 本地结果不能替代本表。

2026-10-06 P08：当前一键离线结果 734/734，支付专项 192、初始化旧基线 19、其余 523；静态 283、SVG 41、源码前后指纹一致。见 [P08 证据与真实场景 R01–R12](phase-7.md#p08-payment-acceptance)及[本次 JSON 报告](../../qa/p08-2026-10-06-final/summary.json)。本表所有实际项继续待补；下方原测试数字为首次开发轮次记录。

| 事项 | 证据要求 | 当前状态 |
|---|---|---|
| E01 隔离云环境 | 开发 / 测试 / 生产 ID 与 AppID 权限、可信运行时 / SDK / 数据库事务 | 2026-10-08 开发环境存在/关联已核实，函数 total=0；独立 test/production、部署/调用/SDK/数据库待补，见 [环境交接](phase-2.md#cloud-environment-handoff-2026-10-08) |
| E03 商户关联与唯一方案 | 控制台确认 AppID / 商户绑定，选定平台集成或直接 API 一个方案 | 未核实 / 未选定 |
| 实际接口能力 | 所选账号、运行时及 SDK 可下单 / 查单 / 关单 / 退款 / 查退款；对应版本与调用证据 | 未接入 |
| 凭证保管与轮换 | 云端受控引用、现行版本 / 撤销，客户端及日志无密钥 | 只有离线引用约束，未部署 |
| 通知信任边界 | 平台验签后的业务转发认证或服务端原始验签解密；伪造来源与错业务字段拒绝 | P03 注入来源边界 / 业务核验离线通过；实际验签 / 解密 / 转发认证及 HTTP 应答未接入 |
| 环境隔离 | 配置 / 实例 / 回调 / 账本不跨环境，生产无模拟入口 | 离线检查通过，实际待验收 |
| E14 受控实付安排 | 负责人、授权来源、窗口、金额 / 次数上限、退款与异常处理及持久预算 | 未登记；P02 占用及 P03 消费 / 去重内存事务通过，真实初始化 / SDK / 对账恢复待补，夹具不是安排 |
| P02 本人预支付与恢复 | 唯一未决意图、商户范围唯一编号、请求未知先查单、真实短期唤起参数及期限 | 离线事务 / 复用 / 一次占权通过；真实预支付 / 查单 / READY 和关闭后重付未接入 |
| P03 入账及资源确认 | 来源真实性、总金额 / 付款者 / 单号 / 时间、通知 / 商户全局交易双去重、预算 / 订单 / HELD / 日志同事务，失败重试及异常资金持久化 | 离线 28 项通过；实际 SDK、跨环境唯一 / 查询不存在保护、真实资金与持久处理后通知应答待验收 |
| P04 查单 / 关闭 / 迟到款 | 实际认证查询补通知、关闭未知 / 已支付 / 并发、可信 CLOSED 后取消、迟到款全额意图 / 预算 / 资源及告警 | 离线 37 项通过；真实查询 / 关闭 / 调度 / SDK 和真实资金竞争待补；退款 / 告警只有持久需求 |
| P05 支付会话 / 结果恢复 | 真实唤起、未知不重复付款、持久请求恢复及已付成功页 | 离线 19 项通过；真实参数 / adapter / 跨实例持久化 / 真机未接入 |
| P06 退款执行 / 恢复 | 商家审批、原号重试、平台可信结果、额度 / 历史详情及真实退款 | 已有意图处理离线 19 项通过；实际审批与权限、提交 / 通知 / 查询、SDK / 唯一索引与资金闭环待补 |
| P07 补偿 / 对账 / 告警 | 隔离环境定时恢复、完整平台账单、差异处置与告警送达 | 离线 23 项通过；只有任务 / 报告 / 未发送需求，真实扫描 / 接线 / 来源 / 策略 / 负责人 / 渠道 / 处置待补 |
| 真实资金闭环 | 允许的隔离环境一笔受控实付及退款，订单 / 账本 / 平台金额核对 | 未执行 |
| 恢复及竞争 | 丢通知 / 丢响应、查单、关单并发、迟到款、退款重试与告警 | P03 / P04 本地故障通过；真实验收及退款执行 / 告警待 P05–P08 与适配器 |

待条件具备时补脱敏日期、环境 / 版本、业务记录引用与结果；密钥正文不得入仓库或公开证据。受控新付款授权结束后仍须恢复已有资金记录，不能关闭查单 / 关单 / 退款补偿。

