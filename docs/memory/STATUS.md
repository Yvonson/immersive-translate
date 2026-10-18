# 当前状态

更新日期：2026-10-18。

## 源码与交付

- 用户按 D-014 明确选择正式 `v0.2.0`，源码及显示版本均为 `0.2.0`；本机扩展目录 `dist/chrome`，包 `dist/chrome.zip`。
- 已公开正式 [v0.2.0 Release](https://github.com/Yvonson/immersive-translate/releases/tag/v0.2.0)，标签仍指向 `28a651c1cf3f0e53202bd32cc341d074604b035a`。按 D-015 精简为 4 个上传附件＋2 个 GitHub 自动源码项，共显示 6 项；普通用户只选轻量包或 Windows 完整包。远程 SHA-256／大小、匿名 latest／下载和公开校验值通过，未上架浏览器商店。
- 独立根提交 `b8d680ad59bdf3a8f211bd1b78dbeccb7cb7b7cb`；旧稳定标签对应 `a3f814f71e101e95198a439c4b723cf102a24813`。保留独立历史，GitHub 创建时确认 `fork: false`。
- `.upstream-git-history/` 为完整本地上游历史备份；`.upstream-git-backup/` 为早期不完整备份；两者不进入 Git。

## v0.2.0 发布审查（2026-10-18）

- 下载整理已完成（D-015）：`chrome.zip` 383,125 字节；`windows-full.zip` 280,941,378 字节，含 `chrome/`、`companion/`、词库 ZIP 和安装指南；`developer-resources.zip` 238,893,283 字节，集中对应源码、Firefox 开发包、原始快照及审计资料；另附 `SHA256SUMS.txt`。普通用户下载其中一个安装包即可，完整包仍需手工注册／导入。旧分件已安装用户无需为整理重装。
- [整理工作流 39137811264](https://github.com/Yvonson/immersive-translate/actions/runs/39137811264) 成功，先完整审查旧输入，逐文件核对新包装与原程序／来源数据，上传核对后才撤下分件；保留原标签和 Chrome 包哈希。3 项包装回归与 [6dbf4c6 的扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39137592018) 通过。首次整理审计因 Windows／Linux 版权文本换行差异停止且没有删附件，0184d8f 仅规范化 3 份声明文本的换行后重跑成功，运行文件／词库仍按字节校验。
- 整理后匿名 latest 指向 v0.2.0；轻量包实际下载 SHA-256 保持不变，公开校验文件 3 条均与远程 digest 一致，完整包／开发包 HTTP 200 和精确体积通过。证据 `.local/release/public-before-simplify.json`、`public-after-simplify.json`、`compact-public-verification.json`，工作流 artifact 保存修改前后清单和新下载清单。以下初次发布的 20 附件记录为历史，当前布局以上述 4 附件为准。

- [审查记录](../RELEASE-REVIEW-2026-10-18.md)：修复旧入口自动换服务、收藏时钟回拨和导入标签越限，排除通用配置中的语音密钥；补齐词库锁／完整来源和构建前校验，避免复用旧工作数据库。
- Node＋fflate 替换旧 Gulp／Babel，删除 550 项依赖；npm audit 从 28 项降至 0。24 项扩展单元、16 项 Python、27 项浏览器回归通过；最终提交的 [扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39128723158)、[Windows CI](https://github.com/Yvonson/immersive-translate/actions/runs/39128723179) 与 [标签发布工作流](https://github.com/Yvonson/immersive-translate/actions/runs/39128902096) 均成功。
- 新资源原始记录数不变，重新构建下载 266,383,521 字节、安装 932,611,439 字节，SHA-256 `7238c154c1f8aca1d7c58ce1d5975a7d3c64c1f0631ef39d3b9688e2eee883eb`，revision `20261018-1c9003161fd2`。旧已安装词库仍可使用；此处取代下方早期资源体积记录。
- 初次发布采用全测后草稿、完整附件检查和远程哈希核对后公开，共 20 个内部交付附件；现已按 D-015 包装为 4 个下载附件。开发原始快照的 7 片、清单和合并脚本都保留在开发 ZIP 内，每片／完整 SHA-256 和损坏拒绝验证通过。许可证／来源／隐私和提交信息随包，正式二进制采用同提交 Windows 官方 CPython CI。安装与升级指南见 [INSTALL](../INSTALL.md)。
- 审查提交 `bdd89d0` 的早期 CI 成功；最终 `28a651c` 补齐 OpenSSL 3.5.9／zlib 1.3.1 许可。正式 Windows 包为官方 CPython 3.13.16，对应 GPL 源码 ZIP 独立重建与 Tk／SQLite 诊断成功，二进制及源码提交一致。
- 最终官方程序通过真实 Chrome Native Messaging 和重复安装验证：干净替换旧运行库、保留原词库位置、隔离收藏／笔记／复习升级保留、未来时间再收藏顺序正常，原有收藏数量保持不变且未写入测试词。最终词库用实际 Windows 程序在隔离目录导入／校验，8 组查询及 US/us／took→take 原形展开通过；未切换用户现用词库。证据 `.local/dictionary/favorites-native-verification.json`、`.local/release/resource-smoke/verification.json`。
- 发布工具实际执行后修正草稿查询（按列表选唯一 tag，再按 ID 操作）和大文件流式传输；每次写入前刷新草稿状态。完整快照上传失败后采用互异分片并行交付，全部校验后才公开。发布与匿名下载证据在 `.local/release/`，不保存认证材料。工具和证据后续提交不移动已发布标签，不重建已验证安装包。

## 功能扩展研究（2026-10-18）

已完成 [24 项候选功能与优先级调研](../research/FEATURE-OPPORTUNITIES-2026-10-18.md)，依据当前源码和同类产品／浏览器官方文档；未实施新功能、下载资源或调用计费 API。本条研究记录不改变下列实现和验收状态。

## 查词与收藏快捷键（2026-10-18）

- 按 D-013 新增网页 Alt+Q 查词／Alt+S 收藏，词卡当前词兜底、新选区优先、即时进度、Esc 关闭及在途收藏合并；未选词只提示。设置页直接录入、清除、恢复默认，旧配置补缺／冲突保留，词卡提示显示实际键。
- 共用四个动作的分发／校验，忽略编辑／输入法和连发，组合动作清除段落单按状态。两个 Chrome 词典原生命令默认未绑定；可选入口按当前焦点 document 一次认领，避免 iframe 或双路径重复。
- 本地 `npm test` 22 项、浏览器回归 27 项、Chrome／Firefox 构建和 `npm run check` 通过。新增浏览器用例覆盖新按键、词卡兜底／新选区／旧语境、慢确认与 Esc 后保存、重复键、空／过长选词、编辑／输入法、失败提示、配置即时生效／清空／重置、跨域 iframe、可选原生路径去重与开放 Shadow DOM 编辑器保护。收藏使用隔离真实 SQLite；可选原生入口的 getAll 绑定状态和触发入口在自动化中受控模拟，不能称为用户正常 Chrome 已手工配置成功。
- 独立真实 Chromium 离线按 Alt+Q，经实际已安装的 Windows 组件查询现有大词库 hello 成功、Esc 关闭成功，两个新原生命令确认为未绑定；没有重新安装组件或向用户收藏写测试词。证据 `.local/dictionary-shortcut-native-verification.json`，设置截图 `.local/browser-results/dictionary-shortcut-settings.png`。
- 没有改原生协议、数据库、组件、词库或版本；用户需重新加载扩展并刷新旧网页。未重测真实语音 API 或视频站点，本轮重点为减少操作步骤。
- 功能提交 `2476896` 已推送；[远程扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39105028420) 成功，包含 22 项扩展单元、13 项 Python、构建／检查和 27 项 Linux Chromium 回归，并上传扩展 ZIP artifact。原生组件工作流未触发，无需更新 Windows 包。

## 本地收藏与翻卡学习（2026-10-18）

- 按 D-012 实现词卡／词典结果星标、选词右键直接收藏、词典页右上角计数与独立生词本。收藏保留词典快照和许可来源、原文语境、处理后的网页来源，可编辑个人解释／标签／笔记和学习状态。
- 独立 UserData SQLite、WAL 与事务；词头唯一约束和独立语境合并，首次／最近时间分开。分页 50 条，支持关键词、日期、状态、标签和来源组合筛选，桌面分栏及小屏详情返回、深浅主题。
- 复习使用当前筛选的固定顺序，默认排除已掌握；Space 翻卡，1／2／3 评级逐次持久化，跳过不计数。JSON v1 一致快照、分片导出、校验与事务导入；重复导入保留已有学习进度。
- 新原生能力独立于词库引擎；旧组件提示升级而非重新下载资源。收藏写入不随词卡关闭取消；内容脚本无批量数据接口，隐身禁用收藏。没有生产 HTTP 服务、云同步、自动模型查询或音频下载。

本地验证：

- 2026-10-18 `npm test` 18 项、Python `unittest` 13 项、Chrome／Firefox 构建及 `npm run check` 通过。Python 覆盖真实 SQLite 5,000 条分页、大小写／词形、并发多连接、编辑与复习时间、JSON 往返与幂等、导入中途失败回滚、只读写入失败。
- `npm run test:browser` 23 项通过；新增 4 项用真实 Python Native Messaging 主机＋隔离 SQLite，经测试桥连接浏览器，覆盖 5,001 条、星标／右键、可见原文提取、日期／多维筛选、桌面／深色／390px 界面、翻卡焦点与键盘、完整分片备份恢复、词库损坏后快照与复习。现有网页／字幕／词典／模拟 Cloud 回归通过；不将测试桥写成实际安装或真实 API 验收。
- Windows 新组件已构建、安装／注册；`node scripts/verify-favorites-native.cjs` 验证真实 Chrome Native Messaging 能力、复用现有大词库，隔离数据在重复安装后笔记／复习／快照保留，缺词库仍可读取并导出。未给用户生词本写测试词，原有数量保持不变；证据 `.local/dictionary/favorites-native-verification.json`。对应源码包同步生成；未重新下载词库、录音或模型。
- 截图在忽略目录 `.local/browser-results/favorites-*.png`。真实用户常用 Chrome 的扩展需重新加载并刷新网页；本轮未补充真实语音 API 或视频站点验收。版本仍为 `0.2.0`／`0.2.0-preview.1`，未创建 Release 或标签。
- 功能提交 `6a789d9` 已推送；[扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39102146070) 与 [Windows 组件 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39102146074) 均成功，上传扩展 ZIP／组件二进制及源码 artifact，未触发大词库资源下载。随后补充选词引号／标点规范化的星标状态回归，本地 4 项生词本浏览器测试通过。
- 最终修复 `b1e24f8` 的 [扩展 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39102272604) 和 [Windows 组件 CI](https://github.com/Yvonson/immersive-translate/actions/runs/39102272626) 均成功；本机最终二进制已重复安装验证，带引号选词状态一致，源码 ZIP 同步更新。使用者可下载这两次运行的匹配 artifact，词库沿用现有安装。

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
