# SPDX-License-Identifier: MPL-2.0
"""Reconstruct the exact v0.2.0 source snapshot from verified release parts.

Usage: python restore-dictionary-source.py [parts-directory] [output-directory]
"""
import hashlib
import json
from pathlib import Path
import re
import sys

EXPECTED_SHA = "b97696cdb53bd1dc6236dd93b69f4e9359217cd9504d1c998508ded9ce11de3f"
EXPECTED_BYTES = 234449710


def restore(source, output):
    meta = json.loads((source / "source-parts.json").read_text(encoding="utf-8"))
    if meta.get("sha256") != EXPECTED_SHA or meta.get("bytes") != EXPECTED_BYTES or meta.get("target") != "zhwiktionary.jsonl.gz":
        raise ValueError("不是 v0.2.0 对应的词典快照清单。")
    names = [part["name"] for part in meta["parts"]]
    if names != [f"zhwiktionary.jsonl.gz.part{i+1:02d}" for i in range(len(names))] or not 1 <= len(names) <= 99:
        raise ValueError("分片名称或顺序无效。")
    output.mkdir(parents=True, exist_ok=True)
    target = output / "zhwiktionary.jsonl.gz"
    if target.exists():
        with target.open("rb") as stream:
            if hashlib.file_digest(stream,"sha256").hexdigest() == EXPECTED_SHA:
                print("快照已存在，SHA-256 正确。");return
        raise FileExistsError("输出位置已有其他快照，请选择空文件夹。")
    temporary = output / "zhwiktionary.jsonl.gz.restoring"
    if temporary.exists():
        raise FileExistsError("输出位置存在未完成文件，请先检查或换空文件夹。")
    whole = hashlib.sha256();total=0
    try:
        with temporary.open("xb") as destination:
            for part in meta["parts"]:
                path = source / part["name"]
                if path.stat().st_size != part["bytes"]:
                    raise ValueError("分片体积不符："+part["name"])
                digest = hashlib.sha256()
                with path.open("rb") as incoming:
                    while block := incoming.read(1024*1024):
                        digest.update(block);whole.update(block);destination.write(block);total+=len(block)
                if digest.hexdigest() != part["sha256"]:
                    raise ValueError("分片校验失败："+part["name"])
        if total != EXPECTED_BYTES or whole.hexdigest() != EXPECTED_SHA:
            raise ValueError("合并后的完整快照 SHA-256 不符。")
        temporary.rename(target)
        print("原始快照已还原，完整 SHA-256 正确："+EXPECTED_SHA)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    restore(Path(sys.argv[1] if len(sys.argv)>1 else ".").resolve(),Path(sys.argv[2] if len(sys.argv)>2 else ".").resolve())
