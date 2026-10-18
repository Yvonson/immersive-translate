# v0.2.0 发布审查

日期：2026-10-18。用户反馈功能可用，要求审查项目并上线，随后明确选择 **v0.2.0 正式版**。本次保持数字版本 0.2.0，去掉 preview 显示后缀；发布不扩大实验功能的支持承诺。

## 审查范围

阅读／字幕及站点桥接、翻译引擎路由与缓存、快捷键与设置迁移、词卡／收藏前端、Native Messaging 来源和长度约束、SQLite／JSON 导入导出、词库下载与原子导入、Windows 安装卸载、依赖与许可证、CI 和 Release 附件。结合源码检查、原有自动化与新增回归；不是对全部继承网站规则逐站人工验收，也不构成安全认证。

## 发现并处理

| 影响 | 问题及修复 | 证据 |
| --- | --- | --- |
| 高：开发构建安全 | 旧 Gulp／Babel 链审计 28 项，含 1 critical；换成 Node 22＋轻量 fflate，移除 550 项旧依赖，不再转译已面向现代浏览器的代码 | 固定 package-lock；npm audit 0；构建及浏览器回归 |
| 高：提供者选择 | 旧 translateHTML／Text／SingleText 路径按语言自动换提供者；保留显式选择，未知或不适用的服务报错 | 新增 provider-policy 回归；阅读路径原有精确路由测试 |
| 中：备份恢复 | 未来收藏时间／系统回拨使最近早于首次，导致自身备份被拒；收藏保持单调范围，打开预览数据库时只修复异常时间范围 | 真实 SQLite 时钟模拟、重开与 JSON 往返回归 |
| 中：导入原子性 | 每份备份最多 30 标签，合并两份却可越限；合并超过上限时报错并回滚整个事务 | 新词插入后再触发超限的完整回滚回归 |
| 中：数据可追溯 | Kaikki 输入未入仓库锁，来源前缀筛选漏项，工作目录可能复用旧库；锁定完整快照、构建前校验、保留全部来源并从原 ZIP 重建 | 小型真实转换／旧库污染／输入损坏回归；最终包逐文件 SHA-256 |
| 中：分发完整性 | 旧 Release 只发扩展，缺组件、源码、词库；新流程全测后先生成草稿，完整附件逐个核对远程哈希后公开 | check-release.py、publish-release.ps1；最终 Release 12 附件 |
| 中：许可证与复建 | 扩展 ZIP 未带根许可证，Windows 未显式复制 Python 许可，源码 ZIP 构建脚本依赖 .git；补许可和来源、源码元数据回退及独立构建说明 | ZIP 与安装目录逐文件检查；正式二进制取同提交 Windows 官方 CPython CI |
| 中：程序升级 | 复制覆盖会遗留旧发行版 DLL，默认安装参数会重置自定义词库目录；先暂存完整程序再替换，失败回滚旧程序，未传 DataDir 时保留已有设置 | Windows 同提交包重复安装验证；UserData 与词库不参与替换 |
| 低：密钥最小化 | 通用配置会额外加载 dictionaryVoiceSecrets；与 AI profile 一样排除 | 新增配置回归；原有设置响应不回显／配置导出排除测试 |
| 低：浏览器声明 | Firefox 最低 63 与实际 structuredClone／现代语法不符；开发包改为 128+ 并明确未完成 Firefox 功能验收 | manifest、README 与发布说明一致；没有据构建成功宣称 Firefox 实测 |

## 验证

- `npm test`：24 项；Python `unittest`：16 项，新增时钟、标签和资源构建回归。
- `npm run build`／`npm run check`：Chrome 与 Firefox 构建，manifest／本地页面资源／语法／JSON／旧赞助清理、许可证及 ZIP 内容一致性。
- `npm run test:browser`：27 项 Chromium 回归，真实 DOM／跨域 iframe、模拟翻译／语音、测试桥连接隔离的真实 SQLite。测试桥和模拟结果不能当作已安装 Native Messaging 或真实收费 API。
- 最终同提交 Windows CI 包另行安装／升级，实际 Chrome Native Messaging、既有词库和隔离收藏验证；最终词库在隔离目录导入／校验并查询，结果和远程 CI 链接补记 [当前状态](memory/STATUS.md)。
- `bdd89d0` 的远程扩展／Windows CI 已成功，包含从 GPL 源码 ZIP 独立重建和 Tk／SQLite 诊断；官方 CPython 3.13.16 成品的实际升级与隔离收藏验证通过。核对 DLL 后补齐 OpenSSL 3.5.9 和 zlib 1.3.1 官方许可，再生成最终发布包。
- 发布前完整资产检查：组件二进制／源码／扩展提交一致、许可、词库每文件 SHA-256、快照与清单、远程附件体积／digest；资产清单不含用户数据或凭据。

## 保留的边界与后续

真实 DeepSeek／本地模型／Google Cloud、正常 Chrome 英美音人工听辨、登录后课程及各类视频播放流程仍未全部验收。用户已报告字幕可用，现阶段将字幕作为实验适配分发。Firefox 未签名、未功能验收，Edge 本地词典注册未适配；不宣称全站支持或商业版完整复刻。浏览器公共翻译接口、网站 DOM 和播放器字幕接口仍可能变更。

超大收藏的全量 ID／元数据与整份 JSON 备份会受 Native Messaging 大小、内存及 128 MiB 备份上限约束；现有 5,001 条回归不等于任意规模性能承诺，后续应分页改造大规模复习／导出。旧网站规则需要有复现页面再逐条维护。

第三方事实核对依据：[Chrome 内容脚本隔离](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Chrome Storage 默认访问范围](https://developer.chrome.com/docs/extensions/reference/api/storage)、[DeepSeek 官方接口](https://api-docs.deepseek.com/guides/thinking_mode/)、[GitHub Release API](https://docs.github.com/en/rest/releases)。未因官方文档存在就把账户端到端调用列为通过。
