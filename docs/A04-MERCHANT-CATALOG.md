# A04 商品 / SKU / 库存维护（2026-10-06）

状态：可离线校验、查询与事务编排完成；正式经营资料、商家页面、云 SDK / 索引 / 并发和发布验收仍待。A04 整体验收未通过，真实操作继续关闭。

## 当前实现

新增 [merchant-catalog-model.js](../cloudfunctions/_shared/merchant-catalog-model.js) 和 [merchant-catalog-service.js](../cloudfunctions/_shared/merchant-catalog-service.js)，复用 A01 严格当前权限、C03 / D03 目录规则、媒体版本与资源计量。

| 既有目标 action | 可离线行为 |
|---|---|
| admin.products.list | 当前同店商品及明确 SKU 摘要，按 sortOrder / ID 分页，支持状态过滤 |
| admin.product.get | 当前同店商品、SKU 编辑资料白名单 |
| admin.product.save | 新建 DRAFT 或维护现有商品 / 完整 SKU 集合，原子实体 / 审计 / 回执 |
| admin.product.status.set | 显式上架、下架或归档，独立版本检查和审计 |
| admin.inventory.list | 当前同店已存在库存资源及可用量，按 createdAt / ID 分页 |
| admin.inventory.setTotal | 只改总配额和版本，不改单位、归属、状态或占用计数 |

没有新 action、admin handler、SDK / 网络 / 客户端 allowlist / UI 或实际云写入。商品 / SKU 采用既有集合与五个通用字段；资源沿用 inventory_resources。未创建、重置库存资源或发布临时开发示例。

## 保存契约

product.save 的 draft 必须完整包含 categoryCode / name / description / images / optionGroups / messagePolicy / minLeadTimeMinutes / sortOrder / skus，禁止传入产品状态、身份、scope 或元数据。门店从已存在记录核对，分类只允许 CAKE / MINI_CAKE / BREAD，已有分类和 storeId 不原地改变。

每项 SKU 包含 description / selectedOptions / currency / unitPriceCents / minQuantity / maxQuantity / stockRequirements / status。已有项另带 skuId / expectedVersion；新项不提供这两项，服务器按环境 / AppID / 父商品 / 回执 / 序号生成固定 ID。新商品 ID 也与门店及回执绑定，不接受客户端指定实体 ID。

新商品保持 DRAFT；SKU 状态按显式字段保存，父商品未上架时不会因某个 SKU 为 ON_SALE 对外可售。产品上架不自动把 SKU 全部改为 ON_SALE。已有商品保持当前状态；修改在售商品时仍须通过发布完整性校验。

已有 SKU 的 groupCode / optionCode 组合固定，换组合应建新 SKU；标签由当前配置规范化，不信任客户端标签。必选组不能缺失、组 / 选项不能重复，非归档 SKU 组合唯一，不生成笛卡尔积。选项组变更必须兼容全部当前非归档 SKU；归档 SKU 保留旧组合和完整原资料，不可复活 / 改价。省略任何已有 SKU 被拒绝，不以覆盖列表进行硬删除。

产品每次保存递增版本；只有内容变化的已有 SKU 递增版本，不变项保留原版本，新项 version=0。产品 / SKU 的创建时间、归属和服务器私有字段保留；新增 / 编辑的版本递增溢出或旧父 / 子版本一律拒绝。归档父商品不可编辑或重新上架；删除以归档表示，不删除历史记录。

草稿允许显式 null 的价格 / 数量 / 提前量、空图片 / 库存要求，保持未配置，不自动补经营值。非 null 价格为正安全整数分，数量为正整数且上下限一致，币种只允许 CNY；BREAD 不支持留言，留言策略使用既有规范版本及显式正长度。保存草稿也不能写非法组合、非法金额或不存在 / 他店资源。

## 发布与图片保留

