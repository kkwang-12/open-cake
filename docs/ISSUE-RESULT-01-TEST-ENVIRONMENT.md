# 问题 01：独立 test 环境执行结果

**主流程最终复核：CLOSED / PASS（2026-10-08）。** 已核对文末用户创建后的实际回读及 `test-ready-evidence.json`：test NORMAL、NoSQL RUNNING、同 AppID 关联，数据库实例、存储桶及函数命名空间均与 development 不同。下文 BLOCKED 与 READY_FOR_MAIN_REVIEW 保留为历史记录。关闭仅代表环境就绪，不代表 D04 业务验收通过。

**最新状态：READY_FOR_MAIN_REVIEW。用户新建 test 已通过状态、NoSQL、AppID 关联及资源隔离复核；此前阻塞解除。详见文末最新复核。**

历史首次执行状态：**BLOCKED**。记录时间：2026-10-08T06:44:11.958Z（UTC；Asia/Hong_Kong +08:00）。本轮重新查询，不沿用旧环境快照。来源：[交接任务](ISSUE-HANDOFF-01-TEST-ENVIRONMENT.md)。

## 本轮实际核验

| 项目 | 结果 |
|---|---|
| test EnvId、名称、地域、状态、模式 | 尚未取得，不能标 READY_FOR_MAIN_REVIEW |
| 账号与微信登录 | CloudBase 国内站账号级 READY；微信 loginExpired=false，CLI 0.3.11/versionRelation=equal |
| 上海环境 | TotalCount=1/HasMore=false，仅 development cloudbase-d8gwtxzm64150b7e0，NORMAL |
| 广州环境 | TotalCount=0/HasMore=false |
| 新加坡环境 | 首次未明确站点返回 AUTH_REQUIRED；随后显式 auth(status,site=domestic)，重新查询 TotalCount=0/HasMore=false。不能将首次错误当空列表 |
| 同 AppID 关联 | 微信 cloud_env_list(appid=wx154f791a17268ace) exit=0，仅返回 development |
| development 实际数据库 | info 明确 RuntimeMode=nosql，RuntimeBackends={postgresql:false,nosql:true,mysql:false}，Source=miniapp，WxAppId 一致 |
| 环境隔离 | 没有第二 EnvId，独立数据库/函数/存储隔离证明 NOT_RUN |
| 创建或复用 | 没有候选可复用；未创建资源，未发起购买或关联 |
| 操作前后工具绑定 | 均为 development，ap-shanghai；未执行 set_env，未切换绑定。显式查询国内站后最终 status 回读仍 READY |
| D04 集合/索引/函数/云事务、唯一冲突、资源竞争、故障回滚 | 全部 NOT_RUN；本轮不执行问题 02 |

区域结论限于工具支持的上述三个地域与当前微信 AppID 关联列表，不断言所有账号/全部地域都没有环境。info 请求 ID：a65ddd77-f1c2-4df1-ae06-e584c9b6c6e1。

## 具体阻塞与可执行下一步

1. **创建能力与所需数据库不符。** 本会话 manageEnv(create) 的实际 schema 仅允许 storage/function/postgresql，并明确“不再包含 flexdb(文档数据库)：新建环境不会创建 NoSQL 实例”。因此即使选套餐、确认购买，也不能据此交付本任务要求的 NoSQL test。未用 PostgreSQL 替代，不通过猜测底层 API 参数绕过工具。
2. **微信 CLI 未暴露创建/关联入口。** 本轮读取 wechatide --help，云环境工具只有 cloud_env_list；数据库结构/函数工具不能创建第二个环境。
3. **UI 执行通道不可用。** 按 [Computer Use 技能](C:/Users/78440/.codex/plugins/cache/openai-bundled/computer-use/26.930.61225/skills/computer-use/SKILL.md) 初始化 @oai/sky，node_repl 启动失败：windows sandbox failed: helper_unknown_error: setup refresh had errors。浏览器 cua.getState 首次进程退出，重试同样沙箱错误，未进入控制台、未点击创建。当前未看到微信创建页，不能断言该页可用套餐/免费资格或实际收费。
4. **套餐只有 API 原始报价，无具体购买授权。** listPackages 本轮返回个人版 baas_personal 的 UnitPrice="39.9"、入门版 starter 的 "99" 等，未出现免费套餐；这里只记录原始字段，不推定币种、优惠或微信侧价格。工具说明要求付费 create 执行前展示配置摘要并等待确认，本交接也明确具体套餐/付费需要选择；本轮未下单。套餐确认不是当前唯一阻塞，需先找到支持微信 NoSQL 的创建入口。

