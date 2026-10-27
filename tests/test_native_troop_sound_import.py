"""The sound importer only reuses shipped audio after its original source hash matches."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/import-native-troop-sounds.py'


class SoundSourceTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sound_import', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.module.ROOT = self.root
        self.module.ARCHIVE = self.root / 'archive'
        self.module.CACHE = self.root / 'cache'
        self.data = b'OggS-original-source-fixture'
        self.path = 'sfx/fixture.ogg'
        self.pins = {self.path: hashlib.sha256(self.data).hexdigest()}
        self.shipped = self.root / 'public' / self.module.AUDIO / 'fixture.ogg'
        self.shipped.parent.mkdir(parents=True)
        self.shipped.write_bytes(self.data)

    def test_verified_shipped_source_needs_no_download(self):
        with patch.object(self.module.subprocess, 'run') as run:
            self.assertEqual(self.module.source(self.path, self.pins), self.data)
            run.assert_not_called()

    def test_edited_shipped_audio_is_not_trusted(self):
        self.shipped.write_bytes(b'edited-audio')
        with patch.object(self.module.subprocess, 'run', side_effect=RuntimeError('download required')):
            with self.assertRaisesRegex(RuntimeError, 'download required'):
                self.module.source(self.path, self.pins)

    def test_existing_corrupt_cache_is_rejected_even_when_shipped_audio_matches(self):
        cached = self.module.CACHE / self.path
        cached.parent.mkdir(parents=True)
        cached.write_bytes(b'corrupt-cache')
        with self.assertRaisesRegex(SystemExit, 'Source checksum differs'):
            self.module.source(self.path, self.pins)

    def test_valid_cache_is_authoritative_over_edited_output(self):
        self.shipped.write_bytes(b'edited-audio')
        cached = self.module.CACHE / self.path
        cached.parent.mkdir(parents=True)
        cached.write_bytes(self.data)
        self.assertEqual(self.module.source(self.path, self.pins), self.data)

    def test_unpinned_path_is_rejected_before_any_download(self):
        with patch.object(self.module.subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'not in the client manifest'):
                self.module.source('sfx/not-pinned.ogg', self.pins)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
