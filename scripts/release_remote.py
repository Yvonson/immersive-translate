"""GitHub transport and resumable publication; verification clients cannot write."""
import http.client
import json
import os
from pathlib import Path
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request

from release_layout import REPOSITORY, ReleaseError, allowed_main_names, dump, require, sha, validate_plan

API = "https://api.github.com/repos/" + REPOSITORY


class AuthRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        require(request.get_method() in {"GET", "HEAD"}, "Refusing a redirect during a GitHub write")
        redirected = super().redirect_request(request, fp, code, msg, headers, newurl)
        if urllib.parse.urlparse(request.full_url).netloc != urllib.parse.urlparse(newurl).netloc:
            redirected.remove_header("Authorization")
        return redirected


class GitHub:
    def __init__(self, allow_writes=False, direct=False):
        self.token = os.environ.get("GH_TOKEN", "")
        require(bool(self.token), "GH_TOKEN is required (existing login or workflow token; do not put it in arguments)")
        handlers = [AuthRedirect()]
        if direct:
            handlers.append(urllib.request.ProxyHandler({}))
        self.opener = urllib.request.build_opener(*handlers)
        self.allow_writes = allow_writes
        self.writes = 0

    def request(self, url, method="GET", data=None, headers=None):
        require(url.startswith(API + "/") or url.startswith("https://uploads.github.com/repos/" + REPOSITORY + "/"), "Unexpected GitHub endpoint")
        if method not in {"GET", "HEAD"}:
            require(self.allow_writes, "Verify mode forbids GitHub writes")
            self.writes += 1
        common = {"Authorization": "Bearer " + self.token, "Accept": "application/vnd.github+json",
                  "User-Agent": "open-bilingual-translate-release", "X-GitHub-Api-Version": "2022-11-28"}
        common.update(headers or {})
        request = urllib.request.Request(url, data=data, headers=common, method=method)
        for attempt in range(3):
            try:
                return self.opener.open(request, timeout=120)
            except urllib.error.HTTPError as error:
                if method == "GET" and error.code in {429, 500, 502, 503, 504} and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                if error.code == 404:
                    raise
                raise ReleaseError(f"GitHub {method} HTTP {error.code}") from None
            except (OSError, http.client.HTTPException):
                if method == "GET" and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise ReleaseError(f"GitHub {method} transport failed; rerun to reconcile remote state") from None

    def api(self, path, method="GET", body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if data is not None else None
        with self.request(API + path, method, data, headers) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    def release(self, tag):
        # The tag endpoint does not return drafts. Authenticated list lookup covers both.
        matches = []
        page = 1
        while True:
            releases = self.api(f"/releases?per_page=100&page={page}")
            matches.extend(value for value in releases if value["tag_name"] == tag)
            if len(releases) < 100:
                break
            page += 1
        require(len(matches) <= 1, "Multiple releases share tag: " + tag)
        return matches[0] if matches else None

    def current(self, release_id):
        return self.api("/releases/" + str(release_id))

    def commit(self, tag):
        return self.api("/commits/" + urllib.parse.quote(tag, safe=""))["sha"]

    def source_ci_ok(self, tag, commit):
        runs = self.api(f"/actions/runs?head_sha={commit}&per_page=100")["workflow_runs"]
        matches = [run for run in runs if run["path"] == ".github/workflows/release.yml" and run["head_branch"] == tag]
        return bool(matches) and max(matches, key=lambda run: run["created_at"])["conclusion"] == "success"

    def download(self, asset, directory):
        path = directory / asset["name"]
        expected = asset.get("digest", "")
        require(expected and expected.startswith("sha256:"), "Missing remote SHA-256: " + asset["name"])
        if path.exists() and path.stat().st_size == asset["size"] and "sha256:" + sha(path) == expected:
            return path
        temporary = path.with_name(path.name + ".downloading")
        with self.request(API + "/releases/assets/" + str(asset["id"]), headers={"Accept": "application/octet-stream"}) as reader, temporary.open("wb") as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
        require(temporary.stat().st_size == asset["size"] and "sha256:" + sha(temporary) == expected,
                "Downloaded asset checksum mismatch: " + asset["name"])
        temporary.replace(path)
        return path

    def upload(self, release, path):
        url = release["upload_url"].split("{", 1)[0] + "?name=" + urllib.parse.quote(path.name, safe="")
        with path.open("rb") as reader:
            with self.request(url, "POST", reader, {"Content-Type": "application/octet-stream", "Content-Length": str(path.stat().st_size)}) as response:
                return json.load(response)

    def create_resource(self, plan):
        return self.api("/releases", "POST", {"tag_name": plan["resourcesTag"], "target_commitish": plan["packagingCommit"],
            "name": "Open Bilingual Translate " + plan["tag"] + " - Resources", "body": "Preparing verified development resources.",
            "draft": True, "prerelease": False, "make_latest": "false"})

    def patch_release(self, release_id, body):
        return self.api("/releases/" + str(release_id), "PATCH", body)

    def patch_asset(self, asset_id, body):
        return self.api("/releases/assets/" + str(asset_id), "PATCH", body)

    def delete_asset(self, asset_id):
        return self.api("/releases/assets/" + str(asset_id), "DELETE")

    def latest(self):
        return self.api("/releases/latest")


def index_assets(release):
    assets = release.get("assets", [])
    result = {item["name"]: item for item in assets}
    require(len(result) == len(assets), "Duplicate remote asset names")
    return result


def matches(asset, item):
    return asset and asset.get("state", "uploaded") == "uploaded" and asset["size"] == item["bytes"] and asset.get("digest") == "sha256:" + item["sha256"]


def incomplete(asset):
    return asset and asset.get("state") == "starter" and asset["size"] == 0 and not asset.get("digest")


def validate_main(release, version):
    require(release is not None and not release.get("immutable") and not release["prerelease"], "Expected an editable stable release/draft")
    unknown = set(index_assets(release)) - allowed_main_names(version)
    require(not unknown, "Unknown main-release attachments; no cleanup performed: " + ", ".join(sorted(unknown)))


def validate_resource(release, plan):
    if release:
        require(not release.get("immutable") and not release["prerelease"] and release["tag_name"] == plan["resourcesTag"], "Resource release state mismatch")
        expected = {item["name"] for item in plan["assets"] if item["target"] == "resources"}
        require(set(index_assets(release)) <= expected, "Unknown resource attachments; refusing changes")


def publish(client, directory, prepared):
    """Run only after packaging succeeds. Existing matching remote files are reused."""
    plan = prepared["plan"]
    validate_plan(plan)
    before = prepared["before"]
    for item in plan["assets"]:
        path = directory / item["name"]
        require(path.stat().st_size == item["bytes"] and sha(path) == item["sha256"], "Prepared file changed: " + item["name"])
    require(client.commit(plan["tag"]) == plan["sourceCommit"], "Software tag moved; no writes performed")
    require(client.source_ci_ok(plan["tag"], plan["sourceCommit"]), "Tagged source release CI must have passed")
    initial = client.current(before["id"])
    validate_main(initial, plan["version"])
    require(initial["tag_name"] == plan["tag"], "Main release identity changed")
    baseline = index_assets(before)
    desired_main = {item["name"]: item for item in plan["assets"] if item["target"] == "main"}
    removed = set()

    def current_main():
        value = client.current(before["id"])
        validate_main(value, plan["version"])
        require(value["tag_name"] == plan["tag"] and value["draft"] == initial["draft"], "Main release state changed concurrently")
        current = index_assets(value)
        require(set(current) <= set(baseline) | set(desired_main), "Concurrent main-release attachments appeared")
        for name, old in baseline.items():
            if name in removed:
                continue
            if name not in current and name not in desired_main:
                # A prior application may already have cleaned this known legacy file.
                # Both replacement downloads and public corresponding source must be intact.
                complete = all(matches(current.get(key), item) for key, item in desired_main.items())
                require(complete and resource and not resource["draft"] and matches(index_assets(resource).get(resource_item["name"]), resource_item),
                        "Baseline attachment disappeared before verified replacement: " + name)
                continue
            require(name in current and (current[name]["id"], current[name]["size"], current[name].get("digest")) ==
                    (old["id"], old["size"], old.get("digest")), "Baseline attachment changed concurrently: " + name)
        return value

    # Validate all existing destination names before creating or editing anything.
    for item in plan["assets"]:
        if item["target"] == "main":
            existing = index_assets(initial).get(item["name"])
            require(not existing or matches(existing, item) or incomplete(existing), "Existing destination has a different hash: " + item["name"])
    resource = client.release(plan["resourcesTag"])
    validate_resource(resource, plan)
    resource_item = next(item for item in plan["assets"] if item["target"] == "resources")
    if resource:
        require(client.commit(plan["resourcesTag"]) == plan["packagingCommit"], "Resource tag does not match packaging commit")
        existing = index_assets(resource).get(resource_item["name"])
        require(not existing or matches(existing, resource_item) or incomplete(existing), "Existing resource has a different hash")
    current_main()
    if resource is None:
        resource = client.create_resource(plan)

    def ensure_asset(release_id, item):
        release = client.current(release_id)
        require(not release.get("immutable"), "Release became immutable")
        if release_id == resource["id"]:
            validate_resource(release, plan)
        existing = index_assets(release).get(item["name"])
        if incomplete(existing):
            # GitHub leaves a zero-byte starter after some interrupted uploads.
            # Only our exact planned destination is retired; valid differing files are never replaced.
            client.delete_asset(existing["id"])
            if release_id == before["id"]:
                removed.add(item["name"])
            existing = None
        if not existing:
            client.upload(release, directory / item["name"])
        require(matches(index_assets(client.current(release_id)).get(item["name"]), item), "Uploaded asset verification failed: " + item["name"])

    ensure_asset(resource["id"], resource_item)
    resource = client.current(resource["id"])
    validate_resource(resource, plan)
    body = (directory / "resources-body.md").read_text(encoding="utf-8")
    resource_title = "Open Bilingual Translate " + plan["tag"] + " - Resources"
    if resource["draft"] or resource.get("body") != body or resource.get("name") != resource_title:
        resource = client.patch_release(resource["id"], {"draft": False, "prerelease": False, "make_latest": "false", "body": body, "name": resource_title})
    require(not resource["draft"] and matches(index_assets(resource).get(resource_item["name"]), resource_item), "Corresponding source must be public before main cleanup")
    for item in desired_main.values():
        current_main()
        ensure_asset(before["id"], item)

    def verify_destinations():
        value = current_main()
        require(all(matches(index_assets(value).get(name), item) for name, item in desired_main.items()), "New user downloads are incomplete")
        current_resource = client.current(resource["id"])
        validate_resource(current_resource, plan)
        require(not current_resource["draft"] and matches(index_assets(current_resource).get(resource_item["name"]), resource_item), "Public corresponding source changed")
        require(client.commit(plan["resourcesTag"]) == plan["packagingCommit"], "Resource tag changed; cleanup stopped")
        require(client.commit(plan["tag"]) == plan["sourceCommit"], "Software tag changed; cleanup stopped")
        return value

    value = verify_destinations()
    body = (directory / "main-body.md").read_text(encoding="utf-8")
    title = "Open Bilingual Translate " + plan["tag"]
    latest = client.latest()
    if value["draft"] or value.get("body") != body or value.get("name") != title or latest["id"] != value["id"]:
        client.patch_release(value["id"], {"draft": False, "prerelease": False, "make_latest": "true", "body": body, "name": title})
        initial["draft"] = False
    for name, asset in index_assets(value).items():
        if name not in desired_main:
            verify_destinations()
            client.delete_asset(asset["id"])
            removed.add(name)
    for release_id in (before["id"], resource["id"]):
        for asset in client.current(release_id)["assets"]:
            if asset.get("label"):
                client.patch_asset(asset["id"], {"label": ""})
    final = verify_destinations()
    require(set(index_assets(final)) == set(desired_main), "Final main-release file set differs")
    require(client.latest()["id"] == final["id"], "Latest must remain the software release")
    result = {"main": final, "resources": client.current(resource["id"]), "writes": client.writes,
              "sourceCommit": plan["sourceCommit"], "verified": True}
    dump(directory / "after.json", result)
    return result
