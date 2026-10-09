# A03 离线验证证据

生成时间：2026-10-06T08:24:01.045Z

scope=OFFLINE_PICKUP_SESSION_EVIDENCE；不代表实际云、微信扫码、页面、存储恢复、SDK 并发或真实核销验收。

- A03 专项：28（包含在全量中，没有重复计数）；A03 / A02 / O07 组合：89/89。
- 全量：828/828，exit=0；fail / cancelled / skipped / todo 均为 0。
- 静态：294 个文件，exit=0；主包 / features / legacy 源估算：1239 / 139 / 45 KiB。
- Node：v24.19.0；平台：win32。
- 全量 / 静态执行前后源码指纹一致，文档和证据文件不在源码采集范围。
- 实际 cloudVerified / adminIdentityVerified / realScanVerified / realDeviceVerified / durableRecoveryVerified / realConcurrencyVerified / fulfillmentAllowed / successFeedbackAllowed：全部 false。
- 平台调用探测：0；现有客户端拒绝 admin.order.get / order.transition；没有部署 handler 或开放 allowlist。
- E01 / E12、E10 / SLOT、D06 / P08 实际门禁及 PS01–PS07 全部 NOT_RUN。

## 日志 SHA-256

| 文件 | SHA-256 |
|---|---|
| [full-final.tap](full-final.tap) | 401c644eea9ca984657d9953037cc19026df408220eac6f161a88aa5bed53730 |
| [full-final-exit.txt](full-final-exit.txt) | 9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa |
| [static-final.txt](static-final.txt) | ee0ad7c907be96ef5157c25e5aa2f36c770e4a4329811ba9a0868c9be86bc5e6 |
| [static-final-exit.txt](static-final-exit.txt) | 9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa |
| [affected-final.tap](affected-final.tap) | 7bed9f587b5829bae945c93f78095b19d7eedf92c297aad11e0db29c9232bc97 |
| [affected-final-exit.txt](affected-final-exit.txt) | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |
| [boundaries-before.tap](boundaries-before.tap) | 300f46c3e49218bcd9f702264cc82faffe73f097b8032427373d825db48feaea |
| [boundaries-before-exit.txt](boundaries-before-exit.txt) | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04 |
| [source-run.txt](source-run.txt) | d6ac797d70bd9e70398ecc31b116c8a1e6c81eed7b8098931cbdaff0b93e2264 |

boundaries-before 保留修复前 3 项失败。session-first / affected-after 保留较早轮次；终稿只取 affected-final / full-final / static-final。

## 源码指纹

执行前与执行后 SHA-256：e59a661052fea2cf97d57e5bc3dbfa9bd81e56960e299feab4e13b92fa0766aa

共 383 个公共源码 / 素材文件，范围沿用 P08 固定代码根目录；逐文件摘要见 [source-files.txt](source-files.txt)。私有配置、密钥、本机数据和文档排除；先前 A01 / A02 等历史证据不修改。

实现范围与真实验收计划见 [A03](../../archive/stages/phase-8.md#a03-pickup-session)。
