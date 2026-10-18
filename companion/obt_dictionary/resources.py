"""Explicit online resource preparation. Imported only by the build/install CLI."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import time
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from .storage import atomic_json, digest

DOWNLOADS = {
    "ecdict.zip": ("https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip", None),
    "ecdict-license.txt": ("https://raw.githubusercontent.com/skywind3000/ECDICT/8defb76/LICENSE", None),
    "zhwiktionary.jsonl.gz": ("https://kaikki.org/zhwiktionary/raw-wiktextract-data.jsonl.gz", None),

}
USER_AGENT = "OpenBilingualTranslate/0.2.0 (offline dictionary resource builder; https://github.com/Yvonson/immersive-translate)"
_lock_path = Path(__file__).resolve().parents[1] / "resources.lock.json"
if _lock_path.exists():
    _locked = json.loads(_lock_path.read_text(encoding="utf-8"))
    DOWNLOADS = {name: (url, sha or (_locked.get(name, {}).get("sha256") if _locked.get(name, {}).get("url") == url else None)) for name, (url, sha) in DOWNLOADS.items()}


def downloader(direct=False, proxy=None):
    handlers = [urllib.request.ProxyHandler({} if direct else ({"https": proxy, "http": proxy} if proxy else None))]
    return urllib.request.build_opener(*handlers)


def download(url, target, opener, expected=None):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (not expected or digest(target) == expected):
        return
    partial = target.with_name(target.name + ".part")
    for attempt in range(4):
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"User-Agent": USER_AGENT}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        try:
            with opener.open(urllib.request.Request(url, headers=headers), timeout=60) as response:
                append = response.status == 206 and response.headers.get("Content-Range", "").startswith(f"bytes {offset}-")
                with partial.open("ab" if append else "wb") as stream:
                    shutil.copyfileobj(response, stream, length=1024 * 1024)
            if expected and digest(partial) != expected:
                partial.unlink()
                raise ValueError("下载校验失败: " + target.name)
            partial.replace(target)
            return
        except urllib.error.HTTPError as error:
            if error.code < 500 or attempt == 3:
                raise
            time.sleep(1 + attempt)
        except (OSError, urllib.error.URLError):
            if attempt == 3:
                raise
            time.sleep(1 + attempt)


def fetch(cache, direct=False, proxy=None):
    cache = Path(cache)
    opener = downloader(direct, proxy)
    # All network activity is confined to this explicit command.
    for name, (url, sha) in DOWNLOADS.items():
        print("下载/检查 " + name, flush=True)
        download(url, cache / name, opener, sha)
    atomic_json(cache / "sources.lock.json", {name: {"url": url, "sha256": digest(cache / name), "bytes": (cache / name).stat().st_size} for name, (url, _) in DOWNLOADS.items()})


def create_details(path):
    db = sqlite3.connect(path)
    db.executescript("CREATE TABLE entries(word TEXT, data TEXT); CREATE INDEX entry_word ON entries(word COLLATE NOCASE); CREATE TABLE forms(form TEXT, lemma TEXT); CREATE INDEX form_word ON forms(form COLLATE NOCASE);")
    return db


def sound_accent(sound):
    tags = set(sound.get("tags", [])) | set(sound.get("raw_tags", []))
    label = " | ".join(unicodedata.normalize("NFKC", tag) for tag in tags)
    american = bool(re.search(r"美式|美國|美国|美音|\bUS\b|American", label, re.I))
    british = bool(re.search(r"英式|英國|英国|英音|\bUK\b|\bRP\b|British|Received.Pr[oə]nunciation|Southern.England", label, re.I))
    if american and british:
        return "unknown"
    if american:
        return "en-US"
    if british:
        return "en-GB"
    return "unknown"


def convert_wiki(entry):
    word = entry["word"]
    page = "https://zh.wiktionary.org/wiki/" + urllib.parse.quote(word, safe="")
    return {"id": "wiki:" + hashlib.sha256(json.dumps(entry, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24],
            "headword": word, "source": "维基词典 · 中文", "sourceUrl": page, "license": "CC BY-SA / GFDL（词库原许可）",
            "pos": entry.get("pos", ""), "senses": [{"zh": "；".join(sense.get("glosses", [])), "labels": sense.get("tags", []) + sense.get("raw_tags", []),
              "examples": [{"text": item.get("text", ""), "translation": item.get("translation", "")} for item in sense.get("examples", [])[:8]]} for sense in entry.get("senses", [])[:100]],
            "pronunciations": [{"ipa": sound["ipa"], "accent": sound_accent(sound), "note": " / ".join(sound.get("tags", []) + sound.get("raw_tags", []))} for sound in entry.get("sounds", []) if sound.get("ipa")][:30],
            "etymology": "\n".join(entry.get("etymology_texts", [])),
            "related": [{"word": item.get("word", ""), "sense": item.get("sense", "")} for item in entry.get("synonyms", []) + entry.get("antonyms", [])][:30]}


def build_core(cache, directory):
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "ecdict.db"
    # Never reuse an unrelated database left in the build directory.
    with zipfile.ZipFile(cache / "ecdict.zip") as archive:
        candidates = [name for name in archive.namelist() if name.endswith((".db", ".sqlite"))]
        if len(candidates) != 1:
            raise ValueError("Unexpected ECDICT archive layout")
        with archive.open(candidates[0]) as incoming, target.open("wb") as output:
            shutil.copyfileobj(incoming, output)
    core = sqlite3.connect(target)
    # Release 1.0.28 already contains the sd_1 NOCASE word index.
    core.commit()
    # The dictionary supplies irregular forms; do not guess English morphology.
    details = directory / "details.db"
    if details.exists():
        details.unlink()
    db = create_details(details)
    forms = []
    for word, exchange in core.execute("SELECT word,exchange FROM stardict WHERE exchange IS NOT NULL AND exchange != ''"):
        for part in exchange.split("/"):
            if ":" not in part:
                continue
            kind, value = part.split(":", 1)
            if kind in ("p", "d", "i", "3", "r", "t", "s"):
                forms += [(form, word) for form in value.split(",") if form and form != word]
            elif kind == "0" and value != word:
                forms.append((word, value))
        if len(forms) >= 10000:
            db.executemany("INSERT INTO forms VALUES (?,?)", forms)
            forms.clear()
    db.executemany("INSERT INTO forms VALUES (?,?)", forms)
    count = 0
    with gzip.open(cache / "zhwiktionary.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            entry = json.loads(line)
            if entry.get("lang_code") != "en" or not entry.get("word"):
                continue
            result = convert_wiki(entry)
            db.execute("INSERT INTO entries VALUES (?,?)", (entry["word"], json.dumps(result, ensure_ascii=False)))
            for form in entry.get("forms", []):
                if form.get("form"):
                    db.execute("INSERT INTO forms VALUES (?,?)", (form["form"], entry["word"]))
            count += 1
    db.commit()
    db.close()
    total = core.execute("SELECT count(*) FROM stardict").fetchone()[0]
    core.close()
    shutil.copyfile(cache / "ecdict-license.txt", directory / "ECDICT-LICENSE.txt")
    (directory / "WIKTIONARY-NOTICE.txt").write_text("Chinese Wiktionary via Kaikki / Wiktextract. English entries, original Chinese glosses.\nhttps://kaikki.org/zhwiktionary/rawdata.html\nText: https://creativecommons.org/licenses/by-sa/4.0/ and https://www.gnu.org/licenses/fdl-1.3.html\nPer-entry source URL retained. Changes: structured extraction, filtering, SQLite indexing.\n", encoding="utf-8")
    return {"ecdictEntries": total, "wiktionaryEntries": count}


def pack(directory, target, component, counts, sources):
    files = [{"path": path.relative_to(directory).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)} for path in sorted(directory.rglob("*")) if path.is_file() and path.name != "manifest.json"]
    manifest = {"schema": 1, "component": component, "revision": time.strftime("%Y%m%d") + "-" + digest_file_list(files)[:12], "counts": counts, "sources": sources, "files": files}
    atomic_json(directory / "manifest.json", manifest)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as archive:
        for item in files + [{"path": "manifest.json"}]:
            archive.write(directory / item["path"], item["path"])
    return manifest


def digest_file_list(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


def verify_sources(cache):
    sources = {}
    for name, (url, sha) in DOWNLOADS.items():
        path = Path(cache) / name
        if not sha or digest(path) != sha:
            raise ValueError("原始词库未锁定或校验失败: " + name)
        sources[name] = {"url": url, "sha256": sha, "bytes": path.stat().st_size}
    return sources


def build(cache, output):
    cache, output = Path(cache), Path(output)
    sources = verify_sources(cache)
    work = cache.parent / "work"
    counts = build_core(cache, work / "core")
    manifest = pack(work / "core", output / "dictionary-core.zip", "core", counts,
                    [{"name": key, **value} for key, value in sources.items()])
    target = output / "dictionary-core.zip"
    atomic_json(output / "catalog.json", {"schema": 1, "components": [{"component": "core", "filename": target.name,
        "downloadBytes": target.stat().st_size, "sha256": digest(target),
        "installedBytes": sum(item["bytes"] for item in manifest["files"]), "revision": manifest["revision"], "counts": counts}]})
