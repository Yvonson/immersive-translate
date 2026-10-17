# 当前状态

更新日期：2026-10-17。

## 源码与交付

- 源码版本 `0.2.0`，扩展显示版本 `0.2.0-preview.1`；本机安装目录 `dist/chrome`，预览包 `dist/chrome.zip`。
- 新功能为预览交付，尚未创建 `v0.2.0` 稳定发布标签。公开稳定下载仍为 [v0.1.0](https://github.com/Yvonson/immersive-translate/releases/tag/v0.1.0)，其中不含本轮升级。
- 独立根提交 `b8d680ad59bdf3a8f211bd1b78dbeccb7cb7b7cb`；旧稳定标签对应 `a3f814f71e101e95198a439c4b723cf102a24813`。保留独立历史，GitHub 创建时确认 `fork: false`。
- `.upstream-git-history/` 为完整本地上游历史备份；`.upstream-git-backup/` 为早期不完整备份；两者不进入 Git。

## 本轮已实现

| 能力 | 实现及状态 |
| --- | --- |
| Ctrl 段落 | 单按开关，组合键/输入框不触发，其他段落不变；整页共享记录 |
| 双语排版 | 原节点保留，段下译文；行内格式、链接、代码、列表/表格；损坏标记用同一引擎分片重试 |
| 快捷键 | 插件内网页键录入；显示 Chrome 实际绑定及原生入口；显式双语模式切换 |
| 调度 | 并发 2，预取最多 1 槽；会话取消、配置失效和内存缓存；新路径不使用磁盘译文缓存 |
| 字幕入口 | 按播放器菜单、当前页面开关、站点自动开关、样式及轨道选择 |
| 字幕适配 | 原生 TextTrack、YouTube 实际响应/当前 DOM、DeepLearning.AI VTT / Vidstack；实验性质 |
| 课程文字稿 | 可见文字稿与逐句入口，保留时间戳；登录后真实 DOM 待验收 |
| 初始化修复 | 新版 Chromium 的 browser 别名不再误触 Firefox theme API；启动异常不阻塞配置 Promise |

代码和内部消息以 [升级说明](../READING-UPGRADE.md) 为准。README 已更新安装、Ctrl、快捷键、字幕模式与边界。

## 验证证据

2026-10-17 本地验证：

- `npm test`：12 项通过，包含模型接口、VTT/JSON3/XML、队列优先级/取消、隐私缓存隔离及字幕 URL 限制。
- `npm run test:browser`：9 项通过，使用 Playwright 1.64.1 配套 Chromium 156、临时配置及本地模拟模型。覆盖实际 DOM、文本节点/事件、格式、快捷键、列表表格、动态内容、慢响应、Shadow DOM/iframe、字幕及设置。字幕播放时钟可控，不是完整网站实播测试。
- `npm run build`、`npm run check`：两个浏览器构建、引用、语法和 ZIP 检查通过；Firefox 只保证这些构建检查，未进行功能验收。
- 浏览器截图在忽略目录 `.local/`，仅用于本地视觉检查；不提交网页截图或课程材料。

真实联网检查（独立 Chromium，无登录、无个人 Chrome 配置）：

| 对象 | 已取得证据 | 尚未通过 |
| --- | --- | --- |
| Google | 实际接口将 Hello world 返回为“你好世界” | 多站点长文/模型质量全面回归 |
| YouTube 官方示例 | 视频实播至约 6 秒，readyState 4；播放器按钮显示、开启状态正确，无页面 JS 错误 | 原生 CC 开启，但实际 timedtext 返回 HTTP 200/空正文，原生字幕 DOM 也为空；没有字幕端到端成功证据 |
| DeepLearning.AI 公开课时 | 页面及播放器入口正常；公开数据可读取英文 VTT 119 条、时间轴及其他语言轨 | 实播遇到 Log In to Continue；登录后播放、换课、文字稿和全屏仍未验收 |

参考样本：[YouTube](https://www.youtube.com/watch?v=EWX0bbGAd0k)、[课程 Introduction](https://learn.deeplearning.ai/courses/chatgpt-prompt-eng/lesson/dfbds/introduction)。不将网页“有入口”写成翻译成功。

## 发布前待验收

- 用户正常 Chrome 的加载、实际快捷键冲突、网页布局及视频全屏。
- 真实 DeepSeek、本地 Ollama/LM Studio；本轮未提供真实 Key/模型服务，模拟测试不替代。
- YouTube 可读字幕环境、人工/自动字幕、跳转、广告及换视频。
- 登录后的 DeepLearning.AI、课程文字稿真实 DOM、换课、全屏。
- 商业参考插件 2026 版的实际逐屏对照；官方帮助截图包含旧 1.16.5，不能用其证明现版一致。

不含 ASR、字幕 OCR、DRM/登录绕过、标准画中画、Safari 或桌面端。依赖仍有继承的 Browserslist/弃用提示，未将本轮变更扩展成构建依赖全面升级。
