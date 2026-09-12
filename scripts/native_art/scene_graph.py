"""Keep native polygon meshes and controllable timelines without rasterizing poses.

Only reachable source texels (including bilinear neighbours) are copied. No
resizing, color baking, geometry simplification or blend flattening is performed.
"""
import json

import numpy as np
from PIL import Image
from .bundle import digest
from .sc6 import require


def capture_graph(sc, exports):
    shapes, clips, matrices, colors = {}, {}, [], []
    matrix_ids, color_ids = {}, {}

    def intern(values, table, indices):
        key = tuple(values)
        if key not in indices:
            indices[key] = len(table)
            table.append(values)
        return indices[key]

    def visit(id_, ancestors=()):
        require(id_ not in ancestors and len(ancestors) < 32, 'Recursive display object')
        if str(id_) in shapes or str(id_) in clips:
            return
        require(id_ not in sc.modifiers, 'Masks are unsupported')
        if id_ in sc.shapes:
            shapes[str(id_)] = [[texture, vertices.reshape(-1).tolist()]
                                for texture, vertices in sc.commands(id_)]
            return
        c = sc.clip(id_)
        require(all(b in (0, 8) for b in c['blending']), 'Unsupported scene blend')
        for child in c['children']:
            visit(child, (*ancestors, id_))
        patterns, pattern_ids, timeline = [], {}, []
        for frame in c['frames']:
            placements = []
            for slot, transform, tint in frame:
                matrix = sc.matrix(c['bank'], transform)[:2].reshape(-1).tolist()
                mul, add = sc.color(c['bank'], tint)
                require(add[3] == 0, 'Additive alpha needs a separate renderer')
                placements.append([slot, intern(matrix, matrices, matrix_ids),
                                   intern([*mul, *add], colors, color_ids)])
            key = json.dumps(placements, separators=(',', ':'))
            if key not in pattern_ids:
                pattern_ids[key] = len(patterns)
                patterns.append(placements)
            timeline.append(pattern_ids[key])
        clips[str(id_)] = dict(fps=c['fps'], children=c['children'], names=c['names'],
                              blending=c['blending'], frames=patterns, timeline=timeline,
                              labels=[[i, label] for i, label in enumerate(c['labels']) if label])

    for id_ in exports.values():
        visit(id_)
    return dict(exports=exports, shapes=dict(sorted(shapes.items(), key=lambda p: int(p[0]))),
                clips=dict(sorted(clips.items(), key=lambda p: int(p[0]))), matrices=matrices, colors=colors)


