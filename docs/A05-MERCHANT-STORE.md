# A05 门店 / 营业 / 预约 / 配送配置维护

2026-10-06。**可离线部分完成，整体验收未通过**。新增内部模型 / 事务服务、组合夹具与 32 项专项；没有 admin handler / 客户端 allowlist / 商家页面或真实云调用。cloudVerified / callable / operationsAllowed 始终 false，正式经营资料仍未发布。

实现：[模型](../cloudfunctions/_shared/merchant-store-model.js)、[服务](../cloudfunctions/_shared/merchant-store-service.js)、[专项](../tests/merchant-store.test.js)、[隔离夹具](../tests/fixtures/merchant-store.js)。当前 [A01](A01-ADMIN-AUTHORIZATION.md) 用户 / principal / scope / 同店 CONFIG_WRITE 在同一事务校验；撤销后的重放也重新鉴权。先查目标头及权限再读关联配置，跨店目标返回 NOT_FOUND，不能通过 UI 显隐或客户端角色授权。

## 本轮行为

复用既有 store.update、config.save / publish、slot.update、store.get、config.get、configs.list、slots.list 契约。门店允许明确维护名称 / 地址 / 电话 / 状态；时区固定 Asia/Shanghai。ARCHIVED 终态，已有营业店不能回退 DRAFT。关闭 / 归档不删除配置、订单或占用；改地址会撤销旧定位，继续 OPEN 必须有新定位和匹配发布配置。

config.save 只修改 DRAFT；新建确定性 ID，序号按本店完整配置读集 max + 1，已有草稿保留序号。PUBLISHED / RETIRED 内容不能编辑或被本轮覆盖，旧版本不会因切换指针而退役 / 删除。发布必须通过草稿 / 门店版本 CAS、本店序号单调条件和所有发布校验，在同一事务写配置状态 / 时间、门店 activeConfigId 和 version、未来已建时段变更、审计及回执。更早序号不能覆盖较新已发布版本；TimePolicy.policyVersion 同名不能换内容。

用户已确认的正常营业规则固定为每天 08:00–21:00、两种方式、30 分钟、自取 3 单 / 配送 1 单且独立计算。日期覆盖支持显式禁约或营业窗口缩短，校验真实日期、时区、30 分钟对齐、重复及重叠。客户端草稿不能改变 V1 正常营业时段、容量、半径、边界、费率、配送执行方或预计时段语义；如用户未来变更 V1，须另做政策版本迁移。

配置发布只维护**完整快照中的未来已建时段**：新政策下仍可约的资源更新实时 policyVersion / version；不再可约的资源关闭，保留原政策身份；不改已开始或过去资源。关闭过的资源不自动重新 OPEN，恢复营业后仍需显式 slot.update 并通过当前规则。每个资源原 _id / 店 / 模式 / 日期 / 起止 / capacityUnit / 容量和 held / confirmed / consumed 保留，不清零，不拆分或复制容量池。不存在的时段不会假装可选，后续受控物化器仍待接入；不能用缺行重建绕过已占用。

资源实时 policyVersion 的维护与新配置发布原子，历史订单 appointmentSnapshot.policyVersion 仍固定。此为 D02 的 A05 明确补充，资源不是订单的政策历史载体。库存资源不受影响。slot.update 先拒绝小于 held + confirmed + consumed 的总额，再限定 V1 固定 3 / 1；禁约使用 CLOSED，容量不置零。只有门店 OPEN、当前有效可约窗口且实时政策版本匹配时能重新开放。

未确认的正式提前量 / 最大预约天数、报价 TTL、付款占用时长、袋限制、回补规则不设置默认值；草稿可保留 null / 空配送规则并被拒绝发布。非空部分须完整合法，整数及毫秒运算不得溢出；预约末日须在支持的四位年份内。保存完整字段不等于经营批准，发布还需要独立的受控政策验证器批准准确内容和版本。

配送固定门店自送、半径 20000 m 含边界、0 分、ESTIMATED 和既有距离算法。只接受一个可判定 ACTIVE RADIUS / FLAT 规则，中心须与已核验门店位置逐字段相同。位置写入仅接受服务端 resolveStoreMapSelection 的受权 token 结果，token 绑定当前 scope / 人 / 店 / 版本 / 时间并纳入读栅栏。原始客户端坐标、GCJ02 不能当作 WGS84；门店位置 source / verifiedAt 也不能独立充当证明。

用户给出的地址「安徽省合肥市庐江县X085沙溪派出所南侧约50米」、高德纬度 31.1498 / 经度 117.2886 继续是待地图适配器核验的真实输入；没有复制测试点、转换结果或验证时间到正式门店。正式店名、电话及其他未提供资料仍待确认。夹具的 0 / 0、电话、提前量、天数等均 OFFLINE_TEST_ONLY。

## 事务 / 适配器边界

