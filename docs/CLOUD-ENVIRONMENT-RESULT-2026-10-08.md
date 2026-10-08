# 开发云环境与 user/store 交付记录（2026-10-08）

**最新结果：第三轮重试网络已恢复 wifi，真实微信模拟器 user.me/store.health、伪造身份保持 customer/同一用户、无效 action/payload 拒绝均通过；此前 network offline 阻塞已解除。真机与云端错误配置项仍 NOT_RUN，I03/I07 整体不标通过。**

时间范围：2026-10-08 10:20–10:36（Asia/Hong_Kong）；以各 JSON 的 ISO 时间戳为准。工作目录 D:\dinner cook。只负责配置、工具登录、开发环境与两个最小函数；不代替主流程的数据层/订单/支付/管理员验收。

## 已完成

- 配置生成器从 project.config.json 读取并校验 AppID；本机显式 AppID 不一致时拒绝，保留公开字段白名单、环境隔离与 legacy 门禁。旧 AppID 不再是默认来源。
- 新建 Git 忽略的 miniprogram/config.local.js；仅 development=cloudbase-d8gwtxzm64150b7e0，test/production 留空。生成 runtime-config.js 为 wx154f791a17268ace、development/shell、enableLegacyDemo=false；共享工程全程未切 cloud。
- 微信 CLI v0.3.11，登录状态 loginExpired=false、versionRelation=equal，无需重新扫码。cloud_env_list 返回确认开发环境；部署前 cloud_fn_list total=0。
- npm 不在 PATH，使用已有 pnpm 临时执行固定 npm@10.9.4。user/store 分别 npm ci --ignore-scripts --no-audit --no-fund，均 exit=0、102 个包；保留各自既有 lockfile。首次 pnpm --store-dir 参数不支持，改用 --config.store-dir 后成功，不把失败计作成功。
- prepare-cloud.js 已同步两份 shared/runtime.js；包外 _shared 不是部署依赖。
- wxide 部署帮助未提供 runtime/envVariables 参数，使用已登录且绑定正确 EnvId 的 CloudBase MCP 创建 user/store（只创建这两个 Event 函数）。Nodejs20.19、index.main、timeout=10 秒，JJL_APP_ID/JJL_CLOUD_ENV/JJL_STAGE 实际回读均为上述 AppID/EnvId/development；两个函数 Active/Available、CodeResult=success、无触发器。未新建 HTTP 路由或改变匿名登录配置。
- 从平台下载代码包，在内存检查实际 wx-server-sdk=4.0.2，两个云包内 shared/runtime.js 与源文件逐字一致；仅保存版本、SHA 和公开配置，不保存下载 URL 或原始云详情。
- 本地配置隔离验证 7/7；现有 cloud.test.js 7/7；当前静态检查 321 文件通过，主包/features/legacy 源估算 1392/153/45 KiB；git diff --check exit=0。这些是本地证据，不是云身份或数据层验收。

部署请求 ID：user ff5a8fa3-4bcc-4f83-bc53-0b1a62acfc25；store 1fb775ce-32f8-4416-98e6-f41584e63cbe。配置回读与包摘要见下列 JSON。

## 已执行云端拒绝验证

管理端 invokeFunction 使用实际部署包，但没有微信原生调用者身份。user 事件伪造 openid/OPENID/APPID/ENV/role 与 payload.role，结果 AUTH_REQUIRED；store 健康调用携带伪造身份同样 AUTH_REQUIRED。两次平台 InvokeResult=0 表示代码执行成功，业务 ok=false 表示正确拒绝；不记为 user.me/store.health 原生成功。

| 函数 | 平台请求 ID | 业务 requestId | 结果 |
|---|---|---|---|
| user | d98bd714-1f63-47b4-b80a-fb8f1d66dbf3 | 9172e3e0-8109-45cd-804c-3449a15f9f00 | AUTH_REQUIRED |
| store | ab61fe92-73cc-484a-a63b-f3793cb52cf0 | 5f4ff3f1-0377-4a10-b523-c4009c0b4d8e | AUTH_REQUIRED |

## 原生验证、历史阻塞与最新结果

隔离工程 artifacts/cloud-env-validation-20261008（项目名 user-store-cloud-validation）复用实际 services/cloud.js 和 errors.js，独立 cloud 配置，仅一个验收页；不复制或改写共享商品/购物袋/地址 UI，不上传小程序。首次 automation_evaluate 异步调用超时；编译打开页面后以 onLoad 实际调用，再同步读取结果，运行时可读。

wx.getNetworkType 实际返回 networkType=none、weakNet=true。控制台 cloud init error: network offline 和 webapi_getwxaasyncsecinfo:fail network offline。user.me 返回脱敏 CLOUD_CALL_FAILED、client-muyx59p7-w6qkbnht；没有云端原生 requestId，不认为成功。用户回复已切正常网络后复核仍 none，重编译再次失败 client-muyxc25a-6avax4xp；已请用户确认隔离窗口的模拟网络设置。没有用 mock 或伪造平台身份绕过。

