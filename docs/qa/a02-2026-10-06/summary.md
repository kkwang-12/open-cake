# A02 离线验证证据

生成时间：2026-10-06T07:49:23.108Z

scope=OFFLINE_MERCHANT_ORDER_EVIDENCE；本文件不代表实际云 / 商家身份 / SDK 并发 / 真机 / 真实资金验收。

- 全量：800/800，exit=0；fail / cancelled / skipped / todo 均为 0。
- A02 专项：34（包含在全量中，没有重复计数）；受影响组合：142/142。
- 静态：292 个文件，exit=0；主包 / features / legacy 源估算：1239 / 127 / 45 KiB。
- Node：v24.19.0；平台：win32。
- 真实 cloudVerified / platformSourceVerified / adminIdentityVerified / realConcurrencyVerified / realDeviceVerified / realRefundVerified / entryAllowed / operationsAllowed：全部 false。
- E01 / E12、E06、E10 / E11 / SLOT、D06 / P08 实际门禁仍待核验；MR01–MR08 全部 NOT_RUN。
- 订单 / 身份 / 资金结果来自隔离串行内存夹具；不执行实际支付、退款、配送或云端写入。

## 日志 SHA-256

| 文件 | SHA-256 |
|---|---|
| [full-final-v2.tap](full-final-v2.tap) | 9026984f9d9abce53835837564c98a175c48ba4d53ad5a19b7f4b39d5bd73994 |
| [full-final-v2-exit.txt](full-final-v2-exit.txt) | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |
| [static-final-v2.txt](static-final-v2.txt) | 0ec1a1ece6f86f82e019ece00a545b30d191293d0e3e5b18a93e8bf8cefc666d |
| [static-final-v2-exit.txt](static-final-v2-exit.txt) | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |
| [affected-after.tap](affected-after.tap) | dd062e32a68b426428cd7f4b9f2ce176fefc27e5901c9ce1613d4d9792573bda |
| [boundaries-before.tap](boundaries-before.tap) | faf3a4c6d6046f7a572ecfbd814afe307863b3873fd934392c3d4f723fa5ab39 |
| [pending-review-before.tap](pending-review-before.tap) | 4390e4e45640b395b5807c24bd8b50333a0ec57664e37cd37dc9f5553529c0f4 |

最终结论取 full-final-v2 / static-final-v2。boundaries-before 为修复前 2 项失败，pending-review-before 为修复前 1 项失败；保留原始复现证据。affected-after 为受影响组合，其他较早日志保留对应轮次。

## 验证后源码指纹

SHA-256：fb81727329017902fd635d36042e202938f8ff3898af1dd776813982fc2e2f20

共 381 个公共源码 / 素材文件，范围沿用 P08 固定代码根目录。逐文件摘要见 [source-files.txt](source-files.txt)；排除私有配置 / 密钥 / 本机数据及文档。

这是最终验证后快照，没有采集本轮执行前快照，不声称执行前后指纹比较。A01 等历史证据保留原指纹。

实现范围与真实验收计划见 [A02](../../archive/stages/phase-8.md#a02-merchant-orders)。
