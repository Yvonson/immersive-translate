"""Windows entrypoint; native mode does not load the downloader or any HTTP library."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

from obt_dictionary import HOST_NAME
from obt_dictionary.storage import atomic_json, default_data_dir, install_pack, verify_packs


def program_dir():
    return Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def data_dir():
    try:
        return Path(json.loads((program_dir() / "settings.json").read_text(encoding="utf-8"))["dataDir"])
    except FileNotFoundError:
        return default_data_dir()


def register(extension_id, root):
    if os.name != "nt" or not re.fullmatch("[a-p]{32}", extension_id):
        raise ValueError("需要 Windows 和有效的 Chrome 扩展 ID。")
    import winreg
    binary = program_dir() / "dictionary-companion.exe"
    if not binary.exists():
        raise ValueError("请先构建 Windows 伴随程序，再运行安装。")
    root.mkdir(parents=True, exist_ok=True)
    atomic_json(program_dir() / "settings.json", {"dataDir": str(root.resolve())})
    manifest = {"name": HOST_NAME, "description": "Open Bilingual Translate offline dictionary", "path": str(binary.resolve()), "type": "stdio", "allowed_origins": ["chrome-extension://" + extension_id + "/"]}
    path = program_dir() / "native-host.json"
    atomic_json(path, manifest)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, "Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(path.resolve()))
    print("本地词典连接已注册。数据目录：" + str(root))


def manage(root):
    import threading
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from obt_dictionary.storage import active_packs
    app = tk.Tk()
    app.title("开放双语翻译 · 本地词典资源")
    app.geometry("660x420")
    app.configure(padx=24, pady=20)
    tk.Label(app, text="本地词典", font=("Microsoft YaHei UI", 21, "bold")).pack(anchor="w")
    tk.Label(app, text="导入资源包后，释义与音标可离线查询；播放读音由扩展中的语音服务负责。", pady=10).pack(anchor="w")
    tk.Label(app, text="资源目录：" + str(root), wraplength=610, justify="left").pack(anchor="w")
    text = tk.StringVar()
    label = tk.Label(app, textvariable=text, justify="left", wraplength=610, pady=20)
    label.pack(anchor="w")
    def refresh():
        packs = active_packs(root)
        text.set("\n".join(f"{kind}: {manifest['revision']} · {sum(f['bytes'] for f in manifest['files']) / 1024**2:.1f} MB\n{manifest.get('counts', {})}" for kind, (_, manifest) in packs.items()) or "尚未安装资源。请选择 dictionary-core.zip。")
    def run(action):
        for button in buttons:
            button.configure(state="disabled")
        text.set("正在校验和处理资源，请稍候……")
        def work():
            try:
                action()
                app.after(0, refresh)
            except Exception as error:
                app.after(0, lambda message=str(error): messagebox.showerror("资源处理失败", message))
            finally:
                app.after(0, lambda: [button.configure(state="normal") for button in buttons])
        threading.Thread(target=work, daemon=True).start()
    def choose():
        paths = filedialog.askopenfilenames(filetypes=[("词典离线资源包", "*.zip")])
        if paths:
            import zipfile
            try:
                descriptions=[]
                total=0
                for path in paths:
                    with zipfile.ZipFile(path) as archive:
                        info=archive.getinfo("manifest.json")
                        if info.file_size>4*1024**2:
                            raise ValueError("资源清单过大")
                        manifest=json.loads(archive.read(info))
                    size=sum(item["bytes"] for item in manifest["files"])
                    total+=size
                    descriptions.append(f"{manifest['component']} · {manifest['revision']} · {size/1024**2:.1f} MB")
                if not messagebox.askyesno("导入本地词典资源", "\n".join(descriptions)+f"\n\n需要约 {total/1024**2:.1f} MB 可用空间，旧版本会保留。\n导入并校验这些资源？"):
                    return
            except Exception as error:
                messagebox.showerror("无效的资源包",str(error))
                return
            run(lambda: [install_pack(path, root) for path in paths])
    row = ttk.Frame(app)
    row.pack(anchor="w", pady=10)
    buttons = [ttk.Button(row, text="导入离线资源包", command=choose), ttk.Button(row, text="校验已安装资源", command=lambda: run(lambda: verify_packs(root)))]
    for button in buttons:
        button.pack(side="left", padx=(0, 12))
    tk.Label(app, text="安装或更新资源后，请回到扩展设置点击“重新连接”。", pady=12).pack(anchor="w")
    refresh()
    app.mainloop()


def main():
    parser = argparse.ArgumentParser(description="Open Bilingual Translate offline dictionary")
    parser.add_argument("origin", nargs="?")
    parser.add_argument("--parent-window")
    parser.add_argument("--install", metavar="EXTENSION_ID")
    parser.add_argument("--unregister", action="store_true")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--manage", action="store_true")
    parser.add_argument("--import-pack", type=Path)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--diagnose", action="store_true", help="Check bundled Tk and SQLite without network")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--build-resources", action="store_true")
    parser.add_argument("--cache", type=Path, default=Path(".local/dictionary/cache"))
    parser.add_argument("--output", type=Path, default=Path(".local/dictionary/packages"))
    parser.add_argument("--direct", action="store_true", help="Explicitly bypass system proxy for resource downloads")
    parser.add_argument("--proxy", help="Proxy for explicit resource downloads only")
    args = parser.parse_args()
    root = args.data_dir or data_dir()
    if args.install:
        register(args.install, root)
    elif args.unregister:
        import winreg
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, "Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME)
        except FileNotFoundError:
            pass
        print("已移除 Chrome 连接注册；词库文件保留。")
    elif args.diagnose:
        import tkinter as tk
        import sqlite3
        window=tk.Tk()
        window.withdraw()
        tk_version=window.tk.call("info", "patchlevel")
        window.destroy()
        print(json.dumps({"ui":str(tk_version),"sqlite":sqlite3.sqlite_version,"offline":True}))
    elif args.manage:
        manage(root)
    elif args.import_pack:
        print(json.dumps(install_pack(args.import_pack, root), ensure_ascii=False))
    elif args.verify:
        print(json.dumps(verify_packs(root)))
    elif args.fetch or args.build_resources:
        from obt_dictionary import resources
        if args.fetch:
            resources.fetch(args.cache, args.direct, args.proxy)
        if args.build_resources:
            resources.build(args.cache, args.output)
    elif args.origin and re.fullmatch(r"chrome-extension://[a-p]{32}/", args.origin):
        if os.name == "nt":
            import msvcrt
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
        from obt_dictionary.host import serve
        serve(root)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
