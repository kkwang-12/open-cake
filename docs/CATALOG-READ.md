# C02 商品列表与 Shop 本地实现

更新时间：2026-10-04。正式云接口仍 PLANNED，当前交付为公开读纯模型与 development/shell 的 Shop 示例浏览。没有云部署 / DB 查询 / 上传 / 新购买入口。

## 正式公开读取模型

[createCatalogReadModel](../cloudfunctions/_shared/catalog-read-model.js) 接收可信、一致、有限的 categories/products/skus/mediaAssets 快照、服务 context 和服务器专用 HMAC key，返回 categoriesList() / productsList(input,now)。不接受 includeDraft / 任意排序 / Filter 或客户端控制的素材白名单。

context 为 environment/storeId/stage/allowedCloudPrefixes；key 为 id + 至少32字节 Buffer secret，模型复制密钥，调用方之后改变 Buffer 不影响此模型实例。context / records 先按既有 canonicalJSON 复制，拒绝 getter、循环、非JSON对象及稀疏数组；输出深冻结。

categoriesList 只投影已发布 CAKE / MINI_CAKE / BREAD 的 code/nameZh/nameEn/sortOrder。仅三分类，不因未知类目扩充 UI。productsList 输入与 D07 一致：storeId 必填，categoryCode/search/pageSize/cursor 可选。名称查询 NFC / trim / 小写 / 64字符上限，采用文字子串，不将输入当正则或数据库表达式。店 ID 须与可信快照范围一致。

正式商品卡必须同时满足：

- 目标门店、已发布三分类、product.status=ON_SALE，以及合法 ID / name / description / version / sortOrder。
- 至少一个经过 D03 resolveSku 的合法 ON_SALE SKU：明确价格 / 数量 / 提前量 / 留言规则 / 资源需求，唯一合法组合。低价草稿、下架规格或缺配置规格不参与起价。无有效 SKU 的商品不返回。
- 封面精确命中 C01 的同 assetId/revision、storageRef/sourceKind，不接受任意 URL / 未登记版本 / 内部额外字段；素材必须 PUBLISHED、REAL_PHOTO、受控云引用。若首张无效，可尝试后续有效引用；全无效则不返回商品。实际图片网络加载失败仍由已有卡片组件兜底。

ProductCard 只含 productId/version/categoryCode/name/description/cover/minPriceCents/currency；cover 只有 PublicMedia 的四字段。库存资源、实拍审批内部数据、文件摘要、保留期、审核元数据和原始文档均不返回。名称与规格文本不执行脚本。

categoriesList 返回 {apiVersion,items}；productsList 返回 {apiVersion,items,nextCursor,hasMore}，apiVersion 沿用 v1-api-2026-10-03。无合法商品返回空页，而非泄露草稿或把草稿当可买商品。

## 稳定分页与一致性边界

固定 sortOrder ASC + ASCII _id ASC；按 D07 默认20 / 最大50，取 pageSize+1，只返回前 pageSize，游标取最后返回项。同 sortOrder 以稳定 ID 打破并列，不使用 skip。可以更改下一页 pageSize，但不能复用游标改变店、类目、查询、环境或当前公开目录版本。

复用 [D07 HMAC 游标](API_NETWORK.md)。query 绑定公开分类 / 已投影商品排序内容的完整摘要，不把名称关键词原文、库存或密钥塞入 token。新建模型的公开名称 / 价格 / 状态 / 封面 / 排序发生变化时，旧游标拒绝并要求从第一页刷新。相同模型实例持有隔离的固定快照，调用者修改原对象不会影响后页。游标过期 / 被修改同样拒绝。

这不是真实数据库快照服务。当前模型在内存中处理完整有限快照；未来 SDK adapter 不能每次不受控全表扫描后分页。需先验证平台身份 / 门店可公开范围，用索引过滤同店、三分类、发布状态及必要关联，保持排序与 seek 的 AND 条件、可信目录修订 / 快照语义；并实测 SDK 字符排序、多页变更、索引和查询预算。不能把本模型的无重漏回归当成云分页已验收。

CatalogReadError：INVALID_CATALOG_SNAPSHOT / INVALID_CATALOG_READ_CONFIGURATION / INVALID_REQUEST / NOT_FOUND；D07 页请求 / 游标错误可传播。预期 D03 / C01 数据配置错误使商品不可公开，意外程序错误不吞掉。未来网络固定脱敏，不回传内部记录 / 配置 / stack。购买仍由云端再次核验价格 / 商品 / 库存 / 预约，浏览不占库存。

## Shop 开发示例

[生成脚本](../scripts/generate-shop-preview.js) 从 C01 用户示例生成 [shop-development.js](../miniprogram/fixtures/shop-development.js)，只保留9项卡片展示数据。蛋糕显示168/188/178元起，小蛋糕36/38/42元，面包统一12元。原图、参考摘要、真实 SKU / 服务端模型 / 密钥不进入主包；正式实体仍 DRAFT。

