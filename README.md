# 家家乐蛋糕店小程序

原生微信小程序与云开发V1工程。

- 开始工作：[AGENTS](AGENTS.md) → [当前状态](docs/CURRENT-STATUS.md) → Git差异及本轮相关源码。
- 按需定位：[文档索引](docs/README.md)。不默认读取阶段历史、完整计划、字段字典或全部契约。
- Node.js ≥22；微信开发者工具导入项目根目录。旧演示与V1隔离，运行配置以源码为准。

日常命令：

```powershell
node scripts/test-brief.js tests/具体.test.js
node scripts/check.js
```

完整回归/阶段验收按AGENTS的改动范围执行。目录：miniprogram（客户端）、cloudfunctions（入口/领域模块）、tests（回归）、docs（按需参考与证据）。

[旧README快照](docs/archive/source-snapshots-2026-10-09.zip)仅用于追溯UI版本和历史进度，不作为运行说明。
