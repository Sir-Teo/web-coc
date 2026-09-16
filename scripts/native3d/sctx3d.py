"""Decode the base mip of the multi-mip ASTC ``sc3d/*.sctx`` textures used by 3D skins.

Layout (client 18.400.21): u32 header size, FlatBuffers header (identifier ``SCTX``; slot 1
pixel format, 2 width u16, 3 height u16, 4 mip count u8, 6 flags, 7 payload size), then a
u32-sized block of size-prefixed FlatBuffers mip records (width u16, height u16, payload
offset u32), optional 16-byte alignment (flag 8), and the payload (zstd when flag 1).
Pixel formats are Metal ``MTLPixelFormat`` numbers: 194 ASTC 8x8 sRGB, 208 ASTC 6x6 LDR,
212 ASTC 8x8 LDR (186-200 / 204-218 for the other ASTC block sizes).
"""
import math

import texture2ddecoder
import zstandard
from PIL import Image

from native_art.sc6 import Flat, require

ASTC_BLOCKS = {
    186: (4, 4), 187: (5, 4), 188: (5, 5), 189: (6, 5), 190: (6, 6), 192: (8, 5), 193: (8, 6), 194: (8, 8),
    195: (10, 5), 196: (10, 6), 197: (10, 8), 198: (10, 10), 199: (12, 10), 200: (12, 12),
    204: (4, 4), 205: (5, 4), 206: (5, 5), 207: (6, 5), 208: (6, 6), 210: (8, 5), 211: (8, 6), 212: (8, 8),
    213: (10, 5), 214: (10, 6), 215: (10, 8), 216: (10, 10), 217: (12, 10), 218: (12, 12),
}
SRGB_FORMATS = set(range(186, 201))


def decode_sctx3d(data):
    """Return (PIL RGBA image of mip 0, metadata dict). Colour values are the stored bytes."""
    f = Flat(data)
    size = f.read(0)
    h = Flat(f.span(4, size))
    require(h.span(4, 4) == b'SCTX', 'Expected SCTX header identifier')
    root = h.ref(0)
    fmt, width, height = h.scalar(root, 1), h.scalar(root, 2, 'H'), h.scalar(root, 3, 'H')
    mips, flags, payload_size = h.scalar(root, 4, 'B', 1), h.scalar(root, 6), h.scalar(root, 7, 'i')
    require(fmt in ASTC_BLOCKS, f'Unsupported SCTX pixel format {fmt}')
    require(0 < width <= 4096 and 0 < height <= 4096, 'Texture dimensions exceed limit')
    require(flags & ~13 == 0, 'Unsupported SCTX flags')
    bx, by = ASTC_BLOCKS[fmt]
    at = 4 + size
    records_size = f.read(at)
    cursor, records = at + 4, []
    while cursor < at + 4 + records_size:
        record_size = f.read(cursor)
        m = Flat(f.span(cursor + 4, record_size))
        r = m.ref(0)
        records.append((m.scalar(r, 0, 'H'), m.scalar(r, 1, 'H'), m.scalar(r, 2)))
        cursor += 4 + record_size
    require(cursor == at + 4 + records_size and len(records) == mips, 'Mip record block differs from mip count')
    expected, offset = 0, 0
    for level, (w, hgt, start) in enumerate(records):
        require((w, hgt) == (max(1, width >> level), max(1, height >> level)) and start == offset,
                'Unexpected mip dimensions or offsets')
        blocks = math.ceil(w / bx) * math.ceil(hgt / by) * 16
        offset += blocks
        if level == 0:
            expected = blocks
    require(offset == payload_size, 'ASTC payload size differs from mip chain')
    at = cursor
    if flags & 8:
        at = (at + 15) & ~15
    payload = f.span(at, len(data) - at)
    if flags & 1:
        payload = zstandard.ZstdDecompressor().decompress(payload, max_output_size=payload_size)
    require(len(payload) == payload_size, 'Incomplete or trailing ASTC payload')
    pixels = texture2ddecoder.decode_astc(payload[:expected], width, height, bx, by)
    image = Image.frombytes('RGBA', (width, height), pixels, 'raw', 'BGRA')
    return image, dict(format=fmt, block=[bx, by], srgb=fmt in SRGB_FORMATS, width=width, height=height, mips=mips)