ON_SALE 需分类已发布、明确提前量、至少一条 ON_SALE 且完整合法的 SKU、明确数量 / 库存要求、已确认单位的同店 OPEN 资源和有效登记图片。所有选定发布图片必须是当前允许云路径下、PUBLISHED / REAL_PHOTO 的确切 assetId / revision / storageRef / sourceKind；临时素材、DESIGN_PREVIEW、DRAFT / RETIRED 素材或缺版本不能用于上架。真实内容核验与商家正式批准仍待 E05；测试中 REAL_PHOTO 标签只为隔离元数据夹具。

草稿引用也必须匹配已登记元数据；没有上传 / 覆盖 / 删除素材的接口。更换产品图片只更新现行引用，旧 media_assets 版本保持，历史订单 / 报价原引用不改。资产的真实文件保留和删除前完整引用扫描仍属媒体接入待办，不能把无删除代码称为已验收物理保留。

下架 / 归档不取消历史订单、不释放已确认预留、不恢复已消耗库存。归档商品保留 SKU 记录，父状态使其不对外销售；不能只依据 SKU 仍 ON_SALE 绕过父状态。要归档最后一个在售 SKU，应先显式下架父商品，避免在售父商品没有合法可售 SKU。

## 库存和购买核验

setTotal 的下限为 heldUnits + confirmedUnits + consumedUnits，求和及总量必须为安全整数。等于占用量可以保存，可用量为 0；低于占用量整笔拒绝。CLOSED 资源可维护配额但不会被自动打开；单位 / storeId / 名称 / 原计数保持，不清零预留，不把退款当补货，不处理 SLOT。

版本变更由既有 B05 / X05 / O03 在下次核验识别。真实本地组合验证：保存新价格 / 下架后，已有 quote 不能创建订单；库存总量版本改变也令旧 quote 失效。当前目录新价格在 C03 投影可见，下架父商品不再返回。

本轮不遍历修改顾客 cart、quote、order、payment、reservation 或本机 Storage。购物袋中的旧产品 / SKU 版本继续交给已有核对逻辑，在下一次读取 / 结算时要求核验；客户端同步更新界面仍待真实服务接线。历史 order / order_items、金额与图片事实、日志、实付和资源预留没有被目录维护改写。

## 权限、幂等和审计

每笔事务重读当前 ACTIVE 用户、完整环境 / AppID A01 角色和门店头，用同一当前 CATALOG_WRITE 授权。实体操作先读服务器归属，再鉴权，随后才加载关联目录；不存在 / 无权实体统一内部 NOT_FOUND。普通顾客、伪造 principal、错误环境 / 他店、禁用、撤销及归档门店均拒绝，旧 key 重放也重新鉴权。

幂等 scope 为环境 + [AppID,主体] + admin.action + key，指纹绑定完整请求，改参拒绝。新建确定性 ID 与回执绑定；重放结果版本必须匹配原请求的 expectedVersion+1，新建必须为 0，不能用后来实体版本伪造原结果。当前实体须存在、版本不落后；同版本结果核对实体白名单指纹，后续正规修改后仍可重放旧结果，不再次应用改价 / 调库存。

产品 / 变化 SKU、audit_logs、idempotency_records 同事务，每个写结果必须为 1 行；单 SKU 新建 / 改价典型 4 写，未改 SKU 的产品维护或上下架 / 调库存典型 3 写，多 SKU 按实际增量。任何写异常 / 零行、完整读集或提交冲突全部回滚。

审计保存服务器 STORE ActorRef、环境 / AppID / 店、目标前后版本、action、脱敏 reason / requestId，以及 requestFingerprint / entityFingerprint 标量变化，不保存完整 draft、媒体元数据、电话或用户来源。摘要是关联证据，不是密码学身份或防篡改签名；实际审计权限、保留和读取仍待云 / A06。

## 适配器与查询限制

runTransaction 必须提交后返回，失败全部回滚。会话提供当前用户 / 完整 access、最小实体读取、readCatalogState(storeId)、回执 / 审计、条件保存 / 唯一插入和 assertCatalogReads；不能只 CAS 父商品而继续使用旧角色、SKU、资源或素材。

