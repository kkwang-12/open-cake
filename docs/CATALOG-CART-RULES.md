# D03：商品规格与购物袋行规则

本文件维护商品/SKU、留言、袋行与库存引用的技术约束及已确认上限；缺项查[EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md)，实现/验收状态查[CURRENT-STATUS](CURRENT-STATUS.md)。

## 已确认经营上限

用户于2026-10-14确认下列正式值；不得沿用开发fixture中的上限。

| 项目 | 值 / 字段 |
| --- | --- |
| 购物袋最多商品种类 / 行数 | 60，cartLimits.maxLines=60；同SKU不同留言形成不同袋行，均占行数 |
| 每种商品 / 单行数量上限 | 15，cartLimits.maxQuantityPerLine=15；仍同时受SKU数量范围及履约日共享配额约束 |
| 订单备注长度上限 | 30，cartLimits.maxOrderNoteLength=30 |
| 支持留言的蛋糕留言上限 | 30，messagePolicy.maxLength=30；按下文既有规范化和Unicode码点计数，不改变不支持留言商品的策略 |

这些值不代表库存或时段已占用；同日蛋糕共享15个配额继续独立生效，不因袋行上限而放宽。配置和商品字段须通过受控发布流程落库，不将本节直接当作已发布云数据。

## 商品、SKU 与步骤

只允许 CAKE / MINI_CAKE / BREAD。产品 optionGroups 定义显示选项与 required；SKU.selectedOptions 明确列出可买组合，不把规格组的笛卡尔积当 SKU。可选组可不选，但该空缺组合也必须有明确 SKU。同一产品非 ARCHIVED SKU 的组合唯一；歧义配置拒绝，不选“第一条”。商品与匹配 SKU 均 ON_SALE、同门店且有完整整数分价 / 数量范围 / 资源需求 / 提前量后才能解析。

`resolveSku(product, skus, selection, requestedSkuId?)` 仅接受当前产品的可信 SKU 列表。selection 为 groupCode/optionCode 数组，客户端 label / 价格不作权威。缺必选、重复组、未知组选项拒绝；规范结果按 optionGroups 顺序，label 从当前产品读取。改变尺寸后必须重新匹配完整 SKU，旧 skuId 与新组合不符时拒绝。返回白名单、深冻结的 SKU 值；不修改目录对象、不查询库存。

Product / SKU 的这些字段是领域输入子集，不是完整发布校验器。图片来源、文件、经营资质和有效配置发布仍在 C01 / D05 等任务验证。SKU 列表必须由服务端完整读取相关配置，不能信客户端缩减后的列表。

配置页步骤来自商品数据：SIZE / FLAVOR / FILLING 只是可用组编码的示例，不强迫每个分类都有。留言是独立 cakeMessage，不作为规格组、SKU 或库存键；Quantity 独立于规格。BREAD 的 messagePolicy 必须 null；CAKE / MINI_CAKE 是否提供留言由明确配置决定，不用分类猜长度。无组的面包合法选择为 []，无需蛋糕步骤；当前未改 Specification 页面。

## 留言与合并身份

技术版本：`unicode-nfc-trim-codepoints-v1`。规范化顺序：拒绝非字符串与不完整 UTF-16 → NFC → trim 首尾空白 → 按 Unicode 码点检查 maxLength。maxLength 必须为明确正安全整数；测试长度不是正式经营值。保留内部空白、大小写、换行和标点；不进行静默敏感词替换。码点不是可见字形数量，组合 emoji 可占多码点；UI 后续须使用同一算法。

- 不支持留言：输入省略 / null 得到 cakeMessage=null；包括空串在内的字符串拒绝。
- 支持留言：省略输入得到空串，显式 null 拒绝；空串表示未填写。
- messageFingerprint 为 SHA-256(JSON.stringify([normalizationVersion, cakeMessage])) 完整十六进制摘要。null 与空串不同；摘要仅用于行身份 / 报价重校验，既不是身份凭证，也不是匿名化。
- 合并身份为同 productId / skuId / normalizationVersion / 规范化 cakeMessage；同时比较文本与摘要，不单凭哈希合并。同 SKU 不同文本可共存。
- 不支持的规范化版本拒绝并等待显式兼容 / 迁移，不在读取旧袋时静默改留言。

## 购物袋命令

`planCartCommand(cart, command, actor, args, context)` 返回 `{nextCart, changedLineId, changed}`。只支持 ADD / UPDATE / REMOVE，输入是服务端已读取的持久化袋与可信 actor；actor.type=CUSTOMER、subjectId 必须等于 cart.ownerId。context.now 为服务端 UTC 毫秒，newLineId 由服务端生成；context.product/skus/limits 是当前可信配置，不是客户端可指定权限的对象。

