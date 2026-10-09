# V1 数据模型

按需技术索引；实现、部署及验收状态只查 [CURRENT-STATUS](CURRENT-STATUS.md)。不整本读入上下文。原文完整快照在[归档](archive/source-snapshots-2026-10-09.zip)；字段与技术约束未删减，已分节保存。章节中的当时实现描述是历史上下文，不是当前验收结论。


## D01 交易快照字段

[读取本节](reference/data/01.md)

## 取消申请与退款的关系

[读取本节](reference/data/02.md)

## 集合基线与验收边界

[读取本节](reference/data/03.md)

## D02 通用持久化契约

[读取本节](reference/data/04.md)

## D02 集合字段字典

[读取本节](reference/data/05.md)

### users

[读取字段](reference/data/collections/users.md)。

### categories

[读取字段](reference/data/collections/categories.md)。

### products

[读取字段](reference/data/collections/products.md)。

### skus

[读取字段](reference/data/collections/skus.md)。

### favorites

[读取字段](reference/data/collections/favorites.md)。

### carts

[读取字段](reference/data/collections/carts.md)。

### addresses

[读取字段](reference/data/collections/addresses.md)。

### stores

[读取字段](reference/data/collections/stores.md)。

### store_config

[读取字段](reference/data/collections/store_config.md)。

### checkout_quotes

[读取字段](reference/data/collections/checkout_quotes.md)。

### orders

[读取字段](reference/data/collections/orders.md)。

### order_items

[读取字段](reference/data/collections/order_items.md)。

### order_logs

[读取字段](reference/data/collections/order_logs.md)。

### cancellation_requests

[读取字段](reference/data/collections/cancellation_requests.md)。

### payments

[读取字段](reference/data/collections/payments.md)。

### refunds

[读取字段](reference/data/collections/refunds.md)。

### payment_events

[读取字段](reference/data/collections/payment_events.md)。

### reservations

[读取字段](reference/data/collections/reservations.md)。

### slot_inventory

[读取字段](reference/data/collections/slot_inventory.md)。

### idempotency_records

[读取字段](reference/data/collections/idempotency_records.md)。

### admin_roles

[读取字段](reference/data/collections/admin_roles.md)。

### audit_logs

[读取字段](reference/data/collections/audit_logs.md)。

## 支撑集合取舍

[读取本节](reference/data/06.md)

### inventory_resources

见[本节定义](reference/data/06.md)。

### media_assets

见[本节定义](reference/data/06.md)。

### refund_attempts

见[本节定义](reference/data/06.md)。

## 不可变 OrderFacts 与嵌套对象

[读取本节](reference/data/07.md)

### OrderFacts 根结构

见[本节定义](reference/data/07.md)。

### CartSelectionSnapshot / SelectedLine

见[本节定义](reference/data/07.md)。

### CartRemovalSnapshot / CartRemovalLine（O04）

见[本节定义](reference/data/07.md)。

### StoreSnapshot / ContactSnapshot

见[本节定义](reference/data/07.md)。

### AddressSnapshot / RegionCodes / Location

见[本节定义](reference/data/07.md)。

### AppointmentSnapshot / DeliverySnapshot

见[本节定义](reference/data/07.md)。

### ItemSnapshot / SelectedOption / MediaRef

见[本节定义](reference/data/07.md)。

## 其余嵌套字段字典

[读取本节](reference/data/08.md)

## 关系与创建边界

[读取本节](reference/data/09.md)

## 金额、流水与资源不变量

[读取本节](reference/data/10.md)

## 客户端读模型与隐私边界

[读取本节](reference/data/11.md)

## 实现范围与一致性验收

[读取本节](reference/data/12.md)

## D03 已冻结的技术细则与经营待定

[读取本节](reference/data/13.md)

## D04 离线持久化准备说明

[读取本节](reference/data/14.md)

## D05 用户确认的履约规则与剩余资料

[读取本节](reference/data/15.md)

## D06 本地身份 / 权限方案补充

[读取本节](reference/data/16.md)

## D07 契约与开发规划补充

[读取本节](reference/data/17.md)

## C01 本地草稿与素材生命周期补充

[读取本节](reference/data/18.md)

## O02 离线订单创建补充（2026-10-05）

[读取本节](reference/data/19.md)

## O05 内部取消与预留解析补充（2026-10-05）

[读取本节](reference/data/20.md)

## O06 历史订单公开投影（2026-10-05）

[读取本节](reference/data/21.md)

## O08 配送完成 / 支持投影补充（2026-10-05）

[读取本节](reference/data/22.md)

## P01 支付配置描述（2026-10-05）

[读取本节](reference/data/23.md)

## P02 内部意图及受控测试预算补充（2026-10-05）

[读取本节](reference/data/24.md)

### payment_test_budgets

见[本节定义](reference/data/24.md)。

## P03 通知 / 交易守卫与预算消费（2026-10-05）

[读取本节](reference/data/25.md)

## P04 恢复记录与迟到款意图（2026-10-05）

[读取本节](reference/data/26.md)

## P06 退款尝试与结果记录补充（2026-10-06）

[读取本节](reference/data/27.md)

## P07 内部维护记录（2026-10-06）

[读取本节](reference/data/28.md)

## A02 商家履约 / 读模型候选（2026-10-06）

[读取本节](reference/data/29.md)

## A04 目录与库存维护数据约束（2026-10-06）

[读取本节](reference/data/30.md)

## A05 版本化配置 / 实时时段补充（2026-10-06）

[读取本节](reference/data/31.md)

## A06 请求 / 退款恢复 / 审计补充（2026-10-06）

[读取本节](reference/data/32.md)
