import io
import gzip
import json
from pathlib import Path
import sqlite3
import struct
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from obt_dictionary.engine import Dictionary, DictionaryError, normalize
from obt_dictionary.host import read_message, write_message
from obt_dictionary.resources import build, convert_wiki, pack, sound_accent, verify_sources
from obt_dictionary.storage import active_packs, digest, install_pack, verify_packs


def fixture(directory):
    directory.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(directory / "ecdict.db")
    db.execute("CREATE TABLE stardict(id INTEGER,word TEXT,phonetic TEXT,definition TEXT,translation TEXT,exchange TEXT,tag TEXT,bnc INTEGER)")
    rows = [(1,"hello","həˈləʊ","a greeting","你好；喂","","cet4",100), (2,"take","teɪk","to obtain","拿；取","p:took/d:taken","",200), (3,"US","","United States","美国","","",1), (4,"us","ʌs","we as object","我们","","",2)]
    db.executemany("INSERT INTO stardict VALUES (?,?,?,?,?,?,?,?)", rows)
    db.commit()
    db.close()
    db = sqlite3.connect(directory / "details.db")
    db.executescript("CREATE TABLE entries(word TEXT,data TEXT);CREATE TABLE forms(form TEXT,lemma TEXT);")
    db.execute("INSERT INTO forms VALUES ('took','take')")
    entry=convert_wiki({"word":"hello","pos":"intj","senses":[{"glosses":["问候语"],"examples":[{"text":"Hello, Sam!","translation":"你好，山姆！"}]}]})
    db.execute("INSERT INTO entries VALUES (?,?)", ("hello",json.dumps(entry)))
    db.commit()
    db.close()


class DictionaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.root=Path(self.temporary.name)
        fixture(self.root / "source")
        self.archive=self.root / "core.zip"
        pack(self.root / "source", self.archive,"core",{"ecdictEntries":4},[])
        install_pack(self.archive,self.root / "installed")
        self.engine=Dictionary(self.root / "installed")

    def tearDown(self):
        self.engine.close()
        self.temporary.cleanup()

    def test_offline_lookup_exact_case_details_and_morphology(self):
        import socket
        from unittest.mock import patch
        with patch.object(socket,"socket",side_effect=AssertionError("Network is forbidden")):
            result=self.engine.lookup("hello")
            self.assertEqual(len(result["entries"]),2)
            self.assertEqual(result["entries"][1]["senses"][0]["examples"][0]["translation"],"你好，山姆！")
            self.assertEqual(self.engine.lookup("took")["entries"][0]["headword"],"take")
            self.assertEqual(self.engine.lookup("US")["entries"][0]["headword"],"US")
            self.assertEqual(self.engine.lookup("us")["entries"][0]["headword"],"us")
            self.assertEqual(self.engine.lookup("doesnotexist")["entries"],[])
            self.assertIn("hello",self.engine.lookup("hellp")["suggestions"])
            self.assertTrue(self.engine.status()["offline"])

    def test_selection_limits_and_unicode(self):
        self.assertEqual(normalize("  hello\nworld  "),"hello world")
        for value in ["", "a"*121,"one "*9,"foo\x00bar",None]:
            with self.assertRaises(DictionaryError):normalize(value)

    def test_atomic_install_rejects_corruption_and_traversal(self):
        before=(self.root / "installed/active.json").read_bytes()
        with zipfile.ZipFile(self.archive) as source:
            manifest=json.loads(source.read("manifest.json"))
            files={name:source.read(name) for name in source.namelist()}
        manifest["files"][0]["sha256"]="0"*64
        files["manifest.json"]=json.dumps(manifest).encode()
        corrupt=self.root / "corrupt.zip"
        with zipfile.ZipFile(corrupt,"w") as output:
            for name,data in files.items():output.writestr(name,data)
        with self.assertRaises(ValueError):install_pack(corrupt,self.root / "installed")
        self.assertEqual(before,(self.root / "installed/active.json").read_bytes())
        manifest["files"][0]["path"]="../escape"
        files["manifest.json"]=json.dumps(manifest).encode()
        with zipfile.ZipFile(corrupt,"w") as output:
            for name,data in files.items():output.writestr(name,data)
            output.writestr("../escape",b"bad")
        with self.assertRaises(ValueError):install_pack(corrupt,self.root / "installed")
        self.assertEqual(verify_packs(self.root / "installed"),["core"])

    def test_native_protocol_utf8_and_size_limits(self):
        stream=io.BytesIO()
        value={"v":1,"id":"d1","text":"你好 hello"}
        write_message(stream,value);stream.seek(0)
        self.assertEqual(read_message(stream),value)
        for stream in [io.BytesIO(b"\1"),io.BytesIO(struct.pack("<I",17000)),io.BytesIO(struct.pack("<I",8)+b"{}")]:
            with self.assertRaises(ValueError):read_message(stream)
        self.assertEqual(sound_accent({"tags":["UK"]}),"en-GB")
        self.assertEqual(sound_accent({"raw_tags":["美国"]}),"en-US")
        self.assertEqual(sound_accent({"tags":["Australia"]}),"unknown")
        self.assertEqual(sound_accent({"raw_tags":["音頻（美式）"]}),"en-US")
        self.assertEqual(sound_accent({"raw_tags":["音頻 (RP)"]}),"en-GB")
        self.assertEqual(sound_accent({"tags":["US","UK"]}),"unknown")

    def test_resource_build_requires_locked_inputs_and_records_every_source(self):
        cache = self.root / "cache"; cache.mkdir()
        with zipfile.ZipFile(cache / "ecdict.zip", "w") as archive:
            archive.write(self.root / "source/ecdict.db", "ecdict.db")
        (cache / "ecdict-license.txt").write_text("Fixture license", encoding="utf-8")
        with gzip.open(cache / "zhwiktionary.jsonl.gz", "wt", encoding="utf-8") as stream:
            stream.write(json.dumps({"word": "hello", "lang_code": "en", "senses": [{"glosses": ["你好"]}]}))
        locked = {name: ("https://example.org/" + name, digest(cache / name)) for name in ("ecdict.zip", "ecdict-license.txt", "zhwiktionary.jsonl.gz")}
        stale = self.root / "work/core"; stale.mkdir(parents=True)
        (stale / "ecdict.db").write_bytes(b"unrelated stale build")
        with patch("obt_dictionary.resources.DOWNLOADS", locked):
            build(cache, self.root / "packages")
            with zipfile.ZipFile(self.root / "packages/dictionary-core.zip") as archive:
                manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual({item["name"] for item in manifest["sources"]}, set(locked))
            self.assertEqual(manifest["counts"], {"ecdictEntries": 4, "wiktionaryEntries": 1})
            (cache / "ecdict-license.txt").write_text("corrupted", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "校验失败"):
                verify_sources(cache)
        locked["zhwiktionary.jsonl.gz"] = ("https://example.org/wiki", None)
        with patch("obt_dictionary.resources.DOWNLOADS", locked):
            with self.assertRaises(ValueError):
                verify_sources(cache)


if __name__=="__main__":unittest.main()
