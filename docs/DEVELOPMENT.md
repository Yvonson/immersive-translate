# 开发说明

开始接续开发前，请先阅读 [协作约定](../AGENTS.md) 和 [项目记忆索引](memory/README.md)。实现细节在本文维护；长期决定、验证状态及待办分别在记忆文档中维护。

## 项目结构

- `src/contentScript/pageTranslator.js`：原网页内容识别、按段落翻译及动态内容处理。
- `src/background/translationService.js`：翻译消息与引擎路由。
- `src/background/aiProviders.js`：DeepSeek 和兼容接口；分批、最多两路请求、25 秒超时、内存缓存及输出校验。
- `src/contentScript/subtitleTranslator.js`：按播放器管理字幕入口、时间轴、预取及叠加层；配合 YouTube / Vidstack 站点桥接。
- `src/options/ai-options.js`：API 地址、模型、密钥和连接测试。
- `src/background/dictionaryService.js`、`src/dictionary/`、`companion/`：选词查词、共享词卡／词典页、Native Messaging、本地 SQLite 与独立浏览器／Google Cloud 语音；协议、安装、资源构建和验收见 [本地词典](LOCAL-DICTIONARY.md)。
- `src/chrome_manifest.json`：Chrome / Edge Manifest V3。
- `src/manifest.json`：Firefox Manifest V2，独立扩展 ID。
- `scripts/build.cjs`：用 Node.js 和 fflate 生成 `dist/chrome`、`dist/firefox` 及两个 ZIP；保留现代浏览器原生语法，不再依赖 Gulp／Babel。
- `tests/`：单元测试和真实 Chromium DOM / 扩展测试；默认使用本地模拟接口，无需付费 Key。

新消息、配置、渲染约定及验收步骤见 [阅读与字幕升级](READING-UPGRADE.md)。

## 日常开发

使用 Node.js 22 或更新版本：

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run check
npx playwright install chromium
npm run test:browser
```

修改源码后重新构建，在扩展管理页点击重新加载，再刷新测试网页。不要直接修改 `dist/`。

`npm run check` 检查构建产物中的 manifest/页面本地资源引用、JavaScript 语法、JSON、旧赞助/收款入口清理及 ZIP 产物。它不代替浏览器中的真实网站测试。

## 接口约定

AI 引擎使用 `POST /chat/completions`。基础 URL 可以包含 `/v1`，也可填写完整接口地址。请求使用 `model`、`messages` 和 `stream: false`；仅 DeepSeek 配置会添加 `thinking: { type: "disabled" }`。

模型必须返回与输入同序、同长度的 JSON 字符串数组。数量或格式不符时拒绝结果，避免将错位译文应用到网页。不会自动把 AI 请求转发给另一个云服务。

`aiProviderSettings` 单独保存在扩展的 `chrome.storage.local`，不写进源码、Git 或普通配置导出；`twpConfig` 不加载该字段。恢复默认设置会清除此字段。该存储不等于系统级加密保险箱。

## GitHub 工作流

- 每次 push / pull request：测试、构建、产物检查，上传两个 ZIP artifact。
- 手动 preview：构建并上传测试包。
- 推送 `v*` 标签：扩展完整回归、Windows 官方 Python 构建及对应源码检查通过后创建草稿；补齐已校验词库和所有附件后发布，见 [发布流程](RELEASING.md)。
- 不需要上游作者的任何密钥，不会上传到上游 Chrome 商店，也不会自动执行 Firefox 签名。

Firefox 正式分发签名、商店上架、Safari 或独立桌面端需要另行开发或配置。

## 手工验收

1. 本轮在 Chrome 加载 `dist/chrome`，检查设置页、弹窗和网页双语显示。
2. 配置实际 API Key，点击“保存并测试连接”，再用正文、链接及动态加载页面验证模型翻译。
3. 启动本地模型服务，使用真实已安装模型名，验证不带 API Key 的翻译。
4. 开启字幕功能，刷新含原字幕的视频页，测试播放、暂停、跳转、换集和全屏。
5. 验证无字幕视频不显示译文，慢响应不会覆盖新的字幕，关闭功能后叠加层消失。

已知边界：字幕适配是实验实现，网站结构更新可能使其失效；不支持无字幕视频的自动语音识别、DRM 字幕提取或所有视频网站。上游的旧网页规则、Google/Yandex 公共接口和构建依赖也仍需持续维护。

## 界面维护

`src/ui/theme.css` / `theme.js` 提供共享颜色变量和主题切换。弹窗及设置使用这些变量；播放器菜单位于独立 Shadow DOM，保持深色原生播放器风格。YouTube 按钮挂到 CC 后（无 CC 时齿轮前），菜单作为播放器容器的子层定位，避免控制栏的 overflow/transform 影响。

设置导航使用固定的分区映射，不直接把任意 hash 传给选择器；旧 `#others` 映射到数据与高级，未知入口回基础设置。所有配置继续沿用原键；UI 改版不清除或导出 API Key。版本以项目记忆 [D-014](memory/DECISIONS.md#d-014按用户明确选择发布-v020) 为准，正式版为 `0.2.0`；早期 D-008 的 preview 冻结已被取代。下载布局与规范命名见 [D-016](memory/DECISIONS.md#d-016规范文件名双安装包与独立-resources)。

