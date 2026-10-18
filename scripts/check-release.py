"""Audit complete release assets before upload; never includes personal data."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"chrome.zip", "firefox.zip", "dictionary-companion-windows-x64.zip",
            "dictionary-companion-sources.zip", "dictionary-core.zip", "catalog.json",
            "resources.lock.json", "zhwiktionary.jsonl.gz", "INSTALL.md", "RELEASE-NOTES.md"}


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def audit(directory, tag, commit):
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if tag != "v" + version or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Tag, package version or source commit mismatch")
    expected = set(REQUIRED)
    auxiliary = {"SHA256SUMS.txt", "release-manifest.json"}
    split = (directory / "source-parts.json").exists()
    if split:
        source_meta = json.loads((directory / "source-parts.json").read_text(encoding="utf-8"))
        names = [part["name"] for part in source_meta["parts"]]
        assert 1 <= len(names) <= 99 and names == [f"zhwiktionary.jsonl.gz.part{i+1:02d}" for i in range(len(names))]
        expected.remove("zhwiktionary.jsonl.gz")
        expected.update(names + ["source-parts.json", "restore-dictionary-source.py"])
        auxiliary.add("zhwiktionary.jsonl.gz")  # Optional local original; never upload twice.
    actual = {file.name for file in directory.iterdir() if file.is_file()}
    if actual - auxiliary != expected:
        raise ValueError("Unexpected or missing release assets: " + repr((actual - auxiliary) ^ expected))
    for browser in ("chrome", "firefox"):
        with zipfile.ZipFile(directory / (browser + ".zip")) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            build = json.loads(archive.read("BUILD.json"))
            assert manifest["version"] == manifest.get("version_name") == version
            assert build == {"version": version, "commit": commit, "browser": browser}
            for name in ("LICENSE", "UPSTREAM.md", "PRIVACY"):
                assert archive.read(name) == (ROOT / name).read_bytes()
            assert not archive.testzip()
            assert all(not re.search(r"(^|/)(?:node_modules|\.git|\.env|settings\.json|native-host\.json|favorites\.sqlite3)(?:/|$)", name) for name in archive.namelist())
    for name, metadata in (("dictionary-companion-windows-x64.zip", "BUILD.json"), ("dictionary-companion-sources.zip", "SOURCE.json")):
        with zipfile.ZipFile(directory / name) as archive:
            info = json.loads(archive.read(metadata).decode("utf-8-sig"))
            assert info["version"] == version and info["commit"] == commit
            assert not archive.testzip()
            assert not any(re.search(r"favorites\.sqlite3|native-host\.json|settings\.json|__pycache__", path) for path in archive.namelist())
            if metadata == "SOURCE.json":
                for file in ("companion/LICENSE", "companion/obt_dictionary/favorites.py", "scripts/build-companion.ps1", "dependencies/pyinstaller-6.16.0.tar.gz"):
                    assert file in archive.namelist()
            else:
                for file in ("dictionary-companion/dictionary-companion.exe", "LICENSE", "THIRD_PARTY.md", "install.ps1", "uninstall.ps1"):
                    assert file in archive.namelist()
                assert info["runtime"] == "cpython", "Release must use official CPython, not an unreviewed distribution"
                licenses = "dictionary-companion/_internal/licenses/"
                for file in ("PYTHON-LICENSE.txt", "TCL-LICENSE.txt", "TK-LICENSE.txt", "OPENSSL-LICENSE.txt", "ZLIB-LICENSE.txt"):
                    assert licenses + file in archive.namelist()
    lock = json.loads((directory / "resources.lock.json").read_text(encoding="utf-8"))
    assert lock == json.loads((ROOT / "companion/resources.lock.json").read_text(encoding="utf-8"))
    if split:
        pinned = lock["zhwiktionary.jsonl.gz"]
        assert source_meta["target"] == "zhwiktionary.jsonl.gz" and source_meta["sha256"] == pinned["sha256"] and source_meta["bytes"] == pinned["bytes"]
        whole = hashlib.sha256(); total = 0
        for part in source_meta["parts"]:
            path = directory / part["name"]
            assert path.stat().st_size == part["bytes"] and sha(path) == part["sha256"]
            with path.open("rb") as stream:
                while block := stream.read(1024*1024): whole.update(block); total += len(block)
        assert total == pinned["bytes"] and whole.hexdigest() == pinned["sha256"]
    else:
        assert sha(directory / "zhwiktionary.jsonl.gz") == lock["zhwiktionary.jsonl.gz"]["sha256"]
    catalog = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))["components"][0]
    core = directory / "dictionary-core.zip"
    assert core.stat().st_size == catalog["downloadBytes"] and sha(core) == catalog["sha256"]
    with zipfile.ZipFile(core) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["counts"] == catalog["counts"] and manifest["revision"] == catalog["revision"]
        assert {item["name"]: {k:v for k,v in item.items() if k != "name"} for item in manifest["sources"]} == lock
        assert sum(item["bytes"] for item in manifest["files"]) == catalog["installedBytes"]
        assert set(archive.namelist()) == {item["path"] for item in manifest["files"]} | {"manifest.json"}
        assert {"ECDICT-LICENSE.txt", "WIKTIONARY-NOTICE.txt"}.issubset(archive.namelist())
        for item in manifest["files"]:
            assert archive.getinfo(item["path"]).file_size == item["bytes"]
            with archive.open(item["path"]) as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == item["sha256"]
    assets = [{"name":name, "bytes":(directory/name).stat().st_size, "sha256":sha(directory/name)} for name in sorted(expected)]
    (directory / "SHA256SUMS.txt").write_text("".join(f"{asset['sha256']}  {asset['name']}\n" for asset in assets), encoding="utf-8")
    (directory / "release-manifest.json").write_text(json.dumps({"version":version, "tag":tag, "commit":commit, "assets":assets}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"tag":tag,"commit":commit,"validatedAssets":len(assets),"bytes":sum(a["bytes"] for a in assets)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    commit = subprocess.check_output(["git","rev-parse","HEAD"], cwd=ROOT, text=True).strip()
    audit(args.directory.resolve(), args.tag, commit)
