# 云函数工程入口

状态（2026-10-08）：`user.me` / `store.health` 已部署到 development 并经微信工具原生调用复验；SDK 4.0.2、云运行时 Nodejs20.19。user.me 已真实事务创建/读取 users。真机及完整数据权限、唯一冲突、并发资源与回滚仍待验收，见 [实际云复验](../docs/PHASE-2-CLOUD-REVALIDATION-2026-10-08.md)。

V1 按领域逐步创建实际云函数：`user / catalog / cart / checkout / order / payment / address / store / admin`。当前只创建两个有实际逻辑的函数；`_shared/` 为共用源码，不能作为云函数部署。

## 配置约定

- 小程序 AppID 已在现有项目配置中填写；未验证其归属、云开发权限或支付关联。
- 开发、测试、生产环境应分别配置环境 ID；环境 ID 属于配置，支付私钥及 API 密钥只能由云端受控保管。
- 选择实际可用的云函数运行时与 SDK 后锁定依赖，并验证事务能力。不要直接将本地 Node 版本视为云端支持版本。
- 主包通过 `services/` 调用领域接口；遗留 HTTP 服务只在默认关闭的 `legacy/` 子包内使用。
- 面向小程序的函数从可信云上下文获取用户身份；HTTP 支付回调按选定支付方案验证来源，不复用普通用户身份入口。
- 共用代码必须随每个函数部署包携带，或使用经过验证的打包方案；不要依赖部署包之外的相对路径。
- 所有写入私有数据、金额、库存、订单状态及管理员操作的接口都在云端鉴权。客户端隐藏按钮不能代替鉴权。

## 下一步

开发环境已关联，`JJL_APP_ID / JJL_CLOUD_ENV / JJL_STAGE` 已配置。下一步按 D04 方案补真实唯一冲突/多文档事务/资源竞争，并补真机记录。SDK 固定为 4.0.2，两函数各有 lockfile；修改 `_shared/` 后执行 `node scripts/prepare-cloud.js`：user 携带 runtime/native-context/身份及依赖模型，store 携带 runtime/native-context，均无需包外 require。独立 test 仍未确认，不能复用 development EnvId 假装隔离。

原生身份入口须调用 nativeContextForInvocation(cloud, invocationContext)，逐次对比 SCF 当前身份/namespace 与 SDK 元组。不要只依赖 process.env 或 getWXContext 的残留值，也不要从 event 接收平台第二参数。user 将校验后的身份快照绑定仓储直到事务提交，响应/日志不回显 OPENID 或完整上下文。首次创建仅默认顾客，admin_roles 保持空，不自动授权。

调用格式：`{ action: 'me', payload: {} }` 对应 user；`{ action: 'health', payload: {} }` 对应 store。统一返回 `{ ok, requestId, data }` 或 `{ ok: false, requestId, error: { code, message } }`。不使用请求中身份 / 角色字段；不返回完整 OPENID。函数不是 HTTP 支付回调入口。

完整操作与待验收边界见 [阶段一执行记录](../docs/PHASE-1-EXECUTION.md)。然后按数据模型阶段建立集合、索引与权限规则。

参见 [开发计划](../docs/DEVELOPMENT-PLAN.md) 与 [项目审查](../docs/PROJECT-REVIEW.md)。

## P01 离线支付配置

2026-10-06 P08 复跑入口：仓库根目录执行 `node scripts/verify-payment-offline.js`（或 `npm run verify:payment:offline`），只跑本地测试 / 检查并在 docs/qa 新建证据目录，不部署或注入现有最小函数。最新 734/734、静态 283、SVG 41；实际支付 / 退款 / SDK 与阶段门禁仍待补，见 [P08](../docs/P08-PAYMENT-ACCEPTANCE.md)。

`payment-settings.example.json` 三个阶段均为 null，不加载到 handler 或小程序；`_shared/payment-configuration-model.js` 仅校验配置并生成不可执行计划。两种真实支付候选尚未选定；密钥只允许云端作用域引用，受控新付款授权到期不应阻断已有资金恢复。没有 payment 部署目录 / SDK 适配器 / 实付调用，也不需要运行 prepare-cloud 将该模型注入现有最小函数。详见 [P01](../docs/P01-PAYMENT-CONFIGURATION.md)和[真实验收](../docs/PAYMENT-CLOUD-ACCEPTANCE.md)。

P02 `_shared/payment-intent-model.js` / `payment-intent-service.js` 只准备内部支付意图 / 测试预算事务和一次发送占权，只有 tests 内存适配器。未知要求 QUERY，实际预支付 / 查单 / READY 参数未实现。payment_test_budgets 候选集合已加入客户端全拒绝草案，未建 / 部署；当前仍只有两个最小函数。详见 [P02](../docs/P02-PAYMENT-INTENTS.md)。

P03 `_shared/payment-notification-model.js` / `payment-notification-service.js` 只提供来源注入后的业务核验、事件 / 商户交易双去重、预算 / 资金 / 资源 / 订单 / 日志原子处理及异常资金隔离。tests 来源只以对象身份模拟，没有实际验签 / 解密、平台认证、HTTP 应答或 SDK；不运行 prepare-cloud 注入现有函数，不增加付款部署目录 / allowlist。真实持久提交后的应答与跨环境唯一保护待验收；隔离资金协调留 P04，见 [P03](../docs/P03-PAYMENT-NOTIFICATIONS.md)。

