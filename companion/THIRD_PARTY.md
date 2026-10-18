# 本地词典组件与第三方资源

本目录的新伴随程序以 GPL-3.0-only 发布；浏览器扩展继续使用仓库根 MPL-2.0。根 LICENSE、原版权和 UPSTREAM.md 不变。按用户最新决定，本地组件只提供词库查询，不再依赖 phonemizer、eSpeak NG、Kokoro、NumPy 或 ONNX Runtime，也不下载／交付真人录音及语音模型。

| 部件 | 来源 | 许可 |
| --- | --- | --- |
| Python | https://www.python.org | PSF License；随包保留 |
| Tcl/Tk | https://www.tcl.tk | Tcl/Tk 许可；随包保留 |
| PyInstaller 构建工具及引导程序 | https://pyinstaller.org | GPL，附运行时引导程序例外；锁定版本见 requirements.lock.txt |

词典数据单独交付：ECDICT 保留其上游 MIT 声明；中文维基词典英语条目保留 CC BY-SA／GFDL、逐词来源链接及结构化转换说明。资源 SHA-256、原始快照和记录数量随包保存，不以多个来源的记录之和声称独立词数。

Windows 包与对应源码 ZIP 一起交付。源码包包含本程序、构建／安装脚本及锁定 PyInstaller 对应源码；运行库自身的许可随二进制保留。浏览器语音和 Google Cloud 音频不作为本地数据资源再分发。

正式 Windows 包使用 GitHub Actions 的官方 CPython 3.13 环境。完整发行版许可显式复制到 `_internal/licenses/PYTHON-LICENSE.txt`，包含其附属软件许可；Tcl/Tk 通用许可另保存在同目录（固定来源 `tcltk/tcl`、`tcltk/tk` 的 `core-8-6-13/license.terms`，原文未修改）。包内 Tk 资源自身的 `license.terms` 也保留。Anaconda 等其他发行环境可用于开发，但不作为本次正式二进制来源。
