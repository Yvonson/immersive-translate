# 阅读与字幕升级：实现与验收

更新日期：2026-10-22；源码和显示版本均为 `0.2.0`，已按 D-014 发布正式版。本次播放器布局变更仍未发布，不移动或替换既有 Release；历史预览及发布验证见 [当前状态](memory/STATUS.md)。

## 实现约定

- `pageTranslator` 持有每个原段落唯一记录。识别不复制原文，双语模式只插入译文。整页和 Ctrl 共享记录；Ctrl 关闭的段落在本次整页会话中保持关闭，恢复原文清除会话。
- 译文用受限标签和排版属性构建；不执行服务返回的 HTML，不复制事件和 ID。格式标记逐一校验，失败后仅用同一服务按文字片段重试。片段翻译可能降低连贯性，悬停译文显示说明。
- 仅译文模式使用临时隐藏包装，恢复时保留原文字节点对象。时间、代码和词典替换通过受保护标记处理。
- 网页内键保存在 `pageShortcuts`，Ctrl 单键保存在 `paragraphTrigger`。Chrome 实际绑定由 `commands.getAll` 读取，相同按键不在内容脚本重复执行；Chrome 不支持 `commands.update`。
- 后台 `readingService` 只使用已选择的服务，不调用自动替代服务。并发为 2，预取最多占 1 个槽；当前段落和字幕优先，未发送会话任务可撤销，已发送结果按版本丢弃。
- 新阅读路径绕过继承的磁盘翻译缓存，内存结果上限 1200 项；AI 自带内存缓存仍有其自身上限。隐私窗口不使用共享结果缓存。
- 字幕适配分为原生 TextTrack、YouTube 页面响应/DOM、DeepLearning.AI 页面 VTT/Vidstack。桥接仅在两个指定站点的 MAIN 环境运行，不持有扩展凭据。
- 有时间轴才预取。只有 DOM 当前字幕时采用即时模式，不能保证慢模型赶上字幕。用户未开启时不发送字幕翻译请求。

## 播放器布局（2026-10-22）

- `subtitleTranslator.js` 内部布局解析按视频定位播放器根节点及实际字幕／设置锚点；YouTube（含右侧子分组）紧邻 CC，Vidstack 在 CC 及其 tooltip 之后，B 站在底部右侧字幕按钮之后，无 CC 时放设置前。不改原生控件内部节点。
- 菜单和 tooltip 使用播放器内独立 Shadow DOM 层，避开控制栏裁剪并限制在可见播放器内；菜单宽度最多 300px，向上展开、小尺寸滚动、Esc 返回／关闭、键盘焦点归还。菜单打开时暂时锁定原生控制栏显隐，关闭／销毁时释放；Vidstack 发送 pause／resume controls 请求，B 站同时处理控制容器和底行的 opacity。
- 原生插入后检查行宽、边界和碰撞，拥挤时缓存回退决定，直到行宽／锚点／原生子节点变化再尝试，避免反复插入造成抖动。B 站保留 36×35px 默认点击区域，图标视觉中心跟随原生紧凑按钮。
- 无原生槽位时使用 36×36px 悬浮入口，从视频右下部向左、再向上避让可见控件及本插件字幕，间距至少 8px，不进入上半画面；video 原生 controls 预留底部区域。鼠标进入或键盘聚焦时显示，离开 2 秒后隐藏，菜单或焦点仍在播放器内时保持。无安全位置则隐藏，插件弹窗开关仍可用。
- 全屏根节点包含视频时，入口／菜单／字幕层随其迁移；普通／网页全屏／浏览器全屏／缩放均使用局部坐标与缩放比例。控制栏重建、播放器换父节点不会重置同一视频的字幕状态和样式。独立视频对象分别管理，销毁时清理观察器、监听、样式和定时器。
- 以上只改变布局与交互，不增加 B 站字幕抓取、翻译服务、权限、消息协议或设置迁移；版本及现有发布包不变。安装本次本地构建需重新加载 `dist/chrome` 并刷新网页。

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

覆盖原节点和事件、链接/加粗/代码、列表/表格、Ctrl 组合键、整页去重、动态变化、慢响应关闭、损坏格式回退、仅译文恢复、字幕跳转关闭、设置页真实绑定。`subtitle-layout.spec.cjs` 补充课程／B 站新旧控制栏、YouTube 子分组、延迟挂载、拥挤恢复、多视频、紧凑基线、自动隐藏、控件与字幕避让、360px／200%／嵌套全屏及清理。详细结果由测试输出及 [状态记录](memory/STATUS.md) 维护。

## 真实环境复验

1. 在自己的 Chrome 加载 `dist/chrome`，刷新已有标签页；用文章检查 Ctrl、整页、快捷键冲突和布局。
2. 用真实 Google、DeepSeek 和本地服务分别验证。后两者需要维护者提供的运行环境，模拟服务不能代替。
3. YouTube 分别选择人工和自动字幕；确认原生 CC 有文字，再检查本插件当前字幕、时间轴模式、跳转、广告、换视频和全屏。空正文不能视为成功。
4. 在本人正常登录的 DeepLearning.AI 中验证播放、源语言、文字稿逐句按钮、换课及全屏；不导出登录数据。
5. 正式 Chrome、2026 版参考插件的逐屏对照、真实模型和登录站点未完成前，不标记完整复刻；正式发布按 D-014 披露实验边界，不将历史发布决定误写成仍然冻结预览。

## 已知边界

原生 video 元素全屏、标准画中画、封闭 Shadow DOM、不可注入 frame、直播、ASR/OCR 均不属于本轮稳定承诺。复杂 CSS 可能需要站点规则，版式差异应提交实际样本。Firefox 仅保留构建，未验收新 MAIN 桥接和交互。
