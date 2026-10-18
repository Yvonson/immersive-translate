"""Verify that retries and failures cannot silently remove working downloads."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import urllib.request

from release_fixture import fixture, layout, SOURCE, PACKAGING
from release_remote import AuthRedirect, GitHub, publish

spec = importlib.util.spec_from_file_location("release_entry", layout.ROOT/"scripts/reorganize-release.py")
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)


class FakeGitHub:
    def __init__(self, inputs):
        self.writes = 0
        self.files = {path.name: path for path in inputs.iterdir() if path.is_file()}
        assets = [self.asset(path, i+10, label="old display label") for i, path in enumerate(self.files.values())]
        self.main = {"id": 1, "tag_name": "v0.2.0", "draft": False, "prerelease": False, "immutable": False,
                     "name": "old title", "body": "old body", "assets": assets}
        self.resources = None
        self.resource_commit = None
        self.next_id = 100
        self.upload_failure = None
        self.delete_failure = None
        self.deleted = []
        self.after_upload = None

    def asset(self, path, asset_id, label=None):
        return {"id": asset_id, "name": path.name, "label": label, "size": path.stat().st_size,
                "digest": "sha256:"+layout.sha(path), "state": "uploaded"}

    def release(self, tag):
        return copy.deepcopy(self.main if tag == "v0.2.0" else self.resources)

    def current(self, release_id):
        return copy.deepcopy(self.main if release_id == 1 else self.resources)

    def commit(self, tag):
        return SOURCE if tag == "v0.2.0" else self.resource_commit

    def source_ci_ok(self, tag, commit):
        return tag == "v0.2.0" and commit == SOURCE

    def download(self, asset, directory):
        path = directory/asset["name"]
        shutil.copyfile(self.files[asset["name"]], path)
        return path

    def create_resource(self, plan):
        self.writes += 1
        self.resource_commit = plan["packagingCommit"]
        self.resources = {"id": 2, "tag_name": plan["resourcesTag"], "draft": True, "prerelease": False,
                          "immutable": False, "assets": [], "name": "preparing", "body": "preparing"}
        return copy.deepcopy(self.resources)

    def upload(self, release, path):
        self.writes += 1
        if self.upload_failure == path.name:
            raise OSError("simulated upload interruption")
        target = self.main if release["id"] == 1 else self.resources
        target["assets"].append(self.asset(path, self.next_id))
        self.files[path.name] = path
        self.next_id += 1
        if self.after_upload:
            hook, self.after_upload = self.after_upload, None
            hook(self)

    def patch_release(self, release_id, body):
        self.writes += 1
        target = self.main if release_id == 1 else self.resources
        target.update({key: value for key, value in body.items() if key != "make_latest"})
        return copy.deepcopy(target)

    def patch_asset(self, asset_id, body):
        self.writes += 1
        for release in (self.main, self.resources):
            if release:
                for asset in release["assets"]:
                    if asset["id"] == asset_id:
                        asset.update(body)
                        return copy.deepcopy(asset)

    def delete_asset(self, asset_id):
        self.writes += 1
        starter = next((a for release in (self.main, self.resources) if release for a in release["assets"] if a["id"] == asset_id and a.get("state") == "starter"), None)
        if starter:
            for release in (self.main, self.resources):
                if release:
                    release["assets"] = [a for a in release["assets"] if a["id"] != asset_id]
            return
        if self.delete_failure == len(self.deleted)+1:
            raise OSError("simulated cleanup interruption")
        # The public corresponding source and both new user files must already exist.
        assert self.resources and not self.resources["draft"]
        assert set(layout.names("0.2.0").values()) - {layout.names("0.2.0")["resources"]} <= {a["name"] for a in self.main["assets"]}
        self.deleted.append(asset_id)
        for release in (self.main, self.resources):
            release["assets"] = [a for a in release["assets"] if a["id"] != asset_id]

    def latest(self):
        return copy.deepcopy(self.main)


class ReleasePublisherTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        root, inputs = fixture(self.base)
        root_patch = patch.object(layout, "ROOT", root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        self.client = FakeGitHub(inputs)
        self.output = self.base/"downloads"
        self.plan = layout.package(inputs, self.output, "v0.2.0", SOURCE, PACKAGING)
        (self.output/"main-body.md").write_text(layout.release_body(self.plan), encoding="utf-8", newline="\n")
        (self.output/"resources-body.md").write_text(layout.resource_body(self.plan), encoding="utf-8", newline="\n")
        self.prepared = {"plan": self.plan, "before": self.client.current(1)}

    def run_publish(self):
        return publish(self.client, self.output, self.prepared)

    def resume(self, folder="retry"):
        output, prepared = entry.prepare(self.client, "v0.2.0", SOURCE, self.base/folder)
        return publish(self.client, output, prepared)

    def test_publish_migrates_source_first_and_leaves_two_user_assets(self):
        result = self.run_publish()
        self.assertTrue(result["verified"])
        self.assertEqual(len(self.client.main["assets"]), 2)
        self.assertEqual(len(self.client.resources["assets"]), 1)
        self.assertEqual(self.client.commit("v0.2.0"), SOURCE)
        self.assertEqual(self.client.latest()["id"], 1)
        self.assertTrue(all(not asset.get("label") for asset in self.client.main["assets"]))

    def test_completed_layout_repeated_execution_performs_zero_writes(self):
        self.run_publish()
        self.client.writes = 0
        self.resume()
        self.assertEqual(self.client.writes, 0)

    def test_same_saved_preparation_can_be_replayed_without_writes(self):
        self.run_publish()
        self.client.writes = 0
        self.run_publish()
        self.assertEqual(self.client.writes, 0)

    def test_upload_interruption_retains_old_downloads_and_resumes(self):
        old = {asset["name"] for asset in self.client.main["assets"]}
        self.client.upload_failure = layout.names("0.2.0")["windows"]
        with self.assertRaises(OSError):
            self.run_publish()
        self.assertTrue(old <= {asset["name"] for asset in self.client.main["assets"]})
        self.assertEqual(self.client.deleted, [])
        self.client.upload_failure = None
        self.resume()
        self.assertEqual(len(self.client.main["assets"]), 2)

    def test_zero_byte_interrupted_upload_can_be_replaced_without_removing_old_downloads(self):
        item = self.plan["assets"][1]
        self.client.main["assets"].append({"id": 999, "name": item["name"], "size": 0, "digest": None, "state": "starter"})
        self.prepared["before"] = self.client.current(1)
        self.run_publish()
        self.assertEqual(len(self.client.main["assets"]), 2)
        self.assertTrue(all(a["state"] == "uploaded" for a in self.client.main["assets"]))

    def test_cleanup_interruption_resumes_from_mixed_layout(self):
        self.client.delete_failure = 2
        with self.assertRaises(OSError):
            self.run_publish()
        self.assertEqual(len(self.client.deleted), 1)
        self.client.delete_failure = None
        self.resume()
        self.assertEqual(len(self.client.main["assets"]), 2)

    def test_unknown_attachment_stops_before_any_write(self):
        self.client.main["assets"].append({"id": 999, "name": "manual.zip", "size": 1, "digest": "x"})
        with self.assertRaisesRegex(layout.ReleaseError, "Unknown"):
            self.run_publish()
        self.assertEqual(self.client.writes, 0)

    def test_different_destination_hash_stops_before_any_write(self):
        item = self.plan["assets"][0]
        self.client.main["assets"].append({"id": 999, "name": item["name"], "size": item["bytes"], "digest": "sha256:"+"f"*64})
        with self.assertRaisesRegex(layout.ReleaseError, "different hash"):
            self.run_publish()
        self.assertEqual(self.client.writes, 0)

    def test_modified_prepared_file_stops_before_any_write(self):
        (self.output/self.plan["assets"][0]["name"]).write_bytes(b"tampered")
        with self.assertRaisesRegex(layout.ReleaseError, "Prepared file changed"):
            self.run_publish()
        self.assertEqual(self.client.writes, 0)

    def test_concurrent_baseline_change_prevents_cleanup(self):
        def mutate(client):
            client.main["assets"][0]["digest"] = "changed"
        self.client.after_upload = mutate
        with self.assertRaisesRegex(layout.ReleaseError, "concurrently"):
            self.run_publish()
        self.assertEqual(self.client.deleted, [])

    def test_prepare_verify_mode_does_not_publish_or_create_resource_release(self):
        entry.prepare(self.client, "v0.2.0", SOURCE, self.base/"verify")
        self.assertEqual(self.client.writes, 0)
        self.assertIsNone(self.client.resources)

    def test_verify_transport_blocks_writes_before_opening_network(self):
        with patch.dict(os.environ, {"GH_TOKEN": "test-token"}):
            client = GitHub(allow_writes=False)
        with patch.object(client.opener, "open") as network:
            with self.assertRaisesRegex(layout.ReleaseError, "forbids"):
                client.api("/releases", "POST", {})
            network.assert_not_called()
        self.assertEqual(client.writes, 0)

    def test_redirect_never_forwards_authentication_to_asset_host(self):
        request = urllib.request.Request("https://api.github.com/repos/example/assets/1", headers={"Authorization": "Bearer test"})
        redirected = AuthRedirect().redirect_request(request, None, 302, "Found", {}, "https://release-assets.githubusercontent.com/file")
        self.assertIsNone(redirected.get_header("Authorization"))


if __name__ == "__main__":
    unittest.main()
