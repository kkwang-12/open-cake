# 云函数工程入口

状态：已实现并在本地验证 `user.me` / `store.health` 两个最小函数，尚未部署或连接任何云环境。

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

创建开发云环境后，填写 `JJL_APP_ID / JJL_CLOUD_ENV / JJL_STAGE` 并分别部署两个函数，执行开发计划 I03 / I07 的工具与真机身份校验。SDK 固定为 4.0.2，两函数各有 lockfile；修改 `_shared/runtime.js` 后执行 `node scripts/prepare-cloud.js` 同步部署包。

调用格式：`{ action: 'me', payload: {} }` 对应 user；`{ action: 'health', payload: {} }` 对应 store。统一返回 `{ ok, requestId, data }` 或 `{ ok: false, requestId, error: { code, message } }`。不使用请求中身份 / 角色字段；不返回完整 OPENID。函数不是 HTTP 支付回调入口。

完整操作与待验收边界见 [阶段一执行记录](../docs/PHASE-1-EXECUTION.md)。然后按数据模型阶段建立集合、索引与权限规则。

参见 [开发计划](../docs/DEVELOPMENT-PLAN.md) 与 [项目审查](../docs/PROJECT-REVIEW.md)。
