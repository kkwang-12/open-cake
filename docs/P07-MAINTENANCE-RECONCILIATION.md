# P07 补偿任务 / 对账 / 告警离线边界（2026-10-06）

新增内部 payment-maintenance-model / service。没有定时触发器部署、真实账单下载、支付 / 退款 SDK 或通知渠道；callable / cloudVerified / moneyAdjusted / messageSent 恒 false。本轮不改 UI、本机 Storage 或用户已确认的样式。

## 候选任务与领域分工

可信事务适配器提供完整、当前环境 / AppID / 商户 / provider 的未决快照。PENDING / EXCEPTION 支付只建 PAYMENT_QUERY；已付款但未 APPLIED 建 PAYMENT_REVIEW；未完成退款建 REFUND_QUERY；订单待付、摘要 CLOSED 且全部原意图已关建 ORDER_CANCELLATION_REVIEW。跨环境 / 重复记录 / 不完整快照、旧实体版本不得登记任务。

任务只提供领域提示，不直接调用 P04 / P06，也不把任务状态当成资金状态。真正处理时必须重新核验实体当前版本、原配置 / 授权与完整读集，再交给原领域服务。PAYMENT_REVIEW 不默认“自动退款”，REFUND_QUERY 不自动再提交，取消复核不直接释放资源。当前没有扫描分页 / 自动逐项登记 / 任务到领域服务的执行适配器。

## 租约、重放与运行记录

任务 ID 固定环境 / AppID / 商户 / provider / kind / entityId / entityVersion，同版本登记幂等。任务 PENDING → RUNNING → DONE / PENDING / REVIEW，读取版本与条件保存防重复占权；租约 token + 任务版本共同保护。过期可以重领，旧 worker 不能确认新租约；提交前再次检查时钟与租约截止，写入过程中到期整笔回滚。

claim 同事务保存任务与 MAINTENANCE_RUN，安全 requestId 为确定运行 ID，包含实体引用、版本、开始 / 租约截止和结果，不含联系人、地址、原报文、交易单号或 leaseToken。finish 把运行终态与任务状态同事务提交；丢响应后读取任务终态，不重复处理资金。历史租约到期的运行记录保留 STARTED + leaseUntil，未假称领域请求失败或自动改资金，后续审计可据租约判过期。

retryDelayMs / leaseMs / maxAttempts / alertAfterMs 必须显式注入，测试 100 / 200 / 3 / 300 只是合成毫秒策略，非正式运营值。未知 / 可重试结果按延迟重新候选，超过次数转 REVIEW、保留告警需求，不擅自关单或放弃资金恢复。策略发布、暂停恢复、批量扫描和重试负责人待实际配置 / P08 验收。

verifyInvocation / verifyOutcome 是未来服务器注入的任务身份与领域结果来源验证；不得把普通脚本返回 success 或客户端 SYSTEM 字段当可信 RESOLVED。夹具仅对象身份验证。DONE 只表示这个任务的受信任结果报告已结束，不证明实付或已退款。

## 对账

verifyStatement 由服务器实际账单 / 查询适配器实现来源认证，事务加载对应范围的完整本地归一化账本。两侧都须明确包含 environment / appId / merchantId / provider，并逐项与服务配置一致；两侧完整、startAt / endAt 相同且范围已结束才比较。本地 scope 缺失 / 错配不能因记录相同而 matched。当前窗口定义与归一化 reference / providerId 映射是候选契约，实际账期 / 时区、分页完整性、平台字段与原付款 / 退款映射仍待实现。

分别核对 payments / refunds 的 reference、整数分、CNY、状态和平台流水号。缺本地记录、缺平台记录、金额 / 状态 / 平台号不符分开报告；重复业务引用或成功平台流水号拒绝，不用 Map 覆盖重复记录来假称一致。只比较通过白名单的归一化字段，不把手机号 / 备注等原始列写进报告。reference 在结果中替换为摘要，报告 ID 对确定字段及字典序排序计算，不依赖系统地区排序或输入顺序。

不自动用平台账单覆盖订单、支付或退款。matched 只是当前已认证候选完整窗口的比较结论，不代表真实账单验收或账号资金已核实；真实认证当前未实现。

## 持久告警需求

长期未决、次数耗尽、领域要求复核与对账差异保存 ALERT_REQUIREMENT：固定 reason、jobId / reportId、OPEN、requiresOperator=true、messageSent=false。同原因 / 同任务或同报告去重；不调用邮箱、短信、微信订阅消息或其他消息工具。当前未配置负责人 / 渠道、送达回执、人工确认 / 关闭，不能声称告警已发送或处置完成。

任务 / 运行 / 告警 / 报告复用 payment_events 内部 recordType，没有新增集合或实际建库。SDK 必须保护候选、任务与运行版本、告警 / 报告不存在条件，零行写回滚；实际索引、范围扫描幻读与多 worker 并发待云验收。对象身份与串行内存不能替代来源认证和数据库并发证明。

## 验证及剩余工作

新增 **23 项**，全套 **717/717**；静态 **281**、SVG **41 个通过**，主包 / features / legacy 源估算 **1239 / 126 / 45 KiB**。覆盖任务重复登记、租约竞争与边界 / 提交中到期、旧 worker、丢响应 / 重建、延迟与次数 / 长期告警、任务 / 运行 / 告警逐写异常及零行回滚、来源伪造、缺完整范围、重复流水、各类差异、顺序稳定及报告 / 告警原子性。不改资金账本。

未操作微信 / 真机、云、真实账单 / SDK / 资金或对外消息，未提交 / 推送 / 上传 / 部署，所有既有改动保留。P07 整体未通过；真实扫描 / 调度、领域服务接线 / 超时查询恢复、认证账单、经营策略与告警负责人 / 送达 / 处置待补。

下一项 **P08 阶段七离线评审、可复现证据与真实验收清单**。无实际受控实付 / 退款前不得标阶段七整体完成，不进入真实购买 / 管理员运营发布。
