"""Keep native polygon meshes and controllable timelines without rasterizing poses.

Only reachable source texels (including bilinear neighbours) are copied. No
resizing, color baking, geometry simplification or blend flattening is performed.
"""
import json

import numpy as np
from PIL import Image
from .bundle import digest
from .sc6 import require


def capture_graph(sc, exports, *, empty_bounds=(), allowed_blends=(0, 4, 8)):
    shapes, clips, matrices, colors = {}, {}, [], []
    matrix_ids, color_ids = {}, {}
    bounds = {}

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
        if id_ in empty_bounds:
            field = sc.text_field(id_)
            require(field['text'] == '', 'Visible text cannot be treated as an empty bound')
            bounds[str(id_)] = field
            # Empty text fields occupy a layout rectangle but paint no pixels.
            # Retain their identity, placement and bounds as a nonpainting node.
            clips[str(id_)] = dict(fps=1, children=[], names=[], blending=[], frames=[[]],
                                   timeline=[0], labels=[])
            return
        require(id_ not in sc.modifiers, 'Masks are unsupported')
        if id_ in sc.shapes:
            shapes[str(id_)] = [[texture, vertices.reshape(-1).tolist()]
                                for texture, vertices in sc.commands(id_)]
            return
        c = sc.clip(id_)
        require(all(b in allowed_blends for b in c['blending']), 'Unsupported scene blend')
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
    require(set(bounds) == {str(v) for v in empty_bounds}, 'Unused empty bounds declaration')
    result = dict(exports=exports, shapes=dict(sorted(shapes.items(), key=lambda p: int(p[0]))),
                  clips=dict(sorted(clips.items(), key=lambda p: int(p[0]))), matrices=matrices, colors=colors)
    if bounds: result['emptyTextBounds'] = bounds
    return result


def _compact_texture(source, rectangles):
    """Keep overlapping sampling regions together without recreating a sparse full page."""
    originals = sorted(rectangles)
    groups = [(rect, [rect]) for rect in originals]
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    # Nearby overlapping pieces compress better together than as isolated tiles.
    # Bound that allowance so empty space cannot recreate the original large page.
    area_cap = sum(map(area, originals)) * 1.1
    while True:
        best = None
        total = sum(area(rect) for rect, _ in groups)
        for i, (a, _) in enumerate(groups):
            for j in range(i + 1, len(groups)):
                b = groups[j][0]
                if a[0] >= b[2] or b[0] >= a[2] or a[1] >= b[3] or b[1] >= a[3]:
                    continue
                box = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
                saving = area(a) + area(b) - area(box)
                overlap = (min(a[2], b[2]) - max(a[0], b[0])) * (min(a[3], b[3]) - max(a[1], b[1]))
                if total - saving <= area_cap and box[2] - box[0] + 2 <= 4096 and box[3] - box[1] + 2 <= 4096:
                    score = saving if saving > 0 else overlap / (1 - saving)
                    choice = (0 if saving > 0 else 1, -score, box, i, j)
                    if best is None or choice < best:
                        best = choice
        if best is None:
            break
        _, _, box, i, j = best
        members = groups[i][1] + groups[j][1]
        groups = [group for k, group in enumerate(groups) if k not in (i, j)] + [(box, members)]
    ordered = sorted(groups, key=lambda g: (-(g[0][3] - g[0][1]), -(g[0][2] - g[0][0]), g[0]))
    choices = []
    for width in range(64, 4097, 32):
        if max(box[2] - box[0] for box, _ in groups) + 2 > width:
            continue
        placed, x, y, row_height = {}, 1, 1, 0
        for box, _ in ordered:
            w, h = box[2] - box[0], box[3] - box[1]
            if x + w + 1 > width:
                x, y, row_height = 1, y + row_height + 2, 0
            placed[box] = (x, y)
            x, row_height = x + w + 2, max(row_height, h)
        height = y + row_height + 1
        if height <= 4096:
            choices.append((width * height, width, height, placed))
    require(choices, 'Source regions exceed texture limit')
    _, width, height, placed = min(choices, key=lambda v: (v[0], max(v[1], v[2]), v[1]))
    image, placements = Image.new('RGBA', (width, height)), {}
    for box, members in groups:
        x, y = placed[box]
        tile = Image.new('RGBA', (box[2] - box[0], box[3] - box[1]))
        for rect in members:
            offset = (rect[0] - box[0], rect[1] - box[1])
            tile.paste(source.crop(rect), offset)
            placements[rect] = (x + offset[0], y + offset[1])
        # Mask unused pixels and pad the cluster as a whole: padding an inner member
        # would overwrite the original neighbour that another member still samples.
        padded = Image.fromarray(np.pad(np.array(tile), ((1, 1), (1, 1), (0, 0)), mode='edge'), 'RGBA')
        image.paste(padded, (x - 1, y - 1))
    return image, placements


