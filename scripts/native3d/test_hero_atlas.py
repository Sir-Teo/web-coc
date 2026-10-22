import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from native3d import bake_hero_art as baker


class HeroAtlasTests(unittest.TestCase):
    def fixture(self, key, labels, same_clip=False, changed=False):
        states, frames = {}, []
        for index, label in enumerate(labels):
            pixels = np.array([[[10, 20, 30, 0], [40, 50, 60, 255]]], dtype=np.uint8)
            if changed and index:
                pixels[0, 0, 0] += 1
            frames.append(dict(pixels=pixels, anchorX=1, anchorY=0))
            states[label] = dict(
                state=dict(file='same' if same_clip else label, scale=1, lookAtCamera=False,
                           loop=index == 0),
                info=dict(sampledNativeFrames=[0], nativeFps=24), refs={(0, 0): index},
                directions=[0], frames=1, action=index + 1, fps=24, loopStart=None)
        return dict(key=key, skin='fixture'), dict(states=states), frames

    def assert_page_alias(self, key, labels, same_clip=False):
        atlas, images = baker.build_atlas(*self.fixture(key, labels, same_clip))
        self.assertEqual(set(images), {labels[1] + '.png'})
        for index, label in enumerate(labels):
            state = atlas['states'][label]
            self.assertEqual(state['actionFrame'], index + 1)
            self.assertEqual(state['loop'], index == 0)
            self.assertEqual({frame['image'] for row in state['frames'] for frame in row},
                             {labels[1] + '.png'})
            self.assertTrue(all(frame['anchorX'] == 1 for row in state['frames'] for frame in row))

    def test_prince_keeps_the_shipping_idle_page_for_identical_separate_clips(self):
        self.assert_page_alias('prince', ['walk', 'idle'])

    def test_prince_renames_the_shared_walk_sheet_when_idle_reuses_its_clip(self):
        self.assert_page_alias('prince', ['walk', 'idle'], same_clip=True)

    def test_flying_warden_keeps_the_shipping_idle_page(self):
        self.assert_page_alias('warden', ['alt_walk', 'alt_idle'])

    def test_alias_rejects_different_rgb_under_transparent_pixels(self):
        with self.assertRaisesRegex(SystemExit, 'pixels differ'):
            baker.build_atlas(*self.fixture('warden', ['alt_walk', 'alt_idle'], changed=True))

    def test_unrelated_characters_keep_their_own_pages(self):
        _, images = baker.build_atlas(*self.fixture('queen', ['walk', 'idle']))
        self.assertEqual(set(images), {'walk.png', 'idle.png'})


class SourceCacheTests(unittest.TestCase):
    def fixture(self, root):
        payload = b'verified source input'
        relative = 'sc3d/example.anim'
        fingerprint = json.dumps({'files': [{'file': relative,
                                            'sha': hashlib.sha1(payload).hexdigest()}]}).encode()
        cache = root / 'output/native-campaign-source'
        (cache / relative).parent.mkdir(parents=True)
        (cache / relative).write_bytes(payload)
        (cache / 'fingerprint.json').write_bytes(fingerprint)
        return payload, relative, cache, fingerprint

    def test_cache_fallback_verifies_fingerprint_and_each_source_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload, relative, cache, fingerprint = self.fixture(root)
            with patch.object(baker, 'ROOT', root), patch.object(baker, 'ARCHIVE', root / 'archive'), \
                    patch.object(baker, 'FINGERPRINT_SHA256', hashlib.sha256(fingerprint).hexdigest()):
                source = baker.Source()
                self.assertEqual(source.read(relative), payload)
                self.assertEqual(source.pins[relative], hashlib.sha256(payload).hexdigest())
                (cache / relative).write_bytes(b'changed')
                with self.assertRaisesRegex(SystemExit, 'Source mismatch'):
                    source.read(relative)
                (cache / 'fingerprint.json').write_bytes(b'changed')
                with self.assertRaisesRegex(SystemExit, 'fingerprint differs'):
                    baker.Source()

    def test_archive_inputs_take_precedence_over_the_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload, relative, cache, fingerprint = self.fixture(root)
            archive = root / 'archive'
            (archive / 'files' / relative).parent.mkdir(parents=True)
            (archive / 'files' / relative).write_bytes(payload)
            (archive / 'fingerprint.json').write_bytes(fingerprint)
            (cache / relative).write_bytes(b'changed')
            (cache / 'fingerprint.json').write_bytes(b'changed')
            with patch.object(baker, 'ROOT', root), patch.object(baker, 'ARCHIVE', archive), \
                    patch.object(baker, 'FINGERPRINT_SHA256', hashlib.sha256(fingerprint).hexdigest()):
                self.assertEqual(baker.Source().read(relative), payload)


if __name__ == '__main__':
    unittest.main()
