# C03 规格读取与合法组合（本地）

更新时间：2026-10-04。入口见 [阶段三](archive/stages/phase-3.md#phase-3-execution)、[公开目录](archive/stages/phase-3.md#catalog-read)、[D03 权威规则](CATALOG-CART-RULES.md)。

此处维护规格投影、合法组合及确认失效规则；实现/页面接入/验收状态只查[CURRENT-STATUS](CURRENT-STATUS.md)。

## 公开详情投影

[createCatalogReadModel](../cloudfunctions/_shared/catalog-read-model.js) 新增 productGet({productId})，只读取同一可信一致快照中满足 C02 公开条件的商品：发布分类、同门店 ON_SALE、D03 校验完整的有效在售 SKU、精确登记的 PUBLISHED / REAL_PHOTO 云素材版本。

输出 apiVersion、productId、version、categoryCode、name、description、cover、minPriceCents、currency、images、optionGroups、messagePolicy、minLeadTimeMinutes、skus。起价仍为有效在售 SKU 的最低整数分价格。图集保留有效引用的配置顺序，按 assetId/revision 去重；封面取首个有效引用。私有审核 / 库存需求 / 素材哈希 / 完整素材实体不公开。

optionGroups 只含 groupCode/label/required/options；每项 optionCode/label。messagePolicy 为 null 或 maxLength/normalizationVersion。SKU 只含 skuId/version/description/selectedOptions/unitPriceCents/currency/minQuantity/maxQuantity；选项标签来自现行配置，不信任调用方标签。没有库存可用量或占用证明。

请求只接受 productId。无此商品、跨门店、草稿、下架、无完整 SKU / 实拍引用均 PRODUCT_UNAVAILABLE；请求结构错误 INVALID_REQUEST。公开错误仍由 D07 固定映射。快照和输出隔离 / 深冻结。

## 客户端规格模型

[createSpecificationModel](../miniprogram/utils/specification-model.js) 是无 Node 依赖的纯显示模型。只接受显式 optionGroups / SKU 组合；不生成尺寸、口味、夹心或组合，不计算价格笛卡尔积。规范化输出剔除未知字段，拒绝重复 ID / 组合、必选项缺失、非法价格 / 数量配置、getter / 循环 / 非 JSON / 稀疏数组。

| 方法 | 行为 |
|---|---|
| configuration() | 冻结的白名单配置与来源、待定留言信息 |
| evaluate(selectedOptions=[]) | INCOMPLETE / INVALID_COMBINATION / MATCHED；匹配时返回唯一 SKU 的价格、数量上下限；不自动选择替代 |
| changeOption(previousState,{groupCode,optionCode}) | optionCode=null 可清空；保留兼容后续选择，清除不兼容项并提示“部分规格已不适用，请重新选择。” |
| reconcile(previousState) | 当前配置重新核对旧选择；删除失效选项，商品版本或 SKU 版本 / 价格 / 数量约束改变时 requiresReconfirmation=true |

选项启用遵循配置组顺序及已经选定的前置组。前置必选项未选时，后续选项暂不可选。可选组省略代表真实的省略组合，不能隐式选入某个 SKU 选项；只有显式配置的组合可匹配。无规格组商品可匹配显式空组合 SKU。

changeOption 遇商品版本或已匹配 SKU 事实变化返回 SPECIFICATION_VERSION_CHANGED，需先 reconcile。状态中的 selectedOptions 标签重取配置值。刷新后提示规格已更新 / 重新选择；调用方必须显式让用户重新确认，不能依靠旧确认直接购买。

所有模型结果 canPurchase=false，包括正式配置的 MATCHED 状态：这里只说明组合匹配，后续 Bag / Quote 仍需服务端核对现行商品、SKU、数量、留言、库存与履约。客户端不构成价格或容量权威。数量 / 留言输入校验与独立页面尚未实现，数量上下限只是读取结果。

## 用户开发示例

[生成器](../scripts/generate-specification-preview.js) 从包外 C01 示例经草稿规划校验，生成 [JS 配置](../miniprogram/fixtures/specification-development.js)。9 商品 / 15 明确 SKU 与 Shop 的 development-example-* ID 对齐。蛋糕仅图中明确尺寸，小蛋糕及面包保留明确单品组合；面包统一 1200 分。没有猜口味、夹心或商品实拍。

蛋糕留言支持为 PENDING_LIMIT，messagePolicy=null；小蛋糕 / 面包 DISABLED。minLeadTimeMinutes、minQuantity、maxQuantity 均 null，source=DEVELOPMENT_EXAMPLE、canPurchase=false、configurationPending=true。版本 0 / 示例 SKU ID 仅为本地演示标识，不能作为云端有效版本 / 商品 ID。

[规格 Service](../miniprogram/services/specification.js) 只允许 development/shell 读取该配置；其他模式返回 CLOUD_NOT_CONFIGURED，没有开发数据回退到生产或云调用。它不修改现有 cloud allowlist、Shop 点击行为、旧 Product / Specification 页或已验收 Home。

生成检查：node scripts/generate-specification-preview.js --check；Shop 生成检查仍 node scripts/generate-shop-preview.js --check。小程序只 require JS 模块，后端模型、密钥、库存和整张海报不进入这些前端配置。

## 验证边界

非法组合、尺寸切换、失效选项清除、价格/版本变化、数据隔离和SKU权威解析均须验证。夹具里的口味、夹心、数量/留言上限、提前量及素材登记不能转为正式经营默认值。微信编译、真机、云目录与SDK分别提供证据。

[原C03过程与验证](archive/stages/phase-3.md#specification-rules)只作历史来源，不在此维护旧测试数量或下一任务。
