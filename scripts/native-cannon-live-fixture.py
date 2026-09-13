#!/usr/bin/env python3
"""Independent normal Cannon assemblies on a shared backdrop, preserving additive glows."""
import argparse
import json
import runpy

import numpy as np
from PIL import Image

from native_art.bundle import ROOT, source, digest
from native_art.sc6 import decode_sctx, require

body = runpy.run_path(str(ROOT / 'scripts/import-native-cannon.py'))
cpu = runpy.run_path(str(ROOT / 'scripts/native-tesla-gpu-fixtures.py'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    native = json.loads((ROOT / 'reference/cannon/native.json').read_text())
    graph = native['world']['graph']
    textures = {
        int(i): np.array(decode_sctx(source(f'sc/buildings_{i}.sctx', native['sources']))) / 255
        for i in native['world']['textures']
    }
    sheet = Image.new('RGBA', (3080, 1110), (48, 65, 53, 255))
    cases = []
    root = np.array([[2, 0, 217], [0, 2, 62], [0, 0, 1]])
    for level in range(1, 22):
        preview = native['previews'][str(level)]
        poses = body['poses'](graph, preview['baseExport'], root=root) + body['poses'](
            graph, preview['export'], controls={'turret': 0, 'gearup': False}, root=root
        )
        pixels = cpu['compose'](poses, textures, 440, [48 / 255, 65 / 255, 53 / 255])
        image = Image.fromarray(np.round(pixels * 255).astype(np.uint8), 'RGBA').crop(
            (0, 0, 440, 370)
        )
        x, y = (level - 1) % 7 * 440, (level - 1) // 7 * 370
        sheet.paste(image, (x, y))
        cases.append(dict(level=level, x=x, y=y, rgbaSha256=digest(image.tobytes())))
    manifest = dict(
        width=3080, height=1110, cellWidth=440, cellHeight=370,
        root=root[:2].reshape(-1).tolist(), background='#304135',
        rgbaSha256=digest(sheet.tobytes()), cases=cases, nativePlaybackVerified=False,
        scope='Original full SCTX compositions at source frame zero, including additive body glows; local world registration is explicit.',
    )
    folder = ROOT / 'tests/fixtures/native-cannon-live'
    folder.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(manifest, indent=2) + '\n'
    if args.check:
        require((folder / 'manifest.json').read_text() == encoded, 'Live reference manifest differs')
        with Image.open(folder / 'reference.png') as old:
            require(
                old.mode == 'RGBA' and old.size == sheet.size and old.tobytes() == sheet.tobytes(),
                'Live source pixels differ',
            )
    else:
        sheet.save(folder / 'reference.png', optimize=True)
        (folder / 'manifest.json').write_text(encoded)
    print(f'{"Verified" if args.check else "Wrote"} 21 independent Cannon live source compositions')


if __name__ == '__main__':
    main()
