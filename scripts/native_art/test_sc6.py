"""Small adversarial format and pixel-registration checks; no network needed."""
import struct
import unittest
from unittest.mock import patch

import numpy as np

from sc6 import Flat, SC6, decode_sctx, decode_ktx_astc, rasterize


class NativeArtTests(unittest.TestCase):
    def test_embedded_astc_keeps_channel_order_and_non_block_dimensions(self):
        # One ASTC void-extent block: red, half alpha; NPOT image crops its 4x4 block.
        block = struct.pack('<Q4H', 0xfffffffffffffdfc, 65535, 0, 0, 32768)
        header = [0x04030201, 0, 1, 0, 0x93B0, 0x1908, 3, 2, 0, 0, 1, 1, 0]
        def ktx(values):
            return b'\xabKTX 11\xbb\r\n\x1a\n' + struct.pack('<13II', *values, 16) + block
        image = decode_ktx_astc(ktx(header))
        self.assertEqual(image.size, (3, 2))
        self.assertEqual(list(image.getdata()), [(255, 0, 0, 128)] * 6)
        for field, value in [(0, 0x01020304), (4, 0x93B1), (6, 4097), (10, 6), (11, 2), (12, 4)]:
            malformed = header.copy()
            malformed[field] = value
            with self.assertRaises(ValueError):
                decode_ktx_astc(ktx(malformed))
        for blob in (ktx(header)[:-1], ktx(header) + b'\0'):
            with self.assertRaisesRegex(ValueError, 'payload size'):
                decode_ktx_astc(blob)

    def test_sc6_large_source_requires_explicit_bounded_opt_in(self):
        # Minimal header sufficient to reach the size gate, without allocating 100 MB.
        header = bytearray(52)
        struct.pack_into('<I', header, 0, 40)
        struct.pack_into('<HH', header, 4, 30, 12)
        struct.pack_into('<H', header, 4 + 4 + 11 * 2, 8)
        struct.pack_into('<i', header, 40, 36)
        struct.pack_into('<I', header, 48, 1)
        blob = b'SC' + struct.pack('<IHI', 6, 0, len(header)) + header + b'Z'
        size = 108270988
        with patch('sc6.zstandard.frame_content_size', return_value=size), \
             patch('sc6.zstandard.ZstdDecompressor') as decoder:
            for kwargs in ({}, {'max_decompressed_bytes': size - 1}):
                with self.assertRaisesRegex(ValueError, 'exceeds limit'):
                    SC6(blob, **kwargs)
            decoder.assert_not_called()
            decoder.return_value.decompress.return_value = bytes(4)
            with self.assertRaisesRegex(ValueError, 'outside its chunk'):
                SC6(blob, max_decompressed_bytes=size)
            decoder.return_value.decompress.assert_called_once_with(b'Z', max_output_size=size)

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
