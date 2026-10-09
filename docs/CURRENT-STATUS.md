# 当前工作状态

更新：2026-10-09（Asia/Hong_Kong）。这是唯一的进度/阻塞/下一步入口；开始时核对 Git，按任务读取源码。历史证据不构成新授权。

## 执行状态

- **主流程开发已恢复**，当前推进D04 SDK读取保护验证；未提交的业务/UI改动保留。本轮仅修改本地代码并只读核实云环境，尚未部署或写云数据。
- 本窗口已接手后续开发主流程，负责关键路径推进、代码/后端实现、相关验证及本页状态维护；UI/动效由其他窗口负责，默认不委派。
- 客户端为 development/shell，只开放 user.me/store.health；商品、袋、地址、收藏为示例或本机草稿，订单与商家业务未接通。未形成真实收付款/履约/退款闭环。

## 当前任务：D04

- 已验证：2026-10-08隔离云技术探针16/16，含原子写、回滚、幂等、库存/时段竞争、容量独立及唯一冲突。
- 已准备：订单写入预算、文档session映射及幂等回放读取保护义务，本地通过；**真实protectReads/findOrderByNumber尚未接入**。
- 本轮交付：现有隔离探针新增read-existing/read-missing/query-empty三类交错事务实验，区分旧读取仍提交、读/写事务冲突与查询不可用/被拒绝；错误、到期、旧run及不一致回执不会记为保护成功。原生执行器支持`--suite=read-protection`，本地夹具不是SDK保证。
- 部署包：`artifacts/d04-read-protection-20261009/functions/jjl-d04-probe`，11个文件与当前源码哈希一致，锁定wx-server-sdk=4.0.2；保留旧包，不代表已部署。
- 下一步：确认本次test探针更新及两小时新run授权，原生调用上述三类实验（仅现有探针集合，最多新增9个隔离文档）；依据真实结果落实读取/订单号保护与完整预算，再冻结隔离业务资源并验正式订单事务。
- 待验收：正式订单保存、完整谓词保护、平台读写/重试预算、真实丢响应、真机及完整权限。D04仍PARTIAL。
- 昨日探针限时授权已过，不复用/自行延期；本次云写入范围待确认，购买/付款业务门禁保持关闭。
- 接入技术约束：[D04-SDK-INTEGRATION](D04-SDK-INTEGRATION.md)。
- 源码：`cloudfunctions/_shared/{order-document-session,order-write-budget,order-transaction-service,cloud-document-transaction}.js`；对应测试按同名定位。
- 云证据：[16/16原记录](archive/stages/phase-2.md#d04-cloud-repair-2026-10-08)；本地session：[日志](qa/d04-cloud/local-session-20261009/tests.txt)。

## 云环境快照（2026-10-09只读核实；使用前复查绑定）

- AppID `wx154f791a17268ace`；上海NoSQL。
- development `cloudbase-d8gwtxzm64150b7e0`：user/store及2个验收函数；users=1、admin_roles=0、audit_logs=0，正式交易集合未建齐。
- test `dinner-cook-test-d5e320u981ec341`：jjl-d04-probe与3个探针集合；共享客户端test配置仍为空。
- production配置为空，未核实生产资源/发布审核状态。
- 来源：[只读审查记录](archive/stages/phase-0.md#project-readiness-review-2026-10-09)。

## 验证与后续

- 最近代码验证（2026-10-09）：完整本地回归1047/1047，86个文件；静态400项及本轮差异空白检查通过。[通过日志](qa/local-checks/tests-1791511955505-10608.tap)。本轮未重复阶段验收；上次联合离线验收1030/1030及Payment/Admin边界、静态/图标证据保留在[原记录](qa/test-orchestration-20261009/summary.json)。源包体主包/features/legacy=1392/153/45 KiB，实际以微信编译为准；真实云/真机/资金仍未验收。
- 环境复核：受限环境首轮HTTP fetch失败/执行器超时，保留[失败日志](qa/local-checks/tests-1791511798626-6408.tap)，允许本机回环连接后完整回归通过；云工具绑定已恢复development并回读READY。
- 关键路径：D04 → 正式数据与目录/袋/地址/时段/报价/订单接口 → 实际支付及商家履约/退款 → Q01–Q08上线联调。
- 经营及支付待确认项只维护在 [EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)。无经验证的上线百分比/日期承诺。
- 文档整理：日常根文档已收敛至21份；82份过程记录合并为9份阶段历史卷，整理前Markdown逐字ZIP备份并校验。链接按实际位置修复，QA日志/JSON/截图保留。
- 测试编排：已提供9个本地分组，含关键关联回归；多组可合并去重。需要Payment/Admin共同验收时运行 `npm run verify:offline`，不叠加其他全量入口；普通修改按AGENTS默认验证表一次选择。日常及阶段失败输出有限错误/位置/堆栈，原日志保留；成功只读摘要，不新增日常报告。本次脚本收尾相关回归22/22（含3项新诊断测试），6个改动JS语法及差异检查通过，[局部日志](qa/local-checks/tests-1791511503156-16792.tap)；未重复完整验收。分组为人工维护范围，共用接口/多域修改仍须完整回归；当前关闭入口的阶段断言待真实接入时更新。
- 常规推进只替换本页相关项并附必要证据；需求/字段/接口变化再改对应参考。纯文档不重复跑业务回归。
