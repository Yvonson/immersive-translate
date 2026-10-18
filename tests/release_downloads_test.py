"""Runtime/source preservation and unsafe input regressions for release packaging."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_downloads", ROOT / "scripts/package-release-downloads.py")
downloads = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloads)


class ReleaseDownloadsTests(unittest.TestCase):
    def test_reject_traversal_and_windows_name_collisions(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "unsafe.zip"
            for names in (("../settings.json",), ("/absolute",), ("C:relative",), ("..\\settings.json",), ("A.txt", "a.txt")):
                with zipfile.ZipFile(path, "w") as archive:
                    for name in names:
                        archive.writestr(name, "x")
                with zipfile.ZipFile(path) as archive, self.assertRaises(ValueError):
                    list(downloads.safe_members(archive))

    def fixture(self, directory):
        for name, files in {"chrome.zip": {"manifest.json": "extension", "LICENSE": "MPL"},
                            "dictionary-companion-windows-x64.zip": {"install.ps1": "installer", "dictionary-companion/program.exe": "runtime"},
                            "dictionary-core.zip": {"dictionary.sqlite3": "definitions"},
                            "dictionary-companion-sources.zip": {"companion/main.py": "source", "companion/LICENSE": "GPL"}}.items():
            with zipfile.ZipFile(directory / name, "w") as archive:
                for filename, data in files.items():
                    archive.writestr(filename, data)
        (directory / "SHA256SUMS.txt").write_text("historical checksums", encoding="utf-8")
        records = [{"name": name, "bytes": (directory/name).stat().st_size, "sha256": downloads.sha(directory/name)}
                   for name in sorted(downloads.RUNTIME | {"dictionary-companion-sources.zip"})]
        manifest = {"version": "0.2.0", "tag": "v0.2.0", "commit": "a" * 40, "assets": records}
        (directory / "release-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def test_complete_runtime_and_corresponding_source_remain_available(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "inputs"
            source.mkdir()
            self.fixture(source)
            output = Path(temporary) / "output"
            plan = downloads.package(source, output)
            self.assertEqual({item["name"] for item in plan["assets"]}, downloads.DOWNLOADS)
            self.assertEqual((output/"chrome.zip").read_bytes(), (source/"chrome.zip").read_bytes())
            with zipfile.ZipFile(output/"windows-full.zip") as archive:
                self.assertEqual(archive.read("companion/install.ps1"), b"installer")
                self.assertEqual(archive.read("dictionary-core.zip"), (source/"dictionary-core.zip").read_bytes())
                self.assertIn("chrome/manifest.json", archive.namelist())
                self.assertIn("INSTALL.md", archive.namelist())
            with zipfile.ZipFile(output/"developer-resources.zip") as archive:
                self.assertEqual(archive.read("dictionary-companion-sources.zip"), (source/"dictionary-companion-sources.zip").read_bytes())
                self.assertNotIn("dictionary-core.zip", archive.namelist())
            self.assertEqual(len((output/"SHA256SUMS.txt").read_text().splitlines()), 3)

    def test_corrupt_input_stops_before_creating_downloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "inputs"
            source.mkdir()
            self.fixture(source)
            (source/"dictionary-companion-sources.zip").write_bytes(b"corrupt")
            output = Path(temporary) / "output"
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                downloads.package(source, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
