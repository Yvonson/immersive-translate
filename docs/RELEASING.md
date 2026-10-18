# 发布流程

Release 面向使用者，主列表只放 4 个文件：

| 附件 | 使用者 |
| --- | --- |
| `chrome.zip` | 只翻译网页／已有字幕 |
| `windows-full.zip` | Windows x64＋Chrome 的完整安装，含扩展、程序、词库、指南 |
| `developer-resources.zip` | GPL 对应源码、Firefox 开发包、完整来源／原始快照及审计资料 |
| `SHA256SUMS.txt` | 可选校验 |

GitHub 自动另加 Source code ZIP／tar.gz，共显示 6 项。普通用户二选一，不让其下载原始数据分片、JSON、Python 脚本或多个独立安装包。

## 新版本

1. 完成版本更新、源码审查、依赖审计、扩展／词典／浏览器测试和实际 Windows 安装验证。推送正式标签；`release.yml` 全部通过才生成草稿，内部扩展／组件 ZIP 只是草稿输入。
2. 在专用目录准备原始完整资产：扩展两个 ZIP、同提交 Windows 组件／GPL 对应源码 ZIP、词库 ZIP、catalog、来源锁、原始 gzip（或 7 分片及合并资料）、INSTALL.md 和 RELEASE-NOTES.md。见 `scripts/check-release.py`。完整资料必须保留来源、许可及对应提交，不省略 GPL 源码。
3. `python -B scripts/check-release.py .local/release/v0.2.0 --tag v0.2.0` 审查全部输入和词库每个文件。内部清单不是主发布页附件列表。
4. `python -B tests/release_downloads_test.py` 验证包装安全与内容保留。在 PowerShell 7.2+ 运行 `scripts/publish-release.ps1 -Tag v0.2.0 -Directory .local/release/v0.2.0 -Publish`；已有 GCM 凭据只放进程内存，不打印、不落盘，`-Direct` 只绕过本次请求的系统代理。
5. 发布脚本自动调用 `package-release-downloads.py` 在输入目录的空 `downloads/` 生成 4 个文件及本地下载清单。完整包展开两份运行 ZIP 到 `chrome/` 和 `companion/`，原词库 ZIP 完整内嵌；开发包保存全部非运行安装附件及原始审计清单。逐个原文件比对 SHA-256、检查 ZIP 路径及大小写冲突。
6. 只有新 4 件全部上传且远程 digest／大小核对后，才从草稿撤下分件输入，按现行发布说明公开为 latest。已公开版本拒绝被普通发布脚本替换。不要同名并发上传。重试使用新的空包装输出目录。
7. 匿名检查最新版本与两个用户下载入口；实际下载轻量包核对 SHA-256，完整包检查 HTTP 200／精确大小并核对远程 digest。记忆记录准确的输入提交、包装证据及未验收范围，不因文档修改移动标签。

## 重新整理已公开版本

只在用户明确要求调整发布附件时，手动触发 `Simplify existing release downloads` 工作流，填写原 tag 和精确源提交。它从原 Release 下载完整输入、按原提交审查，在 GitHub 运行器重新包装；先上传验证新包，再更新正文并撤下已合并附件。保留 `chrome.zip` 内容和 tag，禁止覆写不同的现有运行安装包。修改前／后清单和新 SHA-256 作为工作流 artifact 留存。

v0.2.0 原先的 20 个上传附件加 2 个自动源码项已由用户要求改为上述布局。开发者取得单个开发 ZIP 后，才在本地使用其中的快照分片及还原脚本；主列表不再直接摆放这些分片。旧分件安装已完成的用户无需为这次整理重装。

[GitHub Release 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) · [附件 API](https://docs.github.com/en/rest/releases/assets)
