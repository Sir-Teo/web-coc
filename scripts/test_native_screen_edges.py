"""Independent coverage expectations for new screen-space source witnesses."""
import unittest
import numpy as np
from native_art.sc6 import rasterize, screen_edge_coverage

class ScreenEdges(unittest.TestCase):
    def test_quad_coverage_does_not_depend_on_vertex_orientation(self):
        points = np.stack(np.meshgrid(np.arange(4)+.5,np.arange(4)+.5),axis=-1)
        expected = np.zeros((4,4),dtype=bool); expected[:2,:2]=True
        for xs in [[.5,2.5],[2.5,.5]]:
            for ys in [[.5,2.5],[2.5,.5]]:
                xy=np.array([[xs[0],ys[0]],[xs[1],ys[0]],[xs[0],ys[1]],[xs[1],ys[1]]])
                np.testing.assert_array_equal(screen_edge_coverage(xy,points),expected)

    def test_new_coverage_is_opt_in_and_preserves_existing_default(self):
        vertices=np.array([[2.5,2.5,0,0],[2.5,.5,0,65535],[.5,2.5,65535,0],[.5,.5,65535,65535]])
        draws=[(0,vertices,np.eye(3),(np.ones(4),np.zeros(4)))]
        textures={0:np.ones((2,2,4))}
        old=np.array(rasterize(draws,textures,[0,0,4,4]))
        explicit=np.array(rasterize(draws,textures,[0,0,4,4],screen_space_edges=False))
        new=np.array(rasterize(draws,textures,[0,0,4,4],screen_space_edges=True))
        np.testing.assert_array_equal(old,explicit)
        expected=np.zeros((4,4),dtype=np.uint8);expected[:2,:2]=255
        np.testing.assert_array_equal(new[:,:,3],expected)
        self.assertFalse(np.array_equal(old,new))

if __name__=='__main__':unittest.main()