所需动作：主流程安排用户或可用的原生操作窗口，在同 AppID 的微信云开发控制台创建/复用第二个支持 NoSQL 的独立环境（优先上海）；如创建页要求购买，应先记录具体套餐、价格与时长并取得确认。不要把现有 development 作为 test。环境创建后回报实际 EnvId，本窗口即可重新查询 NORMAL、RuntimeBackends.nosql=true、微信关联列表包含该 EnvId，以及资源独立性，再提交 READY_FOR_MAIN_REVIEW。无需提供账号密码、密钥或经营数据。

曾有一次只读 shell 审批超时，按返回说明重试成功；它不是当前阻塞，没有持续的自动审批拒绝。实际阻塞是创建工具的 NoSQL 能力边界和 UI 进程沙箱启动失败。

## 证据及改动边界

[本轮脱敏查询证据](qa/issue-01-test-environment/environment-evidence.json)包含站点/登录/绑定前后、三个地域列表、微信关联、development 模式、套餐摘要、能力说明和 UI 启动错误。不保存完整 OPENID、用户昵称头像、账号标识、令牌或密钥。

本轮仅新增本结果文件及证据。保留 Git 原有改动；未修改共享配置、业务代码、UI，未创建集合/索引/函数，未删除数据，未上传/发布小程序，未提交/推送。已验证用户在主流程授权直接协调与同步，将此结果直接回报项目推进主流程后停止；问题 02 等待另行交接。

## 最后一轮替代入口核查：CloudBase CLI（2026-10-08T06:51:37.652Z）

**仍为 BLOCKED；补充发现：不能把 MCP 的 NoSQL 限制泛化为所有 CLI/API 均不支持。**

已阅读本地 cloudbase-cli/SKILL.md、references/core.md 和 nosql.md。Get-Command tcb/cloudbase 无结果；常见 npm 全局、Program Files/nodejs、捆绑 Node/bin 位置均无 tcb.cmd；.codex 包/入口搜索及既有 artifacts 工具缓存文件名搜索未找到已安装 CLI。搜索范围有限，不断言磁盘任意目录都没有。本机 CLI 版本 NOT_AVAILABLE，实际 --help 为 NOT_RUN；没有全局安装。

官方 npm 元数据当前版本 **@cloudbase/cli 3.8.5**。为核实官方能力，仅下载发布包到既有忽略目录 artifacts/cloud-env-tools/cli-source-3.8.5.tgz，在内存静态读取 standalone/cli.js；没有执行包内代码、安装依赖、登录、切环境或调用任何写 API。

