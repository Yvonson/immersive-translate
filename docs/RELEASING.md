# 发布流程

Release 分发浏览器手动安装包和可选 Windows 本地词典，不代表商店上架。用户明确选择本次 `v0.2.0` 正式版；字幕和未实测 API 的边界在发布说明保留。

1. 更新 `package.json`、两个 manifest 和 `docs/releases/vX.Y.Z.md`，完成源码审查、`npm ci --ignore-scripts`、`npm audit`、`npm test`、Python 回归、构建／检查与浏览器回归。代码、证据和记忆提交到独立仓库。
2. 推送正式标签，`release.yml` 验证标签与版本一致，构建扩展、Windows 组件及对应源码，全部成功才创建 **草稿**。重跑不覆盖已经公开的版本；未完成大词库上传前不自动公开半套附件。
3. 将安装附件放入专用目录，如 `.local/release/v0.2.0/`：`chrome.zip`、`firefox.zip`、`dictionary-companion-windows-x64.zip`、`dictionary-companion-sources.zip`、`dictionary-core.zip`、`catalog.json`、`resources.lock.json`、`INSTALL.md`、`RELEASE-NOTES.md`。组件使用同提交 Windows CI artifact 并实际安装验证；扩展包内 BUILD.json／组件 BUILD.json／源码 SOURCE.json 必须匹配该提交。
4. v0.2.0 的开发快照采用 7 个 `zhwiktionary.jsonl.gz.part01` 至 `.part07`、`source-parts.json`、`restore-dictionary-source.py`。每片 32 MiB，最后一片略小；清单记录顺序、大小、SHA-256 和完整目标快照的校验值。原始 gzip 可留在本地作辅助校验，不重复上传。普通用户安装使用单个词库 ZIP。运行 `python -B scripts/check-release.py .local/release/v0.2.0 --tag v0.2.0` 核对完整附件、版本／提交、每个词库文件、来源分片及完整重组 SHA-256、许可与源码，生成两份清单；分片交付最终共 20 个附件。工具也支持完整原始 gzip 的 12 附件模式。GPL 组件源码必须同批交付。
5. 在 **PowerShell 7.2+** 用已有 Git Credential Manager 登录执行：

```powershell
pwsh -File scripts/publish-release.ps1 -Tag v0.2.0 -Directory .local/release/v0.2.0 -Publish
```

脚本要求工作区干净、远程标签及成功的标签工作流匹配提交，重新运行完整附件校验。凭据只放内存，不打印、不落盘。草稿通过认证列表按唯一 tag 选择，再按 ID 操作；按 tag 查询发布接口不用于查草稿。每次写入前刷新草稿及附件，只替换尚未公开的不同附件，逐个核对返回的字节数和 SHA-256；流式传输大文件，全部核对后公开并设为 latest。没有 `-Publish` 时仅准备草稿；`-Direct` 只为本次请求绕过系统代理，不修改系统设置。已公开版本拒绝覆盖。

大资源可先上传互异的分片并逐片核对；同一文件不要由多个客户端同时写入草稿。结束后重新读取远程附件清单再完成发布，不能用上传前缓存判断另一条传输的状态。合并脚本用 Python 3.11+；当前构建环境为 3.13，必须实测成功重组和损坏分片拒绝／清理。

发布后匿名核对 latest、标签、20 个附件和直接下载链接，实际下载小安装包比对 SHA-256；大词库无需重复下载，核对 HTTP 200、大小及上传远程 digest。记录 CI／Release URL，更新记忆。发布后的工具／证据提交不移动已公开标签，也不重建已验证安装包。

参考 [GitHub 官方 Release 管理](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) 与 [Release API](https://docs.github.com/en/rest/releases)。公开附件的 SHA-256 用于比对传输完整性，不替代签名或来源审查。
