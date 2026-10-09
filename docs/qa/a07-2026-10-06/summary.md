# A07 本地证据（2026-10-06）

范围：OFFLINE_ADMIN_ACCEPTANCE_EVIDENCE。新增 9 项回归，首轮 [first.tap](first.tap) 9/9、[退出码](first.exit.txt) 0，无修复前失败轮次。增加离线验收脚本与联合测试，未改订单 / 资金服务、UI 或正式接口。

执行 `node scripts/verify-admin-offline.js --name a07-2026-10-06-final`，[runner-exit.txt](../a07-2026-10-06-final/runner-exit.txt) 为 0。[summary.json](../a07-2026-10-06-final/summary.json) 保存参数、退出码、数量、日志摘要与源码清单。

| 检查 | 结果 | 原始证据 |
|---|---|---|
| A01–A06 + A07 | 203/203 | [admin.tap](../a07-2026-10-06-final/admin.tap) |
| 原演示基线 | 19/19 | [legacy-baseline.tap](../a07-2026-10-06-final/legacy-baseline.tap) |
| 其他全套回归 | 715/715 | [other-regressions.tap](../a07-2026-10-06-final/other-regressions.tap) |
| 静态 | 310 JS / JSON / WXML | [static.txt](../a07-2026-10-06-final/static.txt) |
| SVG | 41 | [icons.txt](../a07-2026-10-06-final/icons.txt) |
| 目录越界 / 复用 | 两项退出 1，旧报告哈希不变 | [directory-gates.txt](directory-gates.txt) |

总 937/937，0 fail / cancelled / skipped / todo，全部步骤退出 0。固定代码 / 公开素材范围 398 文件，执行前后匹配，SHA256 `5cf7a45e90b9d1b5109ccca9d70b1de9677753bf20c61a94f627df92228ec9f8`；文档、私有配置与经营数据不在代码指纹范围。

59 个 PLANNED action 在实际 client 拒绝，隔离探测平台调用 0；11 个禁止 legacy 配置组合各拒绝三个旧请求，显式演示对照只触达 stub。非 legacy JS 60 文件的字面相对 require / localhost 与 canonical routes 通过，不能代替动态程序分析或正式产物检查。实际 user handler 在 SDK stub 中拒绝 staff / PIN / openid 身份升级。

主包 / features / legacy 源估算 1239 / 139 / 45 KiB，实际以微信打包为准。旧 HTTP 回归临时回环监听，不启动 server/index.js；没有真实云、管理员、来源验签、SDK 并发、页面 / 扫码、持久恢复、实付 / 退款或发布包退役验收，报告对应字段 false。

9 项联测涵盖取消请求拒绝后自提 / 原请求恢复、配送完成后部分退款 / 原履约重放、获批取消后不可接单 / 原号 UNKNOWN 查询及撤销后退款 / 财务拒绝。仍为串行内存、合成 PAID、对象身份结果证明与测试协议投影；A07 整体 / 阶段八运营未通过，AG01–AG10 NOT_RUN，见 [评审清单](../../archive/stages/phase-8.md#a07-admin-acceptance)。

未改 UI、未读取私密凭据或本地经营数据，未操作微信 / 云 / 实际资金 / 对外消息或 Git 提交 / 推送 / prepare-cloud / 部署。全部原未提交成果保留。
