"""Personal vocabulary, independent of replaceable dictionary packs. No network IO."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import uuid
from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode

from .engine import DictionaryError, normalize
from .storage import default_data_dir

STATES = ("new", "learning", "mastered")
MAX_BACKUP = 128 * 1024 * 1024


def user_data_dir():
    return default_data_dir().parent / "UserData"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def text(value, limit, name="内容"):
    if not isinstance(value, str) or len(value) > limit or any(ord(char) < 32 and char not in "\n\r\t" for char in value):
        raise DictionaryError("INVALID_FAVORITE", name + "格式无效或过长。")
    return value.strip()


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not parsed.tzinfo:
            raise ValueError()
        return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, TypeError, AttributeError):
        raise DictionaryError("INVALID_FAVORITE", "备份中的时间格式无效。") from None


def source_url(value):
    """Keep origin/path only; query/fragment can contain tokens or private search terms."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return ""
        hostname = parsed.hostname
        if ":" in hostname:
            hostname = "[" + hostname + "]"
        port = ":" + str(parsed.port) if parsed.port else ""
        query = ""
        if hostname in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            video = parse_qs(parsed.query).get("v", [""])[0]
            if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", video):
                query = urlencode({"v": video})
        return urlunsplit((parsed.scheme, hostname + port, parsed.path, query, ""))[:2048]
    except (ValueError, TypeError):
        return ""


def context_data(value):
    if not isinstance(value, dict):
        raise DictionaryError("INVALID_FAVORITE", "上下文格式无效。")
    return {"sentence": text(value.get("sentence", ""), 2000),
            "title": text(value.get("title", ""), 500),
            "url": source_url(text(value.get("url", ""), 4096))}


def tags_data(value):
    if not isinstance(value, list) or len(value) > 30:
        raise DictionaryError("INVALID_FAVORITE", "最多保存 30 个标签。")
    return sorted(set(filter(None, (text(tag, 40, "标签") for tag in value))))


def snapshot_data(result, word, strict=False):
    """Allow only dictionary text fields, with bounded size; never raw HTML or secrets."""
    def bounded(value, limit):
        return text(value if strict or not isinstance(value, str) else value[:limit], limit)
    def clean(entry):
        result = {key: bounded(entry.get(key, ""), limit) for key, limit in
                  (("headword", 120), ("source", 300), ("license", 500), ("english", 4000), ("etymology", 2000))}
        result["sourceUrl"] = source_url(entry.get("sourceUrl", ""))
        result["senses"] = []
        for sense in entry.get("senses", [])[:12]:
            item = {"zh": bounded(sense.get("zh", ""), 2000)}
            item["examples"] = [{"text": bounded(example.get("text", ""), 1000),
                                 "translation": bounded(example.get("translation", ""), 1000)}
                                for example in sense.get("examples", [])[:2]]
            result["senses"].append(item)
        result["pronunciations"] = [{"ipa": bounded(sound.get("ipa", ""), 200),
                                      "accent": sound.get("accent") if sound.get("accent") in ("en-US", "en-GB") else "unknown",
                                      "note": bounded(sound.get("note", ""), 300)}
                                     for sound in entry.get("pronunciations", [])[:10]]
        return result
    entries = []
    truncated = bool(result.get("truncated")) or len(result.get("entries", [])) > 4
    for entry in result.get("entries", [])[:4]:
        candidate = clean(entry)
        truncated = truncated or len(entry.get("senses", [])) > 12
        while len(json.dumps(candidate, ensure_ascii=False).encode("utf-8")) > 35000 and len(candidate["senses"]) > 1:
            candidate["senses"].pop()
            truncated = True
        if len(json.dumps(entries + [candidate], ensure_ascii=False).encode("utf-8")) > 40000:
            truncated = True
            break
        entries.append(candidate)
    return {"query": word, "entries": entries, "lemmas": [], "suggestions": [], "truncated": truncated}


