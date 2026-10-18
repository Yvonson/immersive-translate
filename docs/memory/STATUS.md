# 当前状态

更新日期：2026-10-18。

## 源码与交付

- 源码版本 `0.2.0`，扩展显示版本 `0.2.0-preview.1`；本机安装目录 `dist/chrome`，预览包 `dist/chrome.zip`。
- 新功能为预览交付，尚未创建 `v0.2.0` 稳定发布标签。公开稳定下载仍为 [v0.1.0](https://github.com/Yvonson/immersive-translate/releases/tag/v0.1.0)，其中不含本轮升级。
- 独立根提交 `b8d680ad59bdf3a8f211bd1b78dbeccb7cb7b7cb`；旧稳定标签对应 `a3f814f71e101e95198a439c4b723cf102a24813`。保留独立历史，GitHub 创建时确认 `fork: false`。
- `.upstream-git-history/` 为完整本地上游历史备份；`.upstream-git-backup/` 为早期不完整备份；两者不进入 Git。

## 功能扩展研究（2026-10-18）

已完成 [24 项候选功能与优先级调研](../research/FEATURE-OPPORTUNITIES-2026-10-18.md)，依据当前源码和同类产品／浏览器官方文档；未实施新功能、下载资源或调用计费 API。本条研究记录不改变下列实现和验收状态。

## 本地词典与发音（2026-10-18）

- 选词右键查词、闭合 Shadow DOM 词卡、完整释义页与设置分区已实现。简明／完整页共用纯文本渲染，保留逐词来源、音标、例句、词形、词源及相关词；不改动原 `customDictionary` 替换规则。
- Windows x64 本地组件通过 Native Messaging 读取 SQLite，无 HTTP 服务或开机启动；资源导入校验大小／路径／SHA-256／数据库结构，成功后原子切换。默认安装和词库位置见 [安装说明](../LOCAL-DICTIONARY.md)。
- 用户要求停止真人录音下载并选择浏览器语音优先、可选 Google Cloud，见 D-011。代码和资源构建不再下载／交付真人录音或 Kokoro 模型；2026-10-18 按用户要求清理废弃缓存，本地程序只负责释义。
- 英美音及 0.75×：浏览器按实际同口音音色选择并显示在线／本机；Cloud 使用 Standard 官方接口、自配独立 Key。只有点击播放才发送单词／短语，不发送网页正文／URL；缺音色或请求失败明确提示，不自动切换服务；关闭／换词取消旧响应与发音。
- 词库实包：ECDICT 3,402,564 条记录，中文维基词典英语扩展 97,019 条；可能重复，不等于独立单词数。下载 304,036,491 字节，安装 1,016,684,911 字节，SHA-256 和来源在 `.local/dictionary/packages/catalog.json`。本地 Windows 包及对应源码 ZIP 在 `.local/dictionary/`，开发文件和词库不进入 Git。
- 版本保持 `0.2.0`／`0.2.0-preview.1`，未创建 Release 或标签。

验证证据：

- 2026-10-18 `npm test` 16 项、Python `unittest` 4 项、浏览器回归 19 项通过，包含真实 DOM／跨域 iframe 词卡、取消迟到结果、选择限制、设置与 Key 不回显，以及模拟 Cloud 响应在真实离屏页解码播放、鉴权失败不降级；网页／字幕原有回归也通过。
- Chrome／Firefox 构建和产物检查通过；本功能仍只验收 Chrome。Windows PyInstaller 组件打包、实际安装／注册、Tk／SQLite 诊断、完整词库导入／校验通过；断网查询 hello／took／US／us／record／read／neural network／未收录词通过，证据 `.local/dictionary/native-verification.json`。
- 真实独立 Chromium 普通窗口仅列出本机三种中文音色，无英美音；Chrome 临时配置的 Web Speech 英美音列表也为空。缺音色提示已验证，**未通过真实英文发音播放或人工听辨**，需用户安装对应系统英文语音或配置 Cloud。不能把模拟声音成功写成真实读音准确。
- 功能提交 `8dd1617` 已推送 `main`；[扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39094048789) 的单元／Python／构建／检查／19 项 Linux 浏览器回归及 artifact 上传均成功；[Windows 组件 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39094048812) 的依赖安装／测试／二进制与源码归档／artifact 上传成功。大词库远程资源任务未触发，沿用已校验本地词库，不下载录音或模型。
- 未提供真实 Cloud Key，因此未调用真实计费 API；官方接口、计费和认证约定已核对，模拟请求／音频播放不替代账户端到端验收。真实使用仍取决于网络、API 启用／限制／结算与配额。

本地清理（2026-10-18）：

- 按用户要求删除项目内 104 条录音缓存、旧录音包／Kokoro 模型与声音包、语音样本、旧依赖源码、重复下载分片／未完成文件、词库构建中间副本及一次性测试目录；卸载项目专用虚拟环境中的 22 项废弃依赖并清除残留。按文件逻辑大小合计清理 3,332,255,888 字节，约 3.33 GB（3.10 GiB）；明细摘要在忽略文件 `.local/cleanup-20261018-result.json`。
- 保留当前词库 ZIP／清单、ECDICT／维基词典原始压缩数据与 SHA-256、Windows 组件及对应源码包、可安装目录和精简构建环境。未清理项目外 LocalAppData 中的已安装词库，未改插件源码、版本、许可证或上游历史备份。
- 清理后当前安装词库查询 hello／took／US／neural network 正常；词库包及原始数据 SHA-256、两个组件归档完整性通过；`pip check`、PyInstaller 版本检查、4 项 Python 词库测试与 `npm run check` 通过。未重新下载资源或重建发布。

## 评论正文污染修复（2026-10-17）

- 用户确认 Google 译文末尾夹杂“合集、了解细节”；尚无原视频链接。
- 修复前两项浏览器测试捕获：隐藏节点进入翻译请求、行内评论越界包含作者/时间/工具栏。现已修复提取过滤、站点正文边界、保留片段及动态显隐；不按词删除译文，保留仅译文模式和原节点。
- 本地 `npm test` 12 项、`npm run test:browser` 15 项、构建和产物检查通过；版本字段不变。
- 修复提交 `78d546631ac8d81c3586e74d6510f441e78eb531` 已推送；[远程 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39035840702) 成功，包含 Linux Chromium 的 15 项浏览器回归及扩展包上传。
- 真实 Google 同一接口的原始响应和解析结果均无上述尾词；公开 YouTube 样本确认 `#content-text` 为行内元素，未取得用户原评论现场。证据和限制见 [排查说明](../YOUTUBE-TEXT-EXTRACTION.md)。

## 界面改版与用户反馈（2026-10-17）

CI 邮件排查（2026-10-17）：文档提交 `dc0e5e6` 的[运行](https://github.com/Yvonson/immersive-translate/actions/runs/39033909751)在第 12 项全屏菜单测试失败，具体为 `DOM.resolveNode: No node with given id found`；安装依赖、单元测试、构建与产物检查均成功。同样插件源码的后续文档提交 `a255a51` [运行成功](https://github.com/Yvonson/immersive-translate/actions/runs/39033931162)。测试辅助函数已改用 `backendNodeId`，避免全屏切换刷新 CDP 文档树使临时前端节点编号失效。本地该用例连续 10 次通过，完整浏览器 12 项、单元 12 项及产物检查通过；本次未修改插件源码或版本字段。

- 用户报告“字幕功能可以正常使用”；未提供具体浏览器、站点和模型，因此作为用户反馈记录，不替代逐站验收表。
- 弹窗和设置页统一浅灰/白卡片/玫粉视觉及深浅主题，设置重组为六区；弹窗支持直接选择全部引擎，悬停提示显示实际按键。
- YouTube 入口改为 CC 旁同尺寸图标；菜单在播放器内向上展开，样式选项放入子页。设置页增加字幕样式与预览；配置和密钥沿用原存储。
- 删除旧赞助入口、ETH 收款地址、五个相关图片、多语言赞助文案、后台跳转及 funding 配置；旧群邀请与历史说明推广入口同步清理。
- 版本按用户要求冻结，见 [D-008](DECISIONS.md#d-008正式发布前冻结版本字段)。未创建版本标签或 Release。

2026-10-17 本轮验证：

- `npm test`：12 项通过；`npm run build`、`npm run check`：Chrome/Firefox 构建、页面资源、语法、JSON、清理检查通过。ZIP 内容另行扫描，无旧收款/邀请入口和图片。
- `npm run test:browser`：12 项通过；新增设置分区、未知 hash、小屏导航、主题、字幕样式保存、模型配置保留、弹窗引擎选择与翻译/恢复，以及 YouTube 结构模拟页的普通/影院/小尺寸/200% 缩放/全屏、键盘返回、原生菜单互斥和控制栏重建。
- 代码提交 `01044732403d27fe7927498b7c1f355092577c60` 已推送 `main`；[远程 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39033763180) 成功，包含 Linux Chromium 的 12 项浏览器回归，并上传扩展 ZIP artifact。
- 浏览器测试中的扩展弹窗以扩展页面方式加载。独立 Chromium 的 `chrome.action.openPopup()` 可调用，但无可捕获的弹窗页面；真实工具栏弹窗仍需正常 Chrome 人工检查。
- 真实 YouTube 公开样本布局通过：独立无登录 Chromium 中按钮紧邻 CC，尺寸 48×40；菜单范围 x=706–1006、y=210–580.5，位于播放器 x=24–1014、y=80–637 内，菜单底部在控制栏按钮上方。仅验证布局，没有重测字幕翻译端到端。
- 截图位于忽略目录 `.local/`：弹窗、浅/深设置、播放器模拟页、全屏及真实 YouTube；不提交视频页面截图或课程材料。

## 首轮阅读与字幕升级实现

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

## 首轮升级验证证据

2026-10-17 本地验证：

- `npm test`：12 项通过，包含模型接口、VTT/JSON3/XML、队列优先级/取消、隐私缓存隔离及字幕 URL 限制。
- `npm run test:browser`：9 项通过，使用 Playwright 1.64.1 配套 Chromium 156、临时配置及本地模拟模型。覆盖实际 DOM、文本节点/事件、格式、快捷键、列表表格、动态内容、慢响应、Shadow DOM/iframe、字幕及设置。字幕播放时钟可控，不是完整网站实播测试。
- `npm run build`、`npm run check`：两个浏览器构建、引用、语法和 ZIP 检查通过；Firefox 只保证这些构建检查，未进行功能验收。
- 提交 `db6ec41708c21506cf7d6e6bcff112fd860c98a5` 已推送 `main`；[远程 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39020093378) 成功，包含单元测试、构建检查和 Linux Chromium 浏览器回归，并上传扩展包 artifact。
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
- 真实 DeepSeek、本地 Ollama/LM Studio；本轮未提供真实 Key。默认本地端口 `11434`、`1234` 探测不可达，模拟测试不替代真实模型。
- YouTube 可读字幕环境、人工/自动字幕、跳转、广告及换视频。
- 登录后的 DeepLearning.AI、课程文字稿真实 DOM、换课、全屏。
- 商业参考插件 2026 版的实际逐屏对照；官方帮助截图包含旧 1.16.5，不能用其证明现版一致。

不含 ASR、字幕 OCR、DRM/登录绕过、标准画中画、Safari 或桌面端。依赖仍有继承的 Browserslist/弃用提示，未将本轮变更扩展成构建依赖全面升级。