[catalog Service](../miniprogram/services/catalog.js) 仅 development+shell 可读取示例，明确 source=DEVELOPMENT_EXAMPLE、保留 development-example-* ID 和 canPurchase=false。其它 stage/mode 返回服务未开通，绝不回退到开发目录或把其发送给云接口。当前不改变 cloud.js allowlist，不冒充已部署 catalog。

本地标记 development-preview.* 是无购买能力的分页位置，绑定示例修订 / 分类 / 关键词；不是服务器签名游标，任何正式服务均不能接收它。默认页面6项、最多50项，没有前端签名密钥。返回卡片白名单，不复制源数据额外字段。

[Shop](../miniprogram/pages/shop/shop.js) 保留原先两列布局、四个分类标签及黑白暖白样式，小蛋糕中文与已确认三分类一致；不改 Home / Hero / 共享商品卡 / 旧 Product 预览。

- 首次加载 / 分类切换从第一页开始；进入时接收 Home 的 pendingShopCategory。
- 手动“加载更多”及滚到页尾续页；终页明确显示已展示全部。图片为空使用既有商品卡兜底。
- 加载失败显示固定提示和重新加载；续页失败保留已有商品 / 原游标，重试同页，防止重复点击造成并行续页。
- 请求代次检查防止旧分类成功 / 失败覆盖新分类；隐藏 / 卸载后迟到结果不更新页面，回来重新读取。
- 对重复返回 ID 做显示去重；分页标记不前进视为错误，避免无限续页。
- 开发示例点击提示“开发示例暂未开放选购”，不跳到仅支持三条旧 preview ID 的详情，避免无效详情或意外购买。C03/C04 后续接入真实规格 / 详情，本次不扩展这些能力。
- 页面明确显示临时开发示例、价格 / 照片待补、暂未购买。整张参考海报没有被当作每个商品的实拍图片。

生成 / 校验（本机 Node 路径见 HANDOFF）：
```powershell
node scripts/generate-shop-preview.js
node scripts/generate-shop-preview.js --check
node --test tests/catalog-read-model.test.js tests/shop-catalog.test.js
```

## 微信工具与验证

18项新增回归：公开投影 / 隐私、三分类 / 状态 / SKU过滤 / 起价、精确实拍引用、并列排序分页 / 游标绑定 / 变更 / 过期、数据隔离、C01草稿不公开、示例同步 / 环境隔离 / 12元价格、页状态竞争 / 重试 / 去重、防购买跳转及 JS-only 模块加载。全套165/165、静态158文件通过；主包估算1958/2048KiB，微信实际打包大小仍待工具确认。

首次微信截图发现 require JSON 模块导致 Shop 空白，已改为生成 JS 模块，并在 scripts/check.js 增加小程序相对 require 必须解析至 JS 的门禁；后端 Node JSON 读取保持支持。Node 测试不能替代微信运行验收。

修复后使用用户此前授权的本地官方 CLI 编译 / 打开 Shop，366×793截图已人工核对；真实元素点击 Bread 后3条 / 1200分，切回 All 并滚动触发续页后9条且终页。证据在 artifacts/phase-3-qa/c02-ui-report.json、c02-shop-fixed.png、c02-shop-bread.png、c02-shop-all-loaded.png。首次空白截图保留为诊断，不当验收图。工具缓冲还含平台 network offline SDK 错误，不能宣称全程无console错误。没有上传腾讯预览、二维码或真机测试。

完整本机报告：c02-tests.txt / c02-static.txt / c02-contract-audit.json / c02-report.json，均 Git 忽略。既有未提交成果按哈希核对保留；修改仅本任务的 Shop、静态门禁和进度 / 契约文档。没有 commit / push / 云写入。

C02本地模型与示例Shop通过；真实平台身份、SDK查询 / 索引 / 云接口、正式商品 / 实拍、真机交互和动态云分页仍待E01/E05，不标C02云整体验收完成。下一项C03本地SKU读取 / 规格配置投影与合法组合判定，再按依赖推进C04。

## C03 本地商品详情 / 规格补充

createCatalogReadModel 新增 productGet({productId})，沿用 C02 公开条件；返回卡片字段及 images / optionGroups / messagePolicy / minLeadTimeMinutes / skus。SKU 仅含 skuId/version/description/selectedOptions/unitPriceCents/currency/minQuantity/maxQuantity，不公开库存需求。图集按精确已发布实拍版本去重，现行配置提供选项标签；不可公开商品统一 PRODUCT_UNAVAILABLE。

规格纯模型 / 输入输出详见 [SPECIFICATION-RULES.md](SPECIFICATION-RULES.md)。组合匹配、失效清除和版本重确认仅为客户端显示能力；正式价格 / 数量 / 留言 / 库存 / 履约仍须服务端最终验证。开发 Service 只在 development/shell 提供9商品/15规格，未知经营配置仍null、canPurchase=false。不增加 handler、SDK、allowlist 或 action 部署状态。

C04更新：Shop开发卡片现已导航同ID商品详情，不再停留于“暂未开放选购”提示；详情仍不可买，规格入口仅导航独立壳。详见 [PRODUCT-DETAIL.md](PRODUCT-DETAIL.md)。前述C02行为为历史记录。
