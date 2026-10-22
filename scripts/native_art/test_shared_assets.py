import hashlib
import json
import tempfile
from unittest.mock import patch
from pathlib import Path
import unittest

from PIL import Image
from native_art.shared_assets import (
    SHARED_TEXTURES, SharedTexture, owned_asset_paths, redirect_shared_textures,
)


class SharedAssetTests(unittest.TestCase):
    def fixture(self):
        image = Image.frombytes('RGBA', (2, 1), bytes([10, 20, 30, 0, 40, 50, 60, 255]))
        shared = SharedTexture('assets/owner/shared.png', image.size,
                               hashlib.sha256(image.tobytes()).hexdigest())
        return image, shared

    def test_alias_rewrites_outputs_and_nested_paths_without_changing_pixels(self):
        image, shared = self.fixture()
        old = 'assets/importer/texture.png'
        outputs = {old: image, 'assets/importer/sound.ogg': b'sound'}
        references = {'native': {'textures': [{'path': old}]},
                      'runtime': {'textures': {'8': {'path': old}}}, 'note': old + '.extra'}
        redirect_shared_textures(outputs, references, {old: shared})
        self.assertEqual(set(outputs), {shared.path, 'assets/importer/sound.ogg'})
        self.assertIs(outputs[shared.path], image)
        self.assertEqual(references['native']['textures'][0]['path'], shared.path)
        self.assertEqual(references['runtime']['textures']['8']['path'], shared.path)
        self.assertEqual(references['note'], old + '.extra')
        self.assertEqual(owned_asset_paths(outputs, 'assets/importer'),
                         {'assets/importer/sound.ogg'})

    def test_changed_transparent_rgb_is_rejected_before_mutation(self):
        image, shared = self.fixture()
        image.putpixel((0, 0), (11, 20, 30, 0))
        outputs = {'old': image}
        references = {'path': 'old'}
        with self.assertRaisesRegex(ValueError, 'pixels differ'):
            redirect_shared_textures(outputs, references, {'old': shared})
        self.assertEqual(set(outputs), {'old'})
        self.assertEqual(references, {'path': 'old'})

    def test_same_bytes_with_different_dimensions_cannot_be_aliased(self):
        image, shared = self.fixture()
        reshaped = Image.frombytes('RGBA', (1, 2), image.tobytes())
        with self.assertRaisesRegex(ValueError, 'pixels differ'):
            redirect_shared_textures({'old': reshaped}, {}, {'old': shared})

    def test_existing_different_target_is_not_overwritten(self):
        image, shared = self.fixture()
        other = Image.new('RGBA', image.size, (1, 2, 3, 4))
        outputs = {'old': image, shared.path: other}
        with self.assertRaisesRegex(ValueError, 'target differs'):
            redirect_shared_textures(outputs, {}, {'old': shared})
        self.assertIs(outputs[shared.path], other)
        self.assertIn('old', outputs)

    def test_all_planned_aliases_validate_before_any_path_changes(self):
        image, shared = self.fixture()
        outputs = {'first': image, 'second': Image.new('RGBA', image.size)}
        references = {'path': 'first'}
        with self.assertRaisesRegex(ValueError, 'pixels differ'):
            redirect_shared_textures(outputs, references, {'first': shared, 'second': shared})
        self.assertEqual(set(outputs), {'first', 'second'})
        self.assertEqual(references, {'path': 'first'})

    def trap_fixture(self):
        original = 'assets/buildings/tornado-trap-native/texture/texture-18.png'
        shared = SHARED_TEXTURES[original]
        public = Path(__file__).resolve().parents[2] / 'public'
        with Image.open(public / shared.path) as image:
            pixels = image.copy()
        return original, shared, pixels

    def test_trap_writer_checks_shared_outputs_and_rejects_extra_owned_files(self):
        from native_art import late_traps
        original, shared, pixels = self.trap_fixture()
        folder = 'assets/buildings/tornado-trap-native'

        def build():
            return ({original: pixels, folder + '/sample.ogg': b'sound'},
                    {'runtime': {'textures': {'18': {'path': original}}}})

        with tempfile.TemporaryDirectory() as directory, patch.object(late_traps, 'ROOT', Path(directory)):
            root = Path(directory)
            late_traps.write(*build(), folder, 'reference/trap', False, 'test trap')
            late_traps.write(*build(), folder, 'reference/trap', True, 'test trap')
            reference = json.loads((root / 'reference/trap/runtime.json').read_text())
            self.assertEqual(reference['textures']['18']['path'], shared.path)
            (root / 'public' / folder / 'unexpected.png').write_bytes(b'stale')
            with self.assertRaisesRegex(ValueError, 'membership differs'):
                late_traps.write(*build(), folder, 'reference/trap', True, 'test trap')

    def test_trap_writer_does_not_skip_shared_page_pixels(self):
        from native_art import late_traps
        original, shared, pixels = self.trap_fixture()
        folder = 'assets/buildings/tornado-trap-native'

        def build():
            return ({original: pixels}, {'runtime': {'path': original}})

        with tempfile.TemporaryDirectory() as directory, patch.object(late_traps, 'ROOT', Path(directory)):
            late_traps.write(*build(), folder, 'reference/trap', False, 'test trap')
            image = pixels.copy()
            red, green, blue, alpha = image.getpixel((0, 0))
            image.putpixel((0, 0), ((red + 1) % 256, green, blue, alpha))
            image.save(Path(directory) / 'public' / shared.path)
            with self.assertRaisesRegex(ValueError, 'Pixels differ'):
                late_traps.write(*build(), folder, 'reference/trap', True, 'test trap')

    def test_pinned_shared_pages_match_the_shipping_pixels(self):
        root = Path(__file__).resolve().parents[2] / 'public'
        for shared in set(SHARED_TEXTURES.values()):
            with self.subTest(path=shared.path), Image.open(root / shared.path) as image:
                self.assertEqual(image.mode, 'RGBA')
                self.assertEqual(image.size, shared.size)
                self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(), shared.rgba_sha256)


if __name__ == '__main__':
    unittest.main()