服务要求完整、有一致 scope 的有限 state：store、configs、slots 和当前 access / user，同一事务内 header / state / access-store 版本状态一致。不能将 SDK 分页的部分结果标记 complete。真实适配器须使用受控有界查询和已验证事务预算，保护集合谓词 / 完整读集 / 负读，若无法完整原子执行则拒绝操作，不能分批发布或先切指针再迁移时段。当前内存实现没有证明生产规模可行。

tx 接口包含 readUser / readAccessState、readStoreHeader / readStoreState、readReceipt / readAudit、assertStoreReads、saveStore / insertConfig / saveConfig / saveSlot、insertAudit / insertReceipt；写函数必须恰好返回 1，否则整体回滚。assertStoreReads 包含用户 / access / grant、完整业务 state、回执 / 审计 ID 与证明绑定，必须一直保护到 commit，不能只对门店 CAS。

需要时还有 resolveStoreMapSelection、validateStorePhone、verifyStoreLocation 和 verifyOperationalPolicies。后两项必须来自受控验证资料，绑定环境 / app / 店、读取和拟写门店版本、configId、**configVersion（发布序号）/ configReadVersion（读取的记录 version）/ proposedConfigVersion（拟写的记录 version）**、准确定位 / 政策摘要和时间；审批资料的有效性 / 撤销 / 不存在条件也须保护到提交。验证器不能因为请求带 source、时间戳、摘要或规则版本字符串就返回 true。电话须按已确认号码规则检查，正则只存在于测试适配器。

幂等按 environment + app / 当前人员 + action + key 隔离，changed content 拒绝。成功回执 / 当前目标版本 / 确定性新 ID / 原 expectedVersion + 1 / 审计目标与原请求一致，重放不再写配置或重开时段。审计保留 STORE actor、scope / 店、目标版本、脱敏原因 / trace 和请求 / 实体 / 关联写入摘要，不保存地图 token、电话、草稿全文或私密字段。摘要仅用于一致性检查，不是密码学来源证明。

config / slot / store 查询只投影契约字段，私密服务字段不输出；配置 HMAC 游标绑定当前人员、授权、店、完整内容修订和过期时间。服务层仍是内部离线状态，不构成真实公开查询或授权入口。

## 验证与真实验收

32 项专项、受影响组合 157 项通过，最终全套 **891/891**，静态 **302**。源估算主包 / features / legacy **1239 / 139 / 45 KiB**，无需新分包，实际体积仍以微信编译为准。运行前后源码指纹一致，见 [证据摘要](qa/a05-2026-10-06/summary.md)；最终使用 full-verified / static-verified。

失败记录保留：first 26/26 失败源于夹具 / 新模型调用共享时段构造器时传空商品提前量数组（既有构造器要求非空），及组合夹具原 publishedAt 晚于新增元数据；已修正为只表达门店规则下限的 [0] 和一致测试时间，商品提前量仍在 X04 / X05 / O03 重验。second 25/26，最后失败为测试期望 QUOTE_CHANGED，而既有 O03 明确保留 SLOT_FULL_OR_CLOSED；修正测试预期，未放宽业务校验。32 项中增加极大提前量探针，arithmetic-before 复现草稿未拒绝，补齐安全算术 / 日期边界后通过。发布验证字段最后区分序号及记录版本，并重新执行全套 / 静态。

A05 → 实际本地 O03 服务组合验证门店编辑 / 配置切换后旧 quote 返回 QUOTE_CHANGED，时段关闭返回 SLOT_FULL_OR_CLOSED；未来可约摘要读到新配置，历史订单 facts / items / 金额 / 付款 / 日志 / quote / reservations 不改。A02 原服务可继续接单、开始制作关闭时段中的已确认订单；占用仍保留。没有遍历修改顾客 cart / quote，也未接 Storage / 页面刷新事件。

| 用例 | 实际验证目标 | 当前 |
|---|---|---|
| MS01 | 当前平台用户 / 同店权限 / 撤销与真实并发提交 | NOT_RUN |
| MS02 | 配置序号唯一索引、重复 key、SDK 零写 / 全回滚 | NOT_RUN |
| MS03 | SDK 完整谓词保护、发布与下单 / 占用变化冲突、事务规模预算 | NOT_RUN |
| MS04 | 真实地址 / 电话 / 高德输入、地图转换及验证凭据撤销 | NOT_RUN |
| MS05 | 正式经营政策审批 / 时间版本不可覆盖 / 停业 / 禁约 | NOT_RUN |
| MS06 | 微信页面维护后刷新预约 / 配送 / 报价，历史已付履约保持 | NOT_RUN |
| MS07 | E01 / E12 / 真实 Admin 入口与 A07 完整运营验收 | NOT_RUN |

全部真实门禁等待环境 / 索引 / SDK / 地图 / 政策 / 页面 / 真机条件。未修改 UI、操作微信 / 真机 / 云 / 资金或 Git 提交 / 推送 / 部署，既有未提交成果保留。下一项 **A06 取消 / 退款异常处理和审计读取的可离线部分**。
