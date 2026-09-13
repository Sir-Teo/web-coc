#!/usr/bin/env python3
"""Preserve all twenty-one original Cannon levels, turret controls and effects.

--check reconstructs source records, packed texels, previews and original sounds.
Live integration and native engine timing are separate from source preservation.
"""
import argparse
import csv
import hashlib
import io
import json
import lzma
import runpy

import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, source, digest
from native_art.sc6 import SC6, decode_sctx, require
from native_art.scene_graph import capture_graph, crop_textures

PINS = {
    "fingerprint.json": "ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b",
    "sc/buildings.sc": "f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed",
    "logic/buildings.csv": "9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1",
    "logic/projectiles.csv": "71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc",
    "logic/effects.csv": "5c6d5b67d6407345123b8d55872ed77ee6697b466d20d1fa21e25a723c511e9f",
    "csv/particle_emitters.csv": "8d80bbf714386c4f24e6aed8f2eef671a2eac5c3b3ad41e4d275b757ced64cef",
    "sc/buildings_2.sctx": "ff0f766b8d361eeb942384600ace1082a11c7c7404bed41d976fbafbdd2dc622",
    "sc/buildings_8.sctx": "588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd",
    "sc/buildings_18.sctx": "bd0c3b2eece3e9c43b2b3d61463e5b12ff4d274ae6adcc0ce33ceed63df58ffa",
    "sc/buildings_25.sctx": "c290a82b3940513f16b55dba2305e875d923d4120c5997b6b6908c680ec8ca3d",
    "sc/buildings_39.sctx": "dd27d9612fe135c3be364840eeabe45b53a229b24192246b56a08fa0606fdb16",
    "sc/buildings_41.sctx": "b3382bdda1665f62f476dca4afc8896cd1251d53f2c0b533f2fa2c09dfa94260",
    "sfx/building_destroyed_01.ogg": "fd8295765aa86ff5c7c6be1159cd8fc97aed3c858c29fbdb1af5e3d5c5ce7f04",
    "sfx/cannon_08.ogg": "6cd7afb7d0d4c8f27b11921cc7b6e1d9631cadcf980b9067357461e0c275483c",
    "sfx/cannon_drop2.ogg": "b50b98444dd9aa6af9fbbffd5966fbb9be8d4234aa5a34137cc85b44fd0d9d4a",
    "sfx/cannon_pickup3.ogg": "9245ec404baef367b6f1cec4a5572d5c61179e320f01182a9f986afb0af60683",
    "sfx/generic_hit_01.ogg": "5fca48e71d21be79eb6d40a1ca1ad3a002e3d69ba72388b2eb6a4d2ec10e5934"
}
PREFIX = 'assets/buildings/cannon-native'
BODY_FIELDS = ['ExportName', 'ExportNameConstruction', 'ExportNameBuildAnim',
               'ExportNameUpgradeAnim', 'ExportNameDamaged', 'ExportNameBase', 'AlternateExportName']


