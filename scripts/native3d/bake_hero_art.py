#!/usr/bin/env python3
"""Bake the original 3D hero, pet and Town Hall 18 Guardian default skins into 8-direction transparent sprite atlases.

Every input comes from the pinned client 18.400.21 archive (SHA-1 fingerprint membership; SHA-256
pins are written to reference/full-client/hero-art.json or guardian-art.json): heroes/pets/guardians/skins
tables, animation blocks, the 3D camera globals, Odin geometry and animation files (scripts/native3d/fla2.py) and
ASTC textures (scripts/native3d/sctx3d.py). Skinning poses are evaluated here; rasterisation runs
in headless Chromium WebGL2 (Playwright, SwiftShader by default) via scripts/native3d/render_webgl.mjs.

    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/bake_hero_art.py
    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/bake_hero_art.py --check
    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/bake_hero_art.py --set guardians
    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/bake_hero_art.py --set guardians --check

``--set`` selects the character set: heroes (default: heroes and pets -> public/assets/heroes-native,
reference/full-client/hero-art.json) or guardians (logic/guardians.csv DisplaySkin rows ->
public/assets/guardians-native, reference/full-client/guardian-art.json). ``--check`` verifies all recorded
source and output hashes of the set, re-renders one character (``--check-key``, default king / longshot)
and compares its pixels with the stored atlas within a tolerance.
"""
import argparse
import hashlib
import io
import json
import math
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
from PIL import Image

from native_art.bundle import ROOT, digest
from native_art.source_csv import animation_blocks, decoded_rows, records
from native3d import fla2
from native3d.sctx3d import decode_sctx3d

ARCHIVE = ROOT / 'art/source/native-client-18.400.21'
FINGERPRINT_SHA256 = 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b'
OUTPUT = ROOT / 'public/assets/heroes-native'
INDEX = ROOT / 'reference/full-client/hero-art.json'
WORK = ROOT / 'output/native3d-work'
RENDERER = ROOT / 'scripts/native3d/render_webgl.mjs'

CHARACTERS = [
    ('king', 'logic/heroes.csv', 'Barbarian King'), ('queen', 'logic/heroes.csv', 'Archer Queen'),
    ('warden', 'logic/heroes.csv', 'Grand Warden'), ('champion', 'logic/heroes.csv', 'Royal Champion'),
    ('prince', 'logic/heroes.csv', 'Minion Prince'), ('duke', 'logic/heroes.csv', 'Dragon Duke'),
    ('lassi', 'logic/pets.csv', 'LASSI'), ('yak', 'logic/pets.csv', 'Mighty Yak'), ('owl', 'logic/pets.csv', 'Electro Owl'),
    ('unicorn', 'logic/pets.csv', 'Unicorn'), ('phoenix', 'logic/pets.csv', 'Phoenix'),
    ('lizard', 'logic/pets.csv', 'Poison Lizard'), ('diggy', 'logic/pets.csv', 'Diggy'), ('frosty', 'logic/pets.csv', 'Frosty'),
    ('fox', 'logic/pets.csv', 'Spirit Fox'), ('jelly', 'logic/pets.csv', 'Angry Jelly'), ('sneezy', 'logic/pets.csv', 'Sneezy'),
    ('crow', 'logic/pets.csv', 'Crow'),
]
BASE_STATES = ('idle', 'walk', 'attack', 'die')
EXTRA_STATES = ('idle2', 'walk2', 'attack2')
ALT_PREFIX = 'alt_'            # Grand Warden AltAnimation (flying mode)
DIRECTIONS = 8
DIRECTION_NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
MAX_FRAMES = 24
PIXEL_SCALE = 1                # bake at the client's own 225 px character viewport density
SUPERSAMPLE = 4
PAD_PX = 2
SHEET_LIMIT = 2048
LIGHT = dict(ambient=0.72, diffuse=0.45, emission=1.0, direction=(-0.45, 0.55, 0.70))
CHECK_MEAN_TOLERANCE = 1.5     # worst per-frame mean absolute RGBA difference (0-255)
CHECK_OUTLIER_FRACTION = 0.01  # share of pixels differing by more than 24 in any channel

# Town Hall 18 Guardians: logic/guardians.csv rows whose DisplaySkin is their own default skin (the other rows are
# deprecated placeholders reusing these skins).
GUARDIANS = [('longshot', 'InfernoArtillery'), ('smasher', 'MeleeAreaaaa'), ('logger', 'Logger')]
GUARDIAN_STATES = ('idle', 'walk', 'attack', 'attack2', 'die', 'jump', 'celebrate')
# Animation row columns that drive the bake; any other non-empty cell is recorded (csvNotBaked) when a set asks for it.
BAKED_ANIMATION_COLUMNS = ('Name', 'SCW', 'Looping', 'ActionFrame', 'LoopStartFrame', 'Scale', 'LookAtCamera', 'OffsetY')
SKIN_EFFECT_COLUMNS = ('DeployEffect', 'AttackEffect', 'AttackEffect2', 'AttackEffectAlt', 'AttackEffect2Alt', 'HitEffect',
                       'DieEffect', 'AbilityTriggerEffect', 'AbilityEffect', 'AbilityActivationEffect', 'AbilityHitEffect',
                       'ParticleEffect3D', 'AbilityEffect3D', 'CelebrateSfx', 'GunBone', 'ShadowBone', 'ProjectileVis')
