# 项目初始化记录

日期：2026-10-03；项目：家家乐蛋糕店；目录：`D:\dinner cook`。

本文保留首次初始化的历史结果。后续在新分支上的阶段一迁移与当前状态，见 [阶段一执行记录](PHASE-1-EXECUTION.md)。

## 初始化边界

本次完成可审查、可继续开发的工程基线与计划文档初始化。现有仓库已经初始化 Git，且已有原生小程序和可运行演示服务，因此不重新生成框架、不安装替代框架、不清理既有代码。本次没有完成云环境开通、业务迁移或微信支付接入。

`DESIGN-SPEC.md` 作为被审查的产品材料保留原文。本文及其他新增文档是审查结果和执行拆分，其中新增业务规则均标明为建议或待确认，不能当作原执行书已有定稿。

## 已完成的变更

| 文件 | 结果 |
|---|---|
| `.editorconfig` | 明确 UTF-8、LF、两空格缩进；Markdown 保留有意的尾空格 |
| `.gitattributes` | 新增文本换行与图片二进制约定；未对存量文件批量重新归一化 |
| `package.json` | 规范格式，增加 `demo` 命令，保留现有 start / test / check |
| `project.config.json` | 声明 `cloudfunctionRoot: cloudfunctions/`，标明当前仍为演示运行基线 |
| `cloudfunctions/README.md` | 创建真实说明文件，列出云函数配置和部署约定；尚无业务函数 |
| `.gitignore` | 允许 `artifacts/design-ref/*.jpg` 参考图纳入版本管理，其余 artifacts 继续忽略 |
| `README.md` | 新增 V1 文档入口，保留原演示运行说明 |
| `docs/PROJECT-REVIEW.md` | 提供可行性审查、风险、建议模型和前置决策 |
| `docs/DEVELOPMENT-PLAN.md` | 按九个阶段拆分 Task、依赖、验收条件与阶段门禁 |

## 既有工作保护

- Git 基线提交：`40f78b4`，`feat: add cake booking demo and WXML validation`。
- 开始时 `miniprogram/pages/shop/shop.js / .json / .wxml / .wxss` 已有未提交修改；本次未改动这四个文件。
- 开始时 `DESIGN-SPEC.md`、`assets/`、`miniprogram/assets/` 尚未跟踪；本次未删除、覆盖或自动提交。
- 原 `server/`、`web/` 和旧测试完整保留。遗留 JSON 数据不会直接迁成正式订单。
- 未创建新分支、提交、远程仓库或云部署。

## 验证记录

运行环境检测：Node.js `v24.19.0` 可用，当前命令环境中的 `npm` 未被 PATH 识别。本次使用 Node 直接执行检查，不安装运行环境。

```powershell
node --test tests/domain.test.js tests/http.test.js tests/repository.test.js tests/wxml.test.js
node scripts/check.js
```

- 初始化前：19 项自动化测试通过，44 个 JS / JSON / WXML 文件静态检查通过。
- 初始化后：按同样命令复验，结果见下方最终记录。
- 旧测试主要验证演示版定金 / 尾款、权限、模拟退款、持久化与 WXML 表达式；不能作为云数据库并发、真实付款或新购物袋流程的验收凭据。
- 小程序源码原始文件合计 777,062 字节（约 759 KiB），这不是开发者工具生成的发布包体积。
- 微信开发者工具编译、云函数部署、支付回调、真机支付及视觉验收尚未执行。

最终复验记录：初始化后 19 / 19 项自动化测试通过，44 个 JS / JSON / WXML 文件静态检查通过；文档检查确认 67 个 Task 编号连续且唯一，全部包含依赖与验收条件，12 个本地 Markdown 链接有效，代码块闭合，UTF-8 无乱码。云函数根目录与 demo 命令配置正确；参考 JPG 可跟踪，其他临时 artifacts 仍被忽略。

## 尚未完成的项目初始化任务

开发计划阶段一的 `I01 / I02` 本次完成；`I03–I08` 仍待执行，包括云环境最小验证、四 Tab 与路由迁移、设计基础组件、质量门禁、依赖配置和外部条件登记。整个「项目初始化」阶段尚未验收通过。
