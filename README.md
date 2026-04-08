# 秒哒对话完成提醒（Tampermonkey Userscript）

一个用于秒哒网页应用的 Tampermonkey 用户脚本。
当输入区右下角控件从“停止方块态”切回“发送箭头态”时，脚本会判定当前一轮对话已完成，并触发系统通知。

> 本仓库为可公开发布版本，已将 GitHub 用户名、仓库名等个人信息替换为占位符。发布前请先替换脚本头部中的 `YOUR_GITHUB_USERNAME` 和 `REPO_NAME`。

## 功能特性

- 监听秒哒输入区右下角控件状态变化。
- 当状态从 `running` 切换为 `idle` 时自动提醒。
- 优先使用 `GM_notification` 发送系统通知。
- 当 `GM_notification` 不可用时，自动回退到浏览器原生 `Notification`。
- 提供“通知测试”按钮，用于主动请求权限并验证通知链路。
- 支持通过 Tampermonkey 菜单显示或隐藏测试按钮。
- 使用 `GM_setValue` / `GM_getValue` 记住测试按钮显示状态。
- 保留标题闪烁作为兜底提醒方式。

## 运行原理

脚本通过识别输入区右下角控件的两种图标状态来判断对话是否结束：

- **发送态**：按钮内部 SVG 为向上箭头图标。
- **运行态**：按钮内部 SVG 为圆角方块图标。
- 当状态从“运行态”切换回“发送态”时，脚本认为本轮对话已完成。

## 文件结构

```text
REPO_NAME/
├── README.md
└── miaoda-notify.user.js
```

## 发布前替换项

请先在 `miaoda-notify.user.js` 头部替换以下占位符：

- `YOUR_GITHUB_USERNAME`
- `REPO_NAME`

建议替换这些字段：

```javascript
// @namespace    https://github.com/YOUR_GITHUB_USERNAME
// @author       YOUR_GITHUB_USERNAME
// @homepageURL  https://github.com/YOUR_GITHUB_USERNAME/REPO_NAME
// @supportURL   https://github.com/YOUR_GITHUB_USERNAME/REPO_NAME/issues
// @downloadURL  https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/REPO_NAME/main/miaoda-notify.user.js
// @updateURL    https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/REPO_NAME/main/miaoda-notify.user.js
```

## 发布到 GitHub

### 1. 创建公开仓库

建议创建一个公开仓库，例如：

```text
miaoda-notify-userscript
```

### 2. 上传文件

把以下文件上传到仓库根目录：

- `miaoda-notify.user.js`
- `README.md`

### 3. 更新脚本头部

将脚本头部中的占位符替换为你自己的 GitHub 用户名和仓库名。

例如：

```javascript
// @homepageURL  https://github.com/your-name/miaoda-notify-userscript
// @supportURL   https://github.com/your-name/miaoda-notify-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/your-name/miaoda-notify-userscript/main/miaoda-notify.user.js
// @updateURL    https://raw.githubusercontent.com/your-name/miaoda-notify-userscript/main/miaoda-notify.user.js
```

## 安装方式

### 方式一：从本地安装

1. 安装 Tampermonkey。
2. 新建脚本。
3. 粘贴 `miaoda-notify.user.js` 内容。
4. 保存并刷新秒哒页面。

### 方式二：从 GitHub Raw 安装

当你完成占位符替换并推送到 GitHub 后，可以直接访问：

```text
https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/REPO_NAME/main/miaoda-notify.user.js
```

Tampermonkey 通常会识别 `.user.js` 脚本并提示安装。

## Tampermonkey 权限说明

本脚本使用了以下能力：

- `GM_notification`：发送系统通知。
- `GM_registerMenuCommand`：注册脚本菜单项。
- `GM_setValue` / `GM_getValue`：持久化测试按钮显示状态。

## 使用方法

### 自动提醒

正常使用秒哒对话即可。
当输入区右下角控件从“停止方块态”切换为“发送箭头态”时，脚本会自动尝试发送系统通知。

### 测试通知

如果测试按钮处于显示状态，页面右下角会出现“通知测试”按钮。
点击后脚本会：

1. 请求浏览器通知权限。
2. 立即发送一条测试通知。
3. 用于验证浏览器和系统通知链路是否通畅。

### 显示/隐藏测试按钮

打开 Tampermonkey 脚本菜单，点击：

```text
切换通知测试按钮显示/隐藏
```

切换后会立即生效，并在刷新页面后保持当前状态。

## macOS 使用建议

如果你使用 macOS，建议确认以下设置：

### 浏览器站点通知权限

在目标页面地址栏左侧打开站点设置，确保：

- 通知 = 允许

### 系统通知权限

进入系统设置中的通知设置，确保你使用的浏览器通知权限已开启。
建议把提醒样式设置为更显眼的系统提醒样式。

## 常见问题

### 1. 只看到扩展图标红点，没有系统弹窗

这通常说明脚本已经执行了通知逻辑，但系统通知链路没有完全打通。
请优先检查：

- 浏览器是否允许该站点发送通知。
- 系统是否允许浏览器发送通知。
- `GM_notification` 是否可用。

### 2. 测试按钮重复出现

新版脚本已经通过单实例逻辑处理此问题。
如果仍然重复，通常是因为同时启用了多个旧版本脚本。

### 3. 点击测试按钮没有任何通知

请打开浏览器控制台，查看这些日志：

```text
[秒哒提醒] 已触发 GM_notification
[秒哒提醒] 已触发原生 Notification
[秒哒提醒] 系统通知未成功触发
```

如果只有权限已授予但仍没有系统弹窗，通常需要检查系统通知设置，而不是脚本识别逻辑。

## 调试建议

在浏览器控制台中过滤关键前缀：

```text
[秒哒提醒]
```

常见有效日志：

```text
[秒哒提醒] 脚本已注入
[秒哒提醒] 状态变化: idle -> running
[秒哒提醒] 状态变化: running -> idle
[秒哒提醒] 检测到对话完成，触发系统通知
[秒哒提醒] 已触发 GM_notification
[秒哒提醒] 已触发原生 Notification
```

## 免责声明

本脚本为用户侧增强脚本，依赖秒哒当前页面结构。
如果目标网页后续更新了输入区按钮的 DOM 结构、类名或 SVG 图标，脚本可能需要同步调整。
