# v0.2.0 安装与升级

这是浏览器插件。网页／字幕翻译只需要扩展；离线英汉词典和生词本需要额外安装 Windows x64 组件与词库。下载入口：[v0.2.0 Release](https://github.com/Yvonson/immersive-translate/releases/tag/v0.2.0)。

## 首次安装

1. 下载 **chrome.zip**，解压到长期保留的文件夹。
2. Chrome 打开 `chrome://extensions`，启用开发者模式，点“加载已解压的扩展”，选择直接含 `manifest.json` 的文件夹。固定工具栏图标，刷新网页。
3. 点击图标，选目标语言和 Google，点翻译。Google 无需 Key，需要能连通其服务。也可在设置中自行接入 DeepSeek、本地模型或其他兼容 API，详见 [完整 README](https://github.com/Yvonson/immersive-translate#readme)。
4. 需要词典时，再下载 **dictionary-companion-windows-x64.zip** 和 **dictionary-core.zip**。组件 ZIP 完整解压，不要单独取 EXE；词库 ZIP 保持压缩状态。
5. 扩展“全部设置 → 本地词典”复制包含当前扩展 ID 的 PowerShell 安装命令，在有 `install.ps1` 的组件目录执行。无需管理员权限。管理窗口点“导入离线资源包”，选 `dictionary-core.zip`，需约 1 GiB 可用空间。
6. 回扩展词典设置点“重新连接”。选词后 **Alt+Q 查询、Alt+S 收藏**，也可用右键菜单或词卡星标。词典页右上角“我的收藏”支持筛选、笔记、翻卡复习和 JSON 备份。

默认读音使用浏览器实际提供的英／美语音，无需 Key。缺音色时先安装系统英文语音，或自行配置 Google Cloud TTS；后者需自己的 Key／API／结算。两种方式都只在点击读音时工作，不需要下载录音或语音模型。

## 从本地预览版或旧版升级

1. 建议先分别导出扩展配置和生词本 JSON。配置导出不含 API Key 或生词本。
2. 关闭组件管理窗口，更新原有扩展目录内文件，在扩展管理页点“重新加载”，刷新旧网页。保持原路径可保留原扩展 ID 与浏览器配置，不要先移除扩展。
3. 下载新版 Windows 组件并重新运行设置页中的安装命令，再点“重新连接”；本次修复收藏时间和备份边界，组件也需更新。已有词库可以沿用，无需重新下载。
4. 程序在 `%LOCALAPPDATA%\OpenBilingualTranslate\Companion`，词库在 `Dictionary`，生词本独立在 `UserData\favorites.sqlite3`。升级和卸载组件默认保留词库及收藏；不要手工删除 UserData。

## 附件说明与常见问题

普通用户无需下载 `dictionary-companion-sources.zip`、`zhwiktionary.jsonl.gz` 或 GitHub 自动生成的 Source code。它们提供对应源码及可重建数据快照；`catalog.json`／`resources.lock.json`／`release-manifest.json`／`SHA256SUMS.txt` 用于核对来源、版本、体积和 SHA-256。

PowerShell 可运行 `Get-FileHash .\chrome.zip -Algorithm SHA256` 与 `SHA256SUMS.txt` 对照。只从本仓库 Release 下载，不要忽略文件校验错误。

如果 IDM 提示无法连接 `127.0.0.1:10808`，是下载器使用了未运行的代理。修复 IDM 自己的代理设置，或关闭这次下载接管后用浏览器下载；不需要修改插件 API Key。连接词典失败时检查是否完整解压、扩展 ID 是否变化、是否执行安装命令。

Chrome 是本次主要验收平台。Edge 可加载扩展，但本地词典注册首版仅面向 Windows x64＋Chrome。Firefox 128+ 的 `firefox.zip` 是未签名的临时开发包，重启需重载，未完成本项目功能验收。字幕只处理播放器已有文本，仍为实验功能；不能识别无字幕视频，也不能绕过课程登录或 DRM。
