import hashlib
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

    def test_pinned_shared_pages_match_the_shipping_pixels(self):
        root = Path(__file__).resolve().parents[2] / 'public'
        for shared in set(SHARED_TEXTURES.values()):
            with self.subTest(path=shared.path), Image.open(root / shared.path) as image:
                self.assertEqual(image.mode, 'RGBA')
                self.assertEqual(image.size, shared.size)
                self.assertEqual(hashlib.sha256(image.tobytes()).hexdigest(), shared.rgba_sha256)


if __name__ == '__main__':
    unittest.main()