SETS = dict(
    heroes=dict(characters=CHARACTERS, skinColumn='DefaultSkin', states=BASE_STATES + EXTRA_STATES, required=BASE_STATES,
                output=OUTPUT, index=INDEX, work=WORK, checkKey='king', generator='scripts/native3d/bake_hero_art.py',
                extraFields=False, cameraFrom=None, notes={}),
    guardians=dict(
        characters=[(key, 'logic/guardians.csv', row) for key, row in GUARDIANS], skinColumn='DisplaySkin',
        states=GUARDIAN_STATES, required=GUARDIAN_STATES, output=ROOT / 'public/assets/guardians-native',
        index=ROOT / 'reference/full-client/guardian-art.json', work=ROOT / 'output/native3d-guardian-work',
        checkKey='longshot', generator='scripts/native3d/bake_hero_art.py --set guardians', extraFields=True, cameraFrom=INDEX,
        notes=dict(
            anchor='anchorX/anchorY: pixel offset inside the frame rectangle of the projected model origin, i.e. the ground '
                   'point under the character. Guardians are ground units without OffsetY, so no flying offset applies; '
                   'the jump clip keeps its own in-place leap height (the sprite rises above the anchor).',
            lookAtCamera='States flagged LookAtCamera (die/stunned and celebrate) are rendered once facing the camera (S) '
                         'and referenced by all 8 directions.',
            shading='Approximation, not the client "character" shader: gamma-space base colour * (0.72 + 0.45 * lambert) '
                    'with a view-space light from the upper left, tangent-space normal map (ASTC RRRG: x red, y alpha), '
                    'additive emission map. Material maps are pinned but not applied; the all-zero a_color1 stream of a '
                    'second vertex buffer is ignored. No particles, outlines, stun stars, bloom or ground shadows.',
            states='idle, walk, attack, attack2, die, jump, celebrate from the skins.csv Animation block of the '
                   'guardians.csv DisplaySkin: attack2 is the unnamed second attack variant row, die uses the stunned clip '
                   '(HasDirections FALSE, not looping) and celebrate the intro clip. The menu row (ui1 clip, a menu-screen '
                   'pose) is not baked. Non-baked CSV cells (HasDirections, VariationWeight, StopToLast, ParticleEffect3D, '
                   'Effect3DFrame, EffectFrame, Effect) are recorded per state as csvNotBaked and the skins.csv effect and '
                   'bone names as csvSkinEffects; particle and sound effects are not rendered.',
            geometry='All meshDataInfo vertex buffers are used, concatenated in order (the Guardian Logger legs use a second '
                     'buffer). The animation row Scale (recorded per state as scale) scales the model before projection.')),
)


def require(condition, message):
    if not condition:
        raise SystemExit(f'error: {message}')


class Source:
    def __init__(self):
        raw = (ARCHIVE / 'fingerprint.json').read_bytes()
        require(digest(raw) == FINGERPRINT_SHA256, 'Client fingerprint differs from pin')
        self.members = {r['file']: r['sha'] for r in json.loads(raw)['files']}
        self.pins = {}

    def read(self, path):
        require(path in self.members, f'Not a pinned client file: {path}')
        data = (ARCHIVE / 'files' / path).read_bytes()
        require(hashlib.sha1(data).hexdigest() == self.members[path], f'Source mismatch: {path}')
        self.pins[path] = digest(data)
        return data


# --------------------------------------------------------------------------- client data

def client_camera(src):
    table = records(decoded_rows(src.read('csv/client_globals.csv')))

    def value(name, column):
        rows = table[name]
        return [r[column] for r in rows]
    position = [int(v) for v in value('3D_CAMERA_POSITION', 'NumberArray')]
    look_at = [int(v) for v in value('3D_CAMERA_LOOK_AT', 'NumberArray')]
    camera = dict(position=position, lookAt=look_at, fov=int(value('3D_CAMERA_FOV', 'NumberValue')[0]),
                  near=int(value('3D_CAMERA_NEAR', 'NumberValue')[0]), far=int(value('3D_CAMERA_FAR', 'NumberValue')[0]),
                  orthographic=value('USE_3D_ORTHO_PROJECTION', 'BooleanValue')[0] == 'TRUE')
    require(len(position) == 3 and len(look_at) == 3 and camera['orthographic'], 'Unexpected 3D camera globals')
    return camera


