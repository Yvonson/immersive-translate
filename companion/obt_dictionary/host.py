"""Chrome native messaging: 32-bit length + UTF-8 JSON, bounded replies."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import queue
import re
import struct
import sys
import threading

from . import PROTOCOL_VERSION
from .engine import Dictionary, DictionaryError

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


def serve(root, incoming=None, outgoing=None):
    incoming = incoming or sys.stdin.buffer
    outgoing = outgoing or sys.stdout.buffer
    messages = queue.Queue(maxsize=32)
    cancelled = set()

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

    def run(message):
        operation = message.get("op")
        if operation == "lookup":
            return engine.lookup(message.get("text"))
        if operation == "status":
            return engine.status()
        raise DictionaryError("INVALID_OPERATION", "不支持的词典操作。")

    # Construct/read SQLite inside the worker thread.
    engine = executor.submit(Dictionary, root).result()
    try:
        while True:
            try:
                message = messages.get(timeout=.05)
                if message is None:
                    break
                request_id = message.get("id", "") if isinstance(message, dict) else ""
                if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", request_id):
                    continue
                if message.get("v") != PROTOCOL_VERSION:
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
                    code = error.code if isinstance(error, DictionaryError) else "RESOURCE_DAMAGED"
                    description = str(error) if isinstance(error, DictionaryError) else "词典资源不可用，请运行资源校验或重新安装。"
                    write_message(outgoing, {"v": 1, "id": request_id, "ok": False, "error": {"code": code, "message": description}})
    finally:
        executor.submit(engine.close).result()
        executor.shutdown(wait=True, cancel_futures=True)
