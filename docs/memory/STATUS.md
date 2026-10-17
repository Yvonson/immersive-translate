# 当前状态

更新日期：2026-10-17。此处为当日已核实的项目快照。

## 版本与仓库

- 当前代码版本：`0.1.0`，来源为 [package.json](../../package.json) 及两份扩展 manifest。
- 独立根提交：`b8d680ad59bdf3a8f211bd1b78dbeccb7cb7b7cb`。
- `v0.1.0` 对应提交：`a3f814f71e101e95198a439c4b723cf102a24813`，包含字幕关闭时显式隐藏叠加层的修复。
- GitHub 创建时已通过 API 核实 `fork: false`；首次版本源码已推送到 `main`。
- [v0.1.0 下载页](https://github.com/Yvonson/immersive-translate/releases/tag/v0.1.0) 已生成 `chrome.zip` 和 `firefox.zip`。
- 本机的完整上游 Git 历史备份在 `.upstream-git-history/`，已忽略；`.upstream-git-backup/` 是早期备份尝试留下的目录，不应作为完整备份使用，也不进入 Git。

后续文档提交不改变上述版本标签所指的代码。工作区和远程是否干净、同步，应在每次任务开始时实时检查。

## 已实现

| 能力 | 当前范围 | 实现入口 |
| --- | --- | --- |
| 网页翻译 | 继承正文识别、段落双语、动态内容和网站规则 | `src/contentScript/pageTranslator.js` |
| 传统引擎 | 保留 Google / Yandex 接入 | `src/background/translationService.js` |
| AI 翻译 | DeepSeek、本地模型和自定义兼容接口；配置及连接测试 | `src/background/aiProviders.js`、`src/options/ai-options.js` |
| 字幕翻译 | 实验性 HTML5 字幕轨、YouTube 显示中的字幕；过期响应丢弃 | `src/contentScript/subtitleTranslator.js` |
| 打包 | Chrome / Edge MV3，Firefox MV2 开发包 | `gulpfile.js`、两份 manifest |
| 自动化 | Push/PR 测试与构建、手动预览、`v*` 标签发布 | `.github/workflows/` |

接口、缓存、超时、密钥处理及手工验收步骤以 [开发文档](../DEVELOPMENT.md) 为准。

## 验证记录

| 日期 | 验证 | 结果与证据 |
| --- | --- | --- |
| 2026-10-17 | `npm test` | 8 项通过；覆盖请求格式、批处理、并发、缓存、异常结果和字幕状态，使用模拟服务/DOM |
| 2026-10-17 | `npm run build` | Chrome 与 Firefox 目录及 ZIP 成功生成 |
| 2026-10-17 | `npm run check` | 两个构建的 manifest 引用、JavaScript 语法和 ZIP 产物检查通过 |
| 2026-10-17 | 最新版本 CI | [提交 a3f814f 的构建](https://github.com/Yvonson/immersive-translate/actions/runs/39014176752) 成功 |
| 2026-10-17 | 发布工作流 | [v0.1.0 发布](https://github.com/Yvonson/immersive-translate/actions/runs/39014214905) 成功，已核实两个附件存在 |

## 未验证与已知边界

- 尚未使用真实 DeepSeek API Key、本地模型服务或真实视频网站完成端到端验收。
- 字幕测试使用模拟 DOM，不能证明视频站点兼容性、全屏展示或模型速度满足实时观看要求。
- 不含无字幕视频的语音识别、烧录字幕 OCR、DRM 字幕提取、独立桌面端或 Safari 支持。
- Firefox 为开发包，尚未使用维护者自己的账号进行正式签名或商店分发。
- 上游网站规则和 Google/Yandex 旧接口可能失效，需要逐项验证。
- 继承的构建依赖存在弃用及旧 Browserslist 数据提示；配置中的旧浏览器版本不代表已经实测支持。

待办和建议完成标准见 [ROADMAP.md](ROADMAP.md)。