## 生词本实现约定

`companion/obt_dictionary/favorites.py` 管理固定 UserData 下的 SQLite（schema v1），词条／语境／标签分表，WAL、外键和事务保证并发归并及导入原子性。收藏与词库引擎惰性、独立创建；`main.py --user-data-dir` 仅供用户命令行或隔离验证，不通过网页消息接受路径。不要将文件放进资源包、安装目录或 Git。

协议版本继续为 1，`status.capabilities.favorites: 1` 协商能力；旧主机仍可查词，新功能明确提示更新。`dictionaryFavorites` 内部消息映射到 `favorites.state/collect/meta/list/ids/get/update/remove/review/exportStart/exportChunk/importStart/importChunk/importCommit`。仅扩展页面可读取批量收藏、编辑和备份；内容脚本只允许当前选词的 state／collect。背景校验自身 sender、隐身窗口、分片 token 的文档归属、请求 UTF-8 体积；原生进程再次校验内容与地址。没有 page-world 接口或生产 HTTP 服务。

收藏请求有独立 owner，`dictionaryCancel` 只取消查询和发音；保存成功后才显示已收藏。写入不自动重试，超时提示先核对实际状态。`chrome.storage.local.dictionaryFavoritesRevision` 只传变更信号，不保存个人词表；词卡星标、词典计数及列表通过它刷新。新页面 `dictionary/favorites.html` 不复用查词页 `#word`，避免与真实单词冲突。

备份是一致读事务快照，出站每片 60,000 字符；导入每片至多 2,000 个 JS UTF-16 单位，避开代理对，原生按顺序暂存至 128 MiB 上限，完整校验后单事务合并。token 只存在当前主机／扩展文档会话。notes 等自由文本仅以 textContent／value 显示，绝不能注入 HTML。保存资料有上限，详见 [用户说明](LOCAL-DICTIONARY.md#本地生词本)。

`tests/browser/favorites.spec.cjs` 用随机回环地址作为**测试桥**连接真实 Python Native Messaging 主机和隔离 SQLite，以便 Linux CI 不安装 Windows 程序；不进入扩展包或生产运行路径，不接触真实用户词表。覆盖 5,001 条收藏的页面／筛选、语境过滤、翻卡键盘和分片备份；Python 额外覆盖多连接写入、失败回滚。普通浏览器测试需 PATH 有 Python 3.13，或设置 `OBT_TEST_PYTHON`。安装验证和真实 API／网站验收继续分开记录。

## 查词与收藏快捷键

`pageShortcuts` 新增 `hotkey-dictionary-lookup`（Alt+Q）与 `hotkey-dictionary-collect`（Alt+S）。配置读取／导入仅补缺失项，保留显式空值和自定义键；新默认键与既有动作冲突时，新动作保持未绑定并在设置中提示。`twpConfig.getDefault` 为设置提供默认值副本。共享 `readingShortcuts` 注册／分发四个动作、校验冲突、抑制连发与编辑／输入法事件；处理组合键前清除段落单按状态，避免松开修饰键追加翻译。

Chrome manifest 的两个词典命令默认无 `suggested_key`；网页内录入为主要入口，原生实际绑定优先处理重合组合。原生路径使用 `dictionaryShortcutProbe → dictionaryShortcutClaim → dictionaryShortcutExecute`：背景保存短期请求，只有当前标签页首个认领的自身扩展 document 可执行，按 documentId 定向发送，不广播执行，也不从其他 frame 搬运选区。选词、坐标和语境留在执行 frame 内捕获。无网页认领时只给工具栏标题提示，不弹空词典页。此消息不改变 Native Messaging 协议或数据库结构。

词卡持有当前查询及其原文语境；快捷键在聚焦词卡前读取新选区，不使用旧 contextmenu 快照，新范围优先于词卡兜底。相关词查询不携带上一个词的原文。相同词／语境的在途快捷收藏共用请求，按原生提交确认成功；取消查询与关闭 UI 不取消收藏。页面标记 `data-obt-dictionary-card`／`data-obt-dictionary-toast` 区分两个闭合 Shadow DOM 层，不携带词语或个人数据。
