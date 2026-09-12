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


if __name__ == '__main__':
    unittest.main()
