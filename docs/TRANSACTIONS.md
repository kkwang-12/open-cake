# D04：幂等、资源预留与原子事务设计

按需技术索引；实现、部署及验收状态只查 [CURRENT-STATUS](CURRENT-STATUS.md)。不整本读入上下文。原文完整快照在[归档](archive/source-snapshots-2026-10-09.zip)；字段与技术约束未删减，已分节保存。章节中的当时实现描述是历史上下文，不是当前验收结论。


## 内部工具与身份范围

[读取本节](reference/transactions/01.md)

## 幂等裁决与重试

[读取本节](reference/transactions/02.md)

## quote → order 的原子边界

[读取本节](reference/transactions/03.md)

## 付款、取消、消耗与资金意图

[读取本节](reference/transactions/04.md)

## 候选索引与逻辑唯一性

[读取本节](reference/transactions/05.md)

## 事务预算与真实云验收清单

[读取本节](reference/transactions/06.md)

## 回归与边界

[读取本节](reference/transactions/07.md)

## D06 敏感操作权限与事务衔接

[读取本节](reference/transactions/08.md)

## D07 分页与开发seed衔接

[读取本节](reference/transactions/09.md)

## O04 提交后的精确袋同步边界（2026-10-05）

[读取本节](reference/transactions/10.md)

## O05 内部取消原子边界（2026-10-05）

[读取本节](reference/transactions/11.md)

## O06 本人订单一致读（2026-10-05）

[读取本节](reference/transactions/12.md)

## O07 核销与拒绝的原子边界（2026-10-05）

[读取本节](reference/transactions/13.md)

## O08 配送原子写 / 历史重放（2026-10-05）

[读取本节](reference/transactions/14.md)

## P01 配置 / 资金边界登记（2026-10-05）

[读取本节](reference/transactions/15.md)

## P02 意图 / 测试预算与发送占权（2026-10-05）

[读取本节](reference/transactions/16.md)

## P03 通知原子处理（2026-10-05）

[读取本节](reference/transactions/17.md)

## P04 查询 / 关闭与全额补偿（2026-10-05）

[读取本节](reference/transactions/18.md)

## A06 原子取消审批和同号退款恢复（2026-10-06）

[读取本节](reference/transactions/19.md)
