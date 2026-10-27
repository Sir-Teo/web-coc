import copy
import unittest

import numpy as np
from PIL import Image

from native_art.opaque_mask import OpaqueMaskScene, clip_triangle, convex_strip, cross
from native_art.scene_graph import capture_graph, graph_draws


class Fixture:
    exports = {'crystal': 100}
    shapes = {1: None, 2: None}
    clips = {20: None, 100: None}
    modifiers = {10: 38, 11: 39, 12: 40}
    textfields = {}

    def __init__(self):
        self.mask = np.array([[0, 0, 32768, 32768], [0, 1, 32768, 32768],
                              [1, 0, 32768, 32768], [1, 1, 32768, 32768]], dtype=float)
        self.content = np.array([[-.5, -.5, 0, 0], [-.5, 1.5, 0, 65535],
                                 [1.5, -.5, 65535, 0], [1.5, 1.5, 65535, 65535]])
        self.root = dict(bank=0, fps=24, children=[10, 1, 11, 20, 12], names=['']*5,
                         blending=[0]*5, frames=[[[0, 65535, 65535], [1, 0, 65535], [2, 65535, 65535],
                                                [3, 0, 1], [4, 65535, 65535]]] * 2, labels=['', ''])
        self.child = dict(bank=0, fps=24, children=[2], names=['leaf'], blending=[0],
                          frames=[[[0, 0, 65535]]], labels=[''])

    def clip(self, id_):
        return self.root if id_ == 100 else self.child

    def commands(self, id_):
        return [(0, self.mask if id_ == 1 else self.content)]

    def matrix(self, bank, index):
        if index == 1:
            return np.array([[-1, 0, 1], [0, 1, 0], [0, 0, 1]])
        if index == 2:
            return np.array([[0, 0, 0], [0, 1, 0], [0, 0, 1]])
        return np.eye(3)

    def color(self, bank, index):
        return np.array([1, 1, 1, .5 if index == 1 else 1]), np.zeros(4)

    def instances(self, id_, frame):
        clip = self.clip(id_)
        for slot, matrix, tint in clip['frames'][frame % len(clip['frames'])]:
            yield dict(index=slot, id=clip['children'][slot], frame=frame, name=clip['names'][slot],
                       blend=clip['blending'][slot], matrix=self.matrix(0, matrix), color=self.color(0, tint))


def compiled(source, texture=None):
    scene = OpaqueMaskScene(source, 'crystal', lambda _: texture or Image.new('RGBA', (4, 4), (255, 255, 255, 255)))
    return capture_graph(scene, scene.exports)


class OpaqueMaskTests(unittest.TestCase):
    def test_exact_area_source_uvs_color_and_loop_without_mutating_source(self):
        source = Fixture()
        before = copy.deepcopy(source.root)
        graph = compiled(source)
        self.assertEqual(source.root, before)
        root = graph['clips']['100']
        self.assertEqual(len(root['timeline']), 2)
        self.assertEqual(root['fps'], 24)
        for frame in [0, 1, 2, 13]:
            area = 0
            for _, vertices, matrix, color, _ in graph_draws(graph, 100, frame):
                xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix[:2].T
                self.assertTrue((xy >= -1e-12).all() and (xy <= 1+1e-12).all())
                expected = (vertices[:, :2]+.5)/2*65535
                np.testing.assert_allclose(vertices[:, 2:], expected, rtol=0, atol=1e-8)
                self.assertEqual(color[0][3], .5)
                area += abs(cross(xy[1]-xy[0], xy[2]-xy[0]))/2
            self.assertAlmostEqual(area, 1)

    def test_reflected_content_still_clips_in_mask_space(self):
        source = Fixture()
        source.root['frames'] = copy.deepcopy(source.root['frames'])
        source.root['frames'][0][3][1] = 1
        graph = compiled(source)
        area = 0
        for _, vertices, matrix, _, _ in graph_draws(graph, 100, 0):
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix[:2].T
            self.assertTrue((xy >= -1e-12).all() and (xy <= 1+1e-12).all())
            area += abs(cross(xy[1]-xy[0], xy[2]-xy[0]))/2
        self.assertAlmostEqual(area, 1)

    def test_collapsed_source_leaf_paints_nothing(self):
        source = Fixture()
        source.root['frames'] = copy.deepcopy(source.root['frames'])
        source.root['frames'][0][3][1] = 2
        self.assertEqual(list(graph_draws(compiled(source), 100, 0)), [])

    def test_retains_the_original_blend_group(self):
        source = Fixture()
        source.root['blending'][3] = 4
        root = compiled(source)['clips']['100']
        self.assertEqual(root['blending'], [4, 4])

    def test_rejects_transparent_or_textured_masks(self):
        with self.assertRaisesRegex(ValueError, 'Transparent masks'):
            compiled(Fixture(), Image.new('RGBA', (4, 4), (255, 255, 255, 254)))
        source = Fixture()
        source.mask[0, 2] = 0
        with self.assertRaisesRegex(ValueError, 'Textured masks'):
            compiled(source)

    def test_rejects_overlapping_mask_triangles(self):
        mask = np.array([[0, 0], [1, 1], [0, 1], [1, 0]])
        with self.assertRaisesRegex(ValueError, 'overlap'):
            convex_strip(mask)

    def test_rejects_subclip_cycles_that_do_not_fit_the_root_loop(self):
        source = Fixture()
        source.child['fps'] = 30
        with self.assertRaisesRegex(ValueError, 'Subclip cycle'):
            compiled(source)

    def test_clipping_preserves_the_affine_uv_plane_on_an_intersection(self):
        triangle = np.array([[-1, 0, 0, 10], [2, 0, 3, 10], [0, 2, 1, 14]])
        polygon = np.array([[0, 0], [1, 0], [1, 1], [0, 1]])
        pieces = clip_triangle(triangle, polygon)
        self.assertGreater(len(pieces), 0)
        for piece in pieces:
            np.testing.assert_allclose(piece[:, 2], piece[:, 0]+1, atol=1e-12)
            np.testing.assert_allclose(piece[:, 3], piece[:, 1]*2+10, atol=1e-12)


if __name__ == '__main__':
    unittest.main()
