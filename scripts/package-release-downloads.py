"""Create versioned installation downloads from audited split or grouped inputs."""
import argparse
import json
from pathlib import Path
import subprocess

from release_layout import (add_archive, package, safe_members, sha, verify_archive_copy)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--packaging-commit", default=None)
    args = parser.parse_args()
    packaging_commit = args.packaging_commit or subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    result = package(args.directory.resolve(), args.output.resolve(), args.tag, args.source_commit, packaging_commit)
    print(json.dumps(result))
