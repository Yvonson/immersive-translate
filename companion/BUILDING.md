# 构建 Windows 本地词典组件

从仓库根目录或完整解压的 `dictionary-companion-sources.zip` 根目录运行，使用 python.org 的 **Windows x64 CPython 3.13**（含 Tcl/Tk）。正式包采用 GitHub Actions `setup-python` 的官方环境；固定 Python 依赖见 `requirements.lock.txt`。无需 Node.js、录音、语音模型或商业词典。

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r companion/requirements.lock.txt
.venv/Scripts/python.exe -B -m unittest discover -s companion/tests -v
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-companion.ps1 -Python .venv/Scripts/python.exe
```

输出 `.local/dictionary/dictionary-companion-windows-x64.zip`。有 Git 时记录当前提交；源码归档无 `.git` 时读取 `SOURCE.json`。程序与依赖许可随包保留。源码包 `dependencies/` 另附 PyInstaller 对应源码及下载 SHA-256，供查阅／自行构建引导程序；通常安装锁定版本即可构建本程序。

词库单独构建：`companion/main.py --fetch` 显式下载锁定输入，`--build-resources` 再校验并转换。滚动的维基词典输入可从同版本 Release 的 `zhwiktionary.jsonl.gz` 恢复到 `.local/dictionary/cache/`，不要用新快照冒充原锁定版本。安装或查询词库不要求下载源码依赖。
