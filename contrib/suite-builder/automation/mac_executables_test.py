"""Exercise helper metadata supplied by Windows-built plugin release archives."""
import os
import pathlib
import tempfile
import unittest
import zipfile
from mac_executables import prepare_profile_executables


class NativeHelperMetadata(unittest.TestCase):
    def test_nonexecutable_arm64_helper_is_restored_and_archived(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            helper = root / 'node_modules/plugin/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'
            helper.parent.mkdir(parents=True)
            helper.write_bytes(b'\xcf\xfa\xed\xfe\x0c\x00\x00\x01fixture')
            helper.chmod(0o644)
            repaired = prepare_profile_executables(root)
            self.assertEqual(repaired, [helper.relative_to(root).as_posix()])
            if os.name != 'nt':
                self.assertEqual(helper.stat().st_mode & 0o777, 0o755)
                archive = root / 'helper.zip'
                with zipfile.ZipFile(archive, 'w') as z:
                    z.write(helper, repaired[0])
                with zipfile.ZipFile(archive) as z:
                    self.assertEqual((z.getinfo(repaired[0]).external_attr >> 16) & 0o777, 0o755)

    def test_wrong_cpu_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            helper = pathlib.Path(folder) / 'prebuilds/darwin-arm64/spawn-helper'
            helper.parent.mkdir(parents=True)
            helper.write_bytes(b'\xcf\xfa\xed\xfe\x07\x00\x00\x01fixture')
            with self.assertRaisesRegex(RuntimeError, 'architecture'):
                prepare_profile_executables(folder)

    def test_missing_helper_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'Missing'):
                prepare_profile_executables(folder)
