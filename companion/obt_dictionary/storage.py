"""Validated, versioned resource packs shared by the installer and native host."""
import hashlib
import contextlib
import json
import os
import re
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import uuid
import zipfile


def default_data_dir():
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "OpenBilingualTranslate" / "Dictionary"


def digest(path):
    value = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def safe_path(root, name):
    if not isinstance(name, str) or "\\" in name or ":" in name:
        raise ValueError("Invalid resource path")
    part = PurePosixPath(name)
    if part.is_absolute() or not part.parts or part.as_posix() != name or any(p in ("..", ".") or p.endswith((".", " ")) for p in part.parts):
        raise ValueError("Invalid resource path")
    if any(re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", part, re.I) for part in part.parts):
        raise ValueError("Reserved Windows resource path")
    target = (Path(root) / name).resolve()
    if not target.is_relative_to(Path(root).resolve()):
        raise ValueError("Resource outside data directory")
    return target


def active_packs(root):
    root = Path(root)
    try:
        active = json.loads((root / "active.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    result = {}
    for component in ("core",):
        if component not in active:
            continue
        directory = safe_path(root, active[component])
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("schema") != 1 or manifest.get("component") != component:
            raise ValueError("Resource manifest is incompatible")
        result[component] = (directory, manifest)
    return result


def install_pack(archive, root):
    """Extract only declared files; verify before changing the active pointer."""
    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if len(names) != len(set(names)) or len(names) > 150000:
            raise ValueError("Duplicate or excessive archive entries")
        if source.getinfo("manifest.json").file_size > 4 * 1024 * 1024:
            raise ValueError("Manifest too large")
        manifest = json.loads(source.read("manifest.json"))
        component = manifest.get("component")
        if manifest.get("schema") != 1 or component not in ("core",):
            raise ValueError("Unsupported resource pack")
        files = manifest.get("files", [])
        if not files or len(files) > 149999:
            raise ValueError("Empty or excessive resource files")
        declared = {item["path"] for item in files}
        if len(declared) != len(files) or "manifest.json" in declared or set(names) != declared | {"manifest.json"}:
            raise ValueError("Archive does not match manifest")
        required = {"core": {"ecdict.db", "details.db"}}
        if not required[component].issubset(declared):
            raise ValueError("Required resource files are missing")
        total = sum(item["bytes"] for item in files)
        if total > 12 * 1024**3 or total < 0:
            raise ValueError("Resource pack too large")
        if shutil.disk_usage(root).free < total + 64 * 1024**2:
            raise ValueError("Not enough disk space")
        staging = Path(tempfile.mkdtemp(prefix=".install-", dir=root))
        try:
            for item in files:
                target = safe_path(staging, item["path"])
                info = source.getinfo(item["path"])
                if info.file_size != item["bytes"] or info.is_dir() or (info.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("Invalid resource entry")
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(info) as incoming, target.open("wb") as output:
                    shutil.copyfileobj(incoming, output)
                if digest(target) != item["sha256"]:
                    raise ValueError("Resource checksum mismatch: " + item["path"])
            if component == "core":
                import sqlite3
                databases = {"core": {"ecdict.db": ["stardict"], "details.db": ["entries", "forms"]}}[component]
                for filename, tables in databases.items():
                    with contextlib.closing(sqlite3.connect((staging / filename).as_uri() + "?mode=ro", uri=True)) as db:
                        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                            raise ValueError("Invalid SQLite resource")
                        for table in tables:
                            if not db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                                raise ValueError("Dictionary table is missing: " + table)
            atomic_json(staging / "manifest.json", manifest)
            packs = root / "packs"
            packs.mkdir(exist_ok=True)
            destination = packs / (component + "-" + uuid.uuid4().hex)
            staging.rename(destination)
            pointer = root / "active.json"
            active = json.loads(pointer.read_text(encoding="utf-8")) if pointer.exists() else {}
            active[component] = destination.relative_to(root).as_posix()
            atomic_json(pointer, active)
            return manifest
        finally:
            if staging.exists():
                shutil.rmtree(staging)


def verify_packs(root):
    results = []
    for component, (directory, manifest) in active_packs(root).items():
        for item in manifest["files"]:
            path = safe_path(directory, item["path"])
            if path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
                raise ValueError("Resource damaged: " + item["path"])
        results.append(component)
    return results
