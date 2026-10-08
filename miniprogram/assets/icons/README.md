# SVG 图标素材库

整理日期：2026-10-06。这里是小程序运行时 SVG 的统一引用根目录。图形、颜色、画布及线宽以 SVG 源文件为唯一真实来源；显示尺寸和点击范围以使用它的页面样式为准，不把画布尺寸当作按钮点击尺寸。

## 分类与引用

| 目录 | 文件／用途 | 画布与实际描边 |
|---|---|---|
| `navigation/` | `back.svg` 返回；右箭头复用同图形并在页面旋转 | 24×24、2.1、`#111111` |
| `navigation/` | `account-orders.svg`、`account-location.svg`、`account-service.svg`、`account-store.svg`、`account-info.svg` 我的菜单 | 24×24、1.8、`#111111` |
| `controls/` | `plus.svg`、`minus.svg`、`more-vertical.svg` 通用操作 | 24×24、2.1；更多为实心圆点 |
| `controls/` | `settings.svg` 我的设置；`avatar-default.svg` 未登录头像 | 设置 24×24、1.8、`#111111`；头像 64×64、灰色填充 |
| `commerce/` | `bag-plus.svg`、`bag-minus.svg` 购物袋数量；`trash.svg` 删除 | 24×24；数量 2.7、`#000000`；删除 1.6、`#111111` |
| `product/` | `cake-slice.svg` 蛋糕／缺图；`leaf.svg`、`gift.svg` 商品服务信息 | 24×24、2.1、`#111111` |
| `product/` | `custom-design.svg` 专属设计；`ingredient-check.svg` 优选食材，供我的首页横幅服务条使用 | 24×24、1.8、`#111111` |
| `feedback/` | `heart-outline.svg`、`heart-filled.svg` 收藏；`check.svg` 选中 | 24×24、2.1；勾号白色，无内置黑色圆底 |
| `fulfillment/` | `pickup-bag.svg` 到店自取；`delivery-truck.svg` 配送，各有灰、白版本 | 24×24、1.8、圆头圆角 |
| `forms/` | `calendar.svg`、`clock.svg`、`contact-person.svg`、`phone.svg`，各有灰、白版本；日期与时间另有禁用版本 | 24×24、1.8、圆头圆角 |
| `tab-bar/` | `home`、`shop`、`orders`、`account` 的 `-outline.svg`、`-filled.svg` | 28×28、1.6、白色；当前导航实际使用 outline，选中反馈由样式处理 |

各目录内均保留独立 SVG。运行时文件共 50 个；索引见 [index.json](index.json)，每项列出完整引用路径、用途、画布、线宽和内置颜色。

```xml
<image src="/assets/icons/navigation/back.svg" mode="aspectFit" />
<image src="/assets/icons/fulfillment/pickup-bag-white.svg" mode="aspectFit" />
<image src="/assets/icons/forms/calendar-disabled.svg" mode="aspectFit" />
```

引用路径从小程序根目录开始，以 `/assets/icons/` 开头。页面实际尺寸：返回图标 24px、点击区 44px；填写订单表单图标 18px；底部导航图标 21px；我的菜单与设置图标 20px、默认头像 64px。我的收藏复用现有心形，右箭头复用返回图标旋转显示。

## 颜色与版本

- 配送／表单原稿 `*.svg` 内置 `#111111`；`-gray.svg` 内置 `#666666`；`-white.svg` 内置 `#FFFFFF`；`calendar-disabled.svg`、`clock-disabled.svg` 内置 `#888888`。
- 外部 `<image>` 的颜色不依赖 `currentColor` 或父级 CSS 继承，按实际状态引用对应文件。灰、白双层交叉淡化参数见 [动画规范](../../../docs/UI-ANIMATIONS.md)。
- 不将返回键 2.1、表单 1.8、导航 1.6、购物袋数量 2.7 强行改成同一线宽；这些是当前页面分别采用的实际素材。
- 文件内容整理前后保持不变。`controls/more-vertical.svg`、未被页面引用的状态版本作为可复用素材保留，不自动添加到界面。

## 设计原稿与归档

原始设计稿保留在 `design-assets/cake-ui-icons-20261004/`，其 `preview.svg` 是素材预览，不是运行时图标。该目录 [README](../../../design-assets/cake-ui-icons-20261004/README.md) 列出两套线宽来源。
我的首页新增 7 个 SVG 为按用户选定界面直接绘制的本地矢量素材，未复制参考截图的位图图标；记录见 [本页施工记录](../../../design-assets/account-flow-20261006/account-home-implementation.md)。

已被用户六个新原稿替代的早期 `pickup-dark/light.svg`、`delivery-dark/light.svg` 移至 `design-assets/archive/checkout-icons-legacy/`，不进入小程序运行时素材库。

今后新增或替换图标时，按用途分类，核对实际画布、描边、内置颜色和引用，更新索引；同步检查原稿来源。不要将预览图或早期归档版本接回页面。PNG、商品照片、Hero 图片与 SVG 图标保持各自现有目录，不把门店占位图当作真实门店照片。

维护命令：修改 SVG 后运行 `node scripts/check-ui-icons.js --write` 生成真实元数据索引；运行 `node scripts/check-ui-icons.js` 校验索引、文件内容哈希及静态／已知动态引用。
