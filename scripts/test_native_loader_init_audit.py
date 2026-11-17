import hashlib
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest

from native_loader_init_audit import audit_bytes, InvalidElf


def fixture():
    data = bytearray(0x508)
    data[:16] = b'\x7fELF\x02\x01\x01' + bytes(9)
    struct.pack_into('<HHIQQQIHHHHHH', data, 16,
                     3, 183, 1, 0, 64, 0, 0, 64, 56, 4, 64, 0, 0)
    for i, header in enumerate([
        (1, 4, 0, 0, 0, 0x400, 0x400, 1),
        (2, 4, 0x200, 0x200, 0x200, 0x80, 0x80, 8),
        (1, 5, 0x400, 0x60e5e8, 0x60e5e8, 64, 64, 1),
        (1, 6, 0x500, 0x676898, 0x676898, 8, 8, 8),
    ]):
        struct.pack_into('<IIQQQQQQ', data, 64 + i * 56, *header)
    for i, tag in enumerate([(7, 0x300), (8, 24), (9, 24), (25, 0x676898), (27, 8), (0, 0)]):
        struct.pack_into('<qQ', data, 0x200 + i * 16, *tag)
    struct.pack_into('<QQq', data, 0x300, 0x676898, 1027, 0x60e5e8)
    struct.pack_into('<16I', data, 0x400, *([0xd503201f] * 16))
    return data


def audit(data):
    return audit_bytes(data, hashlib.sha256(data).hexdigest())


class InitAuditTests(unittest.TestCase):
    def test_synthetic_checkpoint(self):
        report = audit(fixture())
        self.assertTrue(report['matches_published_20261116_metadata'])
        self.assertFalse(report['dt_init_present'])
        self.assertEqual(report['standard_rela_count'], 1)
        self.assertEqual(report['init_array'][0]['conditional_target'], '0x60e5e8')
        self.assertEqual(report['init_array'][0]['prefix_words_le'], ['0xd503201f'] * 16)
        self.assertEqual(report['init_array'][0]['prefix_hex'], '1f2003d5' * 16)

    def test_digest_precedes_parsing(self):
        with self.assertRaisesRegex(InvalidElf, 'SHA256 does not match'):
            audit_bytes(b'not an ELF', '0' * 64)
        with self.assertRaisesRegex(InvalidElf, 'independently retained'):
            audit_bytes(fixture(), 'short')

    def test_truncation_and_wrong_architecture(self):
        for end in [0, 63, 150, 0x500, 0x507]:
            with self.subTest(end=end), self.assertRaises(InvalidElf):
                audit(fixture()[:end])
        data = fixture()
        struct.pack_into('<H', data, 18, 40)
        with self.assertRaisesRegex(InvalidElf, 'ARM64'):
            audit(data)

    def test_zero_filled_target_is_not_original_file_bytes(self):
        data = fixture()
        struct.pack_into('<Q', data, 64 + 2 * 56 + 32, 0)
        with self.assertRaisesRegex(InvalidElf, 'zero-filled'):
            audit(data)

    def test_non_executable_prefix(self):
        data = fixture()
        struct.pack_into('<I', data, 64 + 2 * 56 + 4, 4)
        with self.assertRaisesRegex(InvalidElf, 'executable'):
            audit(data)

    def test_dynamic_mapping_mismatch(self):
        data = fixture()
        struct.pack_into('<Q', data, 64 + 56 + 8, 0x210)
        with self.assertRaisesRegex(InvalidElf, 'disagrees'):
            audit(data)

    def test_overlapping_load_mappings_are_rejected(self):
        data = fixture()
        struct.pack_into('<H', data, 56, 5)
        data[64 + 4 * 56:64 + 5 * 56] = data[64 + 2 * 56:64 + 3 * 56]
        with self.assertRaisesRegex(InvalidElf, 'ambiguously mapped'):
            audit(data)

    def test_unaligned_relative_target_is_rejected(self):
        data = fixture()
        struct.pack_into('<q', data, 0x310, 0x60e5e9)
        with self.assertRaisesRegex(InvalidElf, 'aligned ARM64'):
            audit(data)

    def test_cli_success_mismatch_and_authentication_status(self):
        script = Path(__file__).with_name('native_loader_init_audit.py')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.so'
            for modify, expected_status in [(False, 0), (True, 2)]:
                data = fixture()
                if modify:
                    struct.pack_into('<Q', data, 0x500, 1)
                path.write_bytes(data)
                result = subprocess.run([sys.executable, str(script), str(path),
                                         '--expected-sha256', hashlib.sha256(data).hexdigest()],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, expected_status, result.stderr)
            result = subprocess.run([sys.executable, str(script), str(path),
                                     '--expected-sha256', '0' * 64],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('SHA256 does not match', result.stderr)

    def test_duplicate_dynamic_tag(self):
        data = fixture()
        struct.pack_into('<qQ', data, 0x250, 25, 0x676898)
        with self.assertRaisesRegex(InvalidElf, 'duplicate'):
            audit(data)

    def test_missing_dynamic_terminator(self):
        data = fixture()
        for offset in [0x250, 0x260, 0x270]:
            struct.pack_into('<qQ', data, offset, 1, 0)
        with self.assertRaisesRegex(InvalidElf, 'Unterminated'):
            audit(data)

    def test_duplicate_relocation_does_not_establish_unique_target(self):
        data = fixture()
        struct.pack_into('<qQ', data, 0x210, 8, 48)
        data[0x318:0x330] = data[0x300:0x318]
        report = audit(data)
        self.assertFalse(report['matches_published_20261116_metadata'])
        self.assertNotIn('conditional_target', report['init_array'][0])
        self.assertEqual(len(report['init_array'][0]['standard_rela_matches']), 2)

    def test_wrong_symbol_type_or_cell_do_not_match(self):
        for info in [(1 << 32) | 1027, 257]:
            data = fixture()
            struct.pack_into('<Q', data, 0x308, info)
            report = audit(data)
            self.assertFalse(report['matches_published_20261116_metadata'])
            self.assertNotIn('conditional_target', report['init_array'][0])
        data = fixture()
        struct.pack_into('<Q', data, 0x500, 1)
        self.assertFalse(audit(data)['matches_published_20261116_metadata'])

    def test_dt_init_is_not_silently_ignored(self):
        data = fixture()
        struct.pack_into('<qQ', data, 0x250, 12, 0x60e5e8)
        report = audit(data)
        self.assertTrue(report['dt_init_present'])
        self.assertFalse(report['matches_published_20261116_metadata'])

    @unittest.skipUnless(shutil.which('readelf'), 'Independent binutils decoder unavailable')
    def test_independent_readelf_on_synthetic_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.so'
            path.write_bytes(fixture())
            result = subprocess.run(['readelf', '-W', '-h', '-l', '-d', '-r', str(path)],
                                    capture_output=True, text=True, check=True)
        text = result.stdout
        self.assertIn('AArch64', text)
        self.assertIn('(INIT_ARRAY)', text)
        self.assertIn('0x676898', text)
        self.assertIn('(INIT_ARRAYSZ)', text)
        # A sectionless fixture needs --use-dynamic to make readelf inspect DT_RELA.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.so'
            path.write_bytes(fixture())
            relocations = subprocess.run(['readelf', '-W', '--use-dynamic', '-r', str(path)],
                                        capture_output=True, text=True, check=True).stdout
        self.assertIn('R_AARCH64_RELATIVE', relocations)
        self.assertIn('60e5e8', relocations)


if __name__ == '__main__':
    unittest.main()