| 命令 | 必需输入 | 行为 |
|---|---|---|
| ADD | expectedVersion、selectedOptions、正 quantity；skuId 可选；cakeMessage 按政策 | 同配置留言则累加到原 lineId，否则以 newLineId 建行；合并后的最终数量检查 SKU 与门店上限；数量加量本身必须正整数，新行还须满足最低数量 |
| UPDATE | expectedVersion、lineId、expectedLineVersion、selectedOptions、绝对 quantity；skuId 可选 | 原行 product / sku 不改变；cakeMessage 省略保留原留言；数量 / 留言改变递增行版本，原值请求 changed=false 不递增；改成另一已有行身份拒绝，后续 UI 引导显式删除 / 添加 |
| REMOVE | expectedVersion、lineId、expectedLineVersion | 无需目录 / limits；下架或缺配置仍能删行；行不存在明确报错，不复活 |

每次实际写入袋 version +1、受影响行 lineVersion +1（新行 0）、updatedAt 更新；保留 addedAt 和未改行版本。必须有非负安全整数 expectedVersion，UPDATE / REMOVE 还须行版本。版本递增溢出拒绝；不可只做纯函数比较后无条件写库。

maxLines 与 maxQuantityPerLine 来自发布配置，没有硬编码正式上限。合并不增加行数，但不能绕过数量上限；满袋仍可合并已有行。配置调低后超行数袋不可 ADD / UPDATE，可 REMOVE 修复；更新绝对数量须同时满足 SKU.minQuantity/maxQuantity 和门店上限。改 SKU 用显式移除 / 新增，不能偷偷改稳定行身份；组合变更导致旧行不可购买时必须提示，删除仍可用。

购物袋不持久化权威价格 / 总额、库存锁、订单状态或客户端未知字段。重报价与下单读取当前目录；下架 / 改价不改历史订单。返回 nextCart 是白名单复制并冻结，输入不变；没有真实 DB、网络操作或 idempotency_records 去重。重复 ADD 用新的当前版本仍可累加；同幂等键防重复应由 D04 / B04 handler 实现。

## 库存引用与整单需求

`aggregateStockRequirements([{sku,quantity},...])` 将可信 SKU 的 stockRequirements 按 resourceId 聚合，返回排序 / 冻结的 `{resourceId,requiredUnits}[]`，所有乘法和求和检查安全整数。数量必须正整数，但该工具不替代 assertQuantity 或 SKU 解析；调用者须先验证购买数量、合法 SKU、资源归属与可用性。

- 独立库存：每 SKU 的 resourceId 不同。
- 共享库存：多个 SKU 指向同资源；不同 unitsPerItem 可表达同一整数单位的不同用量。
- 同 SKU 可以需求多个资源；每 SKU 内 resourceId 唯一，整袋可以重复引用并聚合。重复需求配置拒绝，防止无意双扣。
- 资源单位 / 分配必须商家确认；没有引用时 CONFIGURATION_REQUIRED，不擅自当无限库存。可用量、容量与 HELD/CONFIRMED/CONSUMED/RELEASED 由 D04 / D05 处理。

技术结构同时支持独立与共享。用户于2026-10-14确认蛋糕接单现做，各款式/尺寸按件计数，每个履约日合计严格上限15个，达到上限后停止接受该日蛋糕预约；不同SKU共享同一日配额，每个蛋糕占1个单位。面包、小蛋糕先各按每天20个记录，不拆成每SKU各享20个。日配额归属预约履约日期，不能用一个永久总数覆盖多个预约日；实际引用及取消回补须遵循受控配置与既有履约策略。报价与加袋都不预留；创建订单事务才预留。

V1分日引用为SKU.stockRequirements中的五字段模板：resourceId=分类池ID、unitsPerItem=1、scope=FULFILLMENT_DAY、categoryCode=当前商品分类、quotaPolicyVersion=category-day-quota-v1-20261014。模板本身不是可占用库存；报价与订单服务均用当前已验证时段的serviceDate解析成同一日期资源ID，再验证实际库存的门店/环境/分类/日期/政策/ITEM单位及分类上限。未绑定日期不能聚合模板，不允许调用方传一个永久池库存代替日期资源。同分类不同款式/尺寸、不同履约模式共享该日配额；环境、门店、分类或履约日不同则ID不同；SKU版本及经营配置版本不参与资源ID，避免修改配置后凭空重开容量。原有明确静态资源引用保持原规则。

分日库存字段和确定性ID唯一来源见[分类履约日配额](reference/data/daily-quota.md)。受控初始化只新增缺失ID，存在时保留已有版本、时间及HELD/CONFIRMED/CONSUMED占用并核对定义；禁止set/upsert覆盖重置。可调低实际库存但不得低于占用，不能调高超过CAKE15/MINI_CAKE20/BREAD20；临时停业或当日额度不足不自动借用另一日名额。模板及初始化清单不代表已落库或已发布。

## 示例与证据入口

开发示例唯一来源：[catalog.js](../tests/fixtures/catalog.js)。正式目录不能使用夹具默认值；历史D03实现和验证按[阶段二记录](archive/stages/phase-2.md#phase-2-execution)定位。