def view_basis(camera, elevation=None):
    back = np.array(camera['position'], float) - np.array(camera['lookAt'], float)
    back /= np.linalg.norm(back)
    if elevation is not None:  # optional override, e.g. ~48.6 to match the 4:3 ground of the 2D art
        require(back[0] == 0 and 5 <= elevation <= 85, 'Unsupported elevation override')
        back = np.array([0.0, math.sin(math.radians(elevation)), math.cos(math.radians(elevation))])
    right = np.cross(-back, [0.0, 1.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, -back)
    return right, up, back


def facing_yaw(direction, elevation_sin):
    """Yaw about +Y so the model's +Z forward projects to screen angle 45*direction (clockwise, y down)."""
    phi = math.radians(45 * direction)
    return math.atan2(math.cos(phi), math.sin(phi) / elevation_sin)


def rot_y(angle):
    c, s = math.cos(angle), math.sin(angle)
    m = np.eye(4)
    m[0, 0], m[0, 2], m[2, 0], m[2, 2] = c, s, -s, c
    return m


def block_states(block, wanted=BASE_STATES + EXTRA_STATES):
    """Named rows in ``wanted`` plus an unnamed attack variant (a second attack clip) when attack2 is wanted and no
    attack2 row exists."""
    events, current, variant = [], None, 0
    for row in block['rows']:
        if row['Name']:
            current, variant = row['Name'], 0
        else:
            variant += 1
        events.append((current, variant, row))
    states = {}
    for name, variant, row in events:
        if variant == 0 and name in wanted and name not in states:
            states[name] = (row, name)
    if 'attack2' in wanted and 'attack2' not in states and 'attack' in states:
        for name, variant, row in events:
            if name == 'attack' and variant > 0 and row['SCW'] and row['SCW'] != states['attack'][0]['SCW']:
                states['attack2'] = (row, 'attack variant 2')
                break
    return states


def character_spec(src, key, table_path, row_name, cache, skin_column='DefaultSkin', wanted=BASE_STATES + EXTRA_STATES,
                   required=BASE_STATES):
    """Resolve a record's default skin (``skin_column``) and the ``wanted`` states of its animation block."""
    def table(path, reader=records):
        if path not in cache:
            cache[path] = reader(decoded_rows(src.read(path)))
        return cache[path]
    rows = table(table_path)
    require(row_name in rows, f'Missing {table_path} record {row_name}')
    skin_name = rows[row_name][0].get(skin_column)
    skins = table('logic/skins.csv')
    require(skin_name in skins, f'Missing skin {skin_name}')
    skin = skins[skin_name][0]
    require(skin.get('IsDefaultSkin') == 'TRUE' and skin.get('HasIngameGeometry') == 'FALSE', f'Unexpected skin flags {skin_name}')
    blocks = table('csv/animations.csv', animation_blocks)
    states = {}
    sources = [(skin['Animation'], '', wanted, required)]
    if key == 'warden':
        require(skin.get('AltAnimation'), 'Grand Warden lacks its flying AltAnimation')
        sources.append((skin['AltAnimation'], ALT_PREFIX, BASE_STATES, BASE_STATES))
    for block_name, prefix, wanted_states, required_states in sources:
        require(block_name in blocks, f'Missing animation block {block_name}')
        for name, (row, event) in block_states(blocks[block_name], wanted_states).items():
            require(row['SCW'], f'{block_name}:{name} has no SCW clip')
            states[prefix + name] = dict(
                block=block_name, event=event, file=row['SCW'], loop=row.get('Looping') == 'TRUE',
                actionFrame=int(row['ActionFrame']) if row.get('ActionFrame') else None,
                loopStartFrame=int(row['LoopStartFrame']) if row.get('LoopStartFrame') else None,
                scale=int(row['Scale']) / 100 if row.get('Scale') else 1.0,
                lookAtCamera=row.get('LookAtCamera') == 'TRUE',
                offsetY=int(row['OffsetY']) if row.get('OffsetY') else None,
                csvNotBaked={c: v for c, v in row.items() if v and c not in BAKED_ANIMATION_COLUMNS})
        for name in required_states:
            require(prefix + name in states, f'{block_name} lacks {name}')
    textures = {k: skin[c] for k, c in (('base', 'Texture'), ('normal', 'NormalMap'), ('material', 'MaterialMap'),
                                         ('emission', 'EmissionMap')) if skin.get(c)}
    return dict(key=key, record=f'{table_path}:{row_name}', skin=skin_name, geometry=skin['Geometry'], textures=textures,
                animation=skin['Animation'], altAnimation=skin.get('AltAnimation') if key == 'warden' else None,
                viewport=(int(skin['ViewportWidth']), int(skin['ViewportHeight']), int(skin['CameraDistance'])),
                shadowScale=int(skin['ShadowScale']) if skin.get('ShadowScale') else None, states=states,
                character=skin.get('Character'), skinEffects={c: skin[c] for c in SKIN_EFFECT_COLUMNS if skin.get(c)})


# --------------------------------------------------------------------------- sampling

def pose_delta(anim, a, b):
    """Largest joint rotation (radians) or translation change between two native frames."""
    worst = 0.0
    for t in anim['tracks']:
        dot = min(1.0, abs(float(np.dot(t['rotation'][a], t['rotation'][b]))))
        worst = max(worst, 2 * math.acos(dot), float(np.abs(t['translation'][a] - t['translation'][b]).max()) * 0.1)
    return worst


def sample_plan(label, state, anim):
    """Choose native frames: the loop range (or whole clip), decimated by an integer step to <= MAX_FRAMES."""
    frames = anim['keyframeCount']
    base = label.removeprefix(ALT_PREFIX)
    start, end, loop_start, closed = 0, frames - 1, None, None
    if state['loop']:
        cycle = (state['loopStartFrame'] - 1) if state['loopStartFrame'] else 0
        require(0 <= cycle < frames - 1, f'{label}: LoopStartFrame outside clip')
        steps = [pose_delta(anim, i, i + 1) for i in range(frames - 1)]
        typical = float(np.median(steps)) if steps else 0.0
        closed = pose_delta(anim, frames - 1, cycle) <= max(1.5 * typical, 1e-3)
        if closed:
            end = frames - 2          # the last native frame repeats the cycle start
        if base in ('walk', 'walk2') or not state['loopStartFrame']:
            start = cycle             # locomotion keeps only its cycle
        else:
            loop_start = cycle        # e.g. stunned: knock-down intro, then a looping cycle
    length = end - start + 1
    step = math.ceil(length / MAX_FRAMES)
    chosen = list(range(start, end + 1, step))
    if loop_start is not None:
        loop_start = min(range(len(chosen)), key=lambda i: abs(chosen[i] - loop_start))
    action = None
    if state['actionFrame'] is not None:
        native = min(frames - 1, max(0, state['actionFrame'] - 1))
        action = min(range(len(chosen)), key=lambda i: abs(chosen[i] - native))
    info = dict(nativeFrames=frames, nativeFps=round(anim['frameRate'], 4), nativeRange=[start, end], step=step,
                sampledNativeFrames=chosen)
    if closed is not None:
        info['lastFrameRepeatsCycleStart'] = bool(closed)
    return chosen, anim['frameRate'] / step, loop_start, action, info


# --------------------------------------------------------------------------- preparation

def mesh_arrays(geometry):
    """All vertex buffers (meshDataInfos) concatenated in index order, primitive indices offset to match."""
    meshes = list(geometry.meshes())
    require(all(skinned for *_, skinned in meshes), 'Unskinned primitives are not supported')
    infos = sorted({info for _, _, info, _, _, _ in meshes})
    buffers, offsets, count = [], {}, 0
    for info in infos:
        data = geometry.vertex_data(info)
        for name in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'):
            require(name in data, f'Model lacks {name}')
        offsets[info], count = count, count + data['count']
        buffers.append(data)
    require(len({'TANGENT' in data for data in buffers}) == 1, 'Vertex buffers disagree on tangents')

    def column(name):
        return np.concatenate([data[name] for data in buffers])
    weights = column('WEIGHTS_0') / column('WEIGHTS_0').sum(1, keepdims=True)
    tangent = column('TANGENT') if 'TANGENT' in buffers[0] else None
    return dict(position=column('POSITION').astype(np.float32), normal=column('NORMAL').astype(np.float32),
                tangent=(tangent if tangent is not None else np.tile(np.float32([1, 0, 0, 1]), (count, 1))).astype(np.float32),
                uv=column('TEXCOORD_0').astype(np.float32), joints=np.where(weights > 0, column('JOINTS_0'), 0).astype(np.uint8),
                weights=weights.astype(np.float32),
                indices=np.concatenate([ind + np.uint32(offsets[info]) for _, _, info, ind, _, _ in meshes]).astype(np.uint32),
                hasTangent=tangent is not None, vertexBuffers=len(buffers))


def prepare(src, spec, basis, ppu, work):
    right, up, back = basis
    elevation_sin = float(back[1])
    key = spec['key']
    geometry = fla2.Document(src.read(spec['geometry']), spec['geometry'])
    joints, ibm = geometry.skin(0)
    mesh = mesh_arrays(geometry)
    used = np.unique(mesh['indices'])
    positions = np.concatenate([mesh['position'][used], np.ones((len(used), 1), np.float32)], axis=1).astype(np.float64)
    v_joints, v_weights = mesh['joints'][used], mesh['weights'][used].astype(np.float64)
    view = np.eye(4)
    view[0, :3], view[1, :3], view[2, :3] = right, up, back
    yaws = [rot_y(facing_yaw(k, elevation_sin)) for k in range(DIRECTIONS)]
    poses, renders, states, clips = [], [], {}, {}
    for label, state in spec['states'].items():
        if state['file'] not in clips:
            clips[state['file']] = fla2.Retarget(geometry, fla2.Document(src.read(state['file']), state['file']))
        retarget = clips[state['file']]
        chosen, fps, loop_start, action, info = sample_plan(label, state, retarget.an)
        directions = [2] if state['lookAtCamera'] else list(range(DIRECTIONS))
        scale = np.diag([state['scale']] * 3 + [1.0])
        refs = {}
        for f, native in enumerate(chosen):
            globals_ = retarget.geometry_globals(float(native))
            skins = np.stack([globals_[j] @ ibm[i] for i, j in enumerate(joints)])
            pose = len(poses)
            poses.append(skins)
            world = np.einsum('vi,vijk,vk->vj', v_weights, skins[v_joints], positions)
            for k in directions:
                model = yaws[k] @ scale
                p = world[:, :3] @ model[:3, :3].T
                x, y, z = p @ right, p @ up, p @ back
                left, right_edge = math.floor(x.min() * ppu) - PAD_PX, math.ceil(x.max() * ppu) + PAD_PX
                bottom, top = math.floor(y.min() * ppu) - PAD_PX, math.ceil(y.max() * ppu) + PAD_PX
                w, h = right_edge - left, top - bottom
                require(0 < w <= 2048 and 0 < h <= 2048, f'{key}:{label} frame exceeds 2048 px')
                distance = float(z.max()) + 1.0
                model_view = view.copy()
                model_view[2, 3] = -distance
                model_view = model_view @ model
                refs[(k, f)] = len(renders)
                renders.append(dict(pose=pose, w=w, h=h,
                                    window=[left / ppu, right_edge / ppu, bottom / ppu, top / ppu, 0.5, distance - float(z.min()) + 0.5],
                                    modelView=model_view.T.reshape(-1).tolist(), anchor=[-left, top]))
        states[label] = dict(state=state, fps=fps, loopStart=loop_start, action=action, info=info,
                             directions=directions, refs=refs, frames=len(chosen))
    blob, arrays = bytearray(), {}
    for name in ('position', 'normal', 'tangent', 'uv', 'joints', 'weights', 'indices'):
        array = np.ascontiguousarray(mesh[name])
        blob.extend(b'\0' * (-len(blob) % 4))
        arrays[name] = dict(offset=len(blob), count=int(array.shape[0]))
        blob.extend(array.tobytes())
    (work / f'{key}-mesh.bin').write_bytes(bytes(blob))
    (work / f'{key}-poses.bin').write_bytes(np.stack(poses).astype(np.float32).transpose(0, 1, 3, 2).tobytes())
    textures = {}
    base, _ = decode_sctx3d(src.read(spec['textures']['base']))
    base.convert('RGB').save(work / f'{key}-base.png')
    textures['base'] = f'{key}-base.png'
    if 'normal' in spec['textures'] and mesh['hasTangent']:
        normal, _ = decode_sctx3d(src.read(spec['textures']['normal']))
        normal.save(work / f'{key}-normal.png')
        textures['normal'] = f'{key}-normal.png'
    if 'emission' in spec['textures']:
        emission, _ = decode_sctx3d(src.read(spec['textures']['emission']))
        emission.convert('RGB').save(work / f'{key}-emission.png')
        textures['emission'] = f'{key}-emission.png'
    if 'material' in spec['textures']:
        src.read(spec['textures']['material'])  # pinned for provenance; not applied
    (work / f'{key}-records.json').write_text(json.dumps([{k: v for k, v in r.items() if k != 'anchor'} for r in renders]))
    job = dict(key=key, mesh=f'{key}-mesh.bin', arrays=arrays, poses=f'{key}-poses.bin', joints=len(joints),
               textures=textures, records=f'{key}-records.json', output=f'{key}-frames.bin')
    return dict(job=job, renders=renders, states=states, joints=len(joints), vertices=int(len(mesh['position'])),
                triangles=int(len(mesh['indices']) // 3), normalMap='normal' in textures, emissionMap='emission' in textures,
                vertexBuffers=mesh['vertexBuffers'])


def run_renderer(work, jobs, gpu):
    direction = np.array(LIGHT['direction'], float)
    job = dict(characters=jobs, supersample=SUPERSAMPLE, gpu=gpu, batch=32,
               light=dict(LIGHT, direction=(direction / np.linalg.norm(direction)).tolist()))
    (work / 'job.json').write_text(json.dumps(job, indent=1))
    subprocess.run(['node', str(RENDERER), str(work / 'job.json')], check=True, cwd=ROOT)


def read_frames(work, key, renders):
    raw = (work / f'{key}-frames.bin').read_bytes()
    require(len(raw) == sum(r['w'] * r['h'] * 4 for r in renders), f'{key}: renderer output size differs')
    frames, cursor = [], 0
    for r in renders:
        pixels = np.frombuffer(raw, np.uint8, r['w'] * r['h'] * 4, cursor).reshape(r['h'], r['w'], 4)
        cursor += r['w'] * r['h'] * 4
        ys, xs = np.nonzero(pixels[:, :, 3])
        require(len(xs) > 0, f'{key}: empty render')
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
        crop = pixels[y0:y1, x0:x1].copy()
        crop[crop[:, :, 3] == 0] = 0
        frames.append(dict(pixels=crop, anchorX=int(r['anchor'][0] - x0), anchorY=int(r['anchor'][1] - y0)))
    return frames


# --------------------------------------------------------------------------- atlas output

def pack(images):
    """Shelf-pack images (tallest first) into as few sheets of at most SHEET_LIMIT px as needed."""
    order = sorted(range(len(images)), key=lambda i: (-images[i].shape[0], -images[i].shape[1], i))
    area = sum((im.shape[0] + 1) * (im.shape[1] + 1) for im in images)
    width = min(SHEET_LIMIT, max(max(im.shape[1] for im in images), int(math.ceil(math.sqrt(area * 1.15)))))
    sheets, placement = [[0, 0]], {}
    x = y = shelf = 0
    for i in order:
        h, w = images[i].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 1, 0
        if y + h > SHEET_LIMIT:
            sheets.append([0, 0])
            x = y = shelf = 0
        placement[i] = (len(sheets) - 1, x, y)
        sheets[-1][0], sheets[-1][1] = max(sheets[-1][0], x + w), max(sheets[-1][1], y + h)
        x += w + 1
        shelf = max(shelf, h)
    return placement, sheets


def build_atlas(spec, prepared, frames):
    atlas_states, files, aliases = {}, {}, {}
    for label, st in prepared['states'].items():
        signature = (st['state']['file'], st['state']['scale'], st['state']['lookAtCamera'],
                     tuple(st['info']['sampledNativeFrames']))
        if signature in aliases:  # e.g. a pet whose walk reuses its idle clip: share the same sheets
            original = atlas_states[aliases[signature]]
            entry = dict(loop=st['state']['loop'], actionFrame=st['action'], fps=round(st['fps'], 4))
            if st['loopStart'] is not None:
                entry['loopStart'] = st['loopStart']
            entry['frames'] = original['frames']
            atlas_states[label] = entry
            continue
        aliases[signature] = label
        unique, seen, refs = [], {}, {}
        for (k, f), index in st['refs'].items():
            frame = frames[index]
            signature = (frame['pixels'].shape, hashlib.sha256(frame['pixels'].tobytes()).hexdigest())
            if signature not in seen:
                seen[signature] = len(unique)
                unique.append(frame['pixels'])
            refs[(k, f)] = (seen[signature], frame['anchorX'], frame['anchorY'])
        placement, sheets = pack(unique)
        names = [f'{label}.png'] + [f'{label}-{i}.png' for i in range(1, len(sheets))]
        canvases = [np.zeros((h, w, 4), np.uint8) for w, h in sheets]
        for i, (sheet, x, y) in placement.items():
            h, w = unique[i].shape[:2]
            canvases[sheet][y:y + h, x:x + w] = unique[i]
        for name, canvas in zip(names, canvases):
            files[name] = Image.fromarray(canvas, 'RGBA')
        directions = []
        for k in range(DIRECTIONS):
            source = k if k in st['directions'] else st['directions'][0]
            row = []
            for f in range(st['frames']):
                index, ax, ay = refs[(source, f)]
                sheet, x, y = placement[index]
                h, w = unique[index].shape[:2]
                row.append(dict(image=names[sheet], x=x, y=y, w=w, h=h, anchorX=ax, anchorY=ay))
            directions.append(row)
        entry = dict(loop=st['state']['loop'], actionFrame=st['action'], fps=round(st['fps'], 4))
        if st['loopStart'] is not None:
            entry['loopStart'] = st['loopStart']
        entry['frames'] = directions
        atlas_states[label] = entry
    native = {round(s['info']['nativeFps'], 4) for s in prepared['states'].values()}
    require(len(native) == 1, f'{spec["key"]}: clips use different native frame rates')
    return dict(key=spec['key'], clientSkin=spec['skin'], fps=native.pop(), directions=DIRECTIONS, states=atlas_states), files


def encode_png(image):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    return buffer.getvalue()


def contact_sheet(atlas, images, target):
    """Rows per state: all 8 directions at the middle frame, then every frame of direction SE."""
    cell = max(max(fr['w'], fr['h']) for st in atlas['states'].values() for row in st['frames'] for fr in row) + 6
    rows = []
    for label, st in atlas['states'].items():
        middle = len(st['frames'][0]) // 2
        rows.append([st['frames'][k][middle] for k in range(DIRECTIONS)])
        rows.append(st['frames'][1])
    columns = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (columns * cell, len(rows) * cell), (92, 118, 84, 255))
    for r, frames in enumerate(rows):
        for c, fr in enumerate(frames):
            sprite = images[fr['image']].crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
            origin = (c * cell + cell // 2, r * cell + int(cell * 0.72))
            layer = Image.new('RGBA', sheet.size)
            layer.paste(sprite, (origin[0] - fr['anchorX'], origin[1] - fr['anchorY']))
            sheet.alpha_composite(layer)
            for dx in (-2, -1, 0, 1, 2):
                sheet.putpixel((origin[0] + dx, origin[1]), (255, 40, 40, 255))
                sheet.putpixel((origin[0], origin[1] + dx), (255, 40, 40, 255))
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)


def conventions(camera, basis, ppu, native_ppu, viewport, override, notes=None):
    """Index conventions; ``notes`` replaces (same key) or appends set-specific entries."""
    right, up, back = basis
    width, height, distance = viewport
    camera_entry = dict(source='csv/client_globals.csv: 3D_CAMERA_POSITION, 3D_CAMERA_LOOK_AT, 3D_CAMERA_FOV, '
                               'USE_3D_ORTHO_PROJECTION (grouped with 3D_CHARACTER_ATLAS_* sizes)',
                        position=camera['position'], lookAt=camera['lookAt'], fov=camera['fov'], orthographic=True,
                        elevationDegrees=round(math.degrees(math.asin(float(back[1]))), 4),
                        viewDirection=[round(float(-v), 6) for v in back],
                        axes='Y-up like every Odin model and the skins.csv portrait/reward cameras (x;y;z); feet at y=0, '
                             'models face +Z; screen right = +X')
    if override is not None:
        camera_entry['elevationOverrideDegrees'] = override
    result = dict(
        camera=camera_entry,
        crossChecks='2D art is drawn from a shallower camera than the client 3D character camera (57.26 deg): '
                    'building_bases.sc base_2x2..base_5x5 diamonds measure 1.34:1 (orthographic elevation ~48 deg; 4:3 '
                    '= 48.6 deg) and the Wall Wrecker 2D direction sprites (wheel layers, edge-on vs side view) give '
                    '~46-52 deg; this project draws a 2:1 (30 deg) grid. Pass --elevation to re-bake for another camera.',
        pixelsPerWorldUnit=round(ppu, 6),
        clientPixelsPerWorldUnit=round(native_ppu, 6),
        pixelScaleNote=f'Client character viewport {width}x{height} px covers 2*(CameraDistance {distance}/100)*tan(FOV/2) '
                       f'world units; atlases are baked at {PIXEL_SCALE}x that density. Draw at 1/{PIXEL_SCALE} for client scale.',
        directions=dict(count=DIRECTIONS, names=DIRECTION_NAMES,
                        index='frames[k] faces screen angle 45*k degrees clockwise from screen right (y down): 0=E, 2=S (toward camera), 6=N',
                        yaw='model yaw about +Y = atan2(cos(phi), sin(phi)/sin(elevation)); no mirroring is used'),
        anchor='anchorX/anchorY: pixel offset inside the frame rectangle of the projected model origin, i.e. the ground '
               'point under the character. Flying heights are part of the source animations (sprites float above the anchor); '
               'the CSV OffsetY is recorded per state but not baked.',
        sampling=f'Sources are 30 fps. A state uses native frames from its range (whole clip; for looping walk states '
                 f'only the cycle from LoopStartFrame; other looping states keep the intro and set loopStart). The last native '
                 f'frame is dropped when it repeats the cycle start pose. Frames are decimated by the smallest integer step '
                 f'that keeps <= {MAX_FRAMES} frames; state fps = 30 / step. actionFrame maps the 1-based CSV ActionFrame to '
                 f'the nearest sampled frame.',
        lookAtCamera='States flagged LookAtCamera (die/stunned) are rendered once facing the camera (S) and referenced by all 8 directions.',
        rig='Animation clips contain the full authoring rig; joint globals are evaluated in the clip hierarchy '
            '(untracked nodes keep the clip node TRS) and mapped to geometry joints by name.',
        shading='Approximation, not the client "character" shader: gamma-space base colour * (0.72 + 0.45 * lambert) with a '
                'view-space light from the upper left, tangent-space normal map (ASTC RRRG: x red, y alpha), additive '
                'emission map. Material maps are pinned but not applied; materials with an opacity variable (Angry Jelly '
                'dome) are drawn opaque. No particles, outlines, stun stars or ground shadows.',
        antialiasing=f'{SUPERSAMPLE}x{SUPERSAMPLE} supersampled, box filtered, straight alpha, tight alpha crop.',
        states='idle, walk, attack, die (heroes and pets use the stunned clip for die); extra idle2/walk2/attack2 rows '
               'and an unnamed second attack clip become idle2/walk2/attack2; Grand Warden flying states use the alt_ prefix.')
    result.update(notes or {})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--set', choices=sorted(SETS), default='heroes',
                        help='character set: heroes (heroes and pets, default) or guardians (Town Hall 18 Guardians)')
    parser.add_argument('--check', action='store_true', help='verify hashes and re-render one character')
    parser.add_argument('--check-key', help='character re-rendered by --check (default: king for heroes, longshot for guardians)')
    parser.add_argument('--only', nargs='*', help='bake a subset (the index is only written when all characters are baked)')
    parser.add_argument('--gpu', choices=['swiftshader', 'metal'], default='swiftshader')
    parser.add_argument('--contact-sheets', type=Path, help='directory for one contact sheet PNG per character')
    parser.add_argument('--work', type=Path, help='scratch directory (default output/native3d-work, '
                                                  'output/native3d-guardian-work for guardians)')
    parser.add_argument('--elevation', type=float, help='override the client camera elevation in degrees')
    args = parser.parse_args()
    config = SETS[args.set]
    output, index_path = config['output'], config['index']
    index_label = index_path.relative_to(ROOT).as_posix()
    work = args.work or config['work']
    check_key = args.check_key or config['checkKey']
    reference = None  # index of the set whose camera this set shares (guardians follow hero-art.json)
    if config['cameraFrom'] is not None and config['cameraFrom'].exists():
        reference = json.loads(config['cameraFrom'].read_text())['conventions']
    started = time.time()
    src = Source()
    camera = client_camera(src)
    if args.check:
        require(index_path.exists(), f'Missing {index_label}')
        args.elevation = json.loads(index_path.read_text())['conventions']['camera'].get('elevationOverrideDegrees')
    elif args.elevation is None and reference is not None:
        args.elevation = reference['camera'].get('elevationOverrideDegrees')
    basis = view_basis(camera, args.elevation)
    cache = {}
    specs = [character_spec(src, *entry, cache, skin_column=config['skinColumn'], wanted=config['states'],
                            required=config['required']) for entry in config['characters']]
    viewports = {s['viewport'] for s in specs}
    require(len(viewports) == 1, f'Characters use different camera viewports: {viewports}')
    viewport = viewports.pop()
    native_ppu = viewport[0] / (2 * viewport[2] / 100 * math.tan(math.radians(camera['fov'] / 2)))
    ppu = native_ppu * PIXEL_SCALE
    if args.check:
        index = json.loads(index_path.read_text())
        verify_index(src, index, specs, output)
        selected = [s for s in specs if s['key'] == check_key]
        require(selected, f'Unknown character {check_key}')
    else:
        selected = [s for s in specs if not args.only or s['key'] in args.only]
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    prepared = {}
    for spec in selected:
        prepared[spec['key']] = prepare(src, spec, basis, ppu, work)
        print(f'{spec["key"]}: {len(prepared[spec["key"]]["renders"])} renders prepared', flush=True)
    run_renderer(work, [prepared[s['key']]['job'] for s in selected], args.gpu)
    characters = {}
    for spec in selected:
        key, info = spec['key'], prepared[spec['key']]
        atlas, images = build_atlas(spec, info, read_frames(work, key, info['renders']))
        target = output / key
        if args.contact_sheets:
            contact_sheet(atlas, images, args.contact_sheets / f'{key}.png')
        if args.check:
            compare_atlas(key, json.loads((target / 'atlas.json').read_text()), atlas, images, target)
            continue
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        atlas_bytes = (json.dumps(atlas, separators=(',', ':')) + '\n').encode()
        (target / 'atlas.json').write_bytes(atlas_bytes)
        hashes = {}
        for name, image in images.items():
            data = encode_png(image)
            (target / name).write_bytes(data)
            hashes[name] = dict(sha256=digest(data), width=image.width, height=image.height, bytes=len(data))
        states = {}
        for label, st in info['states'].items():
            s = st['state']
            states[label] = dict(clip=s['file'], block=s['block'], event=s['event'], loop=s['loop'],
                                 csvActionFrame=s['actionFrame'], csvLoopStartFrame=s['loopStartFrame'], scale=s['scale'],
                                 lookAtCamera=s['lookAtCamera'], csvOffsetY=s['offsetY'])
            if config['extraFields']:
                states[label]['csvNotBaked'] = s['csvNotBaked']
            states[label].update(frames=st['frames'], fps=round(st['fps'], 4), **st['info'])
        characters[key] = dict(record=spec['record'], clientSkin=spec['skin'])
        if config['extraFields']:
            characters[key]['clientCharacter'] = spec['character']
        characters[key].update(animation=spec['animation'], altAnimation=spec['altAnimation'], geometry=spec['geometry'],
                               textures=spec['textures'], appliedMaps=dict(normal=info['normalMap'], emission=info['emissionMap']),
                               shadowScale=spec['shadowScale'])
        if config['extraFields']:
            characters[key].update(csvSkinEffects=spec['skinEffects'], vertexBuffers=info['vertexBuffers'])
        characters[key].update(joints=info['joints'], vertices=info['vertices'], triangles=info['triangles'], states=states,
                               atlas=dict(path=f'{output.relative_to(ROOT / "public").as_posix()}/{key}/atlas.json',
                                          sha256=digest(atlas_bytes)),
                               images=hashes, bytes=len(atlas_bytes) + sum(h['bytes'] for h in hashes.values()))
        print(f'{key}: {len(images)} sheets, {characters[key]["bytes"]:,} bytes', flush=True)
    if args.check:
        print(f'check passed in {time.time() - started:.0f}s')
        return
    if args.only and len(selected) != len(specs):
        print(f'subset baked; {index_label} not rewritten')
        return
    notes = dict(config['notes'])
    if reference is not None:
        label = config['cameraFrom'].relative_to(ROOT).as_posix()
        own = conventions(camera, basis, ppu, native_ppu, viewport, args.elevation)
        if all(own[k] == reference.get(k) for k in ('camera', 'pixelsPerWorldUnit', 'antialiasing', 'sampling')):
            notes['sharedCamera'] = (f'Camera, pixelsPerWorldUnit, sampling and antialiasing are identical to {label} '
                                     '(its elevationOverrideDegrees, if any, is inherited unless --elevation is given).')
        else:
            print(f'warning: camera, pixel density or sampling differs from {label}')
    result = dict(clientVersion='18.400.21', generator=config['generator'],
                  conventions=conventions(camera, basis, ppu, native_ppu, viewport, args.elevation, notes),
                  sources=dict(sorted(src.pins.items())), characters=characters,
                  totalBytes=sum(c['bytes'] for c in characters.values()))
    index_path.write_text(json.dumps(result, indent=2) + '\n')
    print(f'baked {len(characters)} characters, {result["totalBytes"]:,} bytes in {time.time() - started:.0f}s')