class Favorites:
    def __init__(self, root=None):
        directory = Path(root) if root is not None else user_data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(directory / "favorites.sqlite3", timeout=5)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        if self.db.execute("PRAGMA user_version").fetchone()[0] not in (0, 1):
            self.db.close()
            raise DictionaryError("FAVORITES_VERSION", "生词本由更新版本创建，请更新组件；不要删除数据文件。")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS words(
              id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, word TEXT NOT NULL,
              snapshot TEXT NOT NULL, personalMeaning TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
              state TEXT NOT NULL DEFAULT 'new', firstCollectedAt TEXT NOT NULL, lastCollectedAt TEXT NOT NULL,
              reviewCount INTEGER NOT NULL DEFAULT 0, lastReviewedAt TEXT, lastOutcome TEXT);
            CREATE INDEX IF NOT EXISTS words_first ON words(firstCollectedAt, id);
            CREATE INDEX IF NOT EXISTS words_last ON words(lastCollectedAt, id);
            CREATE TABLE IF NOT EXISTS contexts(
              wordId TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE, hash TEXT NOT NULL,
              sentence TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, domain TEXT NOT NULL,
              collectedAt TEXT NOT NULL, PRIMARY KEY(wordId, hash));
            CREATE TABLE IF NOT EXISTS tags(
              wordId TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE, tag TEXT NOT NULL,
              PRIMARY KEY(wordId, tag));
            CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag, wordId);
            CREATE INDEX IF NOT EXISTS contexts_domain ON contexts(domain, wordId);
            PRAGMA user_version=1;
        """)
        self.transfers = {}

    def close(self):
        self.db.close()

    def _context(self, word_id, value, collected):
        value = context_data(value)
        if not any(value.values()):
            return
        # More than 200 distinct contexts is uncommon; fail explicitly rather than silently lose data.
        fingerprint = hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        if self.db.execute("SELECT count(*) FROM contexts WHERE wordId=?", (word_id,)).fetchone()[0] >= 200:
            if not self.db.execute("SELECT 1 FROM contexts WHERE wordId=? AND hash=?", (word_id, fingerprint)).fetchone():
                raise DictionaryError("CONTEXT_LIMIT", "该词已保存 200 条上下文，请先整理或备份。")
        self.db.execute("INSERT OR IGNORE INTO contexts VALUES(?,?,?,?,?,?,?)", (
            word_id, fingerprint, value["sentence"], value["title"], value["url"], urlsplit(value["url"]).hostname or "", collected))
        contexts = [dict(row) for row in self.db.execute("SELECT sentence,title,url,collectedAt FROM contexts WHERE wordId=?", (word_id,))]
        if len(json.dumps(contexts, ensure_ascii=False).encode("utf-8")) > 500000:
            raise DictionaryError("CONTEXT_LIMIT", "该词的上下文容量已满，请先整理或备份。")

    def collect(self, query, result, context=None):
        query = normalize(query)
        matches = [entry for entry in result.get("entries", []) if entry.get("headword", "").casefold() == query.casefold()]
        canonical = next((entry["headword"] for entry in matches if entry["headword"] == query), matches[0]["headword"] if matches else query)
        # An inflected query remains distinct from the lemma returned by lookup.
        identity = "word:" + canonical
        snapshot = snapshot_data(result, canonical)
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            collected = now()
            row = self.db.execute("SELECT id FROM words WHERE identity=?", (identity,)).fetchone()
            word_id = row[0] if row else uuid.uuid4().hex
            if row:
                self.db.execute("UPDATE words SET lastCollectedAt=? WHERE id=?", (collected, word_id))
            else:
                self.db.execute("INSERT INTO words(id,identity,word,snapshot,firstCollectedAt,lastCollectedAt) VALUES(?,?,?,?,?,?)",
                                (word_id, identity, canonical, json.dumps(snapshot, ensure_ascii=False), collected, collected))
            if context is not None:
                self._context(word_id, context, collected)
        return {"id": word_id, "word": canonical, "saved": True, "created": not bool(row)}

    def state(self, query):
        query = normalize(query)
        row = self.db.execute("SELECT id,word FROM words WHERE identity=?", ("word:" + query,)).fetchone()
        return {"saved": bool(row), **(dict(row) if row else {})}

    def get(self, word_id):
        row = self.db.execute("SELECT * FROM words WHERE id=?", (text(word_id, 80),)).fetchone()
        if not row:
            raise DictionaryError("FAVORITE_MISSING", "这个词已被删除，请刷新列表。")
        result = dict(row)
        result["snapshot"] = json.loads(result["snapshot"])
        result["contexts"] = [dict(item) for item in self.db.execute(
            "SELECT sentence,title,url,collectedAt FROM contexts WHERE wordId=? ORDER BY collectedAt DESC,hash", (word_id,))]
        result["tags"] = [item[0] for item in self.db.execute("SELECT tag FROM tags WHERE wordId=? ORDER BY tag", (word_id,))]
        return result

    def update(self, word_id, changes):
        if not isinstance(changes, dict) or set(changes) - {"personalMeaning", "notes", "tags", "state"}:
            raise DictionaryError("INVALID_FAVORITE", "不支持的编辑字段。")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            self.get(word_id)
            for key in ("personalMeaning", "notes", "state"):
                if key not in changes:
                    continue
                value = text(changes[key], 10000 if key == "notes" else 2000)
                if key == "state" and value not in STATES:
                    raise DictionaryError("INVALID_FAVORITE", "学习状态无效。")
                self.db.execute("UPDATE words SET " + key + "=? WHERE id=?", (value, word_id))
            if "tags" in changes:
                tags = tags_data(changes["tags"])
                self.db.execute("DELETE FROM tags WHERE wordId=?", (word_id,))
                self.db.executemany("INSERT INTO tags VALUES(?,?)", ((word_id, tag) for tag in tags))
        return self.get(word_id)

    def remove(self, word_id):
        with self.db:
            self.db.execute("DELETE FROM words WHERE id=?", (text(word_id, 80),))
        return {"removed": True}

    def review(self, word_id, outcome):
        if outcome not in ("unknown", "familiar", "mastered"):
            raise DictionaryError("INVALID_FAVORITE", "复习结果无效。")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            self.get(word_id)
            self.db.execute("UPDATE words SET state=?,reviewCount=reviewCount+1,lastReviewedAt=?,lastOutcome=? WHERE id=?",
                            ("mastered" if outcome == "mastered" else "learning", now(), outcome, word_id))
        return {"reviewed": True}

    def _where(self, filters):
        if not isinstance(filters, dict):
            raise DictionaryError("INVALID_FAVORITE", "筛选条件无效。")
        clauses, args = [], []
        state = filters.get("state", "")
        if state:
            if state not in STATES:
                raise DictionaryError("INVALID_FAVORITE", "学习状态无效。")
            clauses.append("w.state=?"); args.append(state)
        if filters.get("excludeMastered"):
            clauses.append("w.state!='mastered'")
        field = "lastCollectedAt" if filters.get("dateField") == "last" else "firstCollectedAt"
        for key, op in (("from", ">="), ("until", "<")):
            if filters.get(key):
                clauses.append("w." + field + op + "?"); args.append(timestamp(filters[key]))
        tags = tags_data(filters.get("tags", []))
        if tags:
            clauses.append("EXISTS(SELECT 1 FROM tags t WHERE t.wordId=w.id AND t.tag IN (" + ",".join("?" for _ in tags) + "))"); args.extend(tags)
        if filters.get("domain"):
            clauses.append("EXISTS(SELECT 1 FROM contexts c WHERE c.wordId=w.id AND c.domain=?)"); args.append(text(filters["domain"], 253))
        search = text(filters.get("search", ""), 200)
        if search:
            pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            clauses.append("(w.word LIKE ? ESCAPE '\\' OR w.personalMeaning LIKE ? ESCAPE '\\' OR w.notes LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(w.snapshot,'$.entries') e WHERE json_extract(e.value,'$.english') LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(e.value,'$.senses') s WHERE json_extract(s.value,'$.zh') LIKE ? ESCAPE '\\')) OR EXISTS(SELECT 1 FROM contexts c WHERE c.wordId=w.id AND (c.sentence LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\')))")
            args.extend([pattern] * 7)
        order = "ASC" if filters.get("direction") == "asc" else "DESC"
        return (" WHERE " + " AND ".join(clauses) if clauses else ""), args, " ORDER BY w." + field + " " + order + ",w.id " + order

    def listing(self, filters=None, page=0, ids=False):
        where, args, order = self._where(filters or {})
        if ids:
            return {"ids": [row[0] for row in self.db.execute("SELECT w.id FROM words w" + where + order, args)]}
        if not isinstance(page, int) or not 0 <= page <= 1000000:
            raise DictionaryError("INVALID_FAVORITE", "页码无效。")
        # One read transaction keeps count and page consistent with another native host writing.
        with self.db:
            self.db.execute("BEGIN")
            total = self.db.execute("SELECT count(*) FROM words w" + where, args).fetchone()[0]
            rows = self.db.execute("SELECT w.id,w.word,w.state,w.personalMeaning,w.snapshot,w.firstCollectedAt,w.lastCollectedAt FROM words w" + where + order + " LIMIT 50 OFFSET ?", args + [page * 50]).fetchall()
            items = []
            for row in rows:
                item = dict(row)
                snapshot = json.loads(item.pop("snapshot"))
                item["meaning"] = item["personalMeaning"] or "；".join(sense.get("zh", "") for entry in snapshot["entries"] for sense in entry.get("senses", [])[:2])[:200]
                item["tags"] = [tag[0] for tag in self.db.execute("SELECT tag FROM tags WHERE wordId=? ORDER BY tag", (item["id"],))]
                items.append(item)
        return {"items": items, "total": total, "page": page, "pageSize": 50}

    def meta(self):
        return {"count": self.db.execute("SELECT count(*) FROM words").fetchone()[0],
                "tags": [row[0] for row in self.db.execute("SELECT DISTINCT tag FROM tags ORDER BY tag")],
                "domains": [row[0] for row in self.db.execute("SELECT DISTINCT domain FROM contexts WHERE domain!='' ORDER BY domain")]}

    def export_start(self):
        with self.db:
            self.db.execute("BEGIN")
            records = [self.get(row[0]) for row in self.db.execute("SELECT id FROM words ORDER BY firstCollectedAt,id").fetchall()]
        data = json.dumps({"format": "open-bilingual-favorites", "schemaVersion": 1, "exportedAt": now(), "words": records}, ensure_ascii=False, separators=(",", ":"))
        if len(data.encode("utf-8")) > MAX_BACKUP:
            raise DictionaryError("BACKUP_TOO_LARGE", "备份超过 128 MiB，请分开管理收藏。")
        self.transfers.clear()
        token = uuid.uuid4().hex
        self.transfers[token] = data
        return {"token": token, "chunks": (len(data) + 59999) // 60000}

    def export_chunk(self, token, index):
        data = self.transfers.get(token)
        if not isinstance(data, str) or not isinstance(index, int) or index < 0:
            raise DictionaryError("TRANSFER_EXPIRED", "备份会话失效，请重新导出。")
        return {"text": data[index * 60000:(index + 1) * 60000]}

    def import_start(self):
        self.transfers.clear()
        token = uuid.uuid4().hex
        self.transfers[token] = {"parts": [], "bytes": 0}
        return {"token": token}

    def import_chunk(self, token, index, part):
        transfer = self.transfers.get(token)
        part = text(part, 4000, "备份分片") if not isinstance(part, str) else part
        if not isinstance(transfer, dict) or index != len(transfer["parts"]) or len(part) > 4000:
            raise DictionaryError("TRANSFER_EXPIRED", "备份分片顺序错误，请重新导入。")
        transfer["bytes"] += len(part.encode("utf-8"))
        if transfer["bytes"] > MAX_BACKUP:
            self.transfers.pop(token, None)
            raise DictionaryError("BACKUP_TOO_LARGE", "备份不能超过 128 MiB。")
        transfer["parts"].append(part)
        return {"received": index + 1}

    def import_commit(self, token):
        transfer = self.transfers.pop(token, None)
        try:
            data = json.loads("".join(transfer["parts"]))
            if data.get("format") != "open-bilingual-favorites" or data.get("schemaVersion") != 1 or not isinstance(data.get("words"), list):
                raise ValueError()
            records = [self._validate_record(row) for row in data["words"]]
        except (ValueError, TypeError, KeyError, AttributeError):
            raise DictionaryError("INVALID_BACKUP", "不是有效的生词本 JSON v1 备份。原数据未改动。") from None
        created = merged = 0
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            for row in records:
                existing = self.db.execute("SELECT id FROM words WHERE identity=?", (row["identity"],)).fetchone()
                word_id = existing[0] if existing else uuid.uuid4().hex
                if existing:
                    merged += 1
                    # Keep existing notes, snapshot, status and review progress. Collection range is merged.
                    self.db.execute("UPDATE words SET firstCollectedAt=min(firstCollectedAt,?),lastCollectedAt=max(lastCollectedAt,?) WHERE id=?", (row["firstCollectedAt"], row["lastCollectedAt"], word_id))
                else:
                    created += 1
                    fields = ("identity", "word", "personalMeaning", "notes", "state", "firstCollectedAt", "lastCollectedAt", "reviewCount", "lastReviewedAt", "lastOutcome")
                    self.db.execute("INSERT INTO words(id,snapshot," + ",".join(fields) + ") VALUES(" + ",".join("?" for _ in range(12)) + ")", [word_id, json.dumps(row["snapshot"], ensure_ascii=False)] + [row[key] for key in fields])
                self.db.executemany("INSERT OR IGNORE INTO tags VALUES(?,?)", ((word_id, tag) for tag in row["tags"]))
                for context in row["contexts"]:
                    self._context(word_id, context, context["collectedAt"])
        return {"created": created, "merged": merged}

    def _validate_record(self, row):
        if not isinstance(row, dict):
            raise ValueError()
        word = normalize(row["word"])
        if row["identity"] != "word:" + word or row["state"] not in STATES or type(row["reviewCount"]) is not int or not 0 <= row["reviewCount"] < 2**31:
            raise ValueError()
        if row.get("lastOutcome") not in (None, "unknown", "familiar", "mastered"):
            raise ValueError()
        result = {"identity": row["identity"], "word": word, "snapshot": snapshot_data(row["snapshot"], word, strict=True),
                  "personalMeaning": text(row["personalMeaning"], 2000), "notes": text(row["notes"], 10000),
                  "tags": tags_data(row["tags"]), "state": row["state"],
                  "firstCollectedAt": timestamp(row["firstCollectedAt"]), "lastCollectedAt": timestamp(row["lastCollectedAt"]),
                  "reviewCount": row["reviewCount"], "lastReviewedAt": timestamp(row["lastReviewedAt"]) if row.get("lastReviewedAt") else None,
                  "lastOutcome": row.get("lastOutcome"), "contexts": []}
        if result["firstCollectedAt"] > result["lastCollectedAt"] or not isinstance(row["contexts"], list) or len(row["contexts"]) > 200:
            raise ValueError()
        for context in row["contexts"]:
            result["contexts"].append({**context_data(context), "collectedAt": timestamp(context["collectedAt"])})
        return result
