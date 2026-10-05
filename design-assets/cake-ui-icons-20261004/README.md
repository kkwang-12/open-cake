# 蛋糕详情页图标素材

依据对话中的参考图手工绘制的 SVG，不是参考图原始素材。仅提供独立图标，不修改页面或购买逻辑。

基础详情图标规格：24 × 24 viewBox，描边 2.1，圆形端点与连接，透明背景，固定颜色 #111111；check.svg 为白色勾号。后来追加的六个配送／表单图标为同画布、1.8 描边，不将两个系列误记为统一 2.1。

| 文件 | 用途 |
| --- | --- |
| back.svg | 返回 |
| heart-outline.svg | 未收藏 |
| heart-filled.svg | 已收藏 |
| leaf.svg | 新鲜食材 |
| cake-slice.svg | 经典口味 |
| gift.svg | 适合场景 |
| check.svg | 选中勾号 |
| more-vertical.svg | 更多 |
| minus.svg | 减少 |
| plus.svg | 增加 |

## 追加的配送与表单原稿

| 文件 | 用途 |
|---|---|
| pickup-bag.svg | 到店自取 |
| delivery-truck.svg | 商家配送 |
| calendar.svg | 日期 |
| clock.svg | 时间段 |
| contact-person.svg | 姓名 |
| phone.svg | 手机号 |

六个原稿均为 24×24、1.8 描边、圆头圆角、内置 `#111111`。当前运行时分类与状态颜色见 [SVG 素材库](../../miniprogram/assets/icons/README.md)。本目录保留原始来源，不在页面中直接引用；`preview.svg` 只预览基础详情图标，不能据旧预览标题推断当前全部素材数量。

## 接入说明

- 将需要的图标复制到实际小程序根目录的 assets/icons，按实际代码结构引用。
- 单色线条素材保留 SVG 源文件；实际加载方案需在目标小程序中验证。若使用 PNG，可按 72 × 72 导出，显示约 24 × 24 CSS 像素。
- check.svg 仅含白色勾号，黑色圆底由页面样式实现。
- 心形、更多、加减按钮的圆底和点击范围由页面样式实现，不包含在图标中。
- 参考预览 preview.svg 仅用于查看，不能当成页面背景。
- 尚未导出 PNG，尚未在微信开发者工具或真机中验证。
