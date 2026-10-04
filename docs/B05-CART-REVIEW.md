# B05 商品与购物袋行复核

日期：2026-10-04。本机目录 / 规格 / 价格复核及微信模拟器验收完成；库存快照检查完成离线模型测试，真实云库存与正式购买仍待接入。

## 当前行为

Bag 每次 onShow / 重试都异步调用 local-bag.review，读取当前规格配置。等待期间清空已选小计、禁用操作；隐藏页面及被新请求替代的响应不再渲染。复核结束同时检查存储 revision，避免展示被另一操作改动或删除前的快照。单行目录异常保留该行，不能使其他正常商品消失。

| 状态 | 展示和操作 |
|---|---|
| LOCAL_READY | 当前本机配置与快照一致，可勾选 / 调数量；仍不是正式可购买 |
| PRICE_CHANGED | 展示原单价与当前单价；确认前不可勾选或调数量，不计已选小计 |
| CONFIG_CHANGED | 名称 / 规格描述 / 版本 / 规格标签已变；展示当前名称与规格，需确认 |
| PRODUCT_UNAVAILABLE | 已下架或不存在，可查看 / 移除，不可勾选 |
| SKU_INVALID | 原规格 / 组合失效，不猜另一 SKU 替换；可查看 / 移除 |
| QUANTITY_INVALID / MESSAGE_INVALID | 数量或历史留言不合新规则，提示重新选择；原值不静默清除或截断 |
| REVIEW_FAILED | 配置异常或临时读取失败，提示重新核验；不冒充商品下架 |

所有行仍 checkoutAllowed=false、stockStatus=UNKNOWN。有效行的已选件数 / 小计单独计算，全选只处理可勾选行；本机读取时不改写存储、不永久改变用户勾选。原始数量和角标计数包含袋内全部行，失效行排除于已选摘要。

确认更新使用原生 showModal。取消或确认期间隐藏不写入；同意后服务再次读取当前配置、比较 reviewToken 与 revision，规则或价格又变时拒绝过期确认。成功更新该行的本机名称、规格描述 / 标签、版本、单价，保留 lineId、数量、留言及原勾选意图。回执不被修改；原加购重试仍重放原始命令结果，不是对当前价格的确认。

specification.get 对开发目录中合法但不存在的商品返回 PRODUCT_UNAVAILABLE；重复 ID / 结构错误仍 INVALID_RESPONSE，不把配置损坏当下架。development / shell 门禁保持不变，无生产回退到开发示例。

实现：`miniprogram/utils/bag-review.js`、`services/local-bag.js` 与 `features/bag`。reviewToken 是本机一致性比较，不是签名、权限或报价凭证。目录复核不承担云端身份、库存、经营配置、预约或价格权威。

## 库存离线准备

`cloudfunctions/_shared/stock-review.js` 的 reviewStockDemand(lines, resources) 复用 D03 aggregateStockRequirements 与 D04 validateResource。在可信服务端快照上，按共享 resourceId 聚合各行需求，扣除 held / confirmed / consumed；余额不足或资源关闭返回 INSUFFICIENT，缺快照 / 记录返回 UNKNOWN，充足返回 SUFFICIENT。跨门店、重复 / 非法记录拒绝。

该函数没有读写数据库、不预扣库存、不暴露资源 ID 和余额，任何结果都 checkoutAllowed=false。尚未接入实际云处理器或本机 Bag；不能宣称真实库存不足 UI 已完成联调。真实商品资源数量、经营配置与 SDK 事务仍待云环境及资料。

## 验证

新增 12 项测试，全套 258/258 通过：只读复核、未知库存、改价明确确认、失效 / 临时错误区分、SKU / 数量 / 留言失效、同价配置变更、确认 token / revision 竞争、全选跳过失效行、迟到 / 删除保护、缺目录与重复配置、页面取消 / 同意 / 隐藏行为，以及共享库存聚合 / 余额 / 关闭 / 缺失 / 非法范围。历史留言与记录保留均有断言。

静态 184 文件通过，主包源文件估算 2010/2048 KiB、features 42 KiB、legacy 45 KiB。购物袋 WXML 编译成功；摄影素材和已验收详情 UI 未改。

微信实际加购新增草莓 6 寸×1，留言“B05保留留言验收”。仅把该测试行的本机历史单价改为 150（当前真实开发目录仍 168），再进袋出现 PRICE_CHANGED，已选小计排除该行并维持原有 892。showModal 回答采用工具受控回调分别取消和同意，实际点击确认更新：取消存储仍 150，同意后实际读回 168，留言 / 行 ID 保留；这不是人工点原生弹窗验收，也不是伪造加购成功或价格数据。

随后仅将该测试行的旧 skuId 改为缺失规格，重新进袋出现 SKU_INVALID、不能勾选、仍可删除。实际移除测试行后，读取存储中的原有黑巧克力 6 寸×2 与 8 寸×2，两行原始对象逐字比对一致；件数 4、小计 892。showModal mock 已在 finally 恢复，未清空或恢复整个存储。

366×793 截图已人工核对：[价格变化](qa/2026-10-04/b05-price-change.png)、[规格失效](qa/2026-10-04/b05-invalid-sku.png)。首次模拟器还运行旧编译缓存，测试失败后停止，simulator_refresh 编译新代码并恢复自动化连接，再按现存测试行继续验收；失败 / 超时日志不计为通过。脚本 / 详细响应在忽略的 artifacts/phase-3-qa/b05-*。

下一项 B06：仅选中且当前有效的行形成 Checkout 输入，并验收重启持久化 / 精准移除契约。正式订单 / 结算继续关闭。此次保留全部未提交成果，未提交、推送、上传或部署。
