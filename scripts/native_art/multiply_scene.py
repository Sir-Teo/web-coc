"""Independent source sampler/compositor including Multiply.

Extends the existing Tesla reference equations without changing its frozen producer.
Multiply uses the mathematical premultiplied source-over equation, independently
of the browser's two-pass implementation.
"""

import numpy as np
from native_art.sc6 import rasterize, require


def nodes(graph, id_, frame, matrix, multiply=None, add=None, path=None):
    """Retain group boundaries; do not derive source witnesses from the JS player."""
    key = str(id_)
    path = key if path is None else path
    multiply = np.ones(4) if multiply is None else multiply
    add = np.zeros(4) if add is None else add
    if key in graph['shapes']:
        return [dict(key=f'{path}:{i}', texture=t, vertices=v, matrix=matrix[:2].reshape(-1).tolist(),
                     multiply=multiply.tolist(), add=add.tolist(), blend=0)
                for i, (t, v) in enumerate(graph['shapes'][key])]
    clip = graph['clips'][key]
    result = []
    for slot, transform, tint in clip['frames'][clip['timeline'][frame % len(clip['timeline'])]]:
        child = str(clip['children'][slot])
        placed = frame
        while placed > 0 and any(p[0] == slot for p in clip['frames'][clip['timeline'][(placed - 1) % len(clip['timeline'])]]):
            placed -= 1
        phase = frame - placed
        if child in graph['clips']: phase = phase * graph['clips'][child]['fps'] // clip['fps']
        m = matrix @ np.vstack([np.array(graph['matrices'][transform]).reshape(2, 3), [0, 0, 1]])
        color = np.array(graph['colors'][tint])
        mul, plus = multiply * color[:4], multiply * color[4:] + add
        mode = clip['blending'][slot]
        require(mode in (0, 3, 4, 8), 'Unsupported source blend')
        if mode == 3 or (mode in (4, 8) and child in graph['clips'] and graph['clips'][child]['children']):
            require(plus[3] == 0, 'Unsupported group alpha addition')
            result.append(dict(key=f'{path}/{slot}', group=nodes(graph, int(child), phase, m, path=f'{path}/{slot}'),
                               multiply=mul.tolist(), add=plus.tolist(), blend=mode))
        else:
            nested = nodes(graph, int(child), phase, m, mul, plus, f'{path}/{slot}')
            for node in nested:
                if mode: node['blend'] = mode
            result.extend(nested)
    return result


def compose(poses, textures, cell, background=None):
    canvas = np.zeros((cell, cell, 4), dtype=float)
    if background is not None:
        canvas[:, :, :3], canvas[:, :, 3] = background, 1
    for pose in poses:
        if 'group' in pose:
            rgba = compose(pose['group'], textures, cell)
            if pose['multiply'][:3] != [1, 1, 1] or pose['add'][:3] != [0, 0, 0]:
                alpha = rgba[:, :, 3:4]
                straight = np.divide(rgba[:, :, :3], alpha, out=np.zeros_like(rgba[:, :, :3]), where=alpha > 0)
                rgba[:, :, :3] = np.clip(straight * pose['multiply'][:3] + pose['add'][:3], 0, 1) * alpha
            rgba *= pose['multiply'][3]
        else:
            matrix = np.vstack([np.array(pose['matrix']).reshape(2, 3), [0, 0, 1]])
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
            require((xy[:, :2] >= 0).all() and (xy[:, :2] < cell).all(), 'Source fixture clips a polygon')
            rgba = np.array(rasterize([(pose['texture'], vertices, matrix,
                                      (np.array(pose['multiply']), np.array(pose['add'])))],
                                     textures, [0, 0, cell, cell])) / 255
            rgba[:, :, :3] *= rgba[:, :, 3:4]
        alpha = rgba[:, :, 3:4]
        if pose['blend'] == 3:
            src, dst = rgba[:, :, :3], canvas[:, :, :3]
            canvas[:, :, :3] = src * dst + src * (1 - canvas[:, :, 3:4]) + dst * (1 - alpha)
        elif pose['blend'] == 8:
            canvas[:, :, :3] = np.minimum(1, canvas[:, :, :3] + rgba[:, :, :3])
        elif pose['blend'] == 4:
            canvas[:, :, :3] = rgba[:, :, :3] + canvas[:, :, :3] * (1 - rgba[:, :, :3])
        else:
            require(pose['blend'] == 0, 'Unsupported source blend')
            canvas[:, :, :3] = rgba[:, :, :3] + canvas[:, :, :3] * (1 - alpha)
        canvas[:, :, 3:4] = alpha + canvas[:, :, 3:4] * (1 - alpha)
    # Match the RGBA8 intermediate framebuffer boundary, not its individual leaves.
    return np.round(np.clip(canvas, 0, 1) * 255) / 255