本轮 readCatalogState 读取明确门店的完整有限快照，含 products / skus / STOCK resources / categories / mediaAssets 和服务器 scope / complete。模型校验同店、无重复 / 孤儿、合法关联 / 版本 / 时间、资源计数与媒体元数据，商家 DTO 使用白名单。SDK 必须保护整个查询谓词及不存在 / 新增记录、父子 / 资源 / 图片 / 当前用户 / 角色 / 门店与回执 / 审计唯一性到提交；complete 只能由服务器适配器提供。

分页 cursor 使用既有 HMAC，绑定环境 / AppID / 主体 / 店 / action / 状态 / 当前 grant 与内容修订，稳定复合排序；修改内容、换人员 / grant / 条件、篡改或过期要求重读。本轮不声称实现规模化数据库分页或实际全量查询成本；未来 SDK 必须解决有界查询、完整性 / 不存在条件和并发成本，不能直接把全快照夹具当可部署适配器。

输出 OFFLINE_MERCHANT_CATALOG_RESULT、PRODUCT_PAGE / DETAIL、INVENTORY_PAGE；cloudVerified / callable / operationsAllowed 全 false。不开放真实经营或把内部错误直接加入网络响应。

## 验证和真实待办

新增 **31 项** A04；受影响组合 **119/119**，全套 **859/859**，静态 **298**。主包 / features / legacy 源估算 **1239 / 139 / 45 KiB**，本轮无客户端新增包体。全量 / 静态执行前后公共源码 SHA-256 一致。

覆盖三分类 / 组合 / 空经营值、发布图 / 分类 / SKU / 资源门禁、版本 / 归档 / 显式新 SKU、逐写异常 / 零行回滚、串行双人竞争、撤销 / store / user / 资源 / 素材 / 新记录提交变化、幂等 / 重放 / 审计关联、稳定分页 / 过期 / scope、私有字段投影、图片更换版本保留、O03 旧 quote 失效与历史保存，以及 6 个 admin action 平台调用前关闭（调用数 0）。

早期 first 的 23 项失败是夹具未取到 A01 options.runTransaction，已正确接入；second 26 项通过。复查加强重放实体 / 原请求版本绑定并追加回归；replay-before / affected-after 中的失败包含测试修改了提交前旧对象引用的问题，已改为当前数据库对象，不作为实际云 / 越权复现证据。最终日志：[组合](qa/a04-2026-10-06/affected-final.tap)、[全量](qa/a04-2026-10-06/full-final.tap)、[静态](qa/a04-2026-10-06/static-final.txt)、[摘要 / 指纹](qa/a04-2026-10-06/summary.md)，较早轮次保留。

| ID | 真实场景 | 状态 |
|---|---|---|
| MC01 | E01 / E12 真实商家与普通账号 / 他店 / 撤销，直调与直写拒绝 | NOT_RUN |
| MC02 | E05 / E06 正式分类、照片、价格、SKU、留言 / 数量 / 提前量及库存单位批准 | NOT_RUN |
| MC03 | SDK 原子父子 / 审计 / 回执，双人改价 / 上下架 / 库存并发及逐写故障 | NOT_RUN |
| MC04 | 制作 / 下单占用与调低库存同时发生，完整查询 / 素材退役 / 撤销提交保护 | NOT_RUN |
| MC05 | 真机商家编辑、发布错误、顾客购物袋 / quote 更新与历史订单事实 | NOT_RUN |
| MC06 | 真实图片上传、不可覆盖版本、历史文件保留与删除前完整引用扫描 | NOT_RUN |
| MC07 | 丢响应同 key、唯一索引 / query 范围 / 成本、脱敏审计和运营恢复 | NOT_RUN |

E01 / E12、E05 / E06、D06 / P08 实际门禁和页面 / SDK / 真机仍待补。只使用合成身份 / 图片元数据、串行内存和本地订单组合，没有微信 / 云 / 真实资金 / 对外消息、Git 提交 / 推送 / 上传 / 部署；现有 UI 和全部未提交成果保留。

下一项 **A05 门店 / 营业 / 预约与配送配置维护的可离线部分**，保留已确认的每天 08:00–21:00、30 分钟、自取 3 / 配送 1、20 km 含边界、配送费 0 及云端权威校验规则。