def crop_textures(graph, decoded, prefix):
    """Crop unused texture space while retaining the complete sampling footprint.

    UVs remain the source's 16-bit coordinates in the evidence graph. The runtime
    copy remaps them to cropped, normalized UVs; native x/y and strips are exact.
    """
    regions, command_regions = {}, {}
    for id_, commands in graph['shapes'].items():
        for index, (texture, vertices) in enumerate(commands):
            require(texture in decoded, 'Unexpected unpinned texture')
            width, height = decoded[texture].size
            uv = np.array(vertices).reshape(-1, 4)[:, 2:] / 65535 * [width, height]
            require(np.isfinite(uv).all() and (uv >= 0).all() and (uv <= [width, height]).all(),
                    'Texture coordinates outside the source')
            left, top = np.maximum(0, np.floor(uv.min(axis=0) - .5)).astype(int)
            right, bottom = np.minimum([width, height], np.floor(uv.max(axis=0) - .5) + 2).astype(int)
            rect = (int(left), int(top), int(right), int(bottom))
            regions.setdefault(texture, set()).add(rect)
            command_regions[(id_, index)] = rect
    outputs, textures, placements_by_texture = {}, {}, {}
    for texture, rectangles in sorted(regions.items()):
        source = decoded[texture]
        left, top = min(r[0] for r in rectangles), min(r[1] for r in rectangles)
        right, bottom = max(r[2] for r in rectangles), max(r[3] for r in rectangles)
        placements = {r: (r[0] - left, r[1] - top) for r in rectangles}
        size = (right - left, bottom - top)
        packing = 'source layout'
        area = sum((r - l) * (b - t) for l, t, r, b in rectangles)
        if area * 2 < size[0] * size[1]:
            # Sparse projectile textures can otherwise consume megabytes of GPU
            # memory for a few tiny source regions. Compare bounded shelf layouts.
            choices = []
            ordered = sorted(rectangles, key=lambda r: (-(r[3] - r[1]), -(r[2] - r[0]), r))
            for width in (64, 128, 256, 512, 1024, 2048, 4096):
                if max(r[2] - r[0] for r in rectangles) + 2 > width:
                    continue
                packed, x, y, row_height = {}, 1, 1, 0
                for rect in ordered:
                    w, h = rect[2] - rect[0], rect[3] - rect[1]
                    if x + w + 1 > width:
                        x, y, row_height = 1, y + row_height + 2, 0
                    packed[rect] = (x, y)
                    x, row_height = x + w + 2, max(row_height, h)
                height = y + row_height + 1
                if height <= 4096:
                    choices.append((width * height, width, height, packed))
            require(choices, 'Source regions exceed texture limit')
            _, width, height, placements = min(choices, key=lambda v: (v[0], max(v[1], v[2]), v[1]))
            size, packing = (width, height), 'packed source regions'
        placements_by_texture[texture] = placements
        image = Image.new('RGBA', size)
        evidence = []
        for l, t, r, b in sorted(rectangles):
            tile = source.crop((l, t, r, b))
            x, y = placements[(l, t, r, b)]
            if packing == 'packed source regions':
                # UVs at an original texture edge sample CLAMP_TO_EDGE. After
                # packing, preserve that neighbour instead of sampling a gutter.
                padded = Image.fromarray(np.pad(np.array(tile), ((1, 1), (1, 1), (0, 0)), mode='edge'), 'RGBA')
                image.paste(padded, (x - 1, y - 1))
            image.paste(tile, (x, y))
            evidence.append(dict(bounds=[l, t, r, b], placement=[x, y], rgbaSha256=digest(tile.tobytes())))
        # Verify actual output pixels after every overlapping paste, not just inputs.
        for region in evidence:
            l, t, r, b = region['bounds']
            x, y = region['placement']
            require(digest(image.crop((x, y, x + r - l, y + b - t)).tobytes()) == region['rgbaSha256'],
                    'Source sampling pixels changed')
        path = f'{prefix}/texture-{texture}.png'
        outputs[path] = image
        textures[str(texture)] = dict(path=path, sourceSize=list(source.size), bounds=[left, top, right, bottom], packing=packing,
                                      width=image.width, height=image.height, rgbaSha256=digest(image.tobytes()),
                                      regions=evidence)
    runtime = {**graph, 'shapes': {}, 'textures': {k: {f: t[f] for f in ('path', 'width', 'height')}
                                               for k, t in textures.items()}}
    for id_, commands in graph['shapes'].items():
        remapped = []
        for index, (texture, vertices) in enumerate(commands):
            t = textures[str(texture)]
            v = np.array(vertices, dtype=float).reshape(-1, 4)
            original = v[:, 2:].copy()
            rect = command_regions[(id_, index)]
            translation = np.array(placements_by_texture[texture][rect]) - rect[:2]
            v[:, 2:] = (v[:, 2:] / 65535 * t['sourceSize'] + translation) / [t['width'], t['height']]
            restored = (v[:, 2:] * [t['width'], t['height']] - translation) / t['sourceSize'] * 65535
            require(np.allclose(restored, original, rtol=0, atol=1e-10), 'UV remapping loses source precision')
            remapped.append([texture, v.reshape(-1).tolist()])
        runtime['shapes'][id_] = remapped
    return outputs, textures, runtime


def graph_draws(graph, id_, frame=0, controls=None, matrix=None, color=None, blend=0, ancestors=()):
    """Diagnostic graph playback; aiming frames are selected by instance name.

    Native engine direction mapping and clock rules remain separately unverified.
    Additive groups are deliberately restricted to single shape/empty children.
    """
    require(id_ not in ancestors and len(ancestors) < 32, 'Recursive display object')
    matrix = np.eye(3) if matrix is None else matrix
    color = (np.ones(4), np.zeros(4)) if color is None else color
    key = str(id_)
    if key in graph['shapes']:
        for texture, vertices in graph['shapes'][key]:
            yield texture, np.array(vertices).reshape(-1, 4), matrix, color, blend
        return
    c = graph['clips'][key]
    f = frame % len(c['timeline'])
    for slot, transform, tint in c['frames'][c['timeline'][f]]:
        child, name = c['children'][slot], c['names'][slot]
        if controls and controls.get(name) is False:
            continue
        child_key = str(child)
        placed = frame
        while placed > 0 and any(p[0] == slot for p in c['frames'][c['timeline'][(placed - 1) % len(c['timeline'])]]):
            placed -= 1
        phase = frame - placed
        if child_key in graph['clips']:
            phase = phase * graph['clips'][child_key]['fps'] // c['fps']
        if controls and name in controls:
            phase = controls[name]
        cm = np.vstack([np.array(graph['matrices'][transform]).reshape(2, 3), [0, 0, 1]])
        ct = np.array(graph['colors'][tint])
        mode = c['blending'][slot]
        require(mode in (0, 8), 'Unsupported scene blend')
        if mode == 8 and child_key in graph['clips']:
            require(not graph['clips'][child_key]['children'], 'Additive group requires isolated compositing')
        yield from graph_draws(graph, child, phase, controls, matrix @ cm,
                               (color[0] * ct[:4], color[0] * ct[4:] + color[1]),
                               mode or blend, (*ancestors, id_))
