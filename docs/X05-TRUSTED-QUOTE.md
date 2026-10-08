# X05 可信报价：离线规划与重核验

2026-10-05。当前仅服务端内部纯模型，无 quote.create / quote.get handler、云保存、客户端正式报价或资源占用。保留全部已有 UI 和 X03 / X04 未提交改动。

## 输入与可信来源

`cloudfunctions/_shared/quote-model.js` 提供 planQuoteCreation、revalidateQuote、projectQuotePreview。入口复用 D07 的 checkout.quote.create 请求白名单：购物袋 ID / 版本、所选行 ID / lineVersion、方式、联系人、本人地址 ID、slotId、可选备注与幂等键。网络行版本明确转换为 B06 内部 expectedLineVersion；不接受客户端价格、总额、角色、坐标、费用、评估 ID、时钟或额外字段。订单备注 null 拒绝，省略为规范化空字符串。

门店、发布配置、本人购物袋、目录、地址、真实时段与库存记录，以及 principal / 时钟 / 数量限制均必须来自受控服务端加载器的一致读取；模型参数本身不是网络身份验证。复用 X02 联系人号码校验、B06 正式 SKU / 数量 / 留言 / 行版本重核验、D05 当前日期 / 最大提前量 / 时段定义与余额，以及 X03 本人地址 / 当前规则 / 精确位置可信核验。店或商品提前量、最大预约天数、quoteTtlMinutes、号码政策、备注政策、可信实拍核验任何一项缺失，不能生成正式报价。

verifyProductImage 接收产品 ID / 版本与冻结的 MediaRef 白名单；必须由正式素材加载器确认受控实拍引用，严格返回 true。开发 Hero 或参考图不代替正式商品图。validateOrderNote 是尚待经营备注限制配置的可信适配器，不猜长度；validatePhone 和 verifyLocation 同样不能用客户端自证结果代替。测试中的 true 适配器仅为隔离用例。

## 金额、快照与时间

价格从当前 SKU 重算，所有金额为 CNY 安全整数分；共享库存需求按整个所选袋聚合。未选行不进入报价，缺库存 / 不足 / 关闭或不可约时段拒绝。每订单 SLOT 需求为 1，不按商品数量占用预约名额；自取和配送容量独立。

调用 D02 captureOrderFacts 捕获版本化商品 / 留言 / 图片、袋选择证据、门店 / 联系人 / 地址 / 时段 / 配送规则及金额的不可变白名单快照。自取地址 null、运费 0、配送评估字段 null；配送经 X03 通过后亦为 0 分，并绑定地址版本 / 摘要和当前规则。报价规划生成的 quoteId 和配送 evaluationId 是确定性的**待保存标识**，仅在内部 OFFLINE_QUOTE_PLAN 中返回；不冒充已存在的报价或已保存的评估凭证。

过期时间取 min(createdAt + 发布配置 quoteTtlMinutes, 时段开始 - 最大提前量)，必须严格晚于创建时间；拒绝非法或溢出时效。now >= expiresAt 即失效，无需等待 TTL 清理。报价时效不等于订单付款保留时长，模型没有猜 paymentHoldMinutes。

## 保存、重复请求与重核验

规划返回 proposedQuote、当前 STOCK / SLOT resourceVersions、幂等摘要与 requiredEffects；配送另附待保存的评估追踪内容。requiresAtomicPersistence=true，必须实际原子保存报价、幂等结果以及关联配送追踪后才可报告成功。追踪持久化位置仍待云接入设计；没有新增评估数据库集合。capacityReserved=false、stockReserved=false、checkoutAllowed=false。

幂等键按环境 / 本人 / checkout.quote.create 绑定业务请求摘要。已保存同键同参返回 REPLAY 决策，同键异参拒绝，未决回执返回 BUSY；这些是 D04 离线决策，未获得真实锁或完成 SDK 重放验收。没有受控回执时同 ID 再次规划不构成自动去重，未来插入和幂等回执必须同事务。

revalidateQuote 只接受服务端读取的本人记录，检查结构 / 未消费 / 时效，再从当前可信数据重建事实并比对版本、价格、地址、配置、资源证据与截止。价格或商品版本变化需要重新报价；已满或关闭的时段 / 库存不足不能继续使用旧报价。资源版本即使余额仍足够，只要证据版本变动也保守要求刷新。门店版本单独变化但快照事实不变的自取场景按当前 D02 结构比较经营事实及发布配置版本，不声称已增加 storeVersion 字段。消费检查不等于实际消费；order.create 仍需真实事务完成全资源预留和唯一消费。

projectQuotePreview 经重核验后投影 OFFLINE_QUOTE_PREVIEW，只含买方商品、金额、联系人 / 地址、时段和时效；不暴露资源版本、袋证据、评估 ID / 指纹、本人 ID 或内部坐标。配送显示 ESTIMATED。该投影尚未接客户端，不新增下单成功提示。

## 验证与下一项

新增 13 项报价回归，全套 **357/357** 通过，静态 **221** 个文件通过；主包源估算仍 **1213 KiB**，features **87 KiB**、legacy **45 KiB**。涵盖双分支、整数金额、选中行、共享库存聚合、伪造价格拒绝、满额 / 缺库存、未定位 / 越界、过期等号边界、提前量截止、改价 / 地址 / 配置 / 资源版本失效、幂等及公开投影隐私。测试 TTL 10 分钟、备注 30 字、提前量 60 分钟、最大 7 天、模拟实拍引用与 (0,0) 点均为 OFFLINE_TEST_ONLY，不代表正式经营资料。

本轮无页面或素材变动，未重复操作微信模拟器；X04 原生验收记录保留。本项没有实际云持久化 / 地图 / SDK 并发 / 真实 A/B / 报价重放验收。下一项 X06 Checkout 双分支与输入保留组合；云购买门禁仍关闭。不提交 / 推送 / 上传 / 部署。
