# B01 / B02 离线购物袋接口编排

日期：2026-10-04。实现为 `cloudfunctions/_shared/cart-service.js`；测试为 `tests/cart-service.test.js`。

## 已完成范围

`createCartService({runTransaction, now, newLineId}).execute(event, principal)` 接收 D07 已定义的 `cart.get/add/update/remove` 请求。principal 必须由 D06 `resolveCustomer` 根据可信平台上下文及当前用户记录生成，复制或伪造对象不能使用。平台 context 不允许来自请求 payload；每次网络调用仍需重新验证当前用户状态。

获取 / 首次添加使用环境、AppID、用户、门店构成的确定性袋 ID。空袋 GET 返回 version 0，不写记录。更新 / 删除读取指定 cartId 后验证所有权。所有变更检查袋版本，更新 / 删除另查行版本；稳定 lineId、lineVersion 按 D03 规则保留或递增。请求不能夹带 ownerId、userId、价格或角色。

返回仅包含 cartId、storeId、version、lines；每行包含 lineId、lineVersion、productId、skuId、quantity、cakeMessage、addedAt、updatedAt。私有 owner、留言摘要、库存资源和价格快照不返回；商品展示及当前价格读取由 B05 补齐，不能用此结果直接结算。

复用 D03 目录、SKU、数量和留言规则，不复制业务逻辑。相同 SKU 与 NFC/trim 后的相同留言合并；不同留言、不同 SKU 分行，价格相同也不能误合并。合并数量仍受 SKU / 门店限额约束。缺正式经营限制拒绝添加和更新，不用测试数值兜底。移除下架 / 缺目录行不依赖商品和经营配置。

变更幂等键按环境、AppID、用户、动作隔离；规范请求摘要覆盖 payload。原子记录命令回执，相同键与请求重放原始结果；相同键换参数报 IDEMPOTENCY_KEY_REUSED。原始回执可能比当前购物袋旧，客户端必须 GET 后再继续新操作；不能把重放结果当作当前全局版本。删除后重试原加购回执也不会复活已删除行。

本服务不读取库存余额、不预扣库存、不占预约容量、不创建订单或支付。规格的 stockRequirements 只用于验证目录完整性。

## 存储接入约定与未完成项

`runTransaction(work)` 必须提供原子事务 session：

| 方法 | 约定 |
|---|---|
| readCart(id) / readReceipt(id) | 当前事务读取，缺失返回 null |
| readCatalog(productId) | 当前产品及完整 SKU 列表；缺失返回 null |
| readLimits(storeId) | 已发布且服务端可信的购物袋限制；缺失不兜底 |
| saveCart(cart, expectedVersion) | 条件写入；null 表示仅不存在时创建，整数表示比较当前版本 |
| saveReceipt(id, receipt) | 仅不存在时创建，与 cart 原子提交 |

目录、限制与购物袋读取也必须参与事务一致性检查。事务失败全部回滚；无变化 UPDATE 仍提交回执，但不写袋或增加版本。事务重试调用服务端时钟和 ID 工厂，不接受客户端时间 / ID。

没有提供实际微信云数据库适配器或新增可部署 cart 云函数，也没有接到本机 LOCAL_DRAFT 购物袋。回执格式是此服务内部约定，后续数据库集合落地应与 D04 幂等字典对齐并补保留策略、响应校验及真实并发验收。禁止直接用无条件 set 或仅在事务外检查版本替代上述协议。

## 验证结果

10 项新增离线测试通过，覆盖 CRUD、私有字段白名单、伪造 principal、A/B 隔离、非法请求 / SKU / 数量 / 配置 / 行数、并发版本冲突、重复请求、回执写入失败回滚、失效行删除、无变化更新、留言合并及相同价格不同 SKU。测试适配器在 tests 内串行执行并模拟回滚，不是云 SDK 并发证明。

全套 Node 测试 230/230 通过。此次没有改动小程序 UI / 本机袋存储，未重复页面截图验收，也未上传、部署、提交或推送。B01 / B02 离线部分完成；正式云接口、持久化事务及客户端联调待云环境。下一项 B03：本机购物袋数量、勾选、计数与小计，继续保留 LOCAL_DRAFT 与不可正式结算边界。
