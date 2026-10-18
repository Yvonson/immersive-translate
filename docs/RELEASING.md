# 发布流程

正式 Release 只上传两个用户安装包：`open-bilingual-translate-<version>-chromium-extension.zip` 和 `open-bilingual-translate-<version>-windows-x64-bundle.zip`。加 GitHub 自动生成的两项 Source code，共显示四项。附件 label 留空，正文保持中文；名称、下载链接、大小和 SHA-256 从同一内部清单生成。

开发资料为 `open-bilingual-translate-<version>-development-resources.zip`，保留 GPL 对应源码、原始数据和许可，放在 `resources-v<version>` Release。资源版本 `make_latest=false`；资源标签指向包装提交，正文单独标明软件源提交。正式软件标签保持原提交，安装方式和用户数据不随包装修改。

## 验证与发布

1. 新软件版本先完成依赖审计、扩展／词典／浏览器和实际 Windows 验收，正式标签工作流全通过后才进入分发。只整理已有版本时，不重新编译已验证程序。
2. 运行 `python -B -m unittest discover -s tests -p '*release*test.py' -v`。在 Actions 手动触发 **Release Packaging**，填写软件 tag、准确源提交和模式；默认 `verify`，只读取远程元数据和下载到忽略目录，不创建、上传、修改或删除 Release。
3. `publish` 模式同样先执行 Windows／Linux 回归、只读预检和包装，全部成功才进入发布步骤。先使对应源码／开发资料公开并核对哈希，再上传两个用户包；远程 digest／大小匹配后才修改正式正文、撤下已合并的旧附件并清除显示标签。运行末尾用禁止写入的客户端重放同一发布结果，必须零写入通过。
4. 预检支持完整原始输入、已有分组包、目标布局以及迁移中断后的混合布局。不会要求重建已经撤下的旧组件 ZIP。已存在且匹配的目标复用；同名不同哈希、未知附件、基准附件被替换或标签变化时停止，保留可用安装包。GitHub 留下的已知目标零字节 starter 可安全重试。
5. `download-manifest.json` 和准备／完成 JSON 只作内部证据，不上传为用户附件。工作流 artifact 保存正文、清单、首次发布报告和零写入重放报告。固定 Python 3.13.16 的构建环境，ZIP 时间／顺序／权限和生成文本统一，重复包装不受输入文件 mtime 影响。
6. 软件包内只允许已验证的运行文件；新增包装只替换 INSTALL.md／PACKAGE.json。逐文件 SHA-256、完整词库文件、对应源码、来源锁和原始快照校验通过。仅 LICENSE／UPSTREAM.md／PRIVACY 等声明文本规范化 CRLF／LF；内容不同仍报出文件名并失败。

## 本机入口

PowerShell 7.2+ 可继续使用已有 GCM 登录，凭据只放进程环境，不进入参数、文件或日志，不需要安装 gh：

```powershell
# 只读预检与包装，使用远程现有分组输入
./scripts/publish-release.ps1 -Tag v0.2.0
# 明确发布；-Direct 只绕过本次请求的系统代理
./scripts/publish-release.ps1 -Tag v0.2.0 -Publish -Direct
```

可选 `-Directory` 指向本机完整原始输入或已分组的三个包（含开发包）。新原始输入仍经 `check-release.py` 全面审查。包装输出和校验见 `.local/release/`；同一次准备的 `downloads/prepared.json` 可交给 `reorganize-release.py --mode publish --prepared ...` 恢复执行。

## 公开验收

- 主列表恰好两个英文文件名、无替代 label；正文两个下载入口和折叠校验值一致。
- 匿名 latest 仍为正式软件版本；实际下载轻量包核对 SHA-256，完整包检查精确大小及远程 digest。
- Resources 可公开下载且不抢占 Latest，对应源码和数据许可可获取；实际源标签未移动。
- 更新 README、包内指南与记忆，明确旧直链迁移及已安装用户无需为包装调整重装。保留历史失败记录和真实错误通知。

[GitHub Release 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) · [附件 API](https://docs.github.com/en/rest/releases/assets)
