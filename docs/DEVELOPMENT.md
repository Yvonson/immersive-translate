# 开发说明

开始接续开发前，请先阅读 [协作约定](../AGENTS.md) 和 [项目记忆索引](memory/README.md)。实现细节在本文维护；长期决定、验证状态及待办分别在记忆文档中维护。

## 项目结构

- `src/contentScript/pageTranslator.js`：原网页内容识别、按段落翻译及动态内容处理。
- `src/background/translationService.js`：翻译消息与引擎路由。
- `src/background/aiProviders.js`：DeepSeek 和兼容接口；分批、最多两路请求、25 秒超时、内存缓存及输出校验。
- `src/contentScript/subtitleTranslator.js`：实验性视频字幕叠加层；读取 HTML5 TextTrack 和 YouTube 显示中的字幕，丢弃过期译文。
- `src/options/ai-options.js`：API 地址、模型、密钥和连接测试。
- `src/chrome_manifest.json`：Chrome / Edge Manifest V3。
- `src/manifest.json`：Firefox Manifest V2，独立扩展 ID。
- `gulpfile.js`：生成 `dist/chrome`、`dist/firefox` 及两个 ZIP 包。
- `tests/`：使用模拟接口验证核心逻辑，无需付费 API Key。

## 日常开发

使用 Node.js 22 或更新版本：

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
```

修改源码后重新构建，在扩展管理页点击重新加载，再刷新测试网页。不要直接修改 `dist/`。

`npm run check` 检查构建产物中的 manifest 文件引用、全部 JavaScript 语法和 ZIP 产物。它不代替浏览器中的真实网站测试。

## 接口约定

AI 引擎使用 `POST /chat/completions`。基础 URL 可以包含 `/v1`，也可填写完整接口地址。请求使用 `model`、`messages` 和 `stream: false`；仅 DeepSeek 配置会添加 `thinking: { type: "disabled" }`。

模型必须返回与输入同序、同长度的 JSON 字符串数组。数量或格式不符时拒绝结果，避免将错位译文应用到网页。不会自动把 AI 请求转发给另一个云服务。

`aiProviderSettings` 单独保存在扩展的 `chrome.storage.local`，不写进源码、Git 或普通配置导出；`twpConfig` 不加载该字段。恢复默认设置会清除此字段。该存储不等于系统级加密保险箱。

## GitHub 工作流

- 每次 push / pull request：测试、构建、产物检查，上传两个 ZIP artifact。
- 手动 preview：构建并上传测试包。
- 推送 `v*` 标签：验证后创建 GitHub Release，附带两个 ZIP。
- 不需要上游作者的任何密钥，不会上传到上游 Chrome 商店，也不会自动执行 Firefox 签名。

Firefox 正式分发签名、商店上架、Safari 或独立桌面端需要另行开发或配置。

## 手工验收

1. 在 Chrome / Edge 加载 `dist/chrome`，检查设置页、弹窗和网页双语显示。
2. 配置实际 API Key，点击“保存并测试连接”，再用正文、链接及动态加载页面验证模型翻译。
3. 启动本地模型服务，使用真实已安装模型名，验证不带 API Key 的翻译。
4. 开启字幕功能，刷新含原字幕的视频页，测试播放、暂停、跳转、换集和全屏。
5. 验证无字幕视频不显示译文，慢响应不会覆盖新的字幕，关闭功能后叠加层消失。

已知边界：字幕适配是实验实现，网站结构更新可能使其失效；不支持无字幕视频的自动语音识别、DRM 字幕提取或所有视频网站。上游的旧网页规则、Google/Yandex 公共接口和构建依赖也仍需持续维护。
