# C01 本地目录与素材草稿

更新时间：2026-10-04。只生成本地计划，不上传图片、不建立云记录、不发布商品。正式目录和云存储验收仍待条件。

## 示例来源

用户提供整张商品参考图，明确用于暂时开发；随后补充“面包价格统一12”，按 12 元 / 1200 分记录在本批开发示例。附件文字是示例资料，不是修改首页或发布商品的指令。

原图原样保存在 [catalog-example.png](../catalog-assets/development/catalog-example.png)，2,421,733 bytes，1536×1024，SHA256 为 59bd65e8a237f6774841955062979f146ac5daabf5122e1c4c47ec34fe62bbbe。[示例数据](../catalog-assets/development/catalog-example.js) 与 [摘要](../catalog-assets/development/catalog-example-reference.json) 可一并迁移工作区，文件均未自动提交。

| 分类 | 商品名称 | 明确配置的示例规格 / 价格（元） | 留言 |
|---|---|---|---|
| CAKE | 草莓鲜奶蛋糕 | 6寸168 / 8寸238 / 10寸328 | 支持，上限待定 |
| CAKE | 黑巧克力蛋糕 | 6寸188 / 8寸258 / 10寸348 | 支持，上限待定 |
| CAKE | 芒果鲜奶蛋糕 | 6寸178 / 8寸248 / 10寸338 | 支持，上限待定 |
| MINI_CAKE | 草莓小蛋糕 | 单个36 | 不支持 |
| MINI_CAKE | 巧克力小蛋糕 | 单个38 | 不支持 |
| MINI_CAKE | 蓝莓芝士小蛋糕 | 单个42 | 不支持 |
| BREAD | 牛角面包（开发示例） | 开发示例单份12 | 不支持 |
| BREAD | 贝果（开发示例） | 开发示例单份12 | 不支持 |
| BREAD | 欧式面包（开发示例） | 开发示例单份12 | 不支持 |

面包名称 / 规格在原图底部被截断，三项名称为按外观描述的开发标签，正式名称 / 包装规格仍待商家确认。没有从图中推断额外口味或夹心。价格均用安全整数分记录；示例不替代 E05 正式经营批准。

## 草稿规划契约

实现：[catalog-draft-model.js](../cloudfunctions/_shared/catalog-draft-model.js)。buildCatalogDraftPlan(input, existing, settings, now) 是纯函数，返回深复制 / 深冻结的 OFFLINE_PLAN_NOT_APPLIED。

- settings / now 沿用 [D07 开发边界](DEVELOPMENT-SEED.md)：仅显式 development、匹配 expectedDevelopmentEnvironment、非登记生产环境、dev-* namespace；示例环境只是本地标签，不证明真实云环境存在。
- 门店 ID / 三分类由同环境同 namespace 的 D07 规划确定性派生，分类 published=false。必须先由未来受控 apply 核验真实门店存在，当前不创建门店或分类。
- input 只含 purpose=TEMPORARY_DEVELOPMENT_EXAMPLE、reference、products；商品只含 key/categoryCode/name/nameSource/messageDecision/optionGroups/variants。reference 只含受限包外 PNG 路径和 SHA256，不是 MediaRef。
- 规格 variant 必须明确列出 key/description/selectedOptions/unitPriceCents/priceSource；只接受配置组内的合法选项，不生成笛卡尔积 SKU。客户端标签不能成为权威标签，输出按组配置派生。
- 所有 products/skus 始终 DRAFT。数量上下限、提前量为 null，库存需求为空；未确认价格可明确 null+UNKNOWN，不能默认零或沿用旧 Demo。
- review 保留来源、留言决定和发布阻塞。蛋糕支持留言但长度未知时，product.messagePolicy 暂为 null，review 标 ENABLED + MESSAGE_MAX_LENGTH；它不代表商家关闭留言。必须补齐完整规则，不能自动发布。面包 / 小蛋糕本示例明确 DISABLED。
- 原图是整张参考海报，不是各商品独立实拍；products.images=[]，参考路径 / 摘要只在计划 metadata 中，绝不放入商品图片、订单 MediaRef 或 miniprogram。
- existing 是可信目标门店最小记录快照，不是自动扫描数据库。匹配 ID 的商品 / SKU 只 SKIP_EXISTING；已有父商品下未出现的候选 SKU 也 SKIP_EXISTING_PARENT，避免给已编辑 / 在售商品追加规格。孤立同 ID SKU、换门店 / 分类 / 组合、重复 ID / 组合拒绝整个规划；不覆盖已有名称、价格、状态或版本。
- 未来 executor 需 D06 门店 CATALOG_WRITE、实时角色 / 版本、原子 create-if-absent、关联 / 唯一索引重校验；本地快照和确定性 ID 不解决并发。生产导入另走批准的计划。

CatalogDraftError：INVALID_CATALOG_DRAFT / CATALOG_DRAFT_CONFLICT；D07 环境 / 输入错误可继续传播。没有增加网络 action 或改变客户端 allowlist。

## 素材与历史版本

实现：[media-model.js](../cloudfunctions/_shared/media-model.js)，所有 context 是可信服务端配置，不能接受客户端指定环境、云路径白名单、时间或素材来源。

