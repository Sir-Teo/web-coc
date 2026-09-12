"""Reconstruct compact atlases while preserving clip timelines and travel offsets."""
import math
import struct

import numpy as np
from PIL import Image
from .bundle import digest
from .sc6 import rasterize, require


def atlas_group(sc, textures, names, prefix, travel=False, density=2):
    clips, draws = {}, {}
    for state, name in names.items():
        clip = sc.clip(name if isinstance(name, int) else sc.exports[name])
        clips[state] = dict(export=None if isinstance(name, int) else name, id=clip['id'], fps=clip['fps'], count=len(clip['frames']),
                            labels=[dict(frame=i, name=s) for i, s in enumerate(clip['labels']) if s])
        frames, offsets = [], []
        for i, elements in enumerate(clip['frames']):
            transform = np.eye(3)
            if travel and elements:
                # Retain the first child's native translation as a separate track.
                # The other children keep their exact displacement from that child.
                origin = sc.matrix(clip['bank'], elements[0][1])[:2, 2]
                transform[:2, 2] = -origin
                offsets.append(origin.tolist())
            else:
                offsets.append([0, 0])
            frames.append(list(sc.draw_list(clip['id'], i, matrix=transform)))
        if travel:
            clips[state]['offsets'] = offsets
        draws[state] = frames
    points = np.concatenate([np.column_stack([v[:, :2], np.ones(len(v))]) @ m.T
                             for frames in draws.values() for frame in frames for _, v, m, _ in frame])
    bounds = [math.floor(points[:, 0].min()) - 2, math.floor(points[:, 1].min()) - 2,
              math.ceil(points[:, 0].max()) + 2, math.ceil(points[:, 1].max()) + 2]
    width, height = (bounds[2] - bounds[0]) * density, (bounds[3] - bounds[1]) * density
    frames, hashes, images, rendered = [], {}, [], {}
    for state, animation in draws.items():
        timeline = []
        for draw in animation:
            require(all(t in textures for t, _, _, _ in draw), 'Unexpected unpinned texture')
            key = digest(b''.join(struct.pack('<II', t, len(v)) + v.tobytes() + m.tobytes()
                                  + c[0].tobytes() + c[1].tobytes() for t, v, m, c in draw))
            if key not in rendered:
                scaled = [(t, v, np.diag([density, density, 1]) @ m, c) for t, v, m, c in draw]
                rendered[key] = rasterize(scaled, textures, [v * density for v in bounds])
            image = rendered[key]
            rgba_hash = digest(image.tobytes())
            if rgba_hash not in hashes:
                index = len(images)
                hashes[rgba_hash] = index
                images.append(image)
                frames.append(dict(index=index, rgbaSha256=rgba_hash, alphaBounds=image.getbbox()))
            timeline.append(hashes[rgba_hash])
        clips[state]['frames'] = timeline
    # Keep every texture within 4096×4096; large timelines split into pages.
    columns = min(8, 4096 // width)
    require(columns > 0 and height <= 4096, 'Atlas cell exceeds texture limit')
    capacity = columns * (4096 // height)
    outputs, pages = {}, []
    for start in range(0, len(images), capacity):
        count = min(capacity, len(images) - start)
        atlas = Image.new('RGBA', (columns * width, math.ceil(count / columns) * height))
        for i, image in enumerate(images[start:start + count]):
            atlas.paste(image, (i % columns * width, i // columns * height))
            frames[start + i].update(page=len(pages), cell=i)
        path = f'{prefix}-{len(pages)}.png'
        outputs[path] = atlas
        pages.append(dict(path=path, frames=count, rgbaSha256=digest(atlas.tobytes())))
    meta = dict(width=width, height=height, columns=columns, pixelsPerNativeUnit=density,
                bounds=bounds, frames=frames, clips=clips, pages=pages)
    print(f'{prefix}: {sum(c["count"] for c in clips.values())} timeline frames, '
          f'{len(images)} unique, {len(pages)} pages, {width}×{height} cells', flush=True)
    return outputs, meta


def root_track(sc, name):
    """Keep each root child's native transform/tint and nested animation phase.

    Separating animated components preserves the scene graph without baking
    root motion, tint or fractional relative translation into duplicate pixels.
    """
    clip = sc.clip(sc.exports[name])
    frames = []
    for i, frame in enumerate(clip['frames']):
        placements = []
        for child, transform, tint in frame:
            id_ = clip['children'][child]
            nested = sc.clip(id_)
            placed = i
            while placed > 0 and any(e[0] == child for e in clip['frames'][placed - 1]):
                placed -= 1
            phase = (i - placed) * nested['fps'] // clip['fps'] % len(nested['frames'])
            matrix = sc.matrix(clip['bank'], transform)
            mul, add = sc.color(clip['bank'], tint)
            placements.append(dict(id=id_, frame=phase, matrix=matrix[:2].reshape(-1).tolist(),
                                   multiply=mul.tolist(), add=add.tolist()))
        frames.append(placements)
    return dict(export=name, id=clip['id'], fps=clip['fps'], count=len(frames), frames=frames)


def verify_root_track(sc, track):
    """Compare split components with the reader's complete recursive draw stream."""
    commands = 0
    for i, frame in enumerate(track['frames']):
        expected = list(sc.draw_list(track['id'], i))
        actual = []
        for p in frame:
            matrix = np.vstack([np.array(p['matrix']).reshape(2, 3), [0, 0, 1]])
            actual.extend(sc.draw_list(p['id'], p['frame'], matrix=matrix,
                                       color=(np.array(p['multiply']), np.array(p['add']))))
        require(len(actual) == len(expected), 'Split track loses draw commands')
        for a, e in zip(actual, expected):
            require(a[0] == e[0], 'Split track changes a texture')
            for av, ev in [(a[1], e[1]), (a[2], e[2]), (a[3][0], e[3][0]), (a[3][1], e[3][1])]:
                require(av.shape == ev.shape and np.allclose(av, ev, rtol=0, atol=1e-10),
                        'Split track changes native geometry, tint or phase')
        commands += len(expected)
    print(f'Verified {len(track["frames"])} native root frames and {commands} recursive draw commands', flush=True)
