# A06 本地验证证据

2026-10-06，OFFLINE_TEST_ONLY。可离线部分完成，整体实际验收未通过。

- 新增专项：37 项，当前源码由最终 full-final 覆盖。
- 受影响组合：[affected-verified](affected-verified.tap)，212/212，exit 0。
- 最终全套：[full-final](full-final.txt)，928/928，exit 0，无 skip / todo / cancelled。
- 最终静态：[static-final](static-final.txt)，307 个 JS / JSON / WXML，exit 0。
- 主包 / features / legacy：1239 / 139 / 45 KiB，实际打包待微信。
- 运行前后源码：[source-run](source-run.txt)，396 个代码 / 公共素材文件，完全匹配。
- SHA256：e3a913706cc65b622c18abff7bfa2ae80af0a86b14f57dcc99feac403ca9fe55
- 精确文件清单：[source-files](source-files.txt)。
- 目标 registry 61 项均在 API_NETWORK 中有对应行，只有 exceptions.list 为本轮新增 PLANNED；真实 allowlist 未扩展。
- cloudVerified / callable / operationsAllowed / externalRefundExecuted / realCloudVerified / realConcurrencyVerified / realMoneyVerified / realWechatVerified：全部 false。

first 27/28，剩余为测试误期望回滚模拟外部版本变更，已改为保护外部变化并验证本次退款未提交。replay-before 2/2 探针复现新重放未拒绝伪造 review 关联 / 自洽错误 transition，已加强操作绑定。affected-first 204/205 是 registry 重复定义既有 retry、误计 62；已去重，实际 61。affected-final 209/210 是模拟履约比夹具时钟晚，校正时间；终稿 affected-verified / full-final 通过。复查修正真实模型中 CLOSED 付款订单补偿映射、已付完整来源和异常投影白名单。未声称这些是云 / 真机事故。

仅串行内存、真实本地 O03 / A01 / P06 服务、合成 provider 弱对象身份验证。实际 SDK / 唯一 / 并发 / 平台认证、正式 SLOT 策略、资金 / 页面 / 真机仍待 [A06](../../archive/stages/phase-8.md#a06-merchant-resolution) 的 RF01–RF07。无 Git 提交 / 推送 / 云操作 / 资金调用 / UI 改动。下一项 A07 可离线阶段评审 / 真实运营与旧入口退役清单。

| 证据 | SHA256 |
|---|---|
| [first.tap](first.tap) | 8c6247ed338e53ed3e7e1bcea97fddb508da0e4899af817941d0342139680a0f |
| [replay-before.tap](replay-before.tap) | b17dcd98cf4ccf9e57b5d9b9afb06b0e9e853918f178d11d3ce21e0034e41d98 |
| [affected-first.tap](affected-first.tap) | 052820c7c752d496630994d478d7d0c1d3d99c898e4236bf0303ca023f28a7b1 |
| [affected-final.tap](affected-final.tap) | 044379910201b239a94f75c74e9f891a2fe5ae6ff0b2e59bac169a93a5162fe8 |
| [affected-verified.tap](affected-verified.tap) | d0f8f8d6be17a8db720918ab74cb03348dd33d9d276c013005a71199a441bb27 |
| [full-final.txt](full-final.txt) | 5e1774fe11d82c5b46b1dbf0542f03578743e65914835f09b4bb0e7b2b6650e7 |
| [static-final.txt](static-final.txt) | 8d56f9cf3d0e16b268444914a3ce4f2909ab5f64df7c9b87a5546da077a4b66a |
| [source-run.txt](source-run.txt) | b9e5277b27f0d5cf3f23b8e1ddece11a76d09bc2956d635fe2d063b0bc6c6766 |
