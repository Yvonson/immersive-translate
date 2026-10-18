# v0.2.0 安装与升级

这是浏览器插件。到 [正式版下载页](https://github.com/Yvonson/immersive-translate/releases/tag/v0.2.0)，**按需求选一个包，不用下载全部附件**：

| 你的需求 | 下载这个 | 包含什么 |
| --- | --- | --- |
| 只翻译网页和视频已有字幕，Chrome／Edge | [open-bilingual-translate-0.2.0-chromium-extension.zip](https://github.com/Yvonson/immersive-translate/releases/download/v0.2.0/open-bilingual-translate-0.2.0-chromium-extension.zip) | 轻量扩展，无需安装本地组件 |
| Windows x64＋Chrome，还要离线查词和生词本 | [open-bilingual-translate-0.2.0-windows-x64-bundle.zip](https://github.com/Yvonson/immersive-translate/releases/download/v0.2.0/open-bilingual-translate-0.2.0-windows-x64-bundle.zip) | 扩展、本地词典程序、词库、本文；**不用再下 open-bilingual-translate-0.2.0-chromium-extension.zip** |

正式页只提供上面两个安装包，另有 GitHub 自动生成的两项 Source code（不能直接安装）。校验值在发布正文的 **SHA-256** 折叠区。开发者重建、对应源码和 Firefox 开发包统一放在 [Resources 页面](https://github.com/Yvonson/immersive-translate/releases/tag/resources-v0.2.0)，普通用户无需下载。

## 只安装网页／字幕翻译

1. 将 `open-bilingual-translate-0.2.0-chromium-extension.zip` 解压到长期保留的文件夹。
2. Chrome 打开 `chrome://extensions`，启用开发者模式，点“加载已解压的扩展”，选择直接含 `manifest.json` 的文件夹。Edge 使用 `edge://extensions`。
3. 固定工具栏图标，刷新网页，选目标语言和 Google，点翻译。Google 无需 Key，但需能连通服务。自己的 DeepSeek／本地模型配置见 [完整 README](https://github.com/Yvonson/immersive-translate#readme)。

## 安装 Windows 完整包

1. 将 `open-bilingual-translate-0.2.0-windows-x64-bundle.zip` **完整解压**到长期保留的文件夹，建议至少有 2 GiB 可用空间。里面有 `chrome/`、`companion/`、`dictionary-core.zip` 和 `INSTALL.md`。
2. 按上一节打开 Chrome 扩展管理页，加载其中的 **chrome 文件夹**；不用另下轻量包。
3. 扩展“全部设置 → 本地词典”复制包含当前扩展 ID 的安装命令。
4. 在解压后的 **companion 文件夹**打开 PowerShell，执行该命令；该目录直接含 `install.ps1`。无需管理员权限，不要单独复制 EXE。
5. 程序管理窗口点“导入离线资源包”，选择完整包根目录的 **dictionary-core.zip**，不必解压词库 ZIP。
6. 回扩展词典设置点“重新连接”。选词后 **Alt+Q 查询、Alt+S 收藏**，也可用右键或星标。词典页右上角“我的收藏”可筛选、记笔记、翻卡复习和 JSON 备份。

完整包已包含所有安装文件，**仍需执行组件注册和词库导入**，不是自动安装器。默认发音使用实际可用的浏览器英／美音，无需 Key；缺音色时安装系统英文语音，或自行配置 Google Cloud TTS 的 Key／API／结算。不下载录音或语音模型。

## 已有用户升级

1. 先按需导出扩展配置和生词本 JSON；配置导出不含 API Key 或生词本。
2. 只用网页／字幕时下载轻量包；使用本地词典时下载完整包。**保留原扩展路径**：将新扩展文件复制到原目录，点“重新加载”并刷新网页；不要先移除扩展或另从新路径加载。
3. 使用本地词典时，关闭旧管理窗口，在新版完整包的 `companion/` 目录重新运行设置页安装命令，再点“重新连接”。已有词库可沿用，**不用再次导入**。
4. 已按旧分件方式安装的用户可继续使用，不必为这次附件整理重新安装。程序、扩展和词库内容仍对应原 v0.2.0。

程序位于 `%LOCALAPPDATA%\OpenBilingualTranslate\Companion`，词库在 `Dictionary`，收藏独立保存在 `UserData\favorites.sqlite3`。程序升级／卸载默认保留词库和收藏；不要手工删除 UserData。

## 校验和故障排查

展开正式发布正文的 **SHA-256**，运行 `Get-FileHash .\open-bilingual-translate-0.2.0-windows-x64-bundle.zip -Algorithm SHA256` 比对相应文件。只从本仓库 Release 下载，不忽略校验错误。

IDM 提示无法连接 `127.0.0.1:10808` 时，是下载器使用了未运行的代理；修复 IDM 的代理设置，或关闭下载接管改用浏览器。与插件 API Key 无关。词典连接失败时检查是否完整解压、扩展 ID 是否变化、是否在正确的 `companion/` 目录执行注册。

本地词典首版只验证 Windows x64＋Chrome。Firefox 128+ 开发包位于 Resources 页的开发资料 ZIP 内，未签名、重启需重载，未完成本项目功能验收。字幕仍为实验功能，只处理已有可读文本，不识别无字幕视频，也不绕过课程登录或 DRM。