def compare_atlas(key, stored, fresh, images, target):
    require(stored['clientSkin'] == fresh['clientSkin'] and stored['states'].keys() == fresh['states'].keys(),
            f'{key}: atlas identity or state list differs')
    sheets, total, outliers, worst = {}, 0, 0, 0.0
    for label, entry in fresh['states'].items():
        old = stored['states'][label]
        for field in ('loop', 'actionFrame', 'fps', 'loopStart'):
            require(old.get(field) == entry.get(field), f'{key}:{label} {field} differs')
        require([len(r) for r in old['frames']] == [len(r) for r in entry['frames']], f'{key}:{label} frame counts differ')
        for old_row, new_row in zip(old['frames'], entry['frames']):
            for a, b in zip(old_row, new_row):
                if a['image'] not in sheets:
                    sheets[a['image']] = np.asarray(Image.open(target / a['image']).convert('RGBA'), dtype=np.int16)
                pa = sheets[a['image']][a['y']:a['y'] + a['h'], a['x']:a['x'] + a['w']]
                pb = np.asarray(images[b['image']], dtype=np.int16)[b['y']:b['y'] + b['h'], b['x']:b['x'] + b['w']]
                x0, y0 = min(-a['anchorX'], -b['anchorX']), min(-a['anchorY'], -b['anchorY'])
                x1, y1 = max(a['w'] - a['anchorX'], b['w'] - b['anchorX']), max(a['h'] - a['anchorY'], b['h'] - b['anchorY'])
                ca = np.zeros((y1 - y0, x1 - x0, 4), np.int16)
                cb = np.zeros_like(ca)
                ca[-a['anchorY'] - y0:-a['anchorY'] - y0 + a['h'], -a['anchorX'] - x0:-a['anchorX'] - x0 + a['w']] = pa
                cb[-b['anchorY'] - y0:-b['anchorY'] - y0 + b['h'], -b['anchorX'] - x0:-b['anchorX'] - x0 + b['w']] = pb
                diff = np.abs(ca - cb)
                worst = max(worst, float(diff.mean()))
                outliers += int((diff.max(axis=2) > 24).sum())
                total += diff.shape[0] * diff.shape[1]
    fraction = outliers / max(1, total)
    print(f'{key}: worst frame mean |diff| {worst:.3f}, pixels over 24: {fraction:.5f}')
    require(worst <= CHECK_MEAN_TOLERANCE and fraction <= CHECK_OUTLIER_FRACTION, f'{key}: pixels differ beyond tolerance')


def verify_index(src, index, specs, output=OUTPUT):
    for path, pin in index['sources'].items():
        require(digest(src.read(path)) == pin, f'Source pin differs: {path}')
    for spec in specs:
        entry = index['characters'].get(spec['key'])
        require(entry is not None, f'Index lacks {spec["key"]}')
        require(entry['geometry'] == spec['geometry'] and entry['clientSkin'] == spec['skin'], f'{spec["key"]}: source mapping differs')
        base = output / spec['key']
        require(digest((base / 'atlas.json').read_bytes()) == entry['atlas']['sha256'], f'{spec["key"]}: atlas.json hash differs')
        for name, meta in entry['images'].items():
            require(digest((base / name).read_bytes()) == meta['sha256'], f'{spec["key"]}: {name} hash differs')
    src.pins.clear()


if __name__ == '__main__':
    main()
