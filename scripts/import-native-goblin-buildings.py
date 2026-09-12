#!/usr/bin/env python3
"""Import native campaign Town Hall/Hut art and all passive campaign Hall levels."""
import argparse
import csv
import io
import json
import lzma
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, BASE, SOURCES, digest, source
from native_art.sc6 import SC6, decode_sctx, rasterize, require
from native_art.scene_graph import capture_graph, crop_textures, graph_draws

PINS = {
    'sc/buildings.sc': SOURCES['sc/buildings.sc'],
    'sc/buildings_8.sctx': '588eba7d5739a5d9b53d3e14f2ab83bd170cad735363a81dd37bea7bcc0bb3bd',
    'sc/buildings_37.sctx': 'bf4e486ffcd139075200b4fdb7faa7849973d19878036b6b4d4659d505f5a195',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
}
PREFIX = 'assets/buildings/goblin-native'
BOUNDS = {'goblin_townhall_lvl1': [-100, -30, 100, 150],
          'goblin_hut_lvl1': [-70, -30, 70, 100],
          'goblin_townhall_base': [-120, -25, 120, 185],
          'goblin_hut_base': [-70, -5, 65, 90]}


def build():
    raw = source('logic/buildings.csv', PINS)
    if raw.startswith(b'Sig:'): raw = raw[68:]
    if not raw.startswith(b'"'): raw = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:])
    rows, current = {}, ''
    for row in list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[1:]:
        if row['Name']: current = row['Name']
        if current in ['Town Hall', 'Goblin Hut']:
            rows.setdefault(current, []).append({k: v for k, v in row.items() if v})
    require(rows['Town Hall'][0]['GlobalID'] == '1000001' and rows['Goblin Hut'][0]['GlobalID'] == '1000018', 'NPC identity differs')
    levels = {}
    for name, key, count in [('Town Hall', 'goblin-townhall', 11), ('Goblin Hut', 'goblin-hut', 1)]:
        inherited, records = {}, []
        for row in rows[name][:count]:
            inherited.update(row)
            require(not inherited.get('Weapon') and not inherited.get('DPS'), 'NPC needs a weapon implementation')
            records.append(dict(level=int(inherited['BuildingLevel']), hp=int(inherited['Hitpoints']),
                                export=inherited.get('ExportNameNpc', inherited['ExportName'])))
        levels[key] = dict(globalId=int(inherited['GlobalID']), size=int(inherited['Width']), levels=records)
    require(rows['Town Hall'][11]['Weapon'] == 'Townhall12', 'Passive Town Hall boundary differs')
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {name: sc.exports[name] for name in BOUNDS})
    used = {t for commands in graph['shapes'].values() for t, _ in commands}
    require(used == {8, 37}, 'Goblin texture set differs')
    decoded = {t: decode_sctx(source(f'sc/buildings_{t}.sctx', PINS)) for t in used}
    require(decoded[8].size == (444, 448) and decoded[37].size == (448, 474), 'Texture dimensions differ')
    outputs, textures, runtime = crop_textures(graph, decoded, PREFIX)
    previews, animation = {}, {}
    source_textures = {t: np.array(im, dtype=float) / 255 for t, im in decoded.items()}
    for name, bounds in BOUNDS.items():
        id_ = graph['exports'][name]
        states = set()
        for frame in range(24):
            draws = list(graph_draws(graph, id_, frame, {}))
            states.add(json.dumps([(t, v.tolist(), m.tolist(), [a.tolist() for a in c], b) for t, v, m, c, b in draws]))
            for _, vertices, matrix, _, blend in draws:
                xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
                require((xy[:, :2] >= bounds[:2]).all() and (xy[:, :2] <= bounds[2:]).all(), 'Goblin geometry clipped')
                require(blend == 0, 'Unexpected Goblin blend')
        animation[name] = dict(fps=24, frames=24 if len(states) > 1 else 1, distinctStates=len(states))
        draws = list(graph_draws(graph, id_, 0, {}))
        image = rasterize([(t, v, np.diag([2, 2, 1]) @ m, c) for t, v, m, c, _ in draws],
                          source_textures, [v * 2 for v in bounds])
        path = f'{PREFIX}/{name}.png'
        outputs[path] = image
        previews[name] = dict(path=path, bounds=bounds, width=image.width, height=image.height,
                              rgbaSha256=digest(image.tobytes()))
    require(animation['goblin_townhall_lvl1']['distinctStates'] == 8, 'Goblin flag timeline differs')
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=rows, graph=graph, textures=textures, previews=previews, animation=animation,
                    reconstruction=dict(worldProjectionVerified=False, nativeBaseAssociationVerified=False,
                                        scope='11 passive campaign Hall levels and Goblin Hut; weapon-bearing Home Halls excluded'))
    return outputs, metadata, runtime, levels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata, runtime, levels = build()
    folder = ROOT / 'public' / PREFIX
    if args.check:
        require({str(p.relative_to(ROOT / 'public')) for p in folder.iterdir() if p.is_file()} == set(outputs), 'Goblin output membership differs')
    for path, image in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as old:
                require(old.mode == 'RGBA' and old.size == image.size and old.tobytes() == image.tobytes(), f'Goblin pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, optimize=True)
    for name, data in [('native.json', metadata), ('runtime.json', runtime), ('levels.json', levels)]:
        target = ROOT / 'reference/goblin-buildings' / name
        content = json.dumps(data, indent=2) + '\n'
        if args.check: require(target.read_text() == content, f'Goblin metadata differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native Goblin assets and all 11 passive Hall levels')


if __name__ == '__main__': main()
