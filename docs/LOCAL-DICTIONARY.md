# 本地英汉词典与读音

当前功能由 **Chrome 扩展＋Windows x64 查词伴随程序＋本地词库包** 组成。释义、音标和例句在本地 SQLite 检索；发音默认使用浏览器语音，可选择自己的 Google Cloud API。按用户最新要求，已停止真人录音下载，不需要录音包或大型离线语音模型。

## 获取与安装

在 [v0.2.0 Release](https://github.com/Yvonson/immersive-translate/releases/tag/v0.2.0) 下载下面的附件，无需登录 GitHub。普通用户只需扩展、Windows 程序及词库；已安装旧词库可继续使用。完整步骤见 [安装指南](INSTALL.md)。开发中的 CI artifact 不替代固定版本的 Release。

| 文件 | 用途 |
| --- | --- |
| `chrome.zip` | 浏览器扩展，解压后在 `chrome://extensions` 加载 |
| `dictionary-companion-windows-x64.zip` | 本地程序、运行环境及安装／卸载脚本 |
| `dictionary-companion-sources.zip` | 与程序匹配的源码和构建说明所用源码 |
| `dictionary-core.zip` | ECDICT 英汉释义／词形和中文维基词典英语解释／例句 |
| `catalog.json` | 词库版本、下载／安装体积、记录数、SHA-256 |

1. 加载新版扩展并刷新网页，进入 **全部设置 → 本地词典**。
2. 将 Windows 程序 ZIP **完整解压**，保留 `dictionary-companion` 和 `_internal`，不要只复制 EXE。
3. 在包含 `install.ps1` 的文件夹打开 PowerShell，执行设置页提供的安装命令，其中已包含当前扩展 ID。
4. 程序装入 `%LOCALAPPDATA%\OpenBilingualTranslate\Companion`，按当前用户注册 Chrome Native Messaging，无需管理员权限。
5. 管理窗口导入 **dictionary-core.zip**，资源存入 `%LOCALAPPDATA%\OpenBilingualTranslate\Dictionary`。
6. 回到扩展点击 **重新连接**；在发音设置查看可用音色，选择默认口音并“试听 hello”。

自定义词库位置可在安装命令后增加 `-DataDir 'E:\Dictionaries\OpenBilingualTranslate'`。更改位置不会自动搬迁旧资源，需重新导入。移动扩展路径或更换浏览器后，复制新扩展 ID 的安装命令修复注册。

## 查词与学习

选中网页英文单词或短语，右键选择 **在本地词典中查询**。词卡显示简明解释、音标和英／美音按钮；点击 **详细解释与例句** 打开完整词典页，也可从设置直接打开词典输入查询。

普通网页中也可以选词后按 **Alt+Q 查词／Alt+S 收藏**。在 **设置 → 快捷键** 直接录入新按键，支持清除、恢复默认及重复／保留组合检查，保存后即时生效。词卡内可直接按收藏键保存当前词；新选区优先，未选词且没有词卡时仅提示。按住键不连续执行，相同收藏正在保存时合并请求；关闭词卡不取消收藏写入。输入框、编辑器和输入法组合输入期间不触发，不读取剪贴板或自动悬停取词。

这两个动作默认使用网页快捷键，Chrome 原生入口可另外绑定；设置显示实际绑定，同键时只执行原生路径一次。默认只在普通网页有焦点时生效；受限页面、网站／系统占键可能影响按键。原生入口无法找到可执行网页时，工具栏图标的悬停标题给出提示。v0.2.0 同时修复生词本时钟回拨／导入标签上限问题，从预览版本升级时也应更新 Windows 组件；已有词库无需重下。

- 选词不超过 120 个字符、8 个词；长句使用原网页翻译。
- 词卡在选词所在 iframe 内显示，Esc 或点击外部关闭；不能注入的 Chrome 内部页面改开词典页。
- 切词或关闭会停止其发音、取消迟到响应；支持正常／0.75× 慢速。
- 词形显示原形，各来源解释分开呈现。例句、词源、相关词仅在资料存在时显示；缺词不自动转发在线词典或翻译引擎。
- 音标来自本地词库，读音由语音引擎生成。`read`、`lead`、`record` 等多音词未必与当前词义匹配，不能把一次合成当作所有义项的标准读音；当前不承诺按任意音标准确生成声音。

## 默认浏览器语音：无需 Key

设置中选择“浏览器语音”，刷新音色列表，英音和美音可分别选。自动选择优先使用 **同口音** 的 Google 音色，其次是同口音系统音色；没有相应音色会明确提示，不以另一口音代替。

列表和播放提示标明实际名称及“在线／本机”。Google 音色是否出现取决于 Chrome、操作系统和已安装语音引擎，Windows 不保证自带 Google 或英音。本机音色可离线；在线音色需要联网，数据由其提供者处理。Windows 可在系统的语言／语音设置中安装英文语音后重启 Chrome 再刷新列表。

实现使用 [Chrome tts API](https://developer.chrome.com/docs/extensions/reference/api/tts)；浏览器语音不等于 Google Cloud，不需要填 Cloud Key。

## 本地生词本

新版扩展和伴随程序共同提供收藏。旧组件会明确提示“请更新本地伴随程序”，按原步骤安装新版并在设置中重新连接即可；**无需重新下载已有词库**。

网页选词右键 **收藏到本地生词本**，会在原网页提示保存结果，不强制跳走。词卡右上角和词典结果的 **☆ 收藏** 也能保存，成功后变成 **★ 已收藏**；再次点击打开这个词的记录。词典页右上角 **我的收藏 · N** 进入独立页面。不可注入的受限页面改为打开收藏页反馈；没有语境也可保存单词。

收藏保存在固定的 `%LOCALAPPDATA%\OpenBilingualTranslate\UserData\favorites.sqlite3`，不随 `-DataDir` 词库目录迁移，也不在 Companion 安装目录中。组件更新、词库导入／删除、换扩展 ID 和重装扩展都保留它。卸载脚本的 `-DeleteResources` 只删除词库，**不会删除生词本**。

- **保存内容**：词头、收藏时的解释／音标／例句和许可来源、可见原文语境、页面标题及处理后的地址；可编辑个人解释、笔记和标签。原文捕获排除隐藏文字、工具栏及插件译文。只在显式收藏时落盘，查词不记录历史；隐身窗口不读写。
- **归并**：有词库时以实际词头确定身份，保留有意义的大小写；`US`／`us`、`take`／`took` 分开。重复收藏更新最近收藏时间，追加不同语境，首次时间不变，已有快照不覆盖。没有词库或未收录时按规范化选词原样保存，不猜测词根。
- **列表**：每页 50 条，默认首次收藏降序；可选首次／最近收藏、升降序，今天／最近 7 或 30 天／自定义日期、状态、多个标签、来源域名和关键词搜索。日期按电脑当地整日计算，库中统一 UTC；标签任选其一，其余维度同时满足。
- **学习**：个人解释、标签、笔记与状态需点保存；不会改变收藏日期。取消收藏有确认，会删除该词相关学习记录。已保存快照无需词库就能显示，“查看当前词典解释”另开查词页，不静默替换旧资料。
- **翻卡**：从当前筛选和顺序建立本次词表，默认排除已掌握；可勾选包含。正面为单词与原文，Space／按钮翻卡后显示解释，1 不认识、2 有印象均记学习中，3 记已掌握；每次立即保存评价、复习次数和时间。跳过不记次数，已删除词自动跳过，Esc 退出。读音只在点击时调用已选服务。
- **备份**：导出 JSON v1 含完整保存数据（包括笔记、日期、复习和语境），普通配置导出不包含它。导入先校验，事务合并；新词恢复全部字段，同词合并标签／语境与收藏日期范围，保留本机已有快照、笔记、状态及复习进度。重复导入不新增重复词，失败回滚；网络断开／超时后先刷新核对实际结果，不自动重发写入。

首版不包含云同步、间隔复习计划、每日任务或 Anki。为控制消息与本地容量，每词最多 30 个标签（各 40 字）、200 条独立语境（合计约 500 KB，单条原文 2,000 字）；快照最多 4 个词条、每条 12 个义项并受 40 KB 上限约束，截取时有提示。单次编辑请求约 14 KB，过长会提示缩短；JSON 备份最大 128 MiB，分片传输，不受单条 Native Messaging 的 16 KiB 限制。资料过长时仍可打开当前词典查看。

导出文件含你保存的原文、来源和笔记，请自行妥善保管。地址去掉账号、查询参数和片段，YouTube 仅保留视频 `v`，不保证所有网站的登录后链接都能直接重开。程序不会自动保存 Key、Cookie、网页 HTML 或语音；收藏与复习不调用在线模型。若要完全删除本地生词本，先按需导出，关闭 Chrome 和伴随程序，再明确删除 UserData 文件夹（含 SQLite 的 WAL／SHM）。运行中的数据库不能只复制主文件作为一致备份。

## 可选 Google Cloud 官方 API

1. 创建自己的 Google Cloud 项目，开通结算并启用 **Cloud Text-to-Speech API**，参见 [官方入门](https://docs.cloud.google.com/text-to-speech/docs/get-started)。
2. 创建 API Key，建议将 API 限制设为 Cloud Text-to-Speech API；不要把 Key 写进源码或发到聊天中。浏览器扩展的请求来源限制需与自己的实际环境匹配，设置不当可能得到 403。
3. 扩展 **本地词典 → 发音服务** 选择 Google Cloud，输入 Key，点击 **保存发音设置**，再试听。
4. 使用固定 `en-GB-Standard-A`／`en-US-Standard-A`，向官方 `texttospeech.googleapis.com/v1/text:synthesize` 发送当前单词或短语；音频在扩展离屏页从内存播放，不保存音频包。

截至 2026-10-17，[官方价格](https://cloud.google.com/text-to-speech/pricing)列出 Standard 每月前 400 万字符免费，超出为每百万字符 4 美元；**必须开通结算，超额会收费**，以账户实际价格／配额为准。此 Key 与网页 Google 翻译、DeepSeek Key 分开。设置保存后不回显 Key，留空保留，删除按钮可移除；不进入普通配置导出。本功能不提供预置 Key 或中转服务。

只有点击读音才向选定语音服务发送当前单词／短语和语音参数，不发送网页正文或 URL；错误时不自动切换服务。鉴权、配额、网络或音频错误会显示提示，不回显服务原始响应或密钥。没有真实 Key 时只能验证模拟接口，不能据此宣称 Cloud 真实调用已通过。

## 本地资源及许可

- [ECDICT 1.0.28](https://github.com/skywind3000/ECDICT/releases/tag/1.0.28)：SQLite 英汉释义、英文解释、音标、词形和考试标签，保留上游 MIT 声明。
- [中文维基词典，经 Kaikki／Wiktextract](https://kaikki.org/zhwiktionary/rawdata.html)：仅保留 `lang_code=en`，包含中文解释、音标和部分例句／词源，保留逐词链接、CC BY-SA／GFDL 及转换说明。

v0.2.0 词库约 254 MiB 下载、889 MiB 安装，精确体积和各来源记录数以 `catalog.json` 为准；重新从锁定原始数据库构建，未复用旧工作目录中的冗余数据。记录可能重复，不将总记录数称为独立词数。原始数据不进入 Git。程序 GPL-3.0-only 与扩展 MPL-2.0 分开，详见 [第三方说明](../companion/THIRD_PARTY.md)。没有分发商业词典的非授权词库。

## 更新、故障与卸载

管理窗口命令：

```powershell
& "$env:LOCALAPPDATA\OpenBilingualTranslate\Companion\dictionary-companion.exe" --manage
```

导入检查路径、大小、SHA-256 和数据库结构，成功后原子切换版本，失败保留旧包；更新后回扩展重新连接。旧版本不自动删除。2026-10-18 已按用户要求清理项目内废弃录音／语音模型、依赖和下载／构建临时文件；现用词库包、原始压缩数据与对应校验、组件安装包保留。无需重新下载任何录音或语音模型。

| 现象 | 处理 |
| --- | --- |
| 无法连接本地组件 | 完整解压、执行当前扩展 ID 的安装命令，更新后重新连接 |
| 连接成功但没有释义 | 导入 `dictionary-core.zip` |
| 提示更新组件以启用收藏 | 安装新版 Windows 组件并重新连接；无需重新下载词库 |
| 收藏超时／断开 | 刷新收藏列表核对是否已写入，再决定是否重试；不删除生词本文件 |
| 词库损坏 | 收藏快照、筛选和复习仍可用；校验／修复词库后再查询新解释 |
| 浏览器没有英音／美音 | 刷新列表，安装对应系统语音或自行选择 Cloud；不再安装录音／模型包 |
| Cloud 401／403 | 检查 Key、API 启用状态、Key 限制及项目结算 |
| Cloud 429 | 检查配额或等待限流恢复；不自动切换提供者 |
| 校验失败 | 重新下载／导入损坏包，不忽略错误 |
| IDM／代理导致下载失败 | 修复 IDM 独立代理，或关闭该次下载接管后重试；下载与本地查询相互独立 |

运行解压目录的 `powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall.ps1` 移除注册和程序，默认保留词库；增加 `-DeleteResources` 才删除默认资源。自定义目录自行清理。先关闭本组件和管理窗口。

## 开发与验证

```powershell
python -m venv .local/dictionary/venv
.local/dictionary/venv/Scripts/python.exe -m pip install -r companion/requirements.lock.txt
python -m unittest discover -s companion/tests -v
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-companion.ps1 -Python .local/dictionary/venv/Scripts/python.exe
python companion/main.py --fetch
python companion/main.py --build-resources
python scripts/package-dictionary-sources.py
```

只构建释义，不下载真人录音／模型。普通下载支持 `.part` 续传；大文件可用 `python scripts/fetch-dictionary-ranges.py --jobs 6`，依赖 curl，保留已完成分段。`--direct`／`--proxy` 仅作用于显式资源下载。`companion/resources.lock.json` 固定所有原始快照 SHA-256；构建前再次校验，清单保留全部来源。若 Kaikki 滚动地址已更新，从同版本 Release 获取 `zhwiktionary.jsonl.gz` 放入缓存再运行；或另行审查并更新锁，不绕过校验冒充旧版。

生成文件在 `.local/dictionary/`。Native Messaging 协议 `{v:1,id,op,...}` 提供 `status/lookup/cancel` 和 `favorites.*`，32 位小端长度＋UTF-8 JSON，入站 16 KiB，不接受网页提供的路径／命令。收藏地址仅是存储文本，不供程序抓取。语音由扩展独立处理。普通测试不修改系统注册；`node scripts/verify-dictionary-native.cjs` 明确安装当前程序、注册并验证真实词库及实际可用浏览器音色；`node scripts/verify-favorites-native.cjs` 明确安装／更新程序、用真实 Chrome 检查能力，再用隔离收藏文件验证升级保留及缺词库仍可用，不向用户生词本写入测试词。

验收分别记录本地词库、真实 Windows 组件、浏览器音色、模拟 API 与真实 API。音频开始播放不等于已人工听辨准确性；Firefox 尚无本功能验收。
