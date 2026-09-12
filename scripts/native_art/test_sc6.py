"""Small adversarial format and pixel-registration checks; no network needed."""
import struct
import unittest

import numpy as np

from sc6 import Flat, SC6, decode_sctx, rasterize


class NativeArtTests(unittest.TestCase):
    def test_invalid_pointer_cannot_read_another_chunk(self):
        with self.assertRaisesRegex(ValueError, 'outside its chunk'):
            Flat(struct.pack('<I', 128)).ref(0)
        with self.assertRaises(ValueError):
            Flat(bytes(8)).span(-1, 4)

    def test_rejects_wrong_container_version_and_truncation(self):
        for data in (b'SC', b'SC' + struct.pack('<IHI', 5, 0, 0), b'SC' + struct.pack('<IHI', 6, 0, 256)):
            with self.assertRaises(ValueError):
                SC6(data)
        with self.assertRaises(ValueError):
            decode_sctx(struct.pack('<I', 500))

    def test_native_quad_vertex_order_and_fractional_translation(self):
        # Vertices are a strip: top-left, bottom-left, top-right, bottom-right.
        vertices = np.array([[0, 0, 0, 0], [0, 2, 0, 65535],
                             [2, 0, 65535, 0], [2, 2, 65535, 65535]])
        texture = np.array([[[1, 0, 0, 1], [0, 1, 0, 1]],
                            [[0, 0, 1, 1], [1, 1, 1, 1]]], dtype=float)
        matrix = np.array([[1, 0, -2], [0, 1, 3], [0, 0, 1]])
        draw = (0, vertices, matrix, (np.ones(4), np.zeros(4)))
        image = rasterize([draw], {0: texture}, (-2, 3, 0, 5))
        np.testing.assert_array_equal(np.array(image), texture * 255)
        matrix[0, 2] = 0
        matrix = matrix.astype(float)
        matrix[0, 2] = .5
        shifted = rasterize([(0, vertices, matrix, draw[3])], {0: texture}, (0, 3, 3, 5))
        self.assertEqual(shifted.getpixel((1, 0)), (128, 128, 0, 255))

    def test_transparent_texels_do_not_create_dark_fringe(self):
        vertices = np.array([[0, 0, 0, 0], [0, 1, 0, 65535],
                             [1, 0, 65535, 0], [1, 1, 65535, 65535]])
        texture = np.array([[[1, 0, 0, 1], [0, 0, 0, 0]]], dtype=float)
        image = rasterize([(0, vertices, np.eye(3), (np.ones(4), np.zeros(4)))],
                          {0: texture}, (0, 0, 1, 1))
        self.assertEqual(image.getpixel((0, 0)), (255, 0, 0, 128))

    def test_nested_timeline_restarts_after_child_is_removed(self):
        # Exercise placement age across a gap and a wrap, independently of art.
        reader = object.__new__(SC6)
        reader.shapes, reader.modifiers, reader.clips = {2: None}, {}, {0: None, 1: None}
        parent = dict(frames=[[[0, 65535, 65535]], [], [[0, 65535, 65535]]],
                      children=[1], bank=0, fps=24)
        nested = dict(frames=[[[0, 0, 65535]], [[0, 1, 65535]], [[0, 2, 65535]]],
                      children=[2], bank=0, fps=24)
        reader.clip = lambda i: [parent, nested][i]
        reader.commands = lambda i: [(0, np.zeros((4, 4)))]
        reader.matrix = lambda bank, index: np.array([[1, 0, 0 if index == 65535 else index], [0, 1, 0], [0, 0, 1]])
        result = [list(reader.draw_list(0, f)) for f in range(4)]
        self.assertEqual(result[1], [])
        self.assertEqual([result[f][0][2][0, 2] for f in (0, 2, 3)], [0, 0, 1])

    def test_triangle_strips_retain_cutouts_without_double_alpha_seams(self):
        # A six-vertex strip covers the left 2×4 and top-right 2×2 of a 4×4 box.
        vertices = np.array([[0, 4, 0, 65535], [0, 0, 0, 0], [2, 4, 32768, 65535],
                             [2, 0, 32768, 0], [2, 2, 32768, 32768], [4, 0, 65535, 0]])
        texture = np.array([[[1, 0, 0, .5]]], dtype=float)
        image = rasterize([(0, vertices, np.eye(3), (np.ones(4), np.zeros(4)))],
                          {0: texture}, (0, 0, 4, 4))
        self.assertEqual(image.getpixel((0, 0)), (255, 0, 0, 128))
        self.assertEqual(image.getpixel((1, 2)), (255, 0, 0, 128))
        self.assertEqual(image.getpixel((2, 0)), (255, 0, 0, 128))
        self.assertEqual(image.getpixel((3, 3)), (0, 0, 0, 0))
        self.assertEqual(image.getchannel('A').getextrema(), (0, 128))

    def test_named_instances_keep_identity_when_they_share_a_display_object(self):
        reader = object.__new__(SC6)
        reader.shapes, reader.modifiers, reader.clips = {1: None}, {}, {0: None}
        clip = dict(frames=[[[0, 0, 65535], [1, 1, 65535]]], children=[1, 1],
                    names=['turret', 'ammo'], blending=[0, 8], fps=30, bank=0)
        reader.clip = lambda i: clip
        reader.matrix = lambda bank, index: np.array([[1, 0, index * 4], [0, 1, 0], [0, 0, 1]])
        instances = list(reader.instances(0, 4))
        self.assertEqual([(v['index'], v['id'], v['name'], v['blend'], v['frame']) for v in instances],
                         [(0, 1, 'turret', 0, 4), (1, 1, 'ammo', 8, 4)])
        self.assertEqual([v['matrix'][0, 2] for v in instances], [0, 4])
        # Metadata inspection must never silently reinterpret additive glow as normal alpha.
        with self.assertRaisesRegex(ValueError, 'normal blending'):
            list(reader.draw_list(0, 4))

    def test_child_metadata_arrays_must_match_the_instance_count(self):
        class ClipFields:
            def __init__(self, names, blends):
                self.arrays = {5: [10, 11], 6: names, 7: blends}
            def scalar(self, table, field, format=None):
                return 0
            def field(self, table, field):
                return None
            def values(self, table, field, format):
                return self.arrays[field]
        for names, blends, message in [([0], [0, 0], 'name count'), ([0, 0], [0], 'blend count')]:
            reader = object.__new__(SC6)
            reader._clips = {}
            reader.clips = {0: (ClipFields(names, blends), 0)}
            with self.assertRaisesRegex(ValueError, message):
                reader.clip(0)


if __name__ == '__main__':
    unittest.main()
