# D06：身份、所有权与数据库权限

日期：2026-10-03。权限方案版本 v1-access-2026-10-03。状态：服务端纯模型 / 离线回归与安全规则草案；未部署，未接入现有 user.me / store.health。实际云身份 I03、两个真实账号越权、即时撤销和直写拒绝仍待环境。初始管理员真实身份 E12 尚未提供。

## 身份来源与持久化边界

信任链为 cloud.getWXContext() → 匹配服务端 AppID / environment / stage → 本环境 users 记录 → 本人或当前门店授权 → 领域校验 → 事务 → 白名单 DTO。OPENID / APPID / ENV 必须来自 SDK 的可信上下文，不从 event、payload、URL、缓存角色或旧 staff PIN 取值。[微信服务端 SDK 类型定义](https://github.com/wechat-miniprogram/wx-server-sdk/blob/master/index.d.ts)列出了这些上下文字段；本项目实际部署时仍需 I03 核验上下文与调用来源。

identityFromPlatform(context,settings) 产生内部映射对象 _id/environment/appId/openId；_id 为 D04 scopedDocumentId('user',[environment,appId,openId])，完整 SHA-256 与 JSON 元组分帧，不用 16 位 subjectHash，不把 unionId 当本应用 owner。该对象含平台标识，不返回客户端或打印日志。平台元组在 users 字典中已有，不新增集合字段。

首次登录需未来 User 服务按该确定性 ID 原子创建一次 users；并发登录不得覆盖已有 profile / 默认地址 / status / version。不得由客户端指定用户 ID、status 或权限。当前没有写库，缺记录抛 USER_NOT_PROVISIONED，不返回伪造 ACTIVE 用户。已有记录必须与完整平台元组及确定性 ID 相符；不自动迁移未知旧 ID。

resolveCustomer(context,settings,user) 只接受匹配的 schemaVersion=1、非负安全整数 version 和 ACTIVE 用户，DISABLED 拒绝；返回冻结内部 principal：type=CUSTOMER、subjectId、environment、appId、userVersion。WeakSet 标记限制复制 / JSON 反序列化 / 自造对象被当作本模块已解析身份，不能代替平台认证。context/settings/user/roles 仍必须由可信服务构造；服务若把请求身份当 SDK 上下文传入，纯模型无法识别。

每个请求重新加载 users，principal 不跨请求缓存或持久化，不是客户端 session / token。敏感修改须在事务中重查用户及角色，并核验相应版本；userVersion / roleVersion 仅是计划证据，不是已经实现的数据库锁。

## 个人与公共读取

requireOwner(principal,record) 对可信数据库记录比较 ownerId=subjectId，并返回 D01 / D03 接口使用的 CUSTOMER actor。不接受请求自报 ownerId 来替换数据库字段；先由正确环境中的服务读取实体。地址、袋、收藏、报价、订单使用同一边界，顾客请求中的 userId/ownerId/role/status/金额不写入模型。

列表服务端强制 ownerId 条件，分页游标绑定同环境 / 主体 / 查询与排序；先限权再分页，不能全表读取后按前端条件筛选。未找到与无权访问实体在网络 handler 层采用统一公开结果，防止猜 ID 泄露；当前纯模型 FORBIDDEN 为内部错误。

order_items / order_logs / cancellation_requests / payments / refunds 等关联记录先加载父订单并检查本人或对应门店能力，再按 orderId 查询和投影；不能用 requireOwner 检查一个没有 ownerId 的子记录来代替父记录授权。地址更新不改变已创建订单快照；自提结果剔除配送隐私。

公共目录及门店资料通过接口投影，不直接公开原文档。发布分类、ON_SALE 商品与其同店 ON_SALE SKU、正式门店必要资料才可返回；下架 / 草稿不可通过详情 ID 绕过。价格 / 规格由 D03 校验，媒体只输出公开引用。完整配置、原始资源需求 / 计数、角色 / 平台映射、成本、资金报文、地理评估指纹不进公共 DTO。字段清单沿用 [DATA_MODEL.md 读模型](DATA_MODEL.md#客户端读模型与隐私边界)；投影 handler 与完整 DTO 留 D07 / 后续领域，当前没有新公开读取接口。

## 商家能力与门店范围

admin_roles 每次敏感操作按可信 subjectId 查询本环境最新记录。能力词表严格六项，无 wildcard，空能力不放行。ACTIVE 必须 revokedAt=null；REVOKED 必须有正整数撤销时间且无访问权限。角色 _id / schemaVersion / version / subjectId / 门店与能力数组需有效；重复门店 / 能力 / 角色 ID 或未知能力拒绝。

requireStoreCapability(principal,roles,storeId,requiredCapabilities) 必须由同一条 ACTIVE 授权同时覆盖用户、该门店和全部要求能力；不拼接不同门店或拆分授权组合能力。返回 STORE actor 只含本次门店 / 能力以及 grant{roleId,roleVersion,userVersion}，不散播整份授权范围。多条授权可用于不同职责，但复合操作需明确完整授权。

| 操作 / 读取 | 必要能力与范围 |
|---|---|
| 商家订单列表 / 详情、接单、制作、就绪、配送、核销、确认送达、拒绝取消申请 | ORDER_OPERATE + 当前订单 storeId |
| 批准已付取消（含批准 0 元退款）、商家拒单全额退款 | 同一角色 ORDER_OPERATE + REFUND_APPROVE + 当前订单 storeId |
| 独立售后退款审批、必要退款异常摘要 / 经服务核实的重试编排 | REFUND_APPROVE + 当前订单 storeId；金额 / 幂等 / 资金证据仍需领域校验 |
| 商品 / SKU / 素材发布维护 | CATALOG_WRITE + 目标 storeId |
| 门店 / 预约 / 配送配置维护 | CONFIG_WRITE + 目标 storeId |
| 角色授权 / 撤销 | ROLE_MANAGE + 目标角色所有门店；另需委派边界校验 |
| 脱敏审计读取 | AUDIT_READ + 查询 storeId；无关门店与全局初始化审计不可自动放行 |

能力是技术词表，不替用户选择人员职责。CATALOG_WRITE / CONFIG_WRITE / ROLE_MANAGE / AUDIT_READ 不隐含 ORDER_OPERATE 或 REFUND_APPROVE。退款审批不能伪造实收 / 退款成功事件，不授权读取平台原始报文或密钥。商家个人地址 / 袋仍按 CUSTOMER 本人权限访问。

planUserOrderCommand(order,command,principal,roles,args) 先按上表解析 actor，再复用 D01 planOrderCommand 的状态、金额、版本与 requiredEffects。本人允许 CANCEL_UNPAID / REQUEST_CANCELLATION / COMPLETE_DELIVERY；自提核销须门店 ORDER_OPERATE 和未来有效凭证。PAYMENT_CONFIRMED / 过期任务不在用户命令白名单，六项商家能力也不能调用。原 D01 函数保留为内部工具，网络入口不能跳过包装接受 event.actor。系统处理器验证与支付入口在对应领域落实，当前没有可调用的 SYSTEM 身份工厂。

## 授权与撤销流程设计

初始管理员由受控运维流程核验真实微信身份，指定最小门店 / 能力，并写授权与审计；E12 缺身份，不生成管理员、白名单或示例 PIN。初始化不能作为普通客户端 action，不从首次访问者自动授予管理员。

角色管理服务除 ROLE_MANAGE 外，保证目标门店和委派能力不超过操作者当前授权；禁止本人通过此流程修改自身角色、追加无关门店或扩张能力。撤销不删除记录：按版本设 REVOKED、revokedAt、version+1 并审计。全局授权需独立受控运维入口。2026-10-06 [A01](archive/stages/phase-8.md#a01-admin-authorization) 已补内部离线事务：同一当前授权覆盖完整委派范围，角色 / 脱敏审计 / 回执原子；初始化独立受控 / 一次性。真实人员 / 入口 / SDK 仍未接入，不能只调用 requireStoreCapability 就直接写 admin_roles。基础 D06 guard 保持原兼容边界，A01 服务额外校验环境、应用、角色主键、时间与审计引用。

撤销后下一次操作重新读角色即拒绝，不信任登录时角色或入口状态。进行中的敏感事务需角色 / 用户版本与状态的并发校验，和业务写入原子提交；若 SDK 无法保证读集冲突，须验证可用写入栅栏 / CAS 方案，不凭纯函数保证撤销竞态。检查失败或资金状态未知不继续副作用。管理入口显隐只改善体验，直接打开页面、调用函数也要鉴权。

## 数据库安全规则草案

[security-rules.draft.json](../cloudfunctions/database/security-rules.draft.json) 是本地清单，25 个目标集合全部普通客户端直接 read/write/create/update/delete=false；包含公开目录集合，因为公开读取经投影接口进行。新增集合默认拒绝，先补清单 / 字典。初始化规则须在集合可访问前完成并逐集合读回核验。

清单外层 schemaVersion/policyVersion/status/clientAccess/collections 是本项目元数据，不是可整体提交的腾讯 API 参数。将每个 collections[name] 规则对象单独配置到集合，明确 false 的五项操作，避免相反的 create/update/delete 覆盖。部署与验收状态只查CURRENT-STATUS。

[CloudBase 官方规则说明](https://cloud.tencent.com/document/product/876/123478)支持 JSON 布尔规则，create/update/delete 未配置时继承 write。[官方云函数示例](https://docs.cloudbase.net/recipes/secure-database-multi-tenant-rules)说明客户端规则不能替代管理员身份运行的云函数内鉴权，因此还需服务端所有权 / 能力检查。草案格式不代表开发环境已验证有效。

云函数调用权限与数据库权限分别管理；I03 / I07 核验实际入口 / SDK / SOURCE 及服务账户。用户入口不得提供任意集合读写。回调、定时任务、受控初始化独立入口，客户端无管理密钥。支付回调 HTTP 入口仍需验签、商户 / 应用 / 金额 / 事件身份与幂等证据。云存储公开素材 / 上传规则另按媒体领域设计，本草案不代表文件权限已完成。

## 验收要求与实现

实现按authorization-model/authorization-wrapper/collection-security-rules及相关测试核对。真实环境分别验证双账号隔离、客户端直读写拒绝、角色/门店范围、撤销并发和初始化授权；不能用调用方提供的角色或本地快照替代身份与权限证据。

[历史D06过程与验证](archive/stages/phase-2.md#authorization-rules)仅追溯当时事实；当前状态不在此维护。
