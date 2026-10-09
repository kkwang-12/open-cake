# 文档按需索引

默认只读根 [AGENTS](../AGENTS.md) 与 [CURRENT-STATUS](CURRENT-STATUS.md)。源码/测试优先；下面只在对应任务需要时打开，不把目录全部注入上下文。

| 要解决的问题 | 唯一入口 |
|---|---|
| 当前进度、阻塞、下一步、最近验证 | [CURRENT-STATUS](CURRENT-STATUS.md) |
| 任务范围与验收要求 | [DEVELOPMENT-PLAN](DEVELOPMENT-PLAN.md) → 对应阶段 |
| 集合/字段/快照约束 | [DATA_MODEL](DATA_MODEL.md) → 对应小节 |
| 内部模型/服务签名 | [API_CONTRACT](API_CONTRACT.md) → 对应模块 |
| 目标网络action/DTO/分页 | [API_NETWORK](API_NETWORK.md) → 对应契约；部署状态查当前页 |
| 幂等/资源/事务规则 | [TRANSACTIONS](TRANSACTIONS.md) → 对应边界 |
| 正式订单SDK读取保护/查询/预算义务 | [D04-SDK-INTEGRATION](D04-SDK-INTEGRATION.md) |
| 用户确认的交易政策 | [TRANSACTION-RULES](TRANSACTION-RULES.md) |
| 用户确认的履约政策 | [FULFILLMENT-RULES](FULFILLMENT-RULES.md) |
| 还需用户提供什么 | [EXTERNAL-DEPENDENCIES](EXTERNAL-DEPENDENCIES.md) |
| 指定页面的UI/动效 | [UI-TYPOGRAPHY](UI-TYPOGRAPHY.md)、[UI-ANIMATIONS](UI-ANIMATIONS.md) |
| 实验报告/历史来源 | [archive](archive/README.md)、对应 `qa/`；按需，不作当前结论 |

维护与读取约定以根AGENTS为准；此索引只负责定位，不存进度。
