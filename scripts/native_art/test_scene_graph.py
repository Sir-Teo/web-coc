"""Independent checks for retained controls, source sampling and fail-closed blends."""
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_art.scene_graph import capture_graph, crop_textures, graph_draws
from native_art.sc6 import rasterize


class Reader:
    shapes, modifiers = {2: None}, {}

    def clip(self, id_):
        if id_ == 0:
            return dict(fps=30, bank=0, children=[1, 1], names=['turret', 'ammo'], blending=[0, 0],
                        frames=[[[0, 0, 0], [1, 1, 0]], [], [[0, 0, 0]]], labels=['Init', '', ''])
        return dict(fps=15, bank=0, children=[2], names=[''], blending=[0],
                    frames=[[[0, 2, 1]], [[0, 3, 1]], [[0, 2, 1]]], labels=['', '', ''])

    def matrix(self, bank, index):
        return np.array([[1, .25 if index == 0 else 0, index * 2], [0, 1, 0], [0, 0, 1]])

    def color(self, bank, index):
        return (np.array([.5, 1, 1, .5]), np.array([.1, 0, 0, 0])) if index == 0 else (np.ones(4), np.zeros(4))

    def commands(self, id_):
        return [(7, np.array([[0, 0, 22000, 16000], [0, 3, 22000, 50000],
                              [4, 0, 45000, 16000], [4, 3, 45000, 50000]]))]


class SceneGraphTests(unittest.TestCase):
    def test_shared_objects_keep_distinct_names_transforms_and_manual_direction(self):
        graph = capture_graph(Reader(), {'weapon': 0})
        self.assertEqual(graph['clips']['0']['names'], ['turret', 'ammo'])
        self.assertEqual(graph['clips']['1']['timeline'], [0, 1, 0])
        self.assertEqual(graph['clips']['0']['labels'], [[0, 'Init']])
        draws = list(graph_draws(graph, 0, controls={'turret': 1, 'ammo': 0}))
        self.assertEqual([d[2][0, 2] for d in draws], [6, 6])
        self.assertEqual(draws[0][2][0, 1], .25)
        self.assertEqual(draws[1][2][0, 1], 0)
        np.testing.assert_array_equal(draws[0][3][0], [.5, 1, 1, .5])
        np.testing.assert_array_equal(draws[0][3][1], [.1, 0, 0, 0])

    def test_timeline_reinsertion_looping_and_nested_fps(self):
        graph = capture_graph(Reader(), {'weapon': 0})
        self.assertEqual(list(graph_draws(graph, 0, 1)), [])
        # Removed at frame 1, reinserted at 2, continuous over the root wrap at 3.
        self.assertEqual([list(graph_draws(graph, 0, f))[0][2][0, 2] for f in [0, 2, 3]], [4, 4, 4])
        graph['clips']['0']['timeline'] = [0]
        self.assertEqual([list(graph_draws(graph, 0, f))[0][2][0, 2] for f in range(5)], [4, 4, 6, 6, 4])

    def test_retains_additive_leaf_without_flattening_and_rejects_group_approximation(self):
        graph = capture_graph(Reader(), {'weapon': 0})
        graph['clips']['1']['blending'] = [8]
        self.assertEqual([d[-1] for d in graph_draws(graph, 0)], [8, 8])
        graph['clips']['0']['blending'] = [8, 0]
        with self.assertRaisesRegex(ValueError, 'isolated compositing'):
            list(graph_draws(graph, 0))

    def test_crop_keeps_fractional_bilinear_samples_and_transparent_rgb_exact(self):
        graph = capture_graph(Reader(), {'weapon': 0})
        pixels = np.random.default_rng(438).integers(0, 256, (13, 17, 4), dtype=np.uint8)
        pixels[::2, ::2, 3] = 0
        outputs, textures, runtime = crop_textures(graph, {7: Image.fromarray(pixels)}, 'test')
        image = outputs['test/texture-7.png']
        self.assertLess(image.width, 17)
        self.assertLess(image.height, 13)
        left, top, right, bottom = textures['7']['bounds']
        np.testing.assert_array_equal(np.array(image), pixels[top:bottom, left:right])
        before = list(graph_draws(graph, 0, controls={'turret': 1, 'ammo': 0}))
        after = list(graph_draws(runtime, 0, controls={'turret': 1, 'ammo': 0}))
        for draw in after:
            draw[1][:, 2:] *= 65535
        a = rasterize([d[:4] for d in before], {7: pixels / 255}, (0, 0, 12, 4))
        b = rasterize([d[:4] for d in after], {7: np.array(image) / 255}, (0, 0, 12, 4))
        self.assertEqual(a.tobytes(), b.tobytes())

    def test_texture_edges_keep_clamped_neighbours(self):
        graph = dict(shapes={'2': [[7, [0, 0, 0, 0, 0, 1, 0, 65535, 1, 0, 65535, 0, 1, 1, 65535, 65535]]]})
        im = Image.new('RGBA', (3, 5), (73, 16, 201, 47))
        outputs, textures, _ = crop_textures(graph, {7: im}, 'edge')
        self.assertEqual(textures['7']['bounds'], [0, 0, 3, 5])
        self.assertEqual(outputs['edge/texture-7.png'].tobytes(), im.tobytes())

    def test_packed_distant_regions_keep_independent_fractional_samples(self):
        pixels = np.random.default_rng(531).integers(0, 256, (128, 128, 4), dtype=np.uint8)
        a = np.array([[0, 0, 1000, 1000], [0, 5, 1000, 3900], [5, 0, 3900, 1000], [5, 5, 3900, 3900]])
        b = a.copy()
        b[:, 2:] += 60000
        graph = dict(shapes={'1': [[7, a.reshape(-1).tolist()]], '2': [[7, b.reshape(-1).tolist()]]})
        outputs, textures, runtime = crop_textures(graph, {7: Image.fromarray(pixels)}, 'packed')
        t = textures['7']
        self.assertEqual(t['packing'], 'packed source regions')
        self.assertLess(t['width'] * t['height'], 128 * 128 / 8)
        packed = np.array(outputs[t['path']]) / 255
        for id_, original in [('1', a), ('2', b)]:
            vertices = np.array(runtime['shapes'][id_][0][1]).reshape(-1, 4)
            vertices[:, 2:] *= 65535
            color = (np.ones(4), np.zeros(4))
            expected = rasterize([(7, original, np.eye(3), color)], {7: pixels / 255}, (0, 0, 5, 5))
            actual = rasterize([(7, vertices, np.eye(3), color)], {7: packed}, (0, 0, 5, 5))
            self.assertEqual(expected.tobytes(), actual.tobytes())

    def test_cycles_and_unsupported_blends_fail_before_export(self):
        reader = Reader()
        original = reader.clip
        def cycle(id_):
            c = original(id_)
            if id_ == 1:
                c['children'] = [0]
            return c
        reader.clip = cycle
        with self.assertRaisesRegex(ValueError, 'Recursive'):
            capture_graph(reader, {'weapon': 0})
        def blend(id_):
            c = original(id_)
            c['blending'][0] = 3
            return c
        reader.clip = blend
        with self.assertRaisesRegex(ValueError, 'Unsupported scene blend'):
            capture_graph(reader, {'weapon': 0})


if __name__ == '__main__':
    unittest.main()
