"""Shared pinned-source helpers for the late campaign Tornado and Goblin Freeze Trap importers.

Every input is read through `bundle.source` with an explicit SHA-256 pin and a SHA-1 check
against the client's own fingerprint. Nothing here resizes pixels or interprets gameplay.
"""
import hashlib
import json
import runpy

import numpy as np
from PIL import Image
from .bundle import ROOT, BUNDLE, source, digest
from .sc6 import decode_sctx, require
from .source_csv import decoded_rows, records


def verify_fingerprint(pins):
    fingerprint = json.loads(source('fingerprint.json', pins))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    membership = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in pins:
        if path != 'fingerprint.json':
            require(path in membership, f'Source is not in the client fingerprint: {path}')
            require(hashlib.sha1(source(path, pins)).hexdigest() == membership[path], f'Fingerprint differs: {path}')


def table(path, pins):
    return records(decoded_rows(source(path, pins)))


def effect_closure(names, all_effects):
    """Named effects plus every SpawnEffect they reference, in stable name order."""
    pending, effects = set(names), {}
    while pending:
        name = pending.pop()
        if name in effects:
            continue
        require(name in all_effects, f'Missing source effect: {name}')
        effects[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect'))
    return dict(sorted(effects.items()))


def emitter_exports(particles, swf):
    """Particle export names, requiring each variant row to use the expected SC file."""
    exports = set()
    for rows in particles.values():
        current = rows[0]['ParticleSwf']
        for row in rows:
            current = row.get('ParticleSwf', current)
            if current != swf:
                continue
            if row.get('ParticleExportName'):
                exports.add(row['ParticleExportName'])
    return exports


def textures(sc, graph, pins):
    used = sorted({t for shapes in graph['shapes'].values() for t, _ in shapes})
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], pins)) for t in used}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    return images


def points(poses):
    result = []
    for pose in poses:
        if 'group' in pose:
            result.extend(points(pose['group']))
        else:
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))])
            result.extend(xy @ np.array(pose['matrix']).reshape(2, 3).T)
    return result


def previews(graph, images, states, prefix, padding=8):
    """Transparent 2 px/native-unit previews with shared bounds over every frame of `states`.

    `states` maps output names to (bounds exports, rendered export). The independent CPU
    compositor is the Tesla source-fixture sampler, never the runtime JavaScript player.
    """
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    pixels = {t: np.array(image) / 255 for t, image in images.items()}
    outputs, result = {}, {}
    all_points = []
    for exports, _ in states.values():
        for name in exports:
            clip_id = graph['exports'][name]
            for frame in range(len(graph['clips'][str(clip_id)]['timeline'])):
                all_points.extend(points(cpu['nodes'](graph, clip_id, frame, np.eye(3))))
    box = np.array(all_points)
    bounds = [int(v) for v in [*np.floor(box.min(axis=0) - padding), *np.ceil(box.max(axis=0) + padding)]]
    width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
    root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    for state, (_, name) in states.items():
        poses = cpu['nodes'](graph, graph['exports'][name], 0, root)
        xy = np.array(points(poses))
        require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
        rgba = cpu['compose'](poses, pixels, max(width, height))
        rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
        path = f'{prefix}/{state}.png'
        outputs[path] = image
        result[state] = dict(path=path, export=name, bounds=bounds, width=width, height=height,
                             pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
    return outputs, result


def sounds(effects, prefix, pins):
    outputs, result = {}, {}
    for original in sorted({row['Sound'] for rows in effects.values() for row in rows if row.get('Sound')}):
        path = prefix + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, pins)
        result[original] = dict(path=path, sha256=digest(outputs[path]))
    return outputs, result


def write(outputs, references, folder, reference_folder, check, label):
    """Deterministic regeneration; --check compares membership, pixels, bytes and JSON text."""
    public = ROOT / 'public'
    if check:
        present = {p.relative_to(public).as_posix() for p in (public / folder).rglob('*') if p.is_file()}
        require(present == set(outputs), 'Asset membership differs')
    for path, value in outputs.items():
        target = public / path
        if check:
            if isinstance(value, bytes):
                require(target.read_bytes() == value, f'Sound differs: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(),
                            f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes):
                target.write_bytes(value)
            else:
                value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / reference_folder / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if check:
            require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if check else "Wrote"} {len(outputs)} original {label} assets')
