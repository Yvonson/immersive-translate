"""Read-only SQLite lookup. Never imports a network client."""
import difflib
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

from .storage import active_packs



class DictionaryError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def normalize(text):
    if not isinstance(text, str):
        raise DictionaryError("INVALID_QUERY", "请选择英文单词或短语。")
    text = " ".join(unicodedata.normalize("NFKC", text).split()).strip("\"“”‘’.,;:!?()[]{}")
    text = re.sub(r"(?<=\w)[‘’](?=\w)", "'", text)
    if not text or len(text) > 120 or len(text.split()) > 8 or any(unicodedata.category(c).startswith("C") for c in text):
        raise DictionaryError("INVALID_QUERY", "请选择不超过 120 个字符、8 个词的单词或短语。")
    return text


def connect(path):
    if not path.is_file():
        raise DictionaryError("RESOURCE_MISSING", "词库文件缺失，请在本地词典设置中修复资源。")
    db = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    return db


class Dictionary:
    def __init__(self, root):
        self.root = Path(root)
        self.packs = active_packs(root)
        self.core = None
        self.extra = None
        if "core" in self.packs:
            directory = self.packs["core"][0]
            self.core = connect(directory / "ecdict.db")
            self.extra = connect(directory / "details.db")

    def close(self):
        for db in (self.core, self.extra):
            if db:
                db.close()

    def status(self):
        return {"ready": bool(self.core), "resources": [
            {"component": component, "revision": manifest["revision"],
             "bytes": sum(item["bytes"] for item in manifest["files"]),
             "counts": manifest.get("counts", {}), "sources": manifest.get("sources", [])}
            for component, (_, manifest) in self.packs.items()], "offline": True}

    def ecdict_entry(self, row):
        exchange = {}
        for pair in (row["exchange"] or "").split("/"):
            if ":" in pair:
                key, value = pair.split(":", 1)
                exchange[key] = value
        return {"id": "ecdict:" + str(row["id"]), "headword": row["word"], "source": "ECDICT 1.0.28",
                "sourceUrl": "https://github.com/skywind3000/ECDICT", "license": "MIT（上游项目声明）",
                "senses": [{"zh": line} for line in (row["translation"] or "").splitlines() if line],
                "english": row["definition"] or "", "forms": exchange,
                "tags": (row["tag"] or "").split(), "pronunciations": [
                    {"ipa": row["phonetic"], "accent": "unknown", "note": "上游音标以英音为主，未逐词标注口音"}
                ] if row["phonetic"] else []}

    def lookup(self, text):
        query = normalize(text)
        if not self.core:
            raise DictionaryError("RESOURCE_MISSING", "尚未安装词库，请先安装本地词典资源。")
        rows = self.core.execute("SELECT * FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 12", (query,)).fetchall()
        # Prefer exact casing without discarding legitimate case variants (US/us).
        rows = sorted(rows, key=lambda row: row["word"] != query)
        lemmas = []
        for row in rows:
            if row["exchange"]:
                lemmas += re.findall(r"(?:^|/)0:([^/]+)", row["exchange"])
        if not rows:
            lemmas += [row[0] for row in self.extra.execute("SELECT lemma FROM forms WHERE form = ? COLLATE NOCASE LIMIT 8", (query,))]
        found = {row["word"] for row in rows}
        for lemma in dict.fromkeys(lemmas):
            if lemma not in found:
                rows += self.core.execute("SELECT * FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 2", (lemma,)).fetchall()
                found.add(lemma)
        entries = [self.ecdict_entry(row) for row in rows]
        keys = list(dict.fromkeys([query] + lemmas))[:10]
        for word in keys:
            entries += [json.loads(row[0]) for row in self.extra.execute("SELECT data FROM entries WHERE word = ? COLLATE NOCASE LIMIT 12", (word,))]
        # ECDICT itself lowercases some abbreviations; exact-case supplemental
        # entries must come first across all sources, not just within ECDICT.
        entries.sort(key=lambda entry: entry["headword"] != query)
        for entry in entries:
            for sound in entry.get("pronunciations", []):
                if entry.get("pos"):
                    sound["note"] = entry["pos"] + " · " + sound.get("note", "")
                sound["id"] = hashlib.sha256(json.dumps([entry["id"],sound.get("accent"),sound.get("ipa"),sound.get("note")],ensure_ascii=False).encode()).hexdigest()
        suggestions = []
        if not entries:
            prefix = query[:2]
            candidates = [row[0] for row in self.core.execute("SELECT word FROM stardict WHERE word >= ? COLLATE NOCASE AND word < ? COLLATE NOCASE AND length(word) BETWEEN ? AND ? AND bnc > 0 ORDER BY bnc LIMIT 500", (prefix, prefix + "\uffff", max(1,len(query)-2),len(query)+2))]
            suggestions = difflib.get_close_matches(query.lower(), candidates, n=6, cutoff=.65)
            if not suggestions:
                suggestions = [row[0] for row in self.core.execute("SELECT word FROM stardict WHERE word >= ? COLLATE NOCASE AND word < ? COLLATE NOCASE ORDER BY word COLLATE NOCASE LIMIT 6", (query[:3], query[:3] + "\uffff"))]
        return {"query": query, "lemmas": list(dict.fromkeys(lemmas)), "entries": entries[:36],
                "suggestions": suggestions}
