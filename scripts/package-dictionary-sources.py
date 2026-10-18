"""Bundle companion sources and pinned GPL dependency sources beside its binary."""
import json
from pathlib import Path
import sys
import subprocess
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "companion"))
from obt_dictionary.resources import download, downloader
from obt_dictionary.storage import digest, atomic_json

root=Path(__file__).resolve().parents[1]
cache=root / ".local/dictionary/source-cache"
cache.mkdir(parents=True,exist_ok=True)
opener=downloader()
source_lock={}
for project,version in [("pyinstaller","6.16.0")]:
    with opener.open(f"https://pypi.org/pypi/{project}/{version}/json",timeout=30) as response:
        metadata=json.load(response)
    asset=next(item for item in metadata["urls"] if item["packagetype"]=="sdist")
    target=cache / asset["filename"]
    download(asset["url"],target,opener,asset["digests"]["sha256"])
    source_lock[target.name]={"url":asset["url"],"sha256":digest(target)}
    print("Source ready: " + target.name,flush=True)
atomic_json(cache / "sources.json",source_lock)
destination=root / ".local/dictionary/dictionary-companion-sources.zip"
source_info = json.loads((root / "SOURCE.json").read_text(encoding="utf-8")) if (root / "SOURCE.json").exists() else {"version":json.loads((root / "package.json").read_text(encoding="utf-8"))["version"], "commit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()}
with zipfile.ZipFile(destination,"w",compression=zipfile.ZIP_DEFLATED) as output:
    output.writestr("SOURCE.json", json.dumps(source_info,indent=2))
    for pattern in ["companion/obt_dictionary/*.py","companion/tests/*.py","companion/licenses/*.txt","companion/*.py","companion/*.ps1","companion/*.txt","companion/*.md","companion/*lock.json","companion/LICENSE","scripts/*companion.ps1","scripts/*dictionary*.py"]:
        for file in root.glob(pattern):
            output.write(file,file.relative_to(root).as_posix())
    for name in [*source_lock,"sources.json"]:
        file=cache / name
        output.write(file,"dependencies/"+file.name)
print(str(destination))
