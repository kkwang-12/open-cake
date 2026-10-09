# A05 本地验证证据

2026-10-06，OFFLINE_TEST_ONLY。A05 可离线部分完成，整体实际验收未通过。

- 新增专项：32 项，当前源码由 full-verified 覆盖。
- 受影响组合：[affected-final](affected-final.tap)，157/157；最后区分发布验证序号 / 记录版本后已重跑最终全量。
- 最终全套：[full-verified](full-verified.txt)，891/891，exit 0，无 skip / todo / cancelled。
- 最终静态：[static-verified](static-verified.txt)，302 个 JS / JSON / WXML，exit 0。
- 主包 / features / legacy：1239 / 139 / 45 KiB，实际打包待微信。
- 指纹运行前后匹配：[source-verified](source-verified.txt)，391 个代码 / 公共素材文件。
- SHA256：fc0392605491d13a6bc5b8992780f8da2f89f6171e04e0b0c601037ab9ac0cf2
- 精确文件清单：[source-files](source-files.txt)。
- cloudVerified / callable / operationsAllowed / realCloudVerified / realConcurrencyVerified / realMapVerified / realPolicyApproved / realWechatVerified：全部 false。

初次 26 项失败为新调用 productLeadTimes=[] 和组合夹具元数据时间不一致；second 25/26，最后为测试误期待 QUOTE_CHANGED，O03 原逻辑保留 SLOT_FULL_OR_CLOSED。arithmetic-before 为 1 项极大提前量草稿拒绝探针，修复前复现漏校验，最终通过。full-final / source-run 是区分内部证明发布序号与记录 version 之前的通过记录；终稿必须使用 full-verified / source-verified。没有把本地串行内存通过作为 SDK 并发、地图转换、正式经营批准或付款证据。

详细范围 / MS01–MS07 / 真实适配器约束见 [A05](../../archive/stages/phase-8.md#a05-merchant-store)。未改 UI、实际云配置 / 索引 / handler / allowlist，未 Git 提交 / 推送 / 部署。下一项 A06 可离线部分。

| 证据 | SHA256 |
|---|---|
| [first.tap](first.tap) | 303727a750e3567195c2ef455fc290958e0615aaa1a06a8ce0c526d109721cda |
| [second.tap](second.tap) | 796186edb1bbb2a38ccedea91c54f0f5bf405e370a098c91949f1ee724968405 |
| [affected-first.tap](affected-first.tap) | 6742a95a0d4b425a7927ca268400befd87dc004da89b3aafe394880c59c5bfc3 |
| [arithmetic-before.tap](arithmetic-before.tap) | cee71c6a86c10ed075766d172c7a38368108ba2d6f78e85795f5f632ed0ba8c0 |
| [affected-final.tap](affected-final.tap) | b641d7399c5f3d220cb80d30927879bc20b9cdc7ef4a0c8ed2e5f3e06d89dfd9 |
| [full-final.txt](full-final.txt) | 52afec3130ea3ebce0b07dbb47e3e061195dd726f3e973969a91329d7d5ce522 |
| [static-final.txt](static-final.txt) | ba44fa77f924a9cdbabafc9a476f1d983b8483ce5f9ca9d590d9daf04d6c4199 |
| [source-run.txt](source-run.txt) | f5174f8cc464771846b7be46263475be0cbc8ac7f8df862fd35f823fc3edeafb |
| [full-verified.txt](full-verified.txt) | 7fd8c3467dacd0bb2422a560e7f91cf35b2f2bdca4bd98335ea767a954db0abb |
| [static-verified.txt](static-verified.txt) | ba44fa77f924a9cdbabafc9a476f1d983b8483ce5f9ca9d590d9daf04d6c4199 |
| [source-verified.txt](source-verified.txt) | 3f4ac1eace9077e042c5541497ba3f69befa96dc36c65b12a0866bcd506408de |
