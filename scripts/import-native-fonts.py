#!/usr/bin/env python3
"""Retain the pinned English HUD fonts and losslessly encode their full glyph sets as WOFF2."""
import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
from pathlib import Path

import brotli
import fontTools
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from native_art.bundle import ROOT, source, digest
from native_art.sc6 import SC6, require
from native_art.source_csv import decoded_rows, records

PINS = {
    'fingerprint.json': 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b',
    'sc/hud.sc': '05c4a1f5892e7d97e6e4a4c46eb24bbd14db5b9e9ca0fc8a30f5ec1cf2a373da',
    'logic/locales.csv': '6e50853004c02dc4b263ffc9888f0c7f0b5efd7c6f9083970c84dcd63ba91c6f',
    'font/Supercell-Magic_5.ttf': 'c03d2bc6b90e3e04c80bee6fd54ed493d3899e353cdec43cbe96ac65b0260656',
    'font/CCBackBeat-Light_5.ttf': 'af3a7a6fb15f3fd582313284ba72ec1a471b017b2992737676829d7f919d333d',
}
FONTS = [
    ('headline', 'Clash Headline', 'Supercell-Magic', 'font/Supercell-Magic_5.ttf'),
    ('text', 'Clash Text', 'CCBackBeat Light', 'font/CCBackBeat-Light_5.ttf'),
]


def font(data):
    return TTFont(BytesIO(data), recalcTimestamp=False, recalcBBoxes=False)


def witness(face):
    outlines, hints = hashlib.sha256(), hashlib.sha256()
    glyphs = face.getGlyphSet()
    for name in face.getGlyphOrder():
        pen = RecordingPen()
        glyphs[name].draw(pen)
        outlines.update((name + '\0' + repr(pen.value) + '\n').encode())
        glyph = face['glyf'][name]
        program = bytes(glyph.program.getBytecode()) if hasattr(glyph, 'program') else b''
        hints.update(name.encode() + b'\0' + program + b'\0')
    metrics = [(name, *face['hmtx'].metrics[name]) for name in face.getGlyphOrder()]
    maps = [(t.platformID, t.platEncID, t.language, t.format, sorted(t.cmap.items()))
            for t in face['cmap'].tables if hasattr(t, 'cmap')]
    return dict(glyphs=len(face.getGlyphOrder()), outlinesSha256=outlines.hexdigest(),
                instructionsSha256=hints.hexdigest(),
                metricsSha256=digest(json.dumps(metrics).encode()),
                cmapSha256=digest(json.dumps(maps).encode()))


def write(path, data, check):
    if check:
        require(path.read_bytes() == data, f'Native font output differs: {path}')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    require(fontTools.__version__ == '4.61.1' and brotli.__version__ == '1.2.0',
            'Use pinned fonttools/brotli versions in scripts/native_art/requirements.txt')
    fingerprint = json.loads(source('fingerprint.json', PINS))
    members = {r['file']: r['sha'] for r in fingerprint['files']}
    hud_data, locale_data = source('sc/hud.sc', PINS), source('logic/locales.csv', PINS)
    hud = SC6(hud_data)
    fields = [hud.text_field(i) for i in sorted(hud.textfields)]
    families = dict(sorted(Counter(row['font'] for row in fields).items()))
    english = records(decoded_rows(locale_data))['EN'][0]
    require(not english.get('ForcedFontName') and not english.get('UsedSystemFont'),
            'English font override needs review')
    output = []
    for role, family, native_family, path in FONTS:
        require(families.get(native_family, 0) > 0, f'Font family absent from HUD: {native_family}')
        original_path = ROOT / 'art/source/native-fonts' / Path(path).name
        data = original_path.read_bytes() if original_path.exists() else source(path, PINS)
        require(digest(data) == PINS[path] and hashlib.sha1(data).hexdigest() == members[path],
                f'Pinned font differs: {path}')
        write(original_path, data, args.check)
        face = font(data)
        before = witness(face)
        encoder = font(data)
        encoder.flavor = 'woff2'
        encoded = BytesIO()
        encoder.save(encoded, reorderTables=False)
        packed = encoded.getvalue()
        restored = font(packed)
        require(witness(restored) == before, f'WOFF2 changes glyphs, hints or metrics: {path}')
        # WOFF2 normalizes the header checksum and its lossless-compression flag.
        original_head, packed_head = face.reader['head'], restored.reader['head']
        require(len(original_head) == len(packed_head) and all(
            a == b for i, (a, b) in enumerate(zip(original_head, packed_head))
            if i not in (8, 9, 10, 11, 16, 17)), f'WOFF2 changes source header metrics: {path}')
        require((int.from_bytes(original_head[16:18], 'big') ^
                 int.from_bytes(packed_head[16:18], 'big')) & ~0x800 == 0,
                f'Unexpected WOFF2 header flags: {path}')
        # WOFF2 transforms glyf/loca and may transform hmtx; other source tables are retained.
        tables = {}
        for tag in face.reader.keys():
            if tag in ('head', 'glyf', 'loca', 'hmtx', 'DSIG'):
                continue
            raw = face.reader[tag]
            require(restored.reader[tag] == raw, f'WOFF2 changes source table {tag}: {path}')
            tables[tag] = digest(raw)
        target = ROOT / f'public/assets/fonts-native/{role}.woff2'
        write(target, packed, args.check)
        cmap = restored.getBestCmap()
        require(all(cp in cmap for cp in range(32, 127)), f'Printable ASCII incomplete: {path}')
        output.append(dict(role=role, family=family, nativeFamily=native_family, source=path,
                           original=str(original_path.relative_to(ROOT)),
                           path=str(target.relative_to(ROOT / 'public')), sourceBytes=len(data),
                           bytes=len(packed), sha256=digest(packed), weight=restored['OS/2'].usWeightClass,
                           sizeAdjust='72%' if role == 'headline' else '100%',
                           unitsPerEm=restored['head'].unitsPerEm,
                           codePoints=sorted(cp for cp in cmap if cp >= 32 and not 127 <= cp <= 159),
                           tables=dict(sorted(tables.items())), **before))
    for path, data in [('sc/hud.sc', hud_data), ('logic/locales.csv', locale_data)]:
        require(hashlib.sha1(data).hexdigest() == members[path], f'Fingerprint mismatch: {path}')
    index = dict(clientVersion='18.400.21', generator='scripts/import-native-fonts.py',
                 sources=PINS, encoding=dict(fonttools=fontTools.__version__, brotli=brotli.__version__,
                                            format='WOFF2', subset=False),
                 hudFonts=families, englishLocale=dict(name='EN', forcedFontName=english.get('ForcedFontName', ''),
                                                      usedSystemFont=english.get('UsedSystemFont', '')),
                 fonts=output)
    write(ROOT / 'reference/fonts/native.json', (json.dumps(index, indent=2) + '\n').encode(), args.check)
    print(f'{"Verified" if args.check else "Wrote"} native fonts: '
          f'{sum(f["sourceBytes"] for f in output):,} TTF bytes -> {sum(f["bytes"] for f in output):,} WOFF2 bytes; '
          f'{sum(f["glyphs"] for f in output)} glyphs, outlines/metrics/hints/tables preserved')


if __name__ == '__main__':
    main()