| 交接验收项 | 当前状态 | 证据/缺项 |
|---|---|---|
| 配置一致/公开字段/共享 shell | PASS | config-verification.json |
| 微信工具登录/开发环境关联 | PASS | wechat-status.json；实际 cloud_env_list |
| user/store 独立部署/运行时/SDK/共享规则 | PASS | cloud-evidence.json、两份 package-verification.json |
| 云端无可信身份且事件伪造身份拒绝 | PASS（管理端） | 两次 AUTH_REQUIRED，不能替代原生身份路径 |
| 工具原生 user.me | PASS | 第三轮真实 wx.cloud 调用 authenticated=true、role=customer |
| 工具原生 store.health | PASS | 第三轮真实 wx.cloud 调用 available=true、development、正确 EnvId |
| 可信微信上下文下伪造身份仍 customer | PASS | role=customer、sameSubject=true；平台请求 ID 已记录 |
| 可信上下文与 AppID/EnvId 不匹配拒绝 | NOT_RUN | 本地回归通过；未改变共享云函数配置做故障测试 |
| 云端缺配置拒绝 | NOT_RUN | 本地回归通过；未改正常开发函数制造故障 |
| 真机 user.me/store.health/拒绝路径 | NOT_RUN | 用户真机操作待补；未上传预览/小程序 |
| 独立 test/production 环境 | NOT_RUN / 未确认 | 当前关联查询只有开发环境，不复制 EnvId、不创建额外环境 |
| 集合/索引/安全规则/SDK 事务与越权 | NOT_RUN | 未获资源清单且属主流程后续验收 |
| 正式经营数据/订单/支付/管理员 | NOT_RUN | 不在本窗口范围 |

I03/I07 保持整体未验收；主流程可接收已完成的配置/部署/依赖与真实无身份拒绝证据，真机、错误配置与独立环境隔离验收仍须补齐。数据库设计/适配不因两个函数已部署而通过。

## 证据与恢复

- [公开部署与云调用](qa/cloud-env-2026-10-08/cloud-evidence.json)
- [配置验证](qa/cloud-env-2026-10-08/config-verification.json)
- [本地/静态/原生状态](qa/cloud-env-2026-10-08/local-and-native-summary.json)
- [微信登录](qa/cloud-env-2026-10-08/wechat-status.json)
- [user 包核验](qa/cloud-env-2026-10-08/user-package-verification.json)、[store 包核验](qa/cloud-env-2026-10-08/store-package-verification.json)
- [首次原生失败](qa/cloud-env-2026-10-08/native-call-result.txt)、[用户切网后复核](qa/cloud-env-2026-10-08/native-after-network-change.txt)

共享工程配置保持 development/shell，新 AppID 与项目一致；隔离工程保留供切网后复验，不会修改共享本机存储。原有未提交/未跟踪文件保留，未 reset/clean/stash/提交/推送；本次未修改 UI、动效、订单/支付/管理员实现或客户端 allowlist，未创建业务集合/导入经营资料/删除云数据/授予管理员/操作真实资金。

CloudBase code-review：按 SEC001 检查两个最小 handler，仅记录 code/requestId/stage，不回显完整上下文/事件/环境；微信身份保持 getWXContext 原生路径，未引入 Web/匿名身份替代。

运行时参考：[CloudBase 官方函数配置](https://docs.cloudbase.net/cli-v1/functions/configs)推荐 Nodejs20.19；实际结果以平台回读和云包为证，不以本机 Node 版本推定云支持。

## 用户要求重试后的复核

时间：2026-10-08T02:38:54.981Z（UTC，对应 Asia/Hong_Kong +08:00）。初次只读网络查询提示 cant find runtimeid by projectpath；编译打开隔离验收页后运行时已恢复。再次实际查询仍 networkType=none、weakNet=true；原生 user.me 再次 CLOUD_CALL_FAILED，client requestId=client-muyxg9up-oq85r666。store.health 与身份/配置原生拒绝项仍 NOT_RUN；不把工具编译成功当作云调用成功。证据 [本轮结果](qa/cloud-env-2026-10-08/native-retry-2.txt)。共享配置经核对仍 development/shell。

## 第三轮重试：原生链路通过

时间：2026-10-08T02:42:17.156Z（UTC，Asia/Hong_Kong 为 +08:00）。用户要求再次重试；重新编译隔离验收页后，getNetworkType=wifi、weakNet=false，实际 services/cloud.js 调用 user.me/store.health 均成功。无 mock/伪造可信上下文；handler 使用 wx-server-sdk.getWXContext()。事件伪造 openid/role 无效，customer 与正常调用 subjectHash 一致（证据仅保存 sameSubject=true，不保存用户标识）；无效 action/admin 与 payload 数组均 INVALID_REQUEST。

| 项目 | 业务 requestId | 平台请求 ID / 结果 |
|---|---|---|
| user.me | dd7d70d4-bb8e-409f-8af7-af3352c86d4f | 客户端包装未透传平台 ID；authenticated=true、customer |
| store.health | 6abeba1f-5e5a-4110-8fb9-310b084b09d7 | 客户端包装未透传平台 ID；available=true、development、正确 EnvId |
| 伪造身份 | 676bcf5f-f03c-424e-a439-d3ce44e063c6 | 84a1cb39-0d6e-48fc-bc89-5e129c41807e；customer、sameSubject=true |
| 无效 action | b58055bb-0540-40f0-ba02-2584f126e5d2 | e0cc1b10-ef5d-4c9c-a7c0-f36c3a0490a4；INVALID_REQUEST |
| 无效 payload | 58b879e5-01e7-414e-8e6a-5920730372ed | 54687261-76d1-43ac-82a6-50ac6438c0d3；INVALID_REQUEST |

[完整脱敏断言与结果](qa/cloud-env-2026-10-08/native-verified-summary.json)、[原生工具返回](qa/cloud-env-2026-10-08/native-retry-3.txt)、[网络状态](qa/cloud-env-2026-10-08/network-retry-3.txt)。历史失败记录保留，当前网络阻塞已解除。真机、可信 AppID/EnvId 不匹配与缺配置的云端拒绝、独立 test/production、数据层验收均未执行，保留 NOT_RUN。共享配置仍 development/shell；没有上传/提交/推送/云数据或资金操作。