- EnvCreateCommand 的真实 help 参数定义包括 alias/package/region/duration/auto-renew/postgresql/external-storage/platform-id；未见创建时的微信 AppID 或关联入口。
- 默认 doCreate 请求 Resources=[flexdb,storage,function]，带 --postgresql 才追加 postgresql。这与本会话 MCP 的资源白名单不同，说明 CLI 源码确实意图请求 NoSQL；不能说 CLI 只能创建 PG。
- [Manager SDK 官方文档](https://docs.cloudbase.net/api-reference/manager/node/env)同样列 flexdb 创建参数，但没有建立指定 WxAppId 的 createEnv 参数；describeEnvs 的 WxAppId 是查询筛选，不是关联动作。静态参数不是本账号实际发货成功证据，NoSQL 实际开通仍 NOT_RUN。
- [官方 CLI 环境文档](https://docs.cloudbase.net/cli-v1/envs/basement)提供普通创建命令。[官方创建说明](https://docs.cloudbase.net/quick-start/create-env)说明微信工具创建自动关联当前小程序；腾讯云侧现有环境需账户绑定后在微信工具选择/转换。普通 CLI 创建本身不能据此视为已关联。

仅供后续具备可运行 CLI 且完成报价确认后的普通环境配置草案：别名 dinner-cook-test（建议名，尚未创建）、ap-shanghai、duration=1、package待实际报价/选择，不开启自动续费、不指定外部共享桶。官方命令形状为 tcb env create --alias dinner-cook-test --package <已确认套餐ID> --region ap-shanghai --duration 1；这是不完整的采购/关联方案，**本轮未执行**，没有加入 --yes。旧 listPackages 的 UnitPrice=39.9 不能替代 CLI 创建链路的实际询价或微信页面费用确认。

[CLI 核查摘要](qa/issue-01-test-environment/cli-evidence.json)、[最小源码参数证据](qa/issue-01-test-environment/cli-source-excerpts.txt)。Node 直接 fetch 取发布包失败，改用 PowerShell Invoke-WebRequest 下载成功；这不是云 API 失败。未反复尝试此前失败 UI。

### 用户完成此单项的最短步骤

1. 在已登录的微信开发者工具打开 AppID 为 wx154f791a17268ace 的项目，进入工具上方“云开发”（官方文档确认该入口）；共享工程仍保持 shell。
2. 在云开发控制台找到新增独立环境的入口，创建第二个环境，优先上海，建议名称 dinner-cook-test；确认具备文档型 NoSQL 数据库。不要重命名或替换当前 development。本会话未见现有控制台页面，不猜第二环境按钮文案；若无新增入口或没有 NoSQL 选项，回报实际提示即可。
3. 如要求收费，先把页面实际套餐、价格、时长交主流程确认；本记录不预选购买、不承诺免费资格。创建后等待平台资源就绪，不建集合、不部署函数、不改共享配置。
4. 只需回传第二个环境的实际 EnvId。我们会查询环境状态/数据库模式、同 AppID 关联和资源隔离；用户不用提供密码、密钥或经营资料。

CLI 本轮没有提供已验证的完整自动创建及关联路径；问题 01 保持 BLOCKED，由主流程协调上面单项操作。问题 02 和 D04 实验仍 NOT_RUN。

## 用户创建 test 后的实际复核（2026-10-08T06:58:16.049Z）

状态：**READY_FOR_MAIN_REVIEW**，等待主流程复核关闭问题 01；此前 BLOCKED 为历史记录，现已解除。

| 验收项 | 实际结果 |
|---|---|
| test | dinner-cook-test-d5e320u981ec341；名称 dinner-cook-test；ap-shanghai；NORMAL；IsDefault=false |
| 数据库模式 | RuntimeMode=nosql；RuntimeBackends={postgresql:false,nosql:true,mysql:false}；数据库 RUNNING |
| AppID 关联 | info 的 WxAppId=wx154f791a17268ace、Source=miniapp；微信 cloud_env_list 同时返回 development 和 test |
| EnvId 隔离 | test 与 cloudbase-d8gwtxzm64150b7e0 不同 |
| 数据库隔离 | test tnt-if33ogxaq；development tnt-m100muyvs，不同实例 |
| 存储隔离 | test 6469-dinner-cook-test-d5e320u981ec341-1501710237；development 636c-cloudbase-d8gwtxzm64150b7e0-1501710237，不同桶；外部共享存储均 Enabled=false |
| 函数隔离 | test Namespace=dinner-cook-test-d5e320u981ec341；development Namespace=cloudbase-d8gwtxzm64150b7e0 |
| 新建或复用 | 用户新建，本窗口只读核验，未额外创建/清理任何资源；数据库、桶、函数命名空间为平台创建资源回读 |
| 工具绑定 | 前后均 development/ap-shanghai，未执行 set_env，无需恢复；共享运行配置未修改 |
| 具体阻塞 | 本项无；不代表 D04 或整体 I03/I07 通过 |
| D04/问题02 | 集合、索引、规则、函数部署、事务/唯一冲突/竞争/回滚仍 NOT_RUN，等待主流程下一项交接 |

本轮查询 requestId：test abcdf71c-7eff-4021-931e-74d7258c63f6；development 4ec58b76-79fb-4b95-9fd0-266ddd56a641。证据：[就绪与隔离回读](qa/issue-01-test-environment/test-ready-evidence.json)。

没有安装/执行 CLI、进行付费、写入云数据、修改共享配置或 UI、部署函数、提交/推送/上传。保留历史失败和现有未提交改动。直接同步主流程后停止。
