import copy
import unittest

import numpy as np

from native_art.scene_graph import capture_graph
from native_art.static_scene import FrameZeroScene


class SourceFixture:
    exports = {'portrait': 10}
    shapes = {1: None, 3: None}
    clips = {10: None}
    modifiers = {2: 1}
    textfields = {}

    def __init__(self):
        self.root = dict(bank=0, fps=24, children=[1, 2, 3], names=['first', 'mask', 'last'],
                         blending=[0, 0, 8], frames=[[(2, 2, 1), (0, 1, 2)], [(1, 0, 0)]],
                         labels=['idle', 'masked'])

    def clip(self, _):
        return self.root

    def commands(self, _):
        return [(0, np.array([[0, 0, 0, 0], [1, 0, 65535, 0], [1, 1, 65535, 65535]]))]

    def matrix(self, _, index):
        return np.array([[1, 0, index], [0, 1, -index], [0, 0, 1]])

    def color(self, _, index):
        return np.array([index / 10, 1, 1, 1]), np.zeros(4)


class StaticSceneTests(unittest.TestCase):
    def test_keeps_visible_order_transforms_colors_and_blends(self):
        source = SourceFixture()
        graph = capture_graph(FrameZeroScene(source), source.exports)
        root = graph['clips']['10']
        self.assertEqual(root['children'], [3, 1])
        self.assertEqual(root['names'], ['last', 'first'])
        self.assertEqual(root['blending'], [8, 0])
        self.assertEqual(root['timeline'], [0])
        self.assertEqual(root['labels'], [[0, 'idle']])
        self.assertEqual([p[0] for p in root['frames'][0]], [0, 1])
        self.assertEqual(graph['matrices'], [[1, 0, 2, 0, 1, -2], [1, 0, 1, 0, 1, -1]])
        self.assertEqual([color[0] for color in graph['colors']], [0.1, 0.2])
        self.assertEqual(set(graph['shapes']), {'1', '3'})

    def test_does_not_mutate_the_source_clip(self):
        source = SourceFixture()
        before = copy.deepcopy(source.root)
        capture_graph(FrameZeroScene(source), source.exports)
        self.assertEqual(source.root, before)

    def test_active_masks_still_fail_strict_capture(self):
        source = SourceFixture()
        source.root['frames'][0] = [(1, 0, 0)]
        with self.assertRaisesRegex(ValueError, 'Masks are unsupported'):
            capture_graph(FrameZeroScene(source), source.exports)

    def test_an_empty_first_frame_stays_empty(self):
        source = SourceFixture()
        source.root['frames'][0] = []
        graph = capture_graph(FrameZeroScene(source), source.exports)
        self.assertEqual(graph['shapes'], {})
        self.assertEqual(graph['clips']['10']['children'], [])
        self.assertEqual(graph['clips']['10']['frames'], [[]])


if __name__ == '__main__':
    unittest.main()
