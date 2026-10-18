"""Explicitly regroup an existing public release without moving tags or rebuilding code."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "Yvonson/immersive-translate"
API = "repos/" + REPOSITORY


def gh(*args, data=None):
    command = ["gh", *args]
    if data is not None:
        command += ["--input", "-"]
    return subprocess.check_output(command, input=json.dumps(data) if data is not None else None, text=True)


def api(path, method="GET", data=None):
    raw = gh("api", API + path, "--method", method, data=data)
    return json.loads(raw) if raw.strip() else None


def module(filename):
    spec = importlib.util.spec_from_file_location(filename.replace("-", "_"), ROOT / "scripts" / (filename + ".py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def reorganize(tag, commit):
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid tag or expected source commit")
    release = api("/releases/tags/" + tag)
    if release["draft"] or release["prerelease"] or release.get("immutable"):
        raise ValueError("Expected an editable, public stable release")
    if api("/commits/" + tag)["sha"] != commit:
        raise ValueError("Refusing to regroup another source commit")
    work = ROOT / ".local/release" / ("reorganize-" + tag)
    work.mkdir(parents=True, exist_ok=False)
    (work / "before.json").write_text(json.dumps(release, indent=2), encoding="utf-8")
    inputs = work / "original"
    inputs.mkdir()
    gh("release", "download", tag, "--repo", REPOSITORY, "--dir", str(inputs))
    # Audit against the original tagged commit; current HEAD only changes delivery.
    module("check-release").audit(inputs, tag, commit)
    downloads = work / "downloads"
    plan = module("package-release-downloads").package(inputs, downloads)
    expected = {entry["name"]: entry for entry in plan["assets"]}
    original_names = {asset["name"] for asset in release["assets"]}
    release_id = release["id"]

    def current():
        value = api("/releases/" + str(release_id))
        if value["tag_name"] != tag or value["draft"] or value.get("immutable"):
            raise ValueError("Release state changed; stop before writing")
        return value

    def verified(value):
        assets = {asset["name"]: asset for asset in value["assets"]}
        for name, entry in expected.items():
            remote = assets.get(name)
            if not remote or remote["size"] != entry["bytes"] or remote.get("digest") != "sha256:" + entry["sha256"]:
                raise ValueError("Remote archive not verified: " + name)

    # Keep every old runtime/source asset until both new archives are uploaded and hashed.
    for name in ("windows-full.zip", "developer-resources.zip", "chrome.zip", "SHA256SUMS.txt"):
        entry = expected[name]
        existing = [asset for asset in current()["assets"] if asset["name"] == name]
        if existing and existing[0]["size"] == entry["bytes"] and existing[0].get("digest") == "sha256:" + entry["sha256"]:
            continue
        if existing and name != "SHA256SUMS.txt":
            raise ValueError("Refusing to overwrite an existing runtime archive")
        if name == "SHA256SUMS.txt":
            # Both complete new archives must exist before replacing checksum metadata.
            remote_names = {asset["name"] for asset in current()["assets"]}
            if not {"windows-full.zip", "developer-resources.zip"}.issubset(remote_names):
                raise ValueError("New bundles are not uploaded")
        args = ["release", "upload", tag, str(downloads / name), "--repo", REPOSITORY]
        if existing:
            args.append("--clobber")
        gh(*args)
        assets = {asset["name"]: asset for asset in current()["assets"]}
        remote = assets[name]
        if remote["size"] != entry["bytes"] or remote.get("digest") != "sha256:" + entry["sha256"]:
            raise ValueError("Upload checksum mismatch: " + name)
    verified(current())
    # Recheck the tag immediately before cleanup. All original source bytes are in the developer archive.
    if api("/commits/" + tag)["sha"] != commit:
        raise ValueError("Tag changed during upload")
    value = current()
    if {asset["name"] for asset in value["assets"]} - original_names - expected.keys():
        raise ValueError("Concurrent assets appeared; leave everything for review")
    notes = (ROOT / "docs/releases" / (tag + ".md")).read_text(encoding="utf-8")
    api("/releases/" + str(release_id), "PATCH", {"body": notes, "make_latest": "true"})
    for asset in value["assets"]:
        if asset["name"] not in expected:
            verified(current())
            api("/releases/assets/" + str(asset["id"]), "DELETE")
    labels = {"chrome.zip": "网页与字幕：轻量扩展包", "windows-full.zip": "Windows 完整包：扩展＋词典＋词库",
              "developer-resources.zip": "开发者资料与对应源码（普通用户无需下载）", "SHA256SUMS.txt": "下载文件校验值（可选）"}
    for asset in current()["assets"]:
        api("/releases/assets/" + str(asset["id"]), "PATCH", {"label": labels[asset["name"]]})
    final = current()
    verified(final)
    if {asset["name"] for asset in final["assets"]} != set(expected):
        raise ValueError("Unexpected final download set")
    if api("/releases/latest")["id"] != release_id:
        raise ValueError("Stable latest changed")
    (work / "after.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
    print(json.dumps({"url": final["html_url"], "assets": len(final["assets"]), "commit": commit,
                      "verified": True, "tagUnchanged": True}))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text("Downloads regrouped and SHA-256 verified: " + final["html_url"], encoding="utf-8")


if __name__ == "__main__":
    reorganize(os.environ["RELEASE_TAG"], os.environ["RELEASE_SOURCE_COMMIT"])
