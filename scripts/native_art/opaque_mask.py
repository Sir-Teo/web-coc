"""Compile a verified opaque convex SC mask into clipped source mesh triangles.

The narrow adapter keeps the source matrices, colors, blends, texels and complete
root timeline. It rejects textured/transparent masks, nested masks, nonconvex mask
strips and subclip cycles that do not fit the root loop. No pose is rasterized.
"""
import numpy as np

from .sc6 import require


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def convex_strip(vertices):
    """A source strip must cover its convex hull exactly, without overlapping triangles."""
    require(len(vertices) in (3, 4), 'Mask must be a triangle or convex quad')
    if len(vertices) == 4:
        edge = vertices[2, :2]-vertices[1, :2]
        require(cross(edge, vertices[0, :2]-vertices[1, :2]) *
                cross(edge, vertices[3, :2]-vertices[1, :2]) < 0, 'Mask triangles overlap')
    points = sorted(set(tuple(v) for v in vertices[:, :2]))
    require(len(points) >= 3, 'Degenerate mask')
    def half(values):
        result = []
        for point in values:
            while len(result) >= 2 and cross(np.subtract(result[-1], result[-2]), np.subtract(point, result[-1])) <= 0:
                result.pop()
            result.append(point)
        return result
    hull = np.array(half(points)[:-1] + half(points[::-1])[:-1])
    area = abs(sum(cross(a, b) for a, b in zip(hull, np.roll(hull, -1, axis=0)))) / 2
    strip = sum(abs(cross(vertices[i+1, :2]-vertices[i, :2], vertices[i+2, :2]-vertices[i, :2])) / 2
                for i in range(len(vertices)-2))
    require(abs(area-strip) <= max(1, area)*1e-9, 'Mask strip is not a nonoverlapping convex polygon')
    return hull


def clip_triangle(triangle, polygon):
    """Sutherland-Hodgman clipping preserves affine UVs in each original source triangle."""
    output = [v.copy() for v in triangle]
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        previous = output
        output = []
        if not previous:
            break
        for start, end in zip(previous[-1:] + previous[:-1], previous):
            ds, de = cross(b-a, start[:2]-a), cross(b-a, end[:2]-a)
            inside_s, inside_e = ds >= 0, de >= 0
            if inside_s != inside_e:
                output.append(start + (end-start)*(ds/(ds-de)))
            if inside_e:
                output.append(end)
    return [np.array([output[0], output[i], output[i+1]]) for i in range(1, len(output)-1)
            if abs(cross(output[i][:2]-output[0][:2], output[i+1][:2]-output[0][:2])) > 1e-10]


