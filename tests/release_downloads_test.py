"""Content, naming, determinism and cross-platform notice regressions."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from release_fixture import fixture, layout, SOURCE, PACKAGING


class ReleaseDownloadsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        root, self.inputs = fixture(self.base)
        self.root_patch = patch.object(layout, "ROOT", root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def build(self, name="output", directory=None):
        output = self.base / name
        plan = layout.package(directory or self.inputs, output, "v0.2.0", SOURCE, PACKAGING)
        return output, plan

    def test_complete_runtime_sources_and_canonical_names(self):
        output, plan = self.build()
        layout.validate_plan(plan)
        files = layout.names("0.2.0")
        self.assertEqual(len([item for item in plan["assets"] if item["target"] == "main"]), 2)
        self.assertEqual(layout.sha(output/files["extension"]), layout.sha(self.inputs/"chrome.zip"))
        self.assertEqual(layout.sha(output/files["resources"]), layout.sha(self.inputs/"developer-resources.zip"))
        self.assertFalse((output/"SHA256SUMS.txt").exists())
        with zipfile.ZipFile(output/files["windows"]) as current, zipfile.ZipFile(self.inputs/"windows-full.zip") as old:
            for name in old.namelist():
                if name not in {"INSTALL.md", "PACKAGE.json"}:
                    self.assertEqual(current.read(name), old.read(name), name)
            self.assertIn(files["windows"], current.read("INSTALL.md").decode())
        body = layout.release_body(plan)
        self.assertIn("<summary>SHA-256</summary>", body)
        self.assertIn(files["windows"], body)
        self.assertNotIn("windows-full.zip", body)

    def test_same_input_is_deterministic_despite_input_mtime(self):
        first, plan = self.build("first")
        import os
        os.utime(self.inputs/"windows-full.zip", (1000000000, 1000000000))
        second, other = self.build("second")
        self.assertEqual(plan, other)
        for item in plan["assets"]:
            self.assertEqual(layout.sha(first/item["name"]), layout.sha(second/item["name"]))

    def test_target_layout_can_be_read_again_without_legacy_installers(self):
        first, plan = self.build("first")
        second, other = self.build("second", first)
        self.assertEqual(plan, other)
        self.assertFalse((first/"dictionary-companion-windows-x64.zip").exists())

    def test_notice_newlines_allowed_but_content_changes_rejected(self):
        layout.notice_equal(b"copyright\r\nlicense\r\n", b"copyright\nlicense\n", "LICENSE")
        with self.assertRaisesRegex(layout.ReleaseError, "LICENSE"):
            layout.notice_equal(b"changed\n", b"copyright\n", "LICENSE")

    def test_reject_traversal_and_windows_collisions(self):
        path = self.base/"unsafe.zip"
        for names in (("../settings.json",), ("/absolute",), ("C:relative",), ("..\\settings.json",), ("A.txt", "a.txt")):
            with self.subTest(names=names):
                with zipfile.ZipFile(path, "w") as archive:
                    for name in names:
                        archive.writestr(name, "x")
                with zipfile.ZipFile(path) as archive, self.assertRaises(layout.ReleaseError):
                    list(layout.safe_members(archive))

    def test_source_corruption_prevents_output_downloads(self):
        (self.inputs/"developer-resources.zip").write_bytes(b"corrupt")
        with self.assertRaises(zipfile.BadZipFile):
            self.build()
        self.assertFalse((self.base/"output"/layout.names("0.2.0")["windows"]).exists())

    def test_plan_does_not_accept_external_paths(self):
        _, plan = self.build()
        plan["assets"][0]["name"] = "../secret"
        with self.assertRaises(layout.ReleaseError):
            layout.validate_plan(plan)


if __name__ == "__main__":
    unittest.main()
