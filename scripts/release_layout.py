"""Versioned download layout; no network operations and no user-data access."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "Yvonson/immersive-translate"
LAYOUT = "distribution-v2"
OLD_RUNTIME = {"chrome.zip", "dictionary-companion-windows-x64.zip", "dictionary-core.zip"}
OLD_NAMES = OLD_RUNTIME | {"windows-full.zip", "developer-resources.zip", "SHA256SUMS.txt", "firefox.zip",
    "dictionary-companion-sources.zip", "catalog.json", "resources.lock.json", "zhwiktionary.jsonl.gz",
    "source-parts.json", "restore-dictionary-source.py", "INSTALL.md", "RELEASE-NOTES.md", "release-manifest.json"}


class ReleaseError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def stream_sha(stream):
    return hashlib.file_digest(stream, "sha256").hexdigest()


def names(version):
    require(bool(re.fullmatch(r"\d+\.\d+\.\d+", version)), "Invalid numeric version")
    prefix = "open-bilingual-translate-" + version
    return {"extension": prefix + "-chromium-extension.zip", "windows": prefix + "-windows-x64-bundle.zip",
            "resources": prefix + "-development-resources.zip"}


def resources_tag(tag):
    require(bool(re.fullmatch(r"v\d+\.\d+\.\d+", tag)), "Invalid release tag")
    return "resources-" + tag


def allowed_main_names(version):
    return OLD_NAMES | set(names(version).values()) | {f"zhwiktionary.jsonl.gz.part{i:02d}" for i in range(1, 100)}


def dump(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def notice_equal(actual, expected, filename):
    require(actual.decode("utf-8").replace("\r\n", "\n") == expected.decode("utf-8").replace("\r\n", "\n"),
            "Notice text mismatch: " + filename)


def safe_members(archive):
    seen = set()
    for info in archive.infolist():
        path = PurePosixPath(info.filename)
        key = info.filename.rstrip("/").casefold()
        require(bool(key) and not path.is_absolute() and ".." not in path.parts
                and "\\" not in info.filename and ":" not in info.filename and key not in seen
                and (info.external_attr >> 16) & 0o170000 != 0o120000,
                "Unsafe or duplicate ZIP member: " + info.filename)
        seen.add(key)
        if not info.is_dir():
            yield info


def write_entry(archive, name, source, stored=False):
    entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
    entry.create_system = 3
    entry.external_attr = 0o100644 << 16
    entry.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    entry._compresslevel = 6
    with archive.open(entry, "w", force_zip64=True) as target:
        if isinstance(source, bytes):
            target.write(source)
        else:
            shutil.copyfileobj(source, target, 1024 * 1024)


def add_archive(target, source, prefix):
    with zipfile.ZipFile(source) as incoming:
        for info in sorted(safe_members(incoming), key=lambda item: item.filename):
            with incoming.open(info) as stream:
                write_entry(target, prefix + "/" + info.filename, stream)


def verify_archive_copy(bundle, source, prefix):
    with zipfile.ZipFile(source) as original:
        members = list(safe_members(original))
        require({prefix + "/" + item.filename for item in members} ==
                {name for name in bundle.namelist() if name.startswith(prefix + "/")}, "Runtime file set differs: " + prefix)
        for info in members:
            with original.open(info) as before, bundle.open(prefix + "/" + info.filename) as after:
                require(stream_sha(before) == stream_sha(after), "Runtime bytes differ: " + info.filename)


def record(path, role, target):
    return {"name": path.name, "bytes": path.stat().st_size, "sha256": sha(path), "role": role, "target": target}


def validate_plan(plan):
    require(plan["layout"] == LAYOUT and plan["tag"] == "v" + plan["version"] and plan["resourcesTag"] == resources_tag(plan["tag"]), "Invalid distribution layout/tag")
    for key in ("sourceCommit", "packagingCommit"):
        require(bool(re.fullmatch(r"[a-f0-9]{40}", plan[key])), "Invalid " + key)
    expected = names(plan["version"])
    require(len(plan["assets"]) == 3 and {item["role"] for item in plan["assets"]} == set(expected), "Invalid asset role set")
    for item in plan["assets"]:
        require(item["name"] == expected[item["role"]] and item["target"] == ("resources" if item["role"] == "resources" else "main")
                and isinstance(item["bytes"], int) and item["bytes"] > 0 and bool(re.fullmatch(r"[a-f0-9]{64}", item["sha256"])), "Invalid asset record")


def validate_payload(extension, bundle, developer, version, commit, scratch):
    """Validate already-grouped input without recreating deleted legacy installer ZIPs."""
    with zipfile.ZipFile(extension) as browser, zipfile.ZipFile(bundle) as full, zipfile.ZipFile(developer) as dev:
        for archive in (browser, full, dev):
            list(safe_members(archive))
        build = json.loads(browser.read("BUILD.json"))
        manifest = json.loads(browser.read("manifest.json"))
        require(build == {"version": version, "commit": commit, "browser": "chrome"}, "Extension BUILD.json source mismatch")
        require(manifest["version"] == manifest.get("version_name") == version, "Extension manifest version mismatch")
        for filename in ("LICENSE", "UPSTREAM.md", "PRIVACY"):
            notice_equal(browser.read(filename), (ROOT / filename).read_bytes(), filename)
        verify_archive_copy(full, extension, "chrome")
        native = json.loads(full.read("companion/BUILD.json").decode("utf-8-sig"))
        require(native["version"] == version and native["commit"] == commit and native["runtime"] == "cpython",
                "Native BUILD.json source/runtime mismatch")
        for filename in ("install.ps1", "uninstall.ps1", "LICENSE", "THIRD_PARTY.md", "dictionary-companion/dictionary-companion.exe"):
            require("companion/" + filename in full.namelist(), "Missing native file: " + filename)
        for filename in ("PYTHON-LICENSE.txt", "TCL-LICENSE.txt", "TK-LICENSE.txt", "OPENSSL-LICENSE.txt", "ZLIB-LICENSE.txt"):
            require("companion/dictionary-companion/_internal/licenses/" + filename in full.namelist(), "Missing runtime notice: " + filename)
        for filename in full.namelist():
            require(filename.startswith(("chrome/", "companion/")) or filename in {"dictionary-core.zip", "INSTALL.md", "PACKAGE.json"},
                    "Unexpected full-bundle file: " + filename)
            require(not re.search(r"(^|/)(?:settings\.json|native-host\.json|favorites\.sqlite3|__pycache__|\.env)(?:/|$)", filename),
                    "Private/local file in bundle: " + filename)
        with zipfile.ZipFile(io.BytesIO(dev.read("dictionary-companion-sources.zip"))) as sources:
            list(safe_members(sources))
            require(sources.testzip() is None, "Corrupt corresponding-source ZIP")
            info = json.loads(sources.read("SOURCE.json").decode("utf-8-sig"))
            require(info["version"] == version and info["commit"] == commit, "Corresponding source commit mismatch")
            for filename in ("companion/main.py", "companion/obt_dictionary/favorites.py", "scripts/build-companion.ps1", "dependencies/pyinstaller-6.16.0.tar.gz"):
                require(filename in sources.namelist(), "Missing corresponding source: " + filename)
            notice_equal(full.read("companion/LICENSE"), sources.read("companion/LICENSE"), "companion/LICENSE")
        catalog = json.loads(dev.read("catalog.json"))["components"][0]
        lock = json.loads(dev.read("resources.lock.json"))
        require(lock == json.loads((ROOT / "companion/resources.lock.json").read_text(encoding="utf-8")), "Resource source lock mismatch")
        pinned = lock["zhwiktionary.jsonl.gz"]
        if "source-parts.json" in dev.namelist():
            parts = json.loads(dev.read("source-parts.json"))
            entries = parts["parts"]
            require(1 <= len(entries) <= 99 and [item["name"] for item in entries] ==
                    [f"zhwiktionary.jsonl.gz.part{i+1:02d}" for i in range(len(entries))], "Invalid source-part sequence")
            require(parts["target"] == "zhwiktionary.jsonl.gz" and parts["sha256"] == pinned["sha256"] and parts["bytes"] == pinned["bytes"], "Source snapshot lock mismatch")
            whole = hashlib.sha256()
            total = 0
            for item in entries:
                digest = hashlib.sha256()
                require(dev.getinfo(item["name"]).file_size == item["bytes"], "Source-part size mismatch: " + item["name"])
                with dev.open(item["name"]) as reader:
                    while block := reader.read(1024 * 1024):
                        digest.update(block)
                        whole.update(block)
                        total += len(block)
                require(digest.hexdigest() == item["sha256"], "Source-part checksum mismatch: " + item["name"])
            require(total == pinned["bytes"] and whole.hexdigest() == pinned["sha256"], "Complete source snapshot checksum mismatch")
        else:
            with dev.open("zhwiktionary.jsonl.gz") as reader:
                require(dev.getinfo("zhwiktionary.jsonl.gz").file_size == pinned["bytes"] and stream_sha(reader) == pinned["sha256"], "Source snapshot checksum mismatch")
        core = scratch / "dictionary-core.zip"
        with full.open("dictionary-core.zip") as reader, core.open("wb") as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
        require(core.stat().st_size == catalog["downloadBytes"] and sha(core) == catalog["sha256"], "Dictionary ZIP checksum mismatch")
        with zipfile.ZipFile(core) as dictionary:
            list(safe_members(dictionary))
            info = json.loads(dictionary.read("manifest.json"))
            require({"ECDICT-LICENSE.txt", "WIKTIONARY-NOTICE.txt"} <= set(dictionary.namelist()), "Missing dictionary notices")
            require({item["name"]: {k: v for k, v in item.items() if k != "name"} for item in info["sources"]} == lock,
                    "Dictionary manifest source mismatch")
            require(info["counts"] == catalog["counts"] and info["revision"] == catalog["revision"], "Dictionary catalog mismatch")
            require(set(dictionary.namelist()) == {item["path"] for item in info["files"]} | {"manifest.json"}, "Dictionary file set mismatch")
            require(sum(item["bytes"] for item in info["files"]) == catalog["installedBytes"], "Dictionary installed-size mismatch")
            for item in info["files"]:
                with dictionary.open(item["path"]) as reader:
                    require(dictionary.getinfo(item["path"]).file_size == item["bytes"] and stream_sha(reader) == item["sha256"],
                            "Dictionary file checksum mismatch: " + item["path"])
        package = json.loads(full.read("PACKAGE.json"))
        require(package.get("sourceCommit", package.get("commit")) == commit, "Bundle source commit mismatch")
        return package


def legacy_bundle(directory, scratch, tag, commit):
    spec = importlib.util.spec_from_file_location("release_audit", ROOT / "scripts/check-release.py")
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    audit.audit(directory, tag, commit)
    manifest = json.loads((directory / "release-manifest.json").read_text(encoding="utf-8"))
    full = scratch / "windows-full.zip"
    with zipfile.ZipFile(full, "w") as archive:
        add_archive(archive, directory / "chrome.zip", "chrome")
        add_archive(archive, directory / "dictionary-companion-windows-x64.zip", "companion")
        with (directory / "dictionary-core.zip").open("rb") as stream:
            write_entry(archive, "dictionary-core.zip", stream, stored=True)
        write_entry(archive, "INSTALL.md", (ROOT / "docs/INSTALL.md").read_bytes())
        write_entry(archive, "PACKAGE.json", json.dumps({"commit": commit}).encode())
    developer = scratch / "developer-resources.zip"
    developer_names = {item["name"] for item in manifest["assets"]} - OLD_RUNTIME | {"SHA256SUMS.txt", "release-manifest.json"}
    with zipfile.ZipFile(developer, "w") as archive:
        for filename in sorted(developer_names):
            with (directory / filename).open("rb") as stream:
                write_entry(archive, filename, stream, stored=True)
        write_entry(archive, "README-DEVELOPERS.md", b"Corresponding source: dictionary-companion-sources.zip.\nOriginal audit files describe the historical split distribution.\n")
    return directory / "chrome.zip", full, developer


def package(directory, output, tag, commit, packaging_commit):
    version = tag.removeprefix("v")
    filenames = names(version)
    resources_tag(tag)
    require(bool(re.fullmatch(r"[a-f0-9]{40}", commit)) and bool(re.fullmatch(r"[a-f0-9]{40}", packaging_commit)), "Invalid source/packaging commit")
    output.mkdir(parents=True, exist_ok=True)
    require(not any(output.iterdir()), "Use an empty packaging output folder")
    scratch = output / "validation"
    scratch.mkdir()
    if (directory / "release-manifest.json").exists() and (directory / "dictionary-companion-windows-x64.zip").exists():
        extension, full, developer = legacy_bundle(directory, scratch, tag, commit)
    else:
        def choose(role, old):
            result = directory / filenames[role]
            if not result.exists():
                result = directory / old
            require(result.exists(), "Missing " + role + " input (supports grouped releases; old split ZIPs are not required)")
            return result
        extension, full, developer = choose("extension", "chrome.zip"), choose("windows", "windows-full.zip"), choose("resources", "developer-resources.zip")
    metadata = validate_payload(extension, full, developer, version, commit, scratch)
    shutil.copyfile(extension, output / filenames["extension"])
    shutil.copyfile(developer, output / filenames["resources"])
    target = output / filenames["windows"]
    if metadata.get("layout") == LAYOUT:
        require(metadata["version"] == version and bool(re.fullmatch(r"[a-f0-9]{40}", metadata["packagingCommit"])), "Invalid published packaging metadata")
        packaging_commit = metadata["packagingCommit"]
        shutil.copyfile(full, target)
    else:
        metadata = {"layout": LAYOUT, "version": version, "sourceCommit": commit, "packagingCommit": packaging_commit}
        with zipfile.ZipFile(full) as before, zipfile.ZipFile(target, "w") as after:
            for entry in sorted(safe_members(before), key=lambda item: item.filename):
                if entry.filename not in {"INSTALL.md", "PACKAGE.json"}:
                    with before.open(entry) as stream:
                        write_entry(after, entry.filename, stream, stored=entry.filename == "dictionary-core.zip")
            write_entry(after, "INSTALL.md", (ROOT / "docs/INSTALL.md").read_bytes())
            write_entry(after, "PACKAGE.json", (json.dumps(metadata, indent=2) + "\n").encode("utf-8"))
        with zipfile.ZipFile(full) as before, zipfile.ZipFile(target) as after:
            expected = {entry.filename for entry in safe_members(before)} - {"INSTALL.md", "PACKAGE.json"}
            require(expected == set(after.namelist()) - {"INSTALL.md", "PACKAGE.json"}, "Repack changed runtime file set")
            for filename in sorted(expected):
                with before.open(filename) as old, after.open(filename) as new:
                    require(stream_sha(old) == stream_sha(new), "Repack changed runtime bytes: " + filename)
    plan = {"layout": LAYOUT, "version": version, "tag": tag, "resourcesTag": resources_tag(tag),
            "sourceCommit": commit, "packagingCommit": packaging_commit,
            "assets": [record(output / filenames[role], role, "resources" if role == "resources" else "main")
                       for role in ("extension", "windows", "resources")]}
    dump(output / "download-manifest.json", plan)
    return plan


def download_url(tag, filename):
    return f"https://github.com/{REPOSITORY}/releases/download/{tag}/{filename}"


def release_body(plan):
    assets = {item["role"]: item for item in plan["assets"]}
    rows = []
    for role, label in (("extension", "网页／已有字幕翻译，Chrome／Edge"), ("windows", "Windows x64＋Chrome：再加离线词典与生词本")):
        item = assets[role]
        size = f"{item['bytes']/1048576:.1f} MiB" if item["bytes"] > 1048576 else f"{item['bytes']/1024:.0f} KiB"
        rows.append(f"| {label} | [{item['name']}]({download_url(plan['tag'], item['name'])}) | {size} |")
    intro = f"# Open Bilingual Translate {plan['tag']}\n\n选择一个安装包即可。Windows 完整包已包含扩展，不必重复下载。\n\n| 用途 | 下载文件 | 大小 |\n| --- | --- | --- |\n" + "\n".join(rows)
    template = (ROOT / "docs/releases" / (plan["tag"] + ".md")).read_text(encoding="utf-8")
    require("<!-- DOWNLOADS -->" in template and "<!-- /DOWNLOADS -->" in template, "Release notes are missing download section markers")
    before, section = template.split("<!-- DOWNLOADS -->", 1)
    _, after = section.split("<!-- /DOWNLOADS -->", 1)
    text = before + intro + after
    checksums = "\n".join(item["sha256"] + "  " + item["name"] for item in plan["assets"] if item["target"] == "main")
    return text.rstrip() + "\n\n<details>\n<summary>SHA-256</summary>\n\n```text\n" + checksums + "\n```\n\n</details>\n"


def resource_body(plan):
    item = next(item for item in plan["assets"] if item["target"] == "resources")
    return (f"# Open Bilingual Translate {plan['tag']} - Resources\n\n"
            "开发资料归档。普通用户请前往[正式版下载页](https://github.com/" + REPOSITORY + "/releases/latest)。\n\n"
            f"下载 [{item['name']}]({download_url(plan['resourcesTag'], item['name'])})。\n\n"
            "包含 dictionary-companion-sources.zip（GPL 对应源码与独立构建说明）、Firefox 开发包、来源锁、原始词库快照及历史审计记录。许可证和来源声明保留在包内。\n\n"
            f"Software source commit: `{plan['sourceCommit']}`\n\nPackaging commit: `{plan['packagingCommit']}`\n\n"
            f"```text\n{item['sha256']}  {item['name']}\n```\n")
