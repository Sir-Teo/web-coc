"""Independent travel-track, relative registration and atlas pixel checks."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_art.atlas import atlas_group, root_track


class TravelingClip:
    exports = {'moving': 0}
    origins = [(1000.25, -500.5), (-300.75, 250.25), (0, 0)]

    def clip(self, id_):
        return dict(id=id_, fps=24, bank=0, labels=['', '', ''],
                    frames=[[[0, i, 65535], [1, i, 65535]] for i in range(3)])

    def matrix(self, bank, index):
        m = np.eye(3)
        m[:2, 2] = self.origins[index]
        return m

    def draw_list(self, id_, frame, matrix):
        v = np.array([[0, 0, 0, 0], [0, 2, 0, 65535],
                      [2, 0, 65535, 0], [2, 2, 65535, 65535]])
        root = self.matrix(0, frame)
        yield 0, v, matrix @ root, (np.ones(4), np.zeros(4))
        root[0, 2] += 4 if frame < 2 else 5
        yield 1, v, matrix @ root, (np.ones(4), np.zeros(4))


class AtlasTests(unittest.TestCase):
    def test_root_track_keeps_nested_phase_and_restarts_after_a_gap(self):
        reader = TravelingClip()
        root = dict(id=0, fps=24, bank=0, children=[1],
                    frames=[[[0, 0, 65535]], [[0, 1, 65535]], [], [[0, 2, 65535]]])
        child = dict(id=1, fps=12, frames=[[], [], []])
        reader.clip = lambda i: root if i == 0 else child
        reader.color = lambda bank, tint: (np.array([1, 1, 1, .5]), np.zeros(4))
        track = root_track(reader, 'moving')
        self.assertEqual([f[0]['frame'] if f else None for f in track['frames']], [0, 0, None, 0])
        self.assertEqual(track['frames'][0][0]['matrix'], [1, 0, 1000.25, 0, 1, -500.5])
        self.assertEqual(track['frames'][1][0]['multiply'], [1, 1, 1, .5])

    def test_travel_deduplicates_identical_poses_without_losing_relative_child_motion(self):
        textures = {0: np.array([[[1, 0, 0, 1]]]), 1: np.array([[[0, 0, 1, 1]]])}
        outputs, meta = atlas_group(TravelingClip(), textures, {'flight': 'moving'}, 'test', travel=True)
        clip = meta['clips']['flight']
        self.assertEqual(clip['offsets'], [[1000.25, -500.5], [-300.75, 250.25], [0, 0]])
        self.assertEqual(clip['frames'], [0, 0, 1])
        self.assertEqual(meta['bounds'], [-2, -2, 9, 4])
        image = outputs['test-0.png']
        # Density two: red at x=0, blue at x=4, then blue shifts to x=5.
        self.assertEqual(image.getpixel((4, 4)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((12, 4)), (0, 0, 255, 255))
        self.assertEqual(image.getpixel((meta['width'] + 12, 4)), (0, 0, 0, 0))
        self.assertEqual(image.getpixel((meta['width'] + 14, 4)), (0, 0, 255, 255))
        self.assertEqual(meta['frames'][0]['alphaBounds'], (4, 4, 16, 8))
        self.assertEqual(meta['frames'][1]['alphaBounds'], (4, 4, 18, 8))


if __name__ == '__main__':
    unittest.main()
