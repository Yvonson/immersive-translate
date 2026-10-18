"""Explicit, resumable resource preparation using bounded official HTTP ranges."""
from concurrent.futures import ThreadPoolExecutor
import argparse
import re
from pathlib import Path
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "companion"))
from obt_dictionary.resources import DOWNLOADS, download, downloader
from obt_dictionary.storage import atomic_json, digest


def fetch_ranges(name, size, cache, jobs):
    url, expected = DOWNLOADS[name]
    target = cache / name
    if target.exists() and (not expected or digest(target) == expected):
        print("Ready " + name, flush=True)
        return
    parts = cache / (name + ".ranges")
    parts.mkdir(parents=True, exist_ok=True)
    block = 4 * 1024 * 1024
    def fetch(index):
        start, end = index * block, min((index + 1) * block, size) - 1
        part = parts / str(index)
        if part.exists() and part.stat().st_size == end - start + 1:
            return
        command = ["curl.exe" if sys.platform == "win32" else "curl", "--location", "--fail", "--silent", "--show-error", "--connect-timeout", "20", "--max-time", "180", "--speed-limit", "2048", "--speed-time", "25", "--retry", "3", "--retry-all-errors", "--range", f"{start}-{end}", "--output", str(part), url]
        subprocess.run(command, check=True, timeout=800)
        if part.stat().st_size != end - start + 1:
            raise ValueError("Range response length mismatch")
        print(f"{name}: {index + 1}/{(size + block - 1) // block} segments ready", flush=True)
    count = (size + block - 1) // block
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        list(pool.map(fetch, range(count)))
    temporary = target.with_name(target.name + ".assembled")
    with temporary.open("wb") as output:
        for index in range(count):
            with (parts / str(index)).open("rb") as incoming:
                shutil.copyfileobj(incoming, output)
    if expected and digest(temporary) != expected:
        temporary.unlink()
        checked_root=parts.resolve()
        for fragment in parts.iterdir():
            if fragment.name.isdigit() and fragment.is_file() and fragment.resolve().is_relative_to(checked_root):
                fragment.unlink()
        raise ValueError("Resource checksum mismatch; cached segments invalidated. Check the pinned source snapshot before retrying.")
    temporary.replace(target)
    print("Verified " + name, flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache",type=Path,default=Path(".local/dictionary/cache"))
    parser.add_argument("--jobs",type=int,default=6)
    parser.add_argument("--only",nargs="+",choices=list(DOWNLOADS),help="Prepare selected independent assets")
    args=parser.parse_args()
    sizes={"ecdict.zip":216765132}
    for name in args.only or DOWNLOADS:
        if name == "zhwiktionary.jsonl.gz" and not (args.cache / name).exists():
            headers=subprocess.run(["curl.exe" if sys.platform=="win32" else "curl","--head","--location","--fail","--silent","--show-error","--max-time","30",DOWNLOADS[name][0]],capture_output=True,text=True,check=True)
            lengths=re.findall(r"^Content-Length:\s*(\d+)",headers.stdout,re.I|re.M)
            if not lengths:
                raise ValueError("Official data response does not declare file length")
            sizes[name]=int(lengths[-1])
        if name in sizes:
            fetch_ranges(name,sizes[name],args.cache,args.jobs)
        else:
            print("Fetch " + name,flush=True)
            download(DOWNLOADS[name][0],args.cache / name,downloader(),DOWNLOADS[name][1])
    if all((args.cache / name).exists() for name in DOWNLOADS):
        atomic_json(args.cache / "sources.lock.json",{name:{"url":url,"sha256":digest(args.cache / name),"bytes":(args.cache / name).stat().st_size} for name,(url,_) in DOWNLOADS.items()})


if __name__=="__main__":main()
