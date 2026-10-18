"""Verify or publish a versioned distribution; default mode makes no remote writes."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

from release_layout import (ROOT, ReleaseError, dump, names, package, release_body, require,
                            resource_body, resources_tag, validate_plan)
from release_remote import GitHub, incomplete, index_assets, publish, validate_main


def prepare(client, tag, commit, output, directory=None):
    version = tag.removeprefix("v")
    filenames = names(version)
    require(tag == "v" + version, "Expected a version tag")
    require(json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"] == version, "Repository/package version mismatch")
    require(client.commit(tag) == commit, "Software tag does not match expected source commit")
    require(client.source_ci_ok(tag, commit), "Tagged source release CI must have passed")
    main = client.release(tag)
    validate_main(main, version)
    resource = client.release(resources_tag(tag))
    if resource:
        require(not resource.get("immutable") and not resource["prerelease"] and set(index_assets(resource)) <= {filenames["resources"]}, "Unexpected resource-release layout")
    output.mkdir(parents=True, exist_ok=True)
    require(not (output / "prepared.json").exists(), "Choose a fresh preparation directory; apply the saved prepared.json to resume locally")
    dump(output / "before.json", {"main": main, "resources": resource})
    print("Preflight passed: source tag, source CI, and supported remote layouts", flush=True)
    if directory is None:
        directory = output / "inputs"
        directory.mkdir(exist_ok=True)
        for asset in main["assets"]:
            if not (asset["name"] in filenames.values() and incomplete(asset)):
                client.download(asset, directory)
        if resource:
            for asset in resource["assets"]:
                if not incomplete(asset):
                    client.download(asset, directory)
    packaging_commit = client.commit(resources_tag(tag)) if resource else subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    downloads = output / "downloads"
    plan = package(directory, downloads, tag, commit, packaging_commit)
    validate_plan(plan)
    (downloads / "main-body.md").write_text(release_body(plan), encoding="utf-8", newline="\n")
    (downloads / "resources-body.md").write_text(resource_body(plan), encoding="utf-8", newline="\n")
    prepared = {"plan": plan, "before": main}
    dump(downloads / "prepared.json", prepared)
    dump(output / "prepared.json", prepared)
    print("Packaging passed: runtime bytes and corresponding source verified", flush=True)
    return downloads, prepared


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("verify", "publish"), default="verify")
    parser.add_argument("--tag", default=os.environ.get("RELEASE_TAG"))
    parser.add_argument("--source-commit", default=os.environ.get("RELEASE_SOURCE_COMMIT"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--prepared", type=Path)
    parser.add_argument("--direct", action="store_true")
    parser.add_argument("--expect-no-writes", action="store_true", help="Verify that replaying a prepared publication needs zero mutations")
    args = parser.parse_args()
    client = GitHub(allow_writes=args.mode == "publish" and not args.expect_no_writes, direct=args.direct)
    if args.prepared:
        require(args.mode == "publish", "Use publish mode to apply a prepared distribution")
        prepared = json.loads(args.prepared.read_text(encoding="utf-8"))
        downloads = args.prepared.parent
    else:
        require(args.tag and args.source_commit, "--tag and --source-commit are required")
        output = args.output or ROOT / ".local/release" / ("distribution-" + uuid.uuid4().hex)
        downloads, prepared = prepare(client, args.tag, args.source_commit, output.resolve(), args.directory.resolve() if args.directory else None)
    if args.mode == "publish":
        result = publish(client, downloads, prepared)
        print(json.dumps({"published": True, "uploadedMainAssets": len(result["main"]["assets"]), "writes": result["writes"], "verified": True}))
        summary = "Publication verified: two English-named user downloads, public corresponding source, software tag unchanged. Writes: " + str(result["writes"])
    else:
        require(client.writes == 0, "Verify mode performed an unexpected write")
        print(json.dumps({"verified": True, "writes": 0, "prepared": str(downloads / "prepared.json")}))
        summary = "Verification and packaging passed. No GitHub writes performed."
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as stream:
            stream.write(summary + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, ReleaseError) else type(error).__name__ + ": " + str(error)
        print("Release packaging failed: " + message, file=sys.stderr)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as stream:
                stream.write("Release packaging failed: " + message + "\n")
        sys.exit(1)