class OpaqueMaskScene:
    """Override one masked export, leaving the rest of the verified source scene unchanged."""
    def __init__(self, source, export, texture):
        self.source = source
        self.shapes = dict(source.shapes)
        self.clips = dict(source.clips)
        self._clips, self._commands = {}, {}
        self._sequence = max([*source.shapes, *source.clips, *source.modifiers,
                              *source.textfields, *source.exports.values()]) + 1
        root = source.exports[export]
        clip = source.clip(root)
        count, fps = len(clip['frames']), clip['fps']
        children, names, blending, frames = [], [], [], []

        def mask_geometry(id_, frame, matrix):
            if id_ in source.shapes:
                commands = list(source.commands(id_))
                require(len(commands) == 1, 'Mask must have one source strip')
                tex, vertices = commands[0]
                require(np.array_equal(vertices[:, 2:], np.repeat(vertices[:1, 2:], len(vertices), axis=0)),
                        'Textured masks need an alpha-mask renderer')
                image = np.array(texture(tex))
                height, width = image.shape[:2]
                u, v = vertices[0, 2:] / 65535 * [width, height] - .5
                # Verify the complete bilinear sampling footprint, not just a nearest texel.
                for x in [int(np.floor(u)), int(np.floor(u))+1]:
                    for y in [int(np.floor(v)), int(np.floor(v))+1]:
                        require(image[np.clip(y, 0, height-1), np.clip(x, 0, width-1), 3] == 255,
                                'Transparent masks need an alpha-mask renderer')
                hull = convex_strip(vertices)
                return np.column_stack([hull, np.ones(len(hull))]) @ matrix[:2].T
            require(id_ not in source.modifiers, 'Nested mask modifiers are unsupported')
            instances = list(source.instances(id_, frame))
            require(len(instances) == 1, 'Mask must have one geometric child')
            child = instances[0]
            require(child['blend'] == 0 and np.array_equal(child['color'][0], np.ones(4)) and
                    np.array_equal(child['color'][1], np.zeros(4)), 'Colored masks are unsupported')
            return mask_geometry(child['id'], child['frame'], matrix @ child['matrix'])

        def bake(id_, frame, matrix, polygon):
            require(id_ not in source.modifiers, 'Nested mask modifiers are unsupported')
            out = self._id()
            if id_ in source.shapes:
                if np.linalg.det(matrix[:2, :2]) == 0:
                    # Source reveal frames collapse a leaf to zero area: it paints no pixels.
                    self.shapes[out] = None
                    self._commands[out] = []
                    return out
                inverse = np.linalg.inv(matrix)
                local = np.column_stack([polygon, np.ones(len(polygon))]) @ inverse[:2].T
                if np.linalg.det(inverse[:2, :2]) < 0:
                    local = local[::-1]
                commands = []
                for tex, vertices in source.commands(id_):
                    for i in range(len(vertices)-2):
                        for triangle in clip_triangle(vertices[i:i+3], local):
                            commands.append((tex, triangle))
                self.shapes[out] = None
                self._commands[out] = commands
                return out
            nested = source.clip(id_)
            require(count*nested['fps'] % (fps*len(nested['frames'])) == 0,
                    'Subclip cycle does not fit the source mask loop')
            instances = list(source.instances(id_, frame))
            child_ids = [bake(c['id'], c['frame'], matrix @ c['matrix'], polygon) for c in instances]
            source_frame = nested['frames'][frame % len(nested['frames'])]
            self.clips[out] = None
            self._clips[out] = dict(nested, children=child_ids,
                                    names=[c['name'] for c in instances],
                                    blending=[c['blend'] for c in instances],
                                    frames=[[(slot, placed[1], placed[2]) for slot, placed in enumerate(source_frame)]],
                                    labels=[''])
            return out

        for frame, placements in enumerate(clip['frames']):
            require([p[0] for p in placements] == [p[0] for p in clip['frames'][0]],
                    'Masked root placements must remain continuous through the loop')
            active = {instance['index']: instance for instance in source.instances(root, frame)}
            ids = [clip['children'][p[0]] for p in placements]
            require(len(ids) >= 5 and source.modifiers.get(ids[0]) == 38 and
                    source.modifiers.get(ids[2]) == 39 and source.modifiers.get(ids[-1]) == 40 and
                    all(i not in source.modifiers for i in ids[3:-1]), 'Unsupported source mask sequence')
            for position in [0, 2, len(ids)-1]:
                require(placements[position][1:] == [65535, 65535], 'Transformed mask modifier')
            mask_placed = placements[1]
            require(clip['blending'][mask_placed[0]] == 0, 'Blended mask')
            mul, add = source.color(clip['bank'], mask_placed[2])
            require(np.array_equal(mul, np.ones(4)) and np.array_equal(add, np.zeros(4)), 'Colored mask')
            polygon = mask_geometry(ids[1], active[mask_placed[0]]['frame'], source.matrix(clip['bank'], mask_placed[1]))
            if sum(cross(a, b) for a, b in zip(polygon, np.roll(polygon, -1, axis=0))) < 0:
                polygon = polygon[::-1]
            rendered = []
            for slot, transform, tint in placements[3:-1]:
                child = bake(clip['children'][slot], active[slot]['frame'], source.matrix(clip['bank'], transform), polygon)
                target = len(children)
                children.append(child)
                names.append(clip['names'][slot])
                blending.append(clip['blending'][slot])
                rendered.append((target, transform, tint))
            frames.append(rendered)
        self._clips[root] = dict(clip, children=children, names=names, blending=blending, frames=frames)

    def _id(self):
        self._sequence += 1
        return self._sequence

    def __getattr__(self, name):
        return getattr(self.source, name)

    def clip(self, id_):
        return self._clips[id_] if id_ in self._clips else self.source.clip(id_)

    def commands(self, id_):
        return self._commands[id_] if id_ in self._commands else self.source.commands(id_)
