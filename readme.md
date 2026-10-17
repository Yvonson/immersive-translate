# Open Bilingual Translate · 开放双语翻译

由 Yvonson 独立维护的浏览器翻译扩展，以归档的老版沉浸式翻译源码为基础重新初始化。项目拥有自己的 Git 历史、扩展名称和 Firefox ID，不关联上游 Fork 网络，也不是官方产品。

## 已有能力

- 保留上游的网页正文识别、段落双语显示、动态网页处理和网站规则配置。
- 保留 Google / Yandex 翻译引擎。
- 新增 DeepSeek API、本地模型（Ollama / LM Studio）和自定义兼容接口。
- 新增实验性双语字幕：HTML5 原生字幕轨、YouTube 显示中的字幕。
- 提供 Chrome / Edge Manifest V3 和 Firefox 开发包，以及测试和自动构建流程。

这是可继续改进的初始开发版本。字幕翻译需要视频已有文本字幕，不包含语音识别；商业版当前功能不会随老源码自动获得。本项目目前是浏览器扩展，没有独立桌面客户端。

## 本地安装

需要 Node.js 22 或更新版本。

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
```

Chrome / Edge：打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式，选择“加载已解压的扩展”，加载项目的 `dist/chrome` 文件夹。源码更新后重新构建、重新加载扩展，并刷新网页。

Firefox：打开 `about:debugging#/runtime/this-firefox`，选择“临时载入附加组件”，选择 `dist/firefox/manifest.json`。这是临时开发安装；正式分发需要使用自己的 Mozilla 账号签名。

构建压缩包位于 `dist/chrome.zip` 和 `dist/firefox.zip`，构建目录不提交到 Git。

## 选择翻译引擎

点击扩展图标 → Options → Translations（翻译服务）。选择网页翻译引擎。使用 AI 时，在下方“AI 翻译配置”中选中对应服务，填写参数，保存并测试连接，然后刷新待翻译网页。

| 服务 | API 地址示例 | 模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | 默认 `deepseek-flash`，可改成账户支持的模型 |
| Ollama | `http://127.0.0.1:11434/v1` | 填写本机已下载的模型名，例如 `qwen3:8b` |
| LM Studio | `http://127.0.0.1:1234/v1` | 填写本机服务暴露的模型 ID |
| 自定义接口 | `https://your-service.example/v1` | 填写服务支持的模型名 |

本地服务需要先自行启动，模型必须能遵循指令返回 JSON 字符串数组。接口若有 Origin 访问限制，需要配置为允许自己的扩展来源。远程 API 使用 HTTPS；HTTP 仅支持本机回环地址。

API Key 仅保存在本机扩展存储中，不进入普通配置备份。不要把密钥写进源码或上传到 GitHub。连接测试和云端翻译可能产生服务商费用。Google / Yandex 的旧公共接口可能受网络、限流或接口变更影响。

DeepSeek 接口说明：https://api-docs.deepseek.com/api/create-chat-completion/

Ollama 兼容接口说明：https://docs.ollama.com/api/openai-compatibility

## 视频双语字幕

在翻译设置中开启“实时双语字幕”，刷新视频页，并打开视频原字幕。扩展使用所选翻译引擎翻译当前可读取的字幕，在视频上叠加原文和译文。切换字幕时丢弃过期响应。

该功能仍需真实网站验证和适配。模型延迟可能导致快字幕来不及显示；无字幕视频、画面内烧录字幕和受保护字幕不在当前支持范围。

## 继续开发

- 源码在 `src/`，详细说明见 [开发文档](docs/DEVELOPMENT.md)。
- 项目背景、关键决策、验证记录和待办见 [项目记忆](docs/memory/README.md)；协作约定见 [AGENTS.md](AGENTS.md)。
- 推送代码会运行 GitHub Actions 并生成 ZIP artifacts。
- 推送 `v*` 标签会创建 GitHub Release；不会操作上游商店账号。
- 下一步建议：真实网站回归测试、字幕预取与批量翻译、逐站适配、模型限流与故障提示、更新老构建依赖。

当前仓库以全新的首次提交开始。旧 `.git` 仅保存在本地 `.upstream-git-history/` 作为来源备份，并被 `.gitignore` 排除。

## 来源与许可证

源代码来自 [old-immersive-translate](https://github.com/immersive-translate/old-immersive-translate)，导入提交为 `6df13da22664bea2f51efe5db64c63aca59c4e79`；其上游为 [TWP](https://github.com/FilipePS/Traduzir-paginas-web)。感谢原作者的工作。

保留 [MPL-2.0 许可证](LICENSE)、原有版权声明和 [原版 README](docs/upstream-readme.md)。来源记录见 [UPSTREAM.md](UPSTREAM.md)，数据处理说明见 [PRIVACY](PRIVACY)。
