# A01 离线验证证据

生成时间：2026-10-06T06:54:23.383Z

scope=OFFLINE_ADMIN_AUTHORIZATION_EVIDENCE；本文件不代表实际云 / 运维身份 / 管理员 / SDK 并发 / 真机验收。

- 全量：766/766，exit=0；fail / cancelled / skipped / todo 均为 0。
- A01 专项：32（包含在全量中，没有重复计数）。
- 静态：288 个文件，exit=0。
- Node：v24.19.0；平台：win32。
- 真实 cloudVerified / bootstrapIdentityVerified / adminProvisioned / realConcurrencyVerified / realDeviceVerified / entryAllowed / operationsAllowed：全部 false。
- E01 / E12 及 D06 / P08 实际门禁仍待核验；AR01–AR07 全部 NOT_RUN。

## 最终日志 SHA-256

| 文件 | SHA-256 |
|---|---|
| full-final.tap | 0e54ab54fb57a61a407206ee7600032d216aed979c56544d7b898a0f42e1e12e |
| full-final-exit.txt | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |
| static-final.txt | 39230b6ba4b7d7a1bc7346fc9d8158ba94edd3e37c3108e4127b8c1ebb250ba1 |
| static-final-exit.txt | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354 |

## 验证后源码指纹

SHA-256：3f1f722dbdbf46e85af10337702003f0f9800e466af56f9c03ebd145296caaf6

共 377 个公共源码 / 素材文件，范围沿用 P08 固定代码根目录。逐文件摘要见 source-files.txt；排除私有配置 / 密钥 / 本机数据。

这是最终验证后快照，没有采集本轮执行前快照，不声称执行前后指纹比较。较早 full.tap / static.txt 保留原轮次，最终结论只取 full-final / static-final。
