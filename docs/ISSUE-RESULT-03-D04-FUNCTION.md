# 问题 03：D04 验收函数及受控主体配置

**主流程复核：CLOSED / CONFIG_PASS（2026-10-08）。** 已核对部署、代码比对、原生 SDK/身份回读、管理端拒绝、配置期限、空集合及绑定恢复证据。环境配置准备完成；D04 实际事务实验由主流程使用同一 run 在期限内执行，不能以此配置复核宣称 D04 通过。

状态：**READY_FOR_MAIN_REVIEW**，等待主流程复核。记录时间 2026-10-08T07:12:32.757Z（UTC，香港 +08:00）。
唯一环境 dinner-cook-test-d5e320u981ec341，函数 jjl-d04-probe。

## 已完成

- prepare-transaction-cloud.js 清单中的11个文件逐字一致（包括入口、8个shared模块、package.json与lock），已保存SHA256；未覆盖或部署旧包。独立包 npm ci --ignore-scripts --no-audit --no-fund exit=0，102 packages，SDK锁定4.0.2。云端实际两次identify也回报sdkVersion=4.0.2。
- test部署前 cloud_fn_list total=0，仅新建指定Event/index.main，Nodejs20.19、timeout=20秒。最终Active/Available、CodeResult=success，Triggers=[]；未创建HTTP路由、定时器或层。创建请求bec219c5-9d06-47a0-91a5-49b668f08971，主体配置请求349542e9-baaa-407c-bb36-8d84c87c9817。
- 原隔离工程页面会自动调用development user/store，完整保留未复用；本轮新增独立工程 **D:/dinner cook/artifacts/d04-identify-validation-20261008**。正确AppID、显式test初始化/调用，页面只执行identify，不含prepare/hold/read/unique。共享根工程和原工程未修改。
- 本窗口通过本机已登录微信开发者工具主动发起原生调用，主流程明确回复认可此受控会话作为验收主体。核对真实identify返回64位稳定subjectId及当前run后，仅配置服务端JJL_PROBE_USER_ID；不是授权首个任意访客或客户端自称身份。完整subjectId/OPENID/令牌未保存至公开结果和证据。
- 配置更新曾处于Updating，随后回读Active；环境变量均与指定值匹配，JJL_PROBE_USER_ID实际值与原生返回一致，证据仅保存subjectMatchesNative=true/脱敏占位。配置后第二次原生identify同一主体、同一run，成功。
- 三集合最终Count均0；没有插入测试数据或执行事务。代码审查确认identify在授权/期限/原生上下文检查后直接返回，无数据库读写；业务操作仍受指定主体和期限约束，未开放匿名/管理端伪造身份。

## 有限授权配置与真实调用

| 配置 | 实际回读 |
|---|---|
| JJL_APP_ID | wx154f791a17268ace |
| JJL_CLOUD_ENV / JJL_TEST_ENV | dinner-cook-test-d5e320u981ec341 |
| JJL_STAGE | test |
| JJL_DEVELOPMENT_ENV | cloudbase-d8gwtxzm64150b7e0 |
| JJL_PROBE_RUN_ID | d04-20261008070714200-ba2d4765 |
| JJL_PROBE_EXPIRES_AT | 1791450434200 |
| 起始/截止香港时间 | 2026-10-08 15:07:14.200 → 17:07:14.200（+08:00），恰好2小时 |
| UTC截止 | 2026-10-08T09:07:14.200Z |
| JJL_PROBE_USER_ID | 已配置可信64位subjectId，脱敏；匹配真实原生会话 |

到期不自动延期，主流程需在同一run/截止时间内安排实验；超过期限不得直接继续，另行授权安排。

| 核验 | 平台请求ID | 业务requestId | 结果 |
|---|---|---|---|
| 原生identify | b69dc2c7-0de8-4f91-b07f-fb8d87214c0d | ecae7107-c3b8-4ef4-9a86-5560a22adf25 | IDENTIFIED、SDK4.0.2 |
| 配置后原生identify | 9cf8fa47-924b-4a4c-bfe2-9ba3853d4fce | d6055bb5-2ce7-4714-a44d-b8db3eca9bb8 | IDENTIFIED、同主体/同run、SDK4.0.2 |
| 管理端事件伪造openid/role | 60c81147-860e-4934-a11c-1aba7ff7b0b0 | dadf7f5f-40b8-4bdb-b1cf-fd48a94c6940 | AUTH_REQUIRED |

首次读取及配置后编译紧接读取分别出现automator超时，未记为成功；后续读取真实结果成功，历史限制保留。错误不是云业务拒绝证据。最终函数回读requestId dd4e4028-7914-4b2f-8727-732c4f663a76；空集合回读2f1fe469-66d0-4863-bca2-6bb58d79557c。

## 绑定、证据与范围

提前通知主流程暂停隐式MCP操作，切换test；创建、配置更新及管理端拒绝调用前均auth(status)确认test。结束set_env(development)成功，auth(status)确认READY/cloudbase-d8gwtxzm64150b7e0/ap-shanghai，已恢复。development资源、user/store、UI、业务源码及共享配置没有修改。

[脱敏完整证据](qa/issue-03-d04-function/function-evidence.json)。无具体阻塞；函数就绪不等于D04通过。prepare/hold/read/unique、事务/竞争/唯一冲突/故障回滚以及客户端权限实际验收均NOT_RUN，由主流程随后安排。保留现有未提交改动，无删除、管理员授权、支付、提交/推送/上传发布。直接同步主流程后停止。