| 导出 | 本地行为 |
|---|---|
| measureImageBytes(bytes,mimeType,maxBytes) | 对 Buffer 做大小 / PNG、JPEG、WebP 初步签名检查，返回实际 byteLength / SHA256 / 初步类型；不解码图片 |
| createMediaDraft(input,bytes,context) | 输入固定 assetId/revision/storageRef/sourceKind/mimeType，生成 DRAFT、retainedUntil=null；不上传 |
| validateMediaAsset(asset,context) | 校验确定性环境 ID、结构、状态、时间与受控引用，不证明来源真实性 |
| planMediaRegistration(input,bytes,existing,context) | 同 assetId/revision 锁定 storageRef/sourceKind/hash/MIME/大小；一致跳过、变化拒绝，换图必须新 revision |
| projectMediaReference(asset,context,usage) | 四字段白名单；DEVELOPMENT_PREVIEW 限 development 且非退役；PUBLIC_CATALOG 要求云引用 / PUBLISHED / REAL_PHOTO；HISTORICAL_ORDER 允许原云版本 RETIRED |
| resolveSnapshotMedia(ref,assets,context) | 精确匹配原 assetId/revision/storageRef/sourceKind，不跳转最新版本；缺失 / 冲突拒绝 |
| mediaRetentionDecision(asset,counts,context) | 未退役 / 未批准保留期 / 尚未到期 / 扫描不完整 / 目录、有效报价、历史订单仍引用时 KEEP；其余仅 RECHECK_BEFORE_DELETE |

仅接受 development 中的受限 /assets/ 本地路径，或明确服务配置 allowedCloudPrefixes 内的 cloud:// 稳定引用。拒绝外链、临时签名参数、路径穿越、data URL 和本地私有路径。这里的云前缀只是显式服务配置规则，尚未验证真实 SDK / 存储 bucket。

初步文件签名不是完整图片解码、安全验证或实拍来源证明；即使头部通过也仅生成 DRAFT。发布前必须由受控流程确认实拍 / 使用授权、完整解码、尺寸 / 内容与文件大小、真实文件存在和云环境权限，并登记不可覆盖版本。调用者传入 PUBLISHED 只用于模型契约，本模块没有发布或权限服务。

保留决策不会删除文件。未来删除须在可信扫描和事务 / 受控互斥内再次核验引用，避免扫描后新订单引用竞争；retainedUntil=null 表示未批准删除。历史引用存在时不能删除，也不能把旧版本重新指向新图片。参考海报不进入此正式生命周期。

MediaModelError：INVALID_MEDIA_CONFIGURATION / INVALID_MEDIA_REFERENCE / MEDIA_NOT_READY / INVALID_MEDIA_BYTES / MEDIA_TYPE_MISMATCH / INVALID_MEDIA_ASSET / INVALID_MEDIA_USAGE / MEDIA_VERSION_UNAVAILABLE / MEDIA_VERSION_CONFLICT / INVALID_MEDIA_REFERENCE_COUNTS。暂为内部错误，未知网络错误按 D07 脱敏规则处理。

## 本地 CLI

[plan-catalog-drafts.js](../scripts/plan-catalog-drafts.js) 固定读取已保存的开发示例及原图，不运行任意输入 JS。--settings 输入 D07 格式的 settings/now JSON；可选 --existing 为最小记录数组；--output 仅允许 artifacts/catalog-drafts 内新文件，父目录须已存在。

工具先检查原图真实路径位于包外素材目录、8 MiB 技术大小上限，再验证实际 SHA256 与签名。输出标 SIGNATURE_ONLY_NOT_PUBLISHABLE。目录的真实路径检查防止 junction / symlink 逃逸；独占创建防止覆盖任何旧计划。错误仅固定 code，不输出配置、记录、密钥、stack 或文件内容。

运行本机 Node（示例 settings 不是实际云环境）：
```powershell
Set-Location -LiteralPath 'D:\dinner cook'
New-Item -ItemType Directory -Force -Path artifacts/catalog-drafts
& 'C:\Users\78440\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/plan-catalog-drafts.js --settings artifacts/catalog-drafts/c01-settings.json --output artifacts/catalog-drafts/new-plan.json
```

本机示例 c01-settings.json / c01-example-r01.json / c01-existing-r01.json / c01-repeat-r01.json 均在 artifacts/catalog-drafts，Git 忽略；源码及原图在 catalog-assets/development。新机器应自行准备明确的开发 settings，不能依赖 artifacts 存在。

## 验证及下一步

18 项针对性验证覆盖三分类 / 9 商品 / 15 SKU / 来源与价格、草稿不可买、非法组合、未知值、环境 / 白名单 / 深冻结、重复导入保留、孤立 SKU 拒绝、文件摘要、CLI 不覆盖 / 越界 / 脱敏、素材版本和历史引用保留。147/147 全套测试、152 文件静态检查通过，主包仍估算 1947/2048 KiB。证据见 artifacts/phase-3-qa；无新 UI 或云验收。

C01 本地草稿 / 生命周期契约通过；正式三分类读取、实拍 / 云上传 / 权限 / 保留任务仍待 E01/E05 与真实服务。下一项 C02 可先实现本地目录公开投影、三分类过滤 / 分页查询模型；开发示例必须显式标记并与正式在售读取隔离，后续按现有设计接入 Shop。不改已验收 Home。