P04 `_shared/payment-recovery-model.js` / `payment-recovery-service.js` 为注入系统调用 / 结果来源的内部协调器。查询成功共用 P03 QUERY 证据，关闭先占权、CLOSED 后 O05 再取消；迟到款仅原子登记全额退款意图 / 告警需求，不执行查询、关闭、退款或调度。仍只有测试内存适配器、不复制进最小函数、不增加付款入口；实际认证链 / SDK / 资金竞争与发送待接入，见 [P04](../docs/P04-PAYMENT-RECOVERY.md)。

## A01 离线商家授权

2026-10-06 `_shared/admin-access-service.js` 新增受控初始化、范围内委派、撤销、审计 / 回执事务及本人入口摘要。只有 tests 串行内存适配器，验证器只是合成对象身份；没有真实管理员、admin 部署目录 / SDK handler 或客户端 allowlist。不要运行 prepare-cloud 将它注入现有两个最小函数。新增 32 项，最终 766/766、静态 288；真实 E01 / E12 及阶段门禁仍待补，详见 [A01](../docs/A01-ADMIN-AUTHORIZATION.md)。

## A02 离线商家订单

2026-10-06 `_shared/merchant-order-service.js` 提供当前同店商家列表 / 历史详情和接单 / 制作 / 备妥 / 拒单的内部事务。共用 A01 admin-access-state 校验；原 O07 / O08 工厂在业务事务注入服务器 authorizeMerchant 和完整权限栅栏，不改变自提 HMAC / 完成策略。拒单仅预留原实付剩余额退款，不调用平台；已有待审取消需 A06 显式审批。

新增 34 项，全套 800/800、静态 292，源包体不变。没有 admin 部署目录 / SDK handler、客户端 allowlist / UI 接线或真实资金操作，不通过 prepare-cloud 注入现有最小函数。实际越权 / SDK 并发 / 退款号唯一 / 页面 / 真机待条件，见 [A02](../docs/A02-MERCHANT-ORDERS.md)。

## A04 离线商家目录 / 库存

2026-10-06 新增 _shared/merchant-catalog-model.js / merchant-catalog-service.js，覆盖同店读取 / 分页、完整 SKU 保存 / 上下架 / 归档、库存配额下限、审计 / 回执事务；复用严格 A01 scope 与目录 / 媒体 / 资源模型。没有 admin 部署目录 / SDK / handler / allowlist，全部 OFFLINE 门禁 false，不运行 prepare-cloud 注入现有最小函数。

31 项专项，全套 859/859、静态 298；旧 O03 quote 在改价 / 下架 / 库存版本变化后拒绝，已有订单 / 图片 / 占用不变。只有串行内存适配器，正式资料 / 页面 / SDK / 索引 / 并发未验收；见 [A04](../docs/A04-MERCHANT-CATALOG.md)。

## A05 离线门店 / 配置维护

2026-10-06 新增 _shared/merchant-store-model.js / merchant-store-service.js。同店 CONFIG_WRITE、门店资料 / 停业、不可覆盖配置版本发布、未来已建时段 / 禁约 / 占用保护、商家读取 / HMAC 分页、审计 / 回执通过。服务端地图 token、定位 / 正式经营政策 / 电话验证依赖注入的可信事务适配器，不以草稿字段自证批准。无 admin 部署目录 / handler / allowlist 或 SDK；全部 OFFLINE 门禁 false，不运行 prepare-cloud。

32 项专项，全套 891/891、静态 302；O03 旧 quote 重验拒绝、A02 禁约时段已确认订单仍可接单 / 制作，历史快照和占用保留。SDK 完整谓词 / 负读 / 索引 / 事务预算、真实地图 / 批准资料 / 页面未验收。见 [A05](../docs/A05-MERCHANT-STORE.md)，下一项 A06 可离线部分。

## A06 离线取消审批 / 退款异常 / 财务与审计读取

2026-10-06 新增 _shared/merchant-resolution-model.js / merchant-resolution-service.js / merchant-finance-read-service.js。本人已付请求与同店明确审批、资源 / 新预算原子处理、原号 P06 重试 / 查询恢复、财务 / P07 异常 / 独立 AUDIT_READ 读取通过。只新增 PLANNED exceptions.list（registry 61），没有 admin SDK / handler / allowlist / 资金调用，门禁 false，不运行 prepare-cloud。

37 项专项，全套 928/928、静态 307；原 key 重放无二次发送、未知只查、失败保留预算、独立可信结果一次到账。制作后 SLOT 策略未知拒绝，实际身份 / SDK / 唯一 / 资金 / 商家页面与 RF01–RF07 未验收，详情 [A06](../docs/A06-MERCHANT-RESOLUTION.md)。下一项 A07 可离线阶段评审 / 真正运营与旧入口退役清单。

## A07 离线阶段评审

`npm run verify:admin:offline -- --name <新证据目录名>` 保存分组回归 / 静态 / 图标 / 源码指纹与关闭门禁证据；终稿 937/937、静态 310、SVG 41。59 个 PLANNED action 实际 client 拒绝，平台探测 0；旧演示隔离，legacy 子包尚未从正式产物退役。

没有新 admin handler、SDK / 页面 / allowlist 或 prepare-cloud / 部署。阶段八整体及 AG01–AG10 待真实身份、SDK / 查询栅栏 / 索引 / 并发、页面 / 真机与资金验收。见 [A07](../docs/A07-ADMIN-ACCEPTANCE.md)。下一项 Q01 可离线构建 / 独立部署依赖 / 配置核验准备，不能直接上传 _shared 当完整领域函数。
