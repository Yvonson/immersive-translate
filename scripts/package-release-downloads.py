"""Group audited release inputs into two user choices and one developer archive."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = {"chrome.zip", "dictionary-companion-windows-x64.zip", "dictionary-core.zip"}
DOWNLOADS = {"chrome.zip", "windows-full.zip", "developer-resources.zip", "SHA256SUMS.txt"}


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_members(archive):
    seen = set()
    for info in archive.infolist():
        path = PurePosixPath(info.filename)
        key = info.filename.rstrip("/").casefold()
        if (not key or path.is_absolute() or ".." in path.parts or "\\" in info.filename
                or ":" in info.filename or key in seen or (info.external_attr >> 16) & 0o170000 == 0o120000):
            raise ValueError("Unsafe or duplicate ZIP member: " + info.filename)
        seen.add(key)
        if not info.is_dir():
            yield info


def add_archive(target, source, prefix):
    with zipfile.ZipFile(source) as incoming:
        members = list(safe_members(incoming))
        for info in members:
            entry = zipfile.ZipInfo(prefix + "/" + info.filename, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = info.external_attr
            with incoming.open(info) as reader, target.open(entry, "w", force_zip64=True) as writer:
                shutil.copyfileobj(reader, writer, 1024 * 1024)


def verify_archive_copy(bundle, source, prefix):
    with zipfile.ZipFile(source) as original:
        members = list(safe_members(original))
        expected = {prefix + "/" + entry.filename for entry in members}
        actual = {name for name in bundle.namelist() if name.startswith(prefix + "/")}
        if actual != expected:
            raise ValueError("Bundled runtime file set differs: " + prefix)
        for entry in members:
            with original.open(entry) as before, bundle.open(prefix + "/" + entry.filename) as after:
                if hashlib.file_digest(before, "sha256").digest() != hashlib.file_digest(after, "sha256").digest():
                    raise ValueError("Bundled runtime differs: " + entry.filename)


def package(directory, output):
    manifest = json.loads((directory / "release-manifest.json").read_text(encoding="utf-8"))
    records = manifest["assets"]
    names = {entry["name"] for entry in records}
    if not RUNTIME.issubset(names) or "dictionary-companion-sources.zip" not in names or len(names) != len(records):
        raise ValueError("Missing runtime/corresponding source, or duplicate input names")
    for entry in records:
        name = entry["name"]
        if PurePosixPath(name).name != name or "\\" in name or ":" in name:
            raise ValueError("Unsafe input name")
        path = directory / name
        if path.stat().st_size != entry["bytes"] or sha(path) != entry["sha256"]:
            raise ValueError("Input checksum mismatch: " + name)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Use an empty output folder; do not overwrite published packages")
    shutil.copyfile(directory / "chrome.zip", output / "chrome.zip")
    metadata = {"layout": "compact-v1", "version": manifest["version"], "commit": manifest["commit"],
                "inputs": records}
    with zipfile.ZipFile(output / "windows-full.zip", "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        add_archive(archive, directory / "chrome.zip", "chrome")
        add_archive(archive, directory / "dictionary-companion-windows-x64.zip", "companion")
        archive.write(directory / "dictionary-core.zip", "dictionary-core.zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("INSTALL.md", (ROOT / "docs/INSTALL.md").read_bytes())
        archive.writestr("PACKAGE.json", json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    developer_names = names - RUNTIME | {"SHA256SUMS.txt", "release-manifest.json"}
    developer_readme = """# 开发者资料（普通用户无需下载）

这里保存原版 v0.2.0 的对应源码、许可、Firefox 临时开发包、来源锁及词典原始快照。
`dictionary-companion-sources.zip` 是 Windows 组件的 GPL 对应源码，包含独立构建说明与依赖源码。
运行 `python restore-dictionary-source.py` 可将同目录的 7 片还原为锁定的原始 gzip。
原 INSTALL.md、RELEASE-NOTES.md、SHA256SUMS.txt 和 release-manifest.json 保存旧的分件交付审计记录。
现行安装说明：https://github.com/Yvonson/immersive-translate/blob/main/docs/INSTALL.md
本包只是重新组织已验证资料，没有重新编译扩展或本地程序，也没有更换词库。
"""
    with zipfile.ZipFile(output / "developer-resources.zip", "w", compression=zipfile.ZIP_STORED) as archive:
        for name in sorted(developer_names):
            archive.write(directory / name, name)
        archive.writestr("README-DEVELOPERS.md", developer_readme)
        archive.writestr("PACKAGE.json", json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    # Verify actual bytes and complete file sets, not merely successful ZIP creation.
    with zipfile.ZipFile(output / "windows-full.zip") as archive:
        verify_archive_copy(archive, directory / "chrome.zip", "chrome")
        verify_archive_copy(archive, directory / "dictionary-companion-windows-x64.zip", "companion")
        with archive.open("dictionary-core.zip") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != sha(directory / "dictionary-core.zip"):
                raise ValueError("Bundled dictionary differs")
    with zipfile.ZipFile(output / "developer-resources.zip") as archive:
        if set(archive.namelist()) != developer_names | {"README-DEVELOPERS.md", "PACKAGE.json"}:
            raise ValueError("Developer archive file set differs")
        for name in developer_names:
            with archive.open(name) as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != sha(directory / name):
                    raise ValueError("Developer source differs: " + name)
    records = [{"name": name, "bytes": (output/name).stat().st_size, "sha256": sha(output/name)}
               for name in sorted(DOWNLOADS - {"SHA256SUMS.txt"})]
    (output / "SHA256SUMS.txt").write_text("".join(f"{item['sha256']}  {item['name']}\n" for item in records), encoding="utf-8")
    records.append({"name": "SHA256SUMS.txt", "bytes": (output/"SHA256SUMS.txt").stat().st_size,
                    "sha256": sha(output/"SHA256SUMS.txt")})
    result = {"layout": "compact-v1", "version": manifest["version"], "tag": manifest["tag"],
              "commit": manifest["commit"], "assets": records}
    (output / "download-manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    package(args.directory.resolve(), args.output.resolve())
