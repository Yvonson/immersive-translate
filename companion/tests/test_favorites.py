import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from obt_dictionary.favorites import Favorites, source_url
from obt_dictionary.engine import DictionaryError


def result(word="hello"):
    return {"entries": [{"headword": word, "source": "Fixture", "license": "MIT",
                         "sourceUrl": "https://example.org/dictionary", "senses": [{"zh": "你好"}],
                         "pronunciations": [{"ipa": "həˈləʊ", "accent": "en-GB"}]}]}


class FavoritesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Favorites(self.root)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def collect(self, word="hello", sentence="Hello, stranger."):
        return self.store.collect(word, result(word), {"sentence": sentence, "url": "https://user:pass@example.org/lesson?token=private#secret", "title": "Lesson"})["id"]

    def backup(self):
        start = self.store.export_start()
        return "".join(self.store.export_chunk(start["token"], i)["text"] for i in range(start["chunks"]))

    def restore(self, raw):
        token = self.store.import_start()["token"]
        for index, offset in enumerate(range(0, len(raw), 2000)):
            self.store.import_chunk(token, index, raw[offset:offset+2000])
        return self.store.import_commit(token)

    def test_duplicate_context_canonical_case_and_inflection(self):
        word_id = self.collect()
        first = self.store.get(word_id)["firstCollectedAt"]
        self.store.collect("Hello", result(), {"sentence": "A different hello."})
        self.collect()
        self.assertEqual(self.store.meta()["count"], 1)
        saved = self.store.get(word_id)
        self.assertEqual(saved["firstCollectedAt"], first)
        self.assertEqual(len(saved["contexts"]), 2)
        self.assertEqual(saved["contexts"][0]["url"] in ("", "https://example.org/lesson"), True)
        for word in ("US", "us", "take"):
            self.collect(word)
        self.store.collect("took", result("take"))
        self.assertEqual(self.store.meta()["count"], 5)
        self.assertNotEqual(self.store.state("US")["id"], self.store.state("us")["id"])

    def test_learning_does_not_move_collection_dates(self):
        word_id = self.collect()
        before = self.store.get(word_id)
        self.store.update(word_id, {"notes": "记住问候", "tags": ["课程", "日常"], "personalMeaning": "打招呼", "state": "learning"})
        self.store.review(word_id, "mastered")
        saved = self.store.get(word_id)
        self.assertEqual(saved["state"], "mastered")
        self.assertEqual(saved["reviewCount"], 1)
        self.assertEqual(saved["firstCollectedAt"], before["firstCollectedAt"])
        self.assertEqual(saved["lastCollectedAt"], before["lastCollectedAt"])
        self.assertIsNotNone(saved["lastReviewedAt"])

    def test_5000_paged_filters_stable_sort_and_search(self):
        # Bulk fixture avoids timing SQLite fsync 5,000 times; list still exercises real SQL.
        with self.store.db:
            self.store.db.executemany("INSERT INTO words(id,identity,word,snapshot,firstCollectedAt,lastCollectedAt) VALUES(?,?,?,?,?,?)", (
                (f"{i:032x}", f"word:w{i}", f"w{i}", json.dumps(result(f"w{i}")), "2026-10-17T16:00:00.000Z", "2026-10-18T16:00:00.000Z") for i in range(5000)))
        target = "0" * 32
        self.store.update(target, {"tags": ["课程"], "notes": "neural network", "state": "learning"})
        with self.store.db:
            self.store._context(target, {"sentence": "Visible original sentence", "url": "https://course.example.org/path"}, "2026-10-17T16:00:00.000Z")
        page1 = self.store.listing()
        page2 = self.store.listing(page=1)
        self.assertEqual(page1["total"], 5000)
        self.assertEqual(len(page1["items"]), 50)
        self.assertFalse(set(item["id"] for item in page1["items"]) & set(item["id"] for item in page2["items"]))
        filtered = self.store.listing({"tags": ["课程", "不存在"], "state": "learning", "domain": "course.example.org", "search": "neural", "from": "2026-10-17T16:00:00Z", "until": "2026-10-18T16:00:00Z"})
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(self.store.listing({"dateField": "last", "until": "2026-10-18T16:00:00Z"})["total"], 0)
        self.assertEqual(self.store.listing({"search": "Visible original"})["total"], 1)
        self.assertEqual(self.store.listing({"search": "%"})["total"], 0)
        self.assertEqual(self.store.listing({"search": "license"})["total"], 0)

    def test_backup_roundtrip_idempotence_preserve_existing_progress(self):
        word_id = self.collect()
        self.store.update(word_id, {"notes": "original notes", "tags": ["old"]})
        self.store.review(word_id, "mastered")
        backup = self.backup()
        self.store.remove(word_id)
        self.assertEqual(self.restore(backup), {"created": 1, "merged": 0})
        restored_id = self.store.state("hello")["id"]
        self.store.update(restored_id, {"notes": "new notes", "tags": ["new"]})
        self.store.review(restored_id, "unknown")
        self.restore(backup);self.restore(backup)
        saved = self.store.get(restored_id)
        self.assertEqual(saved["notes"], "new notes")
        self.assertEqual(saved["reviewCount"], 2)
        self.assertEqual(saved["state"], "learning")
        self.assertEqual(saved["tags"], ["new", "old"])
        self.assertEqual(len(saved["contexts"]), 1)
        self.assertNotIn("private", self.backup())

    def test_invalid_import_rolls_back_and_rejects_unknown_version(self):
        word_id = self.collect()
        before = self.backup()
        value = json.loads(before)
        bad = copy.deepcopy(value["words"][0]);bad["word"]="new-word";bad["identity"]="word:new-word"
        value["words"].append(bad);value["words"][0]["state"]="broken"
        with self.assertRaises(DictionaryError):self.restore(json.dumps(value))
        self.assertEqual(self.store.meta()["count"], 1)
        self.assertEqual(self.store.get(word_id)["state"], "new")
        value["schemaVersion"]=999
        with self.assertRaises(DictionaryError):self.restore(json.dumps(value))
        self.assertEqual(self.store.meta()["count"], 1)

    def test_concurrent_hosts_merge_atomic_and_reopen_without_packs(self):
        def save(_):
            store = Favorites(self.root)
            try:return store.collect("hello", result(), {"sentence": "same sentence"})
            finally:store.close()
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(save, range(12)))
        self.assertEqual(self.store.meta()["count"], 1)
        self.assertEqual(len(self.store.get(self.store.state("hello")["id"])["contexts"]), 1)
        other = Favorites(self.root)
        try:self.assertEqual(other.listing()["total"], 1)
        finally:other.close()

    def test_source_urls_and_context_limits(self):
        self.assertEqual(source_url("javascript:alert(1)"), "")
        self.assertEqual(source_url("https://user:pass@www.youtube.com/watch?v=abc_123&token=secret#x"), "https://www.youtube.com/watch?v=abc_123")
        word_id = self.collect()
        with self.assertRaises(DictionaryError):self.store.collect("hello", result(), {"sentence": "x"*2001})
        self.assertEqual(len(self.store.get(word_id)["contexts"]), 1)
        with self.assertRaises(DictionaryError):self.store.update(word_id, {"tags": ["x"*41]})
        with self.assertRaises(DictionaryError):self.store.update(word_id, {"firstCollectedAt": "changed"})

    def test_import_transaction_rolls_back_after_partial_merge(self):
        word_id = self.collect()
        with self.store.db:
            for i in range(199):
                self.store._context(word_id, {"sentence": f"Context {i}"}, "2026-10-18T00:00:00.000Z")
        data = json.loads(self.backup())
        existing = copy.deepcopy(data["words"][0])
        existing["contexts"] = [{"sentence": "One context too many", "collectedAt": "2026-10-18T00:00:00Z"}]
        new = copy.deepcopy(existing);new["word"]="new-word";new["identity"]="word:new-word"
        data["words"] = [new, existing]
        with self.assertRaises(DictionaryError):self.restore(json.dumps(data))
        self.assertEqual(self.store.meta()["count"], 1)
        self.assertEqual(len(self.store.get(word_id)["contexts"]), 200)

    def test_readonly_failure_does_not_acknowledge_or_change_data(self):
        self.collect()
        self.store.db.execute("PRAGMA query_only=ON")
        import sqlite3
        with self.assertRaises(sqlite3.OperationalError):self.collect("unwritable")
        self.assertEqual(self.store.meta()["count"], 1)


if __name__ == "__main__":
    unittest.main()
