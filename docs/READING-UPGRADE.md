# 阅读与字幕升级：实现与验收

日期：2026-10-17；源码版本 `0.2.0`，扩展显示版本 `0.2.0-preview.1`。这是预览交付，不替代已发布的 `v0.1.0`。

## 实现约定

- `pageTranslator` 持有每个原段落唯一记录。识别不复制原文，双语模式只插入译文。整页和 Ctrl 共享记录；Ctrl 关闭的段落在本次整页会话中保持关闭，恢复原文清除会话。
- 译文用受限标签和排版属性构建；不执行服务返回的 HTML，不复制事件和 ID。格式标记逐一校验，失败后仅用同一服务按文字片段重试。片段翻译可能降低连贯性，悬停译文显示说明。
- 仅译文模式使用临时隐藏包装，恢复时保留原文字节点对象。时间、代码和词典替换通过受保护标记处理。
- 网页内键保存在 `pageShortcuts`，Ctrl 单键保存在 `paragraphTrigger`。Chrome 实际绑定由 `commands.getAll` 读取，相同按键不在内容脚本重复执行；Chrome 不支持 `commands.update`。
- 后台 `readingService` 只使用已选择的服务，不调用自动替代服务。并发为 2，预取最多占 1 个槽；当前段落和字幕优先，未发送会话任务可撤销，已发送结果按版本丢弃。
- 新阅读路径绕过继承的磁盘翻译缓存，内存结果上限 1200 项；AI 自带内存缓存仍有其自身上限。隐私窗口不使用共享结果缓存。
- 字幕适配分为原生 TextTrack、YouTube 页面响应/DOM、DeepLearning.AI 页面 VTT/Vidstack。桥接仅在两个指定站点的 MAIN 环境运行，不持有扩展凭据。
- 有时间轴才预取。只有 DOM 当前字幕时采用即时模式，不能保证慢模型赶上字幕。用户未开启时不发送字幕翻译请求。

## 内部消息

`translateStructuredParagraphs` 和 `translateSubtitleBatch` 共用请求形状：

```json
{"action":"translateSubtitleBatch","session":"frame-session","priority":"interactive","items":[{"id":"0","text":"Hello"}]}
```

`priority` 为 `interactive`、`page` 或 `prefetch`；最多 12 项，总文本最多 24000 字符，字幕端再约束为每批 6000。结果为 `{items:[{id,text}]}` 或 `{error,code}`。服务、语言和密钥由后台读取，内容脚本不传密钥。

`cancelTranslationSession` 按 tab/frame 隔离取消；`loadSubtitleTrack` 仅允许课程页面请求 `https://video.deeplearning.ai/*.vtt`，禁止重定向，正文上限 2 MB，15 秒超时。

页面消息 `obt-caption-*`、`obt-course-*` 只传字幕元数据和文本，作为不可信输入校验。页面不能通过它们启用翻译或执行任意网络请求。

## 自动验收

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
npx playwright install chromium
npm run test:browser
```

浏览器测试使用 Playwright 配套 Chromium、临时配置、本地模型模拟接口。字幕时间测试采用真实 TextTrack/DOM 与可控播放时钟，不代表真实视频网站已经通过。

覆盖原节点和事件、链接/加粗/代码、列表/表格、Ctrl 组合键、整页去重、动态变化、慢响应关闭、损坏格式回退、仅译文恢复、字幕跳转关闭、设置页真实绑定。详细结果由测试输出及 [状态记录](memory/STATUS.md) 维护。

## 真实环境复验

1. 在自己的 Chrome 加载 `dist/chrome`，刷新已有标签页；用文章检查 Ctrl、整页、快捷键冲突和布局。
2. 用真实 Google、DeepSeek 和本地服务分别验证。后两者需要维护者提供的运行环境，模拟服务不能代替。
3. YouTube 分别选择人工和自动字幕；确认原生 CC 有文字，再检查本插件当前字幕、时间轴模式、跳转、广告、换视频和全屏。空正文不能视为成功。
4. 在本人正常登录的 DeepLearning.AI 中验证播放、源语言、文字稿逐句按钮、换课及全屏；不导出登录数据。
5. 正式 Chrome、2026 版参考插件的逐屏对照、真实模型和登录站点未完成前，不标记完整复刻，不创建稳定发布标签。

## 已知边界

原生 video 元素全屏、标准画中画、封闭 Shadow DOM、不可注入 frame、直播、ASR/OCR 均不属于本轮稳定承诺。复杂 CSS 可能需要站点规则，版式差异应提交实际样本。Firefox 仅保留构建，未验收新 MAIN 桥接和交互。
