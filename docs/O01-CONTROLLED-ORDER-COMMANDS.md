# O01：冻结状态机与受控订单命令

2026-10-05，分支 `codex/ui-refresh-2026-10-05`。**离线命令规划与验收通过；正式 handler / 数据库执行 / 核销 / 支付协调仍未接通。** 保留现有 UI 和所有未提交成果。

## 范围与编号

原计划 O01 是冻结状态机与受控命令，O06 才是本人订单列表 / 详情。上一轮交接将 O01 写成订单列表，本轮已纠正，未改原计划任务编号。下一项 O02 是订单创建、唯一订单号与不可变快照，资源原子预留和幂等执行分别属于 O03 / O04。

## 实现

`cloudfunctions/_shared/order-command-model.js` 的 `planControlledOrderCommand(domain,event,order,principal,roles,context)` 复用 D07 请求白名单、D06 真正签发的 principal 和当前门店授权、D01 冻结状态机。它是内部纯规划工具，没有网络入口或执行器；order.id / review.id 由可信加载器映射数据库 _id。不可把客户端角色、旧订单实体或工具输出作为可信输入。

| API | 内部受控命令 |
|---|---|
| order.cancelUnpaid | CANCEL_UNPAID |
| order.cancellation.request | REQUEST_CANCELLATION |
| order.delivery.confirm | COMPLETE_DELIVERY，仅本人配送中订单 |
| admin.order.transition | ACCEPT / START_MAKING / MARK_READY / START_DELIVERY / COMPLETE_PICKUP / COMPLETE_DELIVERY / REJECT_ORDER |
| admin.cancellation.review | APPROVE_CANCELLATION / REJECT_CANCELLATION，读取当前申请 |
| admin.refund.approve | APPROVE_REFUND |

顾客入口必须本人，商家入口必须当前同店授权；即使商家入口的调用人也是订单所有者，仍必须商家权限。批准取消 / 拒单要求同一授权同时具有 ORDER_OPERATE 和 REFUND_APPROVE，零元取消不绕过审批；售后退款可仅 REFUND_APPROVE。用户入口不接受 PAYMENT_CONFIRMED、SYSTEM 到期动作或 nextStatus、actor、付款金额等额外字段。

自取链：PAID → ACCEPTED → MAKING → READY → COMPLETED。配送链：PAID → ACCEPTED → MAKING → READY → DELIVERING → COMPLETED。未付款不可制作，自取不可进入配送，已完成 / 已取消不可回退或复活；旧 WAIT_DEPOSIT 等不混入 V1。

未付取消须付款 UNPAID / CLOSED；PENDING / EXCEPTION 不能提前释放。已付申请只创建待审申请，保留履约；取消审批读取与订单 / 本人 / 请求 ID 对应的 PENDING 申请，保留申请版本条件。商家拒单补足实付剩余全额退款；制作后的取消不列自动恢复库存；独立售后退款保留履约轴，未决 / 失败退款仍阻止新退款。

## 输出与执行边界

输出深冻结 OFFLINE_ORDER_COMMAND_PLAN，callable=false、requiresAtomicPersistence=true。仅包含待执行的状态 / 版本 / 时间补丁、订单 / 用户 / 授权 / 申请版本条件、幂等作用域与请求指纹、日志草稿及必须同事务完成的效果。

- 制作要求 CONSUME_STOCK_RESERVATIONS；取消要求 RESOLVE_CANCELLED_RESERVATIONS；具体库存 / 时段处理留 O03 / O05。
- 自取完成必须提供 credential，要求 VERIFY_PICKUP_CREDENTIAL 和 RECORD_FULFILLMENT；凭证有效性、一次核销及限速留 O07。凭证只传内部效果输入，不放日志或公开 DTO。
- 配送完成要求 RECORD_DELIVERY_CONFIRMATION / RECORD_FULFILLMENT；重复执行留事务与幂等层核实。
- 退款列出 CREATE_REFUND_INTENT / ENSURE_FULL_REFUND，不假造退款成功或改资金摘要；实际资金操作留 Payment。
- 各命令均要求 APPLY_ORDER_PATCH、APPEND_ORDER_LOG、SAVE_IDEMPOTENCY_RESULT 原子提交。没有执行这些效果，也没有真实回执重放 / 去重 / 并发验证。

日志草稿只保留白名单 actor / before / 可信服务端 requestId / 审核进度文案。理由必须通过显式同步脱敏器，缺策略或返回未知结果拒绝；测试替身不代表正式理由政策。日志草稿没有 after，也不能直接落库：执行器须完成所有领域效果、校验最终资金与状态，再生成真实 after、完整通用字段并同事务提交。退款后资金轴以最终执行结果为准，不以规划补丁代替。

真实适配必须在同一事务重新加载当前用户 / 角色 / 订单 / 申请和资源，校验所有版本条件，匹配幂等回执；任意效果失败不保存订单、日志或局部资源。缺核销、资源或退款执行器应拒绝执行，不能把 requiredAtomicEffects 清单当成已经成功。计划不直接返回小程序。

## 验收

新增 10 项回归，其中参数化矩阵覆盖六个履约命令 × 自取 / 配送有效 V1 状态，共 90 组。权限、完整请求字段、旧状态、版本 / 时钟、取消 / 审批 / 退款、脱敏 / 核销契约与深冻结通过。非法越级不会返回计划，受控测试调用没有日志 / 资源写入，输入记录保持不变；这不等同于真实 SDK 回滚证据。

O01 + D06 + D01 专项 **39/39**、全套 **385/385**，静态检查 **227 个文件**。主包 / features / legacy 源估算 **1213 / 97 / 45 KiB**，新模型仅在服务端目录。本轮没有页面或字体变动，没有新微信 / 真机测试；云 allowlist 仍仅 user.me / store.health。未提交、推送、上传、部署或发布。
