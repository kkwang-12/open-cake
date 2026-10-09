# A04 离线验证证据

生成时间：2026-10-06T09:23:32.628Z

scope=OFFLINE_MERCHANT_CATALOG_EVIDENCE；不代表真实商家身份、正式经营资料、云、页面、SDK / 索引 / 并发或真机验收。

- A04 专项：31（包含在全量中，没有重复计数）；受影响组合：119/119。
- 全量：859/859，exit=0；fail / cancelled / skipped / todo 均为 0。
- 静态：298 个文件，exit=0；主包 / features / legacy 源估算：1239 / 139 / 45 KiB。
- Node：v24.19.0；平台：win32。
- 全量 / 静态执行前后公共源码指纹一致，文档和证据文件不在源码采集范围。
- 实际 cloudVerified / adminIdentityVerified / formalCatalogApproved / stockUnitsApproved / sdkVerified / uniqueIndexVerified / realConcurrencyVerified / realDeviceVerified / operationsAllowed：全部 false。
- 平台调用探测：0；现有客户端拒绝 6 个 admin 目录 / 库存 action；没有开放 handler、allowlist 或正式发布。
- E01 / E12、E05 / E06、D06 / P08 实际门禁及 MC01–MC07 全部 NOT_RUN。

## 最终日志 SHA-256

| 文件 | SHA-256 |
|---|---|
| [full-final.tap](full-final.tap) | 114196d1f55054ae7eb4a714958eed76490916fae83d77e5749f2a37b6a25e0f |
| [full-final-exit.txt](full-final-exit.txt) | 9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa |
| [static-final.txt](static-final.txt) | 7da65df392dff7afce8204433e2fb3589d2fc9a1866401d154c52d64646fa35c |
| [static-final-exit.txt](static-final-exit.txt) | 9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa |
| [affected-final.tap](affected-final.tap) | 75dabe8120d13ebca344a8729f9d04615fddc19f418165636b794510267a5c12 |
| [affected-final-exit.txt](affected-final-exit.txt) | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |
| [source-run.txt](source-run.txt) | deaeb5ea9b2f7ff3162a72d64f7ba0bd737a5a774f4f2afc6f6fc1a9e2bb7a80 |

早期 first 的 23 项失败是夹具未传 A01 options.runTransaction；second 为 26/26。replay-before / affected-after 包含测试修改旧对象引用而未改变当前数据库的失败，不能作为实际越权 / SDK 复现。修正当前对象引用并加强原请求结果绑定后，终稿结论只取 affected-final / full-final / static-final。早期轮次原样保留。

## 源码指纹

执行前与执行后 SHA-256：14f995b416611f08322ad8ca7c17d9ad0e43ca3d75f6084967b21b6c1fc26ad2

共 387 个公共源码 / 素材文件，范围沿用 P08 固定代码根目录；逐文件摘要见 [source-files.txt](source-files.txt)。私有配置、密钥、本机数据和文档排除，历史 A01–A03 等证据不修改。

实现范围、适配器约束和实际验收计划见 [A04](../../archive/stages/phase-8.md#a04-merchant-catalog)。