def crop_textures(graph, decoded, prefix, *, compact=False):
    """Crop unused texture space while retaining the complete sampling footprint.

    UVs remain the source's 16-bit coordinates in the evidence graph. The runtime
    copy remaps them to cropped, normalized UVs; native x/y and strips are exact.
    Large character pages can opt into bounded overlap clustering. Other importers
    retain their established layout and byte-for-byte reconstruction.
    """
    # Old modules may remain alive across a service-worker update. Keep their
    # original page URLs intact when UVs move to a versioned compact page.
    legacy_outputs, legacy_textures, _ = crop_textures(graph, decoded, prefix) if compact else ({}, {}, {})
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
    outputs, textures, placements_by_texture = dict(legacy_outputs), {}, {}
    for texture, rectangles in sorted(regions.items()):
        source = decoded[texture]
        left, top = min(r[0] for r in rectangles), min(r[1] for r in rectangles)
        right, bottom = max(r[2] for r in rectangles), max(r[3] for r in rectangles)
        placements = {r: (r[0] - left, r[1] - top) for r in rectangles}
        size = (right - left, bottom - top)
        packing = 'source layout'
        packed_image = None
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
        if compact:
            candidate, candidate_placements = _compact_texture(source, rectangles)
            if candidate.width * candidate.height < size[0] * size[1]:
                packed_image, placements = candidate, candidate_placements
                size, packing = candidate.size, 'packed source regions'
        placements_by_texture[texture] = placements
        image = packed_image if packed_image is not None else Image.new('RGBA', size)
        evidence = []
        for l, t, r, b in sorted(rectangles):
            tile = source.crop((l, t, r, b))
            x, y = placements[(l, t, r, b)]
            if packed_image is None and packing == 'packed source regions':
                # UVs at an original texture edge sample CLAMP_TO_EDGE. After
                # packing, preserve that neighbour instead of sampling a gutter.
                padded = Image.fromarray(np.pad(np.array(tile), ((1, 1), (1, 1), (0, 0)), mode='edge'), 'RGBA')
                image.paste(padded, (x - 1, y - 1))
            if packed_image is None:
                image.paste(tile, (x, y))
            evidence.append(dict(bounds=[l, t, r, b], placement=[x, y], rgbaSha256=digest(tile.tobytes())))
        # Verify actual output pixels after every overlapping paste, not just inputs.
        for region in evidence:
            l, t, r, b = region['bounds']
            x, y = region['placement']
            require(digest(image.crop((x, y, x + r - l, y + b - t)).tobytes()) == region['rgbaSha256'],
                    'Source sampling pixels changed')
        suffix = '-compact-v1' if packed_image is not None else ''
        path = f'{prefix}/texture-{texture}{suffix}.png'
        outputs[path] = image
        textures[str(texture)] = dict(path=path, sourceSize=list(source.size), bounds=[left, top, right, bottom], packing=packing,
                                      width=image.width, height=image.height, rgbaSha256=digest(image.tobytes()),
                                      regions=evidence)
        if packed_image is not None:
            textures[str(texture)]['legacy'] = {
                field: legacy_textures[str(texture)][field]
                for field in ('path', 'width', 'height', 'rgbaSha256')
            }
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
        require(mode in (0, 4, 8), 'Unsupported scene blend')
        if mode in (4, 8) and child_key in graph['clips']:
            require(not graph['clips'][child_key]['children'], 'Additive group requires isolated compositing')
        yield from graph_draws(graph, child, phase, controls, matrix @ cm,
                               (color[0] * ct[:4], color[0] * ct[4:] + color[1]),
                               mode or blend, (*ancestors, id_))
