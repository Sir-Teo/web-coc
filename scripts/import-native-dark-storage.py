#!/usr/bin/env python3
"""Import all native Dark Elixir Storage levels and original resource-fill controls."""
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
    'sc/buildings_42.sctx': 'b08ef6869de242d7e284cc89db27c6f0633346e59d122af7c12a4e5d1e49983d',
    'logic/buildings.csv': '9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1',
}
PREFIX = 'assets/buildings/dark-storage-native'
BOUNDS = [-100, -40, 100, 130]


def build():
    raw = source('logic/buildings.csv', PINS)
    if raw.startswith(b'Sig:'):
        raw = raw[68:]
    if not raw.startswith(b'"'):
        raw = lzma.decompress(raw[:9] + b'\0' * 4 + raw[9:])
    rows = []
    selected = False
    for row in list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))[1:]:
        if row['Name']:
            selected = row['Name'] == 'Dark Elixir Storage'
        if selected:
            rows.append({k: v for k, v in row.items() if v})
    require(len(rows) == 13 and rows[0]['GlobalID'] == '1000024', 'Native storage identity differs')
    levels, inherited = [], {}
    for row in rows:
        inherited.update(row)
        levels.append(dict(level=int(inherited['BuildingLevel']), townhall=int(inherited['TownHallLevel']),
                           hp=int(inherited['Hitpoints']), capacity=int(inherited['MaxStoredDarkElixir']),
                           cost=int(inherited['BuildCost']), export=inherited['ExportName'],
                           seconds=sum(int(inherited[k]) * n for k, n in [('BuildTimeD', 86400),
                                       ('BuildTimeH', 3600), ('BuildTimeM', 60), ('BuildTimeS', 1)])))
    sc = SC6(source('sc/buildings.sc', PINS))
    graph = capture_graph(sc, {v['export']: sc.exports[v['export']] for v in levels})
    require({texture for cmds in graph['shapes'].values() for texture, _ in cmds} == {42}, 'Storage texture set differs')
    decoded = decode_sctx(source('sc/buildings_42.sctx', PINS))
    require(decoded.size == (1276, 1974), 'Storage source dimensions differ')
    outputs, textures, runtime = crop_textures(graph, {42: decoded}, PREFIX)
    for name, id_ in graph['exports'].items():
        root = graph['clips'][str(id_)]
        require(root['names'].count('resource') == 1 and len(root['timeline']) == 1, 'Storage root differs')
        resource = graph['clips'][str(root['children'][root['names'].index('resource')])]
        require(len(resource['timeline']) == 160 and len(resource['frames']) == 9, 'Native fill control differs')
        for frame in range(160):
            for _, vertices, matrix, _, blend in graph_draws(graph, id_, 0, {'resource': frame}):
                points = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
                require((points[:, :2] >= BOUNDS[:2]).all() and (points[:, :2] <= BOUNDS[2:]).all(), 'Storage clips native geometry')
                require(blend == 0, 'Unexpected storage blending')
    previews = {}
    source_texture = {42: np.array(decoded, dtype=float) / 255}
    for row in levels:
        draws = list(graph_draws(graph, graph['exports'][row['export']], 0, {'resource': 159}))
        image = rasterize([(t, v, np.diag([2, 2, 1]) @ m, c) for t, v, m, c, _ in draws],
                          source_texture, [v * 2 for v in BOUNDS])
        path = f'{PREFIX}/preview-{row["level"]}.png'
        outputs[path] = image
        previews[str(row['level'])] = dict(path=path, bounds=BOUNDS, width=image.width, height=image.height,
                                          resourceFrame=159, rgbaSha256=digest(image.tobytes()))
    metadata = dict(clientVersion='18.400.21', bundle=BUNDLE, baseUrl=BASE, sources=PINS,
                    building=rows, graph=graph, textures=textures, previews=previews,
                    reconstruction=dict(resourceFrames=160, distinctFillStates=9,
                        geometry='original polygon strips and complete affine transforms',
                        fillToFrameMappingVerified=False, worldProjectionVerified=False))
    return outputs, metadata, runtime, levels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, metadata, runtime, levels = build()
    for path, value in outputs.items():
        target = ROOT / 'public' / path
        if args.check:
            with Image.open(target) as existing:
                require(existing.mode == 'RGBA' and existing.size == value.size and existing.tobytes() == value.tobytes(),
                        f'Native storage pixels differ: {path}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            value.save(target, optimize=True)
    if args.check:
        shipped = {str(p.relative_to(ROOT / 'public')) for p in (ROOT / 'public' / PREFIX).iterdir() if p.is_file()}
        require(shipped == set(outputs), 'Unexpected or missing storage assets')
    for name, value in [('native', metadata), ('runtime', runtime), ('levels', levels)]:
        target = ROOT / 'reference/dark-storage' / (name + '.json')
        content = json.dumps(value, indent=2) + '\n'
        if args.check:
            require(target.read_text() == content, f'Native storage metadata differs: {name}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'{"Verified" if args.check else "Wrote"} {len(outputs)} native storage assets, 13 levels and 160-frame fill controls')


if __name__ == '__main__':
    main()
