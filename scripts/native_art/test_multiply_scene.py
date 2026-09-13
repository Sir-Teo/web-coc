"""Numerical source-over checks independent of the browser's two-pass blend state."""
import unittest
import numpy as np
from native_art.multiply_scene import compose
from native_art.scene_graph import capture_graph
from native_art.test_scene_graph import Reader

class MultiplyTests(unittest.TestCase):
    def test_capture_requires_explicit_multiply_opt_in(self):
        class MultiplyReader(Reader):
            def clip(self, id_):
                clip = super().clip(id_)
                if id_ == 0:
                    clip['blending'][0] = 3
                return clip
        with self.assertRaisesRegex(ValueError, 'Unsupported scene blend'):
            capture_graph(MultiplyReader(), {'root': 0})
        graph = capture_graph(MultiplyReader(), {'root': 0}, allowed_blends=(0, 3, 4, 8))
        self.assertEqual(graph['clips']['0']['blending'], [3, 0])

    def test_multiply_source_over_transparent_partial_and_opaque(self):
        cs, cd = np.array([204, 102, 51])/255, np.array([51, 153, 230])/255
        def leaf(texture):
            return dict(texture=texture, vertices=[1,1,0,0,1,6,0,65535,6,1,65535,0,6,6,65535,65535],
                        matrix=[1,0,0,0,1,0], multiply=[1,1,1,1], add=[0,0,0,0], blend=0)
        for sa in [0, 64/255, 128/255, 1]:
            for da in [0, 64/255, 128/255, 1]:
                textures = {0: np.tile([*cd, da], (2,2,1)), 1: np.tile([*cs, sa], (2,2,1))}
                poses = [leaf(0), dict(group=[leaf(1)],multiply=[1,1,1,1],add=[0,0,0,0],blend=3)]
                pixel = compose(poses,textures,8)[3,3]
                expected = [*(cs*sa*cd*da + cs*sa*(1-da) + cd*da*(1-sa)), sa+da*(1-sa)]
                np.testing.assert_allclose(pixel,expected,atol=2/255,rtol=0)

if __name__ == '__main__':
    unittest.main()
