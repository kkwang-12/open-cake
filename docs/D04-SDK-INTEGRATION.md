# 正式订单SDK接入约束

本文件仅维护正式订单事务提供方的技术义务；当前任务、部署和验收结论只查[CURRENT-STATUS](CURRENT-STATUS.md)。实现以源码和相关测试核对，不把本文件当作真实云实验结果。

## 会话与读取保护

- [order-document-session.js](../cloudfunctions/_shared/order-document-session.js)将订单服务映射到users、idempotency_records、checkout_quotes、stores、store_config、carts、products、skus、addresses、inventory_resources、slot_inventory、orders、order_items、reservations、order_logs。
- 先验证报价所有权，再沿可信引用加载当前门店/配置、本人购物袋、商品/SKU、库存、时段和配送地址；读取去重，不扫描整个目录或跟随他人报价读取私有数据。
- 构造要求`protectReads`、`findOrderByNumber`及正整数`maxReadDocuments`；不能用默认true或空查询替代。
- `protectReads(documentSnapshots, conditions, queryPredicates)`必须在同一事务保护已读内容/版本、不存在状态和查询谓词直到提交。重新读一遍再比较版本不足以证明提交前安全。
- `findOrderByNumber(orderNo)`在同一事务执行受控精确查询；已有或空结果均纳入保护，orders.orderNo唯一索引仍是最终写入约束。
- [平台事务文档](https://docs.cloudbase.net/database/transaction)说明快照隔离、读取不持有与修改相同的锁，并列出仅支持doc、不支持where的限制；SDK对象存在where方法也不证明平台支持事务查询。不得以事务外查询、重读比较或查询报错后的空结果满足上述保护义务，须核实部署版本的实际能力。
- 每次SDK重试回调重建session和读取缓存；幂等回放也保护用户、回执和订单，不能绕过用户禁用/权限变化。

## 写入与预算

- 资源用版本更新；订单头/明细/预留/日志/回执显式新增；消费报价保留ACTIVE、本人同店、未消费/未过期和版本约束。
- [order-write-budget.js](../cloudfunctions/_shared/order-write-budget.js)统计业务写入；[order-transaction-service.js](../cloudfunctions/_shared/order-transaction-service.js)在首个业务写入前检查限额。
- 服务端`transactionLimits`含maxWrites/maxPayloadBytes/maxTotalPayloadBytes，均为正安全整数并复制冻结，不接受客户端配置。null仅统计，不启用限额拒绝。
- JSON UTF-8字节不等于BSON/协议/索引/原文档体积或平台预算；maxReadDocuments也不包括缺失检查、查询、保护写入和重试。部署限制必须由真实平台约束和业务边界确定，不能照搬测试夹具。

## 正式入口与验收要求

- 入口绑定原生身份、正确EnvId、可信商品图片/配送位置、正式经营配置、部署限额和脱敏错误投影。
- 在隔离资源验证只读依赖变化、空查询保护、正式订单多文档保存、逐写回滚、唯一冲突、资源竞争和原key恢复；真实断网、客户端权限、真机分别记录。
- 整体通过前保留禁止购买/付款的业务门禁；技术探针与本地执行器不替代正式订单验收。
- 具体历史决策/故障与原始证据按[阶段二历史索引](archive/stages/phase-2.md)定位；日志、JSON、截图保留在qa。