def table(path):
    blob = source(path, PINS)
    if blob.startswith(b'Sig:'): blob = blob[68:]
    if not blob.startswith(b'"'): blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    result, name = {}, ''
    for row in list(csv.DictReader(io.StringIO(blob.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            name = row['Name']
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name and None not in row, 'Malformed source row')
        result[name].append({k: v for k, v in row.items() if v})
    return result


def poses(graph, name, frame=0, controls=None, root=None):
    """Independent named-control sampler retaining isolated original blend groups."""
    root = np.eye(3) if root is None else root
    controls = {} if controls is None else controls
    def visit(id_, phase, matrix, multiply, add, path):
        key = str(id_)
        if key in graph['shapes']:
            return [dict(key=f'{path}:{i}', texture=t, vertices=v, matrix=matrix[:2].reshape(-1).tolist(),
                         multiply=multiply.tolist(), add=add.tolist(), blend=0)
                    for i, (t, v) in enumerate(graph['shapes'][key])]
        clip = graph['clips'][key]
        result = []
        for slot, transform, tint in clip['frames'][clip['timeline'][phase % len(clip['timeline'])]]:
            child = str(clip['children'][slot])
            control = controls.get(clip['names'][slot])
            if control is False: continue
            placed = phase
            while placed > 0 and any(p[0] == slot for p in clip['frames'][clip['timeline'][(placed - 1) % len(clip['timeline'])]]):
                placed -= 1
            age = phase - placed
            if child in graph['clips']: age = age * graph['clips'][child]['fps'] // clip['fps']
            if control is not None: age = control
            m = matrix @ np.vstack([np.array(graph['matrices'][transform]).reshape(2, 3), [0, 0, 1]])
            color = np.array(graph['colors'][tint])
            mul, plus = multiply * color[:4], multiply * color[4:] + add
            mode = clip['blending'][slot]
            require(mode in (0, 8), 'Unexpected Cannon source blend')
            if mode == 8 and child in graph['clips'] and graph['clips'][child]['children']:
                require(plus[3] == 0, 'Unsupported group alpha addition')
                result.append(dict(key=f'{path}/{slot}', group=visit(int(child), age, m, np.ones(4), np.zeros(4), f'{path}/{slot}'),
                                   multiply=mul.tolist(), add=plus.tolist(), blend=mode))
            else:
                nested = visit(int(child), age, m, mul, plus, f'{path}/{slot}')
                for node in nested:
                    if mode: node['blend'] = mode
                result.extend(nested)
        return result
    return visit(graph['exports'][name], frame, root, np.ones(4), np.zeros(4), str(graph['exports'][name]))


def leaves(poses_):
    for pose in poses_:
        if 'group' in pose: yield from leaves(pose['group'])
        else: yield pose


def conservative_bounds(graph, names):
    """Enclose every possible source placement, including independently animated siblings.

    This deliberately conservative portrait framing is not a native camera model.
    Geometry and source timelines remain unchanged in the shipping graph.
    """
    cache = {}
    def bound(id_):
        key = str(id_)
        if key in cache: return cache[key]
        if key in graph['shapes']:
            xy = np.concatenate([np.array(v).reshape(-1, 4)[:, :2] for _, v in graph['shapes'][key]])
        else:
            clip = graph['clips'][key]
            xy = []
            for slot, transform in {(p[0], p[1]) for frame in clip['frames'] for p in frame}:
                child = bound(clip['children'][slot])
                if child is None: continue
                left, top, right, bottom = child
                corners = np.array([[left,top,1],[right,top,1],[right,bottom,1],[left,bottom,1]])
                matrix = np.array(graph['matrices'][transform]).reshape(2,3)
                xy.extend(corners @ matrix.T)
            xy = np.array(xy)
        result = None if not len(xy) else [*xy.min(axis=0), *xy.max(axis=0)]
        cache[key] = result
        return result
    boxes = np.array([bound(graph['exports'][name]) for name in names])
    return [*np.floor(boxes[:, :2].min(axis=0) - 8).astype(int).tolist(),
            *np.ceil(boxes[:, 2:].max(axis=0) + 8).astype(int).tolist()]


def points(poses_):
    result = []
    for pose in leaves(poses_):
        vertices = np.array(pose['vertices']).reshape(-1, 4)
        result.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @
                      np.array(pose['matrix']).reshape(2, 3).T)
    return result


def build():
    fingerprint = json.loads(source('fingerprint.json', PINS))
    require(fingerprint['sha'] == BUNDLE and fingerprint['version'] == '18.400.21', 'Client differs')
    membership = {v['file']: v['sha'] for v in fingerprint['files']}
    for path in PINS:
        if path != 'fingerprint.json':
            require(hashlib.sha1(source(path, PINS)).hexdigest() == membership[path], f'Fingerprint differs: {path}')
    rows = table('logic/buildings.csv')['Cannon']
    require(len(rows) == 21 and rows[0]['GlobalID'] == '1000008', 'Cannon identity/levels differ')
    levels, inherited = [], {}
    for row in rows:
        inherited.update(row)
        levels.append(inherited.copy())
    all_projectiles = table('logic/projectiles.csv')
    projectiles = {n: all_projectiles[n] for n in sorted({r[k] for r in rows for k in ('Projectile', 'AltProjectile') if r.get(k)})}
    all_effects = table('logic/effects.csv')
    pending = {v for row in [*rows, *[r for rs in projectiles.values() for r in rs]]
               for k, v in row.items() if 'Effect' in k and v in all_effects}
    effects = {}
    while pending:
        name = pending.pop()
        if name in effects: continue
        effects[name] = all_effects[name]
        pending.update(row['SpawnEffect'] for row in effects[name] if row.get('SpawnEffect'))
    effects = dict(sorted(effects.items()))
    all_particles = table('csv/particle_emitters.csv')
    names = sorted({r['ParticleEmitter'] for rs in [*effects.values(), *projectiles.values()] for r in rs if r.get('ParticleEmitter')})
    particles = {n: all_particles[n] for n in names}
    body_exports = {r[k] for r in rows for k in BODY_FIELDS if r.get(k)}
    exports = set(body_exports)
    for rs in [*projectiles.values(), *effects.values()]:
        for r in rs:
            for key, swf in [('ExportName', 'SWF'), ('ShadowExportName', 'ShadowSWF')]:
                if r.get(key):
                    require(r[swf] == 'sc/buildings.sc', 'Unexpected effect/projectile source')
                    exports.add(r[key])
    for rs in particles.values():
        swf = rs[0]['ParticleSwf']
        for r in rs:
            swf = r.get('ParticleSwf', swf)
            require(swf == 'sc/buildings.sc', 'Unexpected particle source')
            if r.get('ParticleExportName'): exports.add(r['ParticleExportName'])
    sc = SC6(source('sc/buildings.sc', PINS))
    require(exports <= sc.exports.keys(), 'Missing original export')
    graph = capture_graph(sc, {n: sc.exports[n] for n in sorted(exports)})
    require({b for c in graph['clips'].values() for b in c['blending']} == {0, 8}, 'Unexpected source blend')
    used = {t for ss in graph['shapes'].values() for t, _ in ss}
    require(used == {2, 8, 18, 25, 39, 41}, 'Texture membership differs')
    images = {t: decode_sctx(source('sc/' + sc.textures[t]['external'], PINS)) for t in sorted(used)}
    for t, image in images.items():
        require(image.size == (sc.textures[t]['width'], sc.textures[t]['height']), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, images, PREFIX + '/texture')
    cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))
    pixels = {t: np.array(image) / 255 for t, image in images.items()}
    bounds = conservative_bounds(graph, body_exports)
    width, height = 2 * (bounds[2] - bounds[0]), 2 * (bounds[3] - bounds[1])
    root = np.array([[2, 0, -bounds[0] * 2], [0, 2, -bounds[1] * 2], [0, 0, 1]])
    previews, icons = {}, {}
    for level, row in enumerate(levels, 1):
        controls = {'turret': 0, 'gearup': False}
        preview_poses = poses(graph, row['ExportNameBase'], root=root)
        preview_poses += poses(graph, row['ExportName'], controls=controls, root=root)
        xy = np.array(points(preview_poses))
        require((xy >= 0).all() and (xy < [width, height]).all(), 'Clipped source preview')
        rgba = cpu['compose'](preview_poses, pixels, max(width, height))
        rgba[:, :, :3] /= np.where(rgba[:, :, 3:4] > 0, rgba[:, :, 3:4], 1)
        image = Image.fromarray(np.round(np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').crop((0, 0, width, height))
        path = f'{PREFIX}/level-{level}.png'
        outputs[path] = image
        alpha_bounds = image.getbbox()
        require(alpha_bounds is not None, 'Empty Cannon portrait')
        crop = [alpha_bounds[0] - 8, alpha_bounds[1] - 8, alpha_bounds[2] + 8, alpha_bounds[3] + 8]
        require(crop[0] >= 0 and crop[1] >= 0 and crop[2] <= width and crop[3] <= height, 'Cannon icon padding exceeds source portrait')
        icon = image.crop(crop)
        icon_path = f'{PREFIX}/icon-{level}.png'
        outputs[icon_path] = icon
        icons[str(level)] = dict(path=icon_path, sourcePortrait=path, crop=crop, width=icon.width, height=icon.height, rgbaSha256=digest(icon.tobytes()))
        previews[str(level)] = dict(path=path, export=row['ExportName'], baseExport=row['ExportNameBase'],
            controls=controls, bounds=bounds, width=width, height=height, pixelsPerNativeUnit=2, rgbaSha256=digest(image.tobytes()))
    sounds = {}
    for original in sorted({r['Sound'] for rs in effects.values() for r in rs if r.get('Sound')}):
        path = PREFIX + '/' + original.removeprefix('sfx/')
        outputs[path] = source(original, PINS)
        sounds[original] = dict(path=path, sha256=digest(outputs[path]))
    native = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
        buildings={'Cannon': rows}, projectiles=projectiles, effects=effects, particles=particles,
        world=dict(source='sc/buildings.sc', graph=graph, textures=textures), previews=previews, icons=icons, sounds=sounds,
        reconstruction=dict(liveIntegration=True, nativePlaybackVerified=False,
            scope='Twenty-one original normal bodies, fifteen alternate-mode bodies, exact direction timelines and gear controls, bases/scaffolds/construction/rubble, eleven projectile families, seven effect records and five sounds.',
            preview='Normal body frame zero and turret frame zero with gearup disabled. Conservative common bounds enclose all source placements with eight units of padding at 2x; framing is local. UI icons crop these same pixels with eight pixels of transparent padding. Additive body effects require a shared backdrop for live pixel comparisons.',
            turret='Original direction timelines retained exactly, including irregular transitions and the level-21 terminal frames. Levels 14-15 retain animated parent placements and nested effects. Facing and animation control semantics require native engine corroboration.',
            projectile='Original speed, per-family start height/offset and tracking/rotation flags retained. Version-36 normal Cannons use source speed and continuous tracking; version-34/35 recordings retain their previous physical rules. Screen altitude and particle motion remain local projections.',
            availability='All twenty-one normal levels are retained; home TH8 remains capped at ten. The source TH2 requirement for level two is enforced for new upgrades, while paid deadlines survive. Version-34/35 replay compatibility is retained. Geared-up mode is not integrated.'))
    first = levels[0]
    combat = dict(levels=[dict(level=int(v['BuildingLevel']), townhall=int(v['TownHallLevel']), hp=int(v['Hitpoints']),
                    dps=int(v['DPS']), cost=int(v['BuildCost']),
                    seconds=sum(int(v[key]) * scale for key, scale in [('BuildTimeD', 86400), ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)]),
                    projectile=v['Projectile'], hitEffect=v['HitEffect'], attackEffect=v['AttackEffect'], body=v['ExportName'], base=v['ExportNameBase'], scaffold=v['ExportNameBuildAnim'], rubble=v['ExportNameDamaged']) for v in levels],
                  building=first, intervalMs=int(first['AttackSpeed']), attackRange=int(first['AttackRange']),
                  minAttackRange=int(first.get('MinAttackRange', 0)), damageRadius=int(first.get('DamageRadius', 0)),
                  airTargets=first['AirTargets'] == 'TRUE', groundTargets=first['GroundTargets'] == 'TRUE', size=int(first['Width']))
    return outputs, dict(native=native, runtime=runtime, combat=combat, projectiles=projectiles,
                         effects=dict(effects=effects, particles=particles, sounds=sounds))



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, references = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({p.relative_to(ROOT / 'public').as_posix() for p in folder.rglob('*') if p.is_file()} == set(outputs), 'Asset membership differs')
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            if isinstance(value, bytes): require(target.read_bytes() == value, f'Sound differs: {path}')
            else:
                with Image.open(target) as old:
                    require(old.mode == 'RGBA' and old.size == value.size and old.tobytes() == value.tobytes(), f'Pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(value, bytes): target.write_bytes(value)
            else: value.save(target, optimize=True)
    for name, value in references.items():
        target = ROOT / 'reference/cannon' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Reference differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} original Cannon assets')


if __name__ == '__main__': main()
