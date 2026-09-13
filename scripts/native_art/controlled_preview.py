"""Controlled source-scene sampling and composition for registered UI previews.

Named instance controls select a source frame directly (turret directions,
state-label frames) or hide an instance (``False``), mirroring the named
controls of ``src/game/native-mesh.ts``. Nested clips advance from their latest
continuous placement, with a continuously present slot following the parent's
unwrapped frame. Composition reuses the independent Tesla CPU compositor.
"""
import runpy

import numpy as np
from .bundle import ROOT
from .sc6 import require

_cpu = None


def compositor():
    global _cpu
    if _cpu is None:
        _cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    return _cpu


_presence = {}


def _age(clip, slot, f):
    """-1 means the slot is continuously present across the complete source loop."""
    cache_key = (id(clip), slot)
    present = _presence.get(cache_key)
    if present is None:
        present = _presence[cache_key] = [any(p[0] == slot for p in clip['frames'][i]) for i in clip['timeline']]
    age = 0
    while age < len(present) and present[(f - age - 1) % len(present)]:
        age += 1
    return -1 if age == len(present) else age


def controlled_nodes(graph, id_, frame, matrix, controls=None, multiply=None, add=None, path=None,
                     ancestors=()):
    controls = controls or {}
    key = str(id_)
    require(id_ not in ancestors and len(ancestors) < 32, 'Recursive display object')
    path = key if path is None else path
    multiply = np.ones(4) if multiply is None else multiply
    add = np.zeros(4) if add is None else add
    if key in graph['shapes']:
        return [dict(key=f'{path}:{i}', texture=t, vertices=v, matrix=matrix[:2].reshape(-1).tolist(),
                     multiply=multiply.tolist(), add=add.tolist(), blend=0)
                for i, (t, v) in enumerate(graph['shapes'][key])]
    clip = graph['clips'][key]
    f = frame % len(clip['timeline'])
    result = []
    for slot, transform, tint in clip['frames'][clip['timeline'][f]]:
        child = str(clip['children'][slot])
        name = clip['names'][slot]
        control = controls.get(name)
        if control is False:
            continue
        age = _age(clip, slot, f)
        elapsed = frame if age < 0 else min(frame, age)
        phase = elapsed * graph['clips'][child]['fps'] // clip['fps'] if child in graph['clips'] else 0
        if control is not None:
            phase = max(0, int(control))
        m = matrix @ np.vstack([np.array(graph['matrices'][transform]).reshape(2, 3), [0, 0, 1]])
        color = np.array(graph['colors'][tint])
        mul, plus = multiply * color[:4], multiply * color[4:] + add
        mode = clip['blending'][slot]
        require(mode in (0, 4, 8), 'Unsupported source blend')
        if mode in (4, 8) and child in graph['clips'] and graph['clips'][child]['children']:
            require(plus[3] == 0, 'Unsupported group alpha addition')
            result.append(dict(key=f'{path}/{slot}', blend=mode, multiply=mul.tolist(), add=plus.tolist(),
                               group=controlled_nodes(graph, int(child), phase, m, controls,
                                                      path=f'{path}/{slot}', ancestors=(*ancestors, id_))))
        else:
            nested = controlled_nodes(graph, int(child), phase, m, controls, mul, plus, f'{path}/{slot}',
                                      (*ancestors, id_))
            for node in nested:
                if mode:
                    node['blend'] = mode
            result.extend(nested)
    return result


def pose_bounds(poses):
    points = []

    def visit(items):
        for pose in items:
            if 'group' in pose:
                visit(pose['group'])
                continue
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ np.array(pose['matrix']).reshape(2, 3).T
            points.append(xy)

    visit(poses)
    if not points:
        return None
    stacked = np.vstack(points)
    return [*stacked.min(axis=0).tolist(), *stacked.max(axis=0).tolist()]


def compose_preview(poses, pixels, width, height):
    """Straight-alpha RGBA preview; every polygon must lie inside the raster."""
    cell = max(width, height)
    bounds = pose_bounds(poses)
    require(bounds is not None and bounds[0] >= 0 and bounds[1] >= 0 and bounds[2] < width and bounds[3] < height,
            'Preview clips source geometry')
    rgba = compositor()['compose'](poses, pixels, cell)
    rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
    return np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8)[:height, :width]
