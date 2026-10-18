# 发布流程

Release 分发浏览器手动安装包和可选 Windows 本地词典，不代表商店上架。用户明确选择本次 `v0.2.0` 正式版；字幕和未实测 API 的边界在发布说明保留。

1. 更新 `package.json`、两个 manifest 和 `docs/releases/vX.Y.Z.md`，完成源码审查、`npm ci --ignore-scripts`、`npm audit`、`npm test`、Python 回归、构建／检查与浏览器回归。代码、证据和记忆提交到独立仓库。
2. 推送正式标签，`release.yml` 验证标签与版本一致，构建扩展、Windows 组件及对应源码，全部成功才创建 **草稿**。重跑不覆盖已经公开的版本；未完成大词库上传前不自动公开半套附件。
3. 将以下文件放入专用目录，如 `.local/release/v0.2.0/`：`chrome.zip`、`firefox.zip`、`dictionary-companion-windows-x64.zip`、`dictionary-companion-sources.zip`、`dictionary-core.zip`、`catalog.json`、`resources.lock.json`、`zhwiktionary.jsonl.gz`、`INSTALL.md`、`RELEASE-NOTES.md`。组件使用同提交 Windows CI artifact 并实际安装验证；扩展包内 BUILD.json／组件 BUILD.json／源码 SOURCE.json 必须匹配该提交。
4. `python -B scripts/check-release.py .local/release/v0.2.0 --tag v0.2.0`：核对完整附件集、版本和提交、原始快照、每个词库文件哈希、许可证、源码与安装目录内容，生成 `SHA256SUMS.txt` 和 `release-manifest.json`。最终共 12 个附件。GPL 组件源码必须与二进制同批交付。
5. 在 **PowerShell 7** 用已有 Git Credential Manager 登录执行：

```powershell
pwsh -File scripts/publish-release.ps1 -Tag v0.2.0 -Directory .local/release/v0.2.0 -Publish
```

脚本要求工作区干净、远程标签及成功的标签工作流匹配提交，重新运行完整附件校验。凭据只放内存，不打印、不落盘。它只替换草稿中的不同附件，逐个比较 GitHub 返回的字节数和 SHA-256，完整核对后才公开并设为 latest。没有 `-Publish` 时仅准备草稿；`-Direct` 仅为此次网络请求绕过失效系统代理，不修改系统设置。已公开版本拒绝覆盖。

发布后从未登录的公开接口核对 latest、标签、12 个附件和直接下载链接，记录 CI／Release URL。安装指南只让普通用户下载自己需要的扩展、组件和词库。将实际发布结果更新记忆；纯证据文档提交无需另发标签。

参考 [GitHub 官方 Release 管理](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) 与 [Release API](https://docs.github.com/en/rest/releases)。公开附件的 SHA-256 用于比对传输完整性，不替代签名或来源审查。
