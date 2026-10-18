"""Chrome native messaging: 32-bit length + UTF-8 JSON, bounded replies."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import queue
import re
import sqlite3
import struct
import sys
import threading

from . import PROTOCOL_VERSION
from .engine import Dictionary, DictionaryError, normalize
from .favorites import Favorites

MAX_MESSAGE = 16384


def read_message(stream):
    size = stream.read(4)
    if not size:
        return None
    if len(size) != 4:
        raise ValueError("Truncated message header")
    length = struct.unpack("<I", size)[0]
    if length > MAX_MESSAGE:
        raise ValueError("Message too large")
    value = stream.read(length)
    if len(value) != length:
        raise ValueError("Truncated message")
    return json.loads(value)


def write_message(stream, value):
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 900000:
        raise ValueError("Response too large")
    stream.write(struct.pack("<I", len(encoded)) + encoded)
    stream.flush()


def serve(root, incoming=None, outgoing=None, user_root=None):
    incoming = incoming or sys.stdin.buffer
    outgoing = outgoing or sys.stdout.buffer
    messages = queue.Queue(maxsize=32)
    cancelled = set()
    completed = object()

    def read():
        try:
            while (message := read_message(incoming)) is not None:
                messages.put(message)
        except Exception:
            pass  # Protocol errors close this process; never print query data.
        finally:
            messages.put(None)

    threading.Thread(target=read, daemon=True).start()
    # SQLite stay on this single worker; cancel remains responsive.
    executor = ThreadPoolExecutor(max_workers=1)
    pending = {}
    engine = None
    favorites = None

    def wake(_):
        try:
            messages.put_nowait(completed)
        except queue.Full:
            pass  # The loop also polls completed futures; never block the worker on shutdown.

    def dictionary():
        nonlocal engine
        if engine is None:
            engine = Dictionary(root)
        return engine

    def collection():
        nonlocal favorites
        if favorites is None:
            favorites = Favorites(user_root)
        return favorites

    def run(message):
        operation = message.get("op")
        if operation == "lookup":
            return dictionary().lookup(message.get("text"))
        if operation == "status":
            try:
                status = dictionary().status()
            except Exception:
                status = {"ready": False, "resources": [], "offline": True, "resourceError": "词库不可用，请运行资源校验；已保存的收藏仍可使用。"}
            return {**status, "capabilities": {"favorites": 1}}
        if operation == "favorites.collect":
            try:
                result = dictionary().lookup(message.get("text"))
            except Exception:
                # Explicit collection remains possible without packs; no online fallback.
                result = {"entries": []}
            return collection().collect(message.get("text"), result, message.get("context"))
        if operation == "favorites.state":
            query = normalize(message.get("text"))
            try:
                result = dictionary().lookup(query)
                matches = [entry["headword"] for entry in result["entries"] if entry["headword"].casefold() == query.casefold()]
                query = next((word for word in matches if word == query), matches[0] if matches else query)
            except Exception:
                pass
            return collection().state(query)
        if operation == "favorites.meta":
            return collection().meta()
        if operation == "favorites.list":
            return collection().listing(message.get("filters"), message.get("page", 0))
        if operation == "favorites.ids":
            return collection().listing(message.get("filters"), ids=True)
        if operation == "favorites.get":
            return collection().get(message.get("wordId"))
        if operation == "favorites.update":
            return collection().update(message.get("wordId"), message.get("changes"))
        if operation == "favorites.remove":
            return collection().remove(message.get("wordId"))
        if operation == "favorites.review":
            return collection().review(message.get("wordId"), message.get("outcome"))
        if operation == "favorites.exportStart":
            return collection().export_start()
        if operation == "favorites.exportChunk":
            return collection().export_chunk(message.get("token"), message.get("index"))
        if operation == "favorites.importStart":
            return collection().import_start()
        if operation == "favorites.importChunk":
            return collection().import_chunk(message.get("token"), message.get("index"), message.get("text"))
        if operation == "favorites.importCommit":
            return collection().import_commit(message.get("token"))
        raise DictionaryError("INVALID_OPERATION", "不支持的词典操作。")

    # Construct/read SQLite inside the worker thread.
    try:
        ended = False
        while True:
            try:
                message = messages.get(timeout=.05)
                if message is None:
                    ended = True
                if message is completed or message is None:
                    message = {}
                request_id = message.get("id", "") if isinstance(message, dict) else ""
                if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", request_id):
                    pass
                elif message.get("v") != PROTOCOL_VERSION:
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": False, "error": {"code": "PROTOCOL_MISMATCH", "message": "请更新或修复本地词典组件。"}})
                elif message.get("op") == "cancel":
                    target = message.get("target")
                    if target in pending:
                        cancelled.add(target)
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": True, "result": {}})
                elif len(pending) >= 16:
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": False, "error": {"code": "BUSY", "message": "请求过多，请稍后重试。"}})
                else:
                    pending[request_id] = executor.submit(run, message)
                    pending[request_id].add_done_callback(wake)
            except queue.Empty:
                pass
            for request_id, future in list(pending.items()):
                if not future.done():
                    continue
                del pending[request_id]
                if request_id in cancelled:
                    cancelled.discard(request_id)
                    continue
                try:
                    result = future.result()
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": True, "result": result})
                except Exception as error:
                    code = error.code if isinstance(error, DictionaryError) else "STORAGE_ERROR" if isinstance(error, (sqlite3.Error, OSError)) else "RESOURCE_DAMAGED"
                    description = str(error) if isinstance(error, DictionaryError) else "本地数据暂不可用，请检查磁盘空间、写入权限与资源；不要删除生词本。"
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": False, "error": {"code": code, "message": description}})
            if ended and not pending:
                break
    finally:
        def close():
            if engine:
                engine.close()
            if favorites:
                favorites.close()
        executor.submit(close).result()
        executor.shutdown(wait=True, cancel_futures=True)
