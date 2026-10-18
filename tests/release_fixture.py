"""Small, real ZIP/source/manifest fixtures for publication failure tests."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_layout as layout

SOURCE = "a" * 40
PACKAGING = "b" * 40


def zipped(path, entries):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in sorted(entries.items()):
            archive.writestr(name, value if isinstance(value, bytes) else value.encode("utf-8"))


def fixture(base):
    root = base / "repository"
    inputs = base / "inputs"
    inputs.mkdir()
    (root / "companion").mkdir(parents=True)
    (root / "docs/releases").mkdir(parents=True)
    for filename in ("LICENSE", "UPSTREAM.md", "PRIVACY"):
        shutil.copyfile(layout.ROOT / filename, root / filename)
    (root / "package.json").write_text('{"version":"0.2.0"}', encoding="utf-8")
    filenames = layout.names("0.2.0")
    (root / "docs/INSTALL.md").write_text("Install " + filenames["extension"] + " or " + filenames["windows"] + "\n", encoding="utf-8", newline="\n")
    (root / "docs/releases/v0.2.0.md").write_text("<!-- DOWNLOADS --><!-- /DOWNLOADS -->\n\nInstallation and source links.\n", encoding="utf-8", newline="\n")
    snapshot = gzip.compress(b"[]\n", mtime=0)
    lock = {"zhwiktionary.jsonl.gz": {"bytes": len(snapshot), "sha256": hashlib.sha256(snapshot).hexdigest(), "url": "https://example.invalid/snapshot"}}
    layout.dump(root / "companion/resources.lock.json", lock)
    browser = {"BUILD.json": json.dumps({"version": "0.2.0", "commit": SOURCE, "browser": "chrome"}),
               "manifest.json": '{"version":"0.2.0","version_name":"0.2.0"}', "main.js": "translation code"}
    for filename in ("LICENSE", "UPSTREAM.md", "PRIVACY"):
        browser[filename] = (root / filename).read_bytes()
    zipped(inputs / "chrome.zip", browser)
    source = base / "sources.zip"
    zipped(source, {"SOURCE.json": json.dumps({"version": "0.2.0", "commit": SOURCE}), "companion/LICENSE": "GPL\n",
        "companion/main.py": "program source", "companion/obt_dictionary/favorites.py": "favorites source",
        "scripts/build-companion.ps1": "build", "dependencies/pyinstaller-6.16.0.tar.gz": "dependency source"})
    dictionary_files = {"dictionary.sqlite3": b"definitions", "ECDICT-LICENSE.txt": b"MIT", "WIKTIONARY-NOTICE.txt": b"CC BY-SA"}
    manifest = {"sources": [{"name": key, **value} for key, value in lock.items()], "counts": {"words": 1}, "revision": "fixture",
                "files": [{"path": key, "bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()} for key, value in dictionary_files.items()]}
    core = base / "core.zip"
    zipped(core, {**dictionary_files, "manifest.json": json.dumps(manifest)})
    catalog = {"components": [{"counts": manifest["counts"], "revision": "fixture", "downloadBytes": core.stat().st_size,
                               "installedBytes": sum(item["bytes"] for item in manifest["files"]), "sha256": layout.sha(core)}]}
    zipped(inputs / "developer-resources.zip", {"dictionary-companion-sources.zip": source.read_bytes(), "resources.lock.json": json.dumps(lock),
            "catalog.json": json.dumps(catalog), "zhwiktionary.jsonl.gz": snapshot})
    native = {"BUILD.json": json.dumps({"version": "0.2.0", "commit": SOURCE, "runtime": "cpython"}),
              "install.ps1": "register", "uninstall.ps1": "unregister", "LICENSE": "GPL\n", "THIRD_PARTY.md": "notices",
              "dictionary-companion/dictionary-companion.exe": "tested binary"}
    for filename in ("PYTHON-LICENSE.txt", "TCL-LICENSE.txt", "TK-LICENSE.txt", "OPENSSL-LICENSE.txt", "ZLIB-LICENSE.txt"):
        native["dictionary-companion/_internal/licenses/" + filename] = "runtime notice"
    bundled = {"chrome/" + name: data for name, data in browser.items()}
    bundled.update({"companion/" + name: data for name, data in native.items()})
    bundled.update({"dictionary-core.zip": core.read_bytes(), "INSTALL.md": "old installation guide",
                    "PACKAGE.json": json.dumps({"layout": "compact-v1", "version": "0.2.0", "commit": SOURCE})})
    zipped(inputs / "windows-full.zip", bundled)
    (inputs / "SHA256SUMS.txt").write_text("historical checksum file", encoding="utf-8")
    return root, inputs
