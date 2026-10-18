"""Isolated browser fixture using the real framed native host and SQLite store."""
from pathlib import Path
import json
import os
import sys

project = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project / "companion"))
sys.path.insert(0, str(project / "companion/tests"))
from test_dictionary import fixture
from obt_dictionary.favorites import Favorites, snapshot_data
from obt_dictionary.storage import install_pack
from obt_dictionary.resources import pack
from obt_dictionary.host import serve

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
if not (root / "seeded").exists():
    fixture(root / "source")
    pack(root / "source", root / "core.zip", "core", {"ecdictEntries": 4}, [])
    install_pack(root / "core.zip", root / "Dictionary")
    store = Favorites(root / "UserData")
    with store.db:
        for i in range(5000):
            word = ["serendipity", "ephemeral", "resilience", "neural network"][i] if i < 4 else f"vocabulary-{i:04d}"
            meaning = ["不期而遇的美好；意外发现珍宝的能力", "短暂的；转瞬即逝的", "韧性；恢复力", "神经网络"][i] if i < 4 else "测试词条，用于验证真实分页"
            result = {"entries": [{"headword": word, "source": "Test dictionary", "license": "Fixture", "sourceUrl": "https://example.org", "senses": [{"zh": meaning}], "pronunciations": [{"ipa": "ˌserənˈdɪpɪti", "accent": "en-GB"}]}]}
            collected = f"2026-10-{18 - i % 15:02d}T00:00:00.000Z"
            word_id = f"{i:032x}"
            store.db.execute("INSERT INTO words(id,identity,word,snapshot,firstCollectedAt,lastCollectedAt) VALUES(?,?,?,?,?,?)", (word_id, "word:"+word, word, json.dumps(snapshot_data(result, word), ensure_ascii=False), collected, collected))
            if i < 4:
                store.db.execute("INSERT INTO tags VALUES(?,?)", (word_id, "日常阅读" if i != 3 else "深度学习"))
                store._context(word_id, {"sentence": "It was a moment of serendipity, finding that book in a quiet corner." if i == 0 else "Learning gives familiar words new meaning.", "title": "The art of noticing", "url": "https://reading.example.org/story"}, collected)
    store.close()
    (root / "seeded").touch()
if "--damaged" in sys.argv:
    (root / "Dictionary/active.json").write_text("broken JSON", encoding="utf-8")
if os.name == "nt":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
serve(root / "Dictionary", user_root=root / "UserData")
