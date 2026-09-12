"""Small, strict reader for the SC6 features used by the pinned Pumpkin Bomb.

Format references: sc-workshop/SupercellFlash and SupercellTexture; see README.
This is not a general Flash player. Unsupported reachable objects fail closed.
"""
import math
import struct

import numpy as np
import texture2ddecoder
import zstandard
from PIL import Image


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Flat:
    def __init__(self, data):
        self.data = data

    def span(self, at, size):
        require(0 <= at <= len(self.data) and 0 <= size <= len(self.data) - at,
                'FlatBuffer range outside its chunk')
        return self.data[at:at + size]

    def read(self, at, fmt='I'):
        return struct.unpack('<' + fmt, self.span(at, struct.calcsize('<' + fmt)))[0]

    def ref(self, at):
        target = at + self.read(at)
        self.span(target, 4)
        return target

    def field(self, table, slot):
        vt = table - self.read(table, 'i')
        size = self.read(vt, 'H')
        require(size >= 4 and size % 2 == 0, 'Invalid vtable')
        self.span(vt, size)
        offset = self.read(vt + 4 + slot * 2, 'H') if 4 + slot * 2 < size else 0
        object_size = self.read(vt + 2, 'H')
        self.span(table, object_size)
        require(not offset or 4 <= offset < object_size, 'Invalid field offset')
        return table + offset if offset else None

    def scalar(self, table, slot, fmt='I', default=0):
        at = self.field(table, slot)
        return self.read(at, fmt) if at is not None else default

    def vector(self, table, slot, stride):
        at = self.field(table, slot)
        if at is None:
            return []
        start = self.ref(at)
        count = self.read(start)
        self.span(start + 4, count * stride)
        return range(start + 4, start + 4 + count * stride, stride)

    def tables(self, table, slot):
        return [self.ref(at) for at in self.vector(table, slot, 4)]

    def values(self, table, slot, fmt):
        return [self.read(at, fmt) for at in self.vector(table, slot, struct.calcsize('<' + fmt))]

    def string(self, at):
        start = self.ref(at)
        size = self.read(start)
        require(self.read(start + 4 + size, 'B') == 0, 'String lacks terminator')
        return self.span(start + 4, size).decode('utf-8')


class SC6:
    def __init__(self, data, *, max_decompressed_bytes=100 * 1024 * 1024):
        f = Flat(data)
        require(f.span(0, 2) == b'SC' and f.read(2) == 6 and f.read(6, 'H') == 0,
                'Expected SC6 with no container flags')
        header_size = f.read(8)
        h = Flat(f.span(12, header_size))
        root = h.ref(0)
        require(h.scalar(root, 12) == 0, 'External matrix banks are unsupported')
        scale = self.precision(h.scalar(root, 1))
        translate = self.precision(h.scalar(root, 0))
        compressed_size = h.scalar(root, 11)
        require(12 + header_size + compressed_size == len(data), 'Unexpected SC6 trailing data')
        compressed = f.span(12 + header_size, compressed_size)
        size = zstandard.frame_content_size(compressed)
        require(0 < size <= max_decompressed_bytes, 'SC6 decompression exceeds limit')
        inner = Flat(zstandard.ZstdDecompressor().decompress(compressed, max_output_size=size))
        self.ds = Flat(inner.span(4, inner.read(0)))
        ds = self.ds.ref(0)
        self.strings = [self.ds.string(at) for at in self.ds.vector(ds, 0, 4)]
        self.elements = self.ds.vector(ds, 4, 2)
        self.vertices = self.ds.vector(ds, 5, 1)
        require(len(self.vertices) % 12 == 0, 'Incomplete bitmap vertex')
        self.banks = self.ds.tables(ds, 6)
        self.scale, self.translate = scale, translate
        chunks = []
        at = h.scalar(root, 8)
        require(at >= 4 + inner.read(0), 'Resources overlap data storage')
        for _ in range(6):
            size = inner.read(at)
            chunks.append(Flat(inner.span(at + 4, size)))
            at += 4 + size
        require(at == len(inner.data), 'Unexpected resource chunks')
        exports, textfields, shapes, clips, modifiers, textures = chunks
        eroot = exports.ref(0)
        ids = exports.values(eroot, 0, 'H')
        names = exports.values(eroot, 1, 'I')
        require(len(ids) == len(names), 'Export ID/name count differs')
        self.exports = {self.name(n): i for n, i in zip(names, ids)}
        self.textfields = {}
        for p in textfields.vector(textfields.ref(0), 0, 40):
            id_ = textfields.read(p, 'H')
            require(id_ not in self.textfields, 'Duplicate text field ID')
            self.textfields[id_] = (textfields, p)
        require(len(self.textfields) == h.scalar(root, 5), 'Text field count differs')
        self.shapes, self.clips, self.modifiers = {}, {}, {}
        for collection, target in [(shapes, self.shapes), (clips, self.clips)]:
            for t in collection.tables(collection.ref(0), 0):
                id_ = collection.scalar(t, 0, 'H')
                require(id_ not in target, 'Duplicate display object ID')
                target[id_] = (collection, t)
        for p in modifiers.vector(modifiers.ref(0), 0, 4):
            self.modifiers[modifiers.read(p, 'H')] = modifiers.read(p + 2, 'B')
        require(len(self.shapes) == h.scalar(root, 2), 'Shape count differs')
        require(len(self.clips) == h.scalar(root, 3), 'Movie clip count differs')
        self.textures = []
        self._texture_data = []
        for t in textures.tables(textures.ref(0), 0):
            high = textures.field(t, 1)
            require(high is not None, 'Missing high-resolution texture')
            high = textures.ref(high)
            self._texture_data.append((textures, high))
            external = textures.field(high, 5)
            self.textures.append(dict(width=textures.scalar(high, 2, 'H'),
                                      height=textures.scalar(high, 3, 'H'),
                                      external=textures.string(external) if external else None))
        require(len(self.textures) == h.scalar(root, 4), 'Texture count differs')
        self._clips = {}

    @staticmethod
    def precision(value):
        require(value in (0, 1, 2, 3), 'Unknown matrix precision')
        return {0: 1, 1: 1, 2: 20, 3: 1024}[value]

    def name(self, index):
        require(0 <= index < len(self.strings), 'Invalid SC6 zero-based string reference')
        return self.strings[index]

    def text_field(self, id_):
        """Retain SC2 TextField metadata; visible text rendering is not implemented."""
        require(id_ in self.textfields, 'Unknown text field')
        f, p = self.textfields[id_]
        return dict(id=id_, font=self.name(f.read(p + 4)),
                    bounds=[f.read(p + offset, 'h') for offset in (8, 10, 12, 14)],
                    fontColor=f.read(p + 16), outlineColor=f.read(p + 20),
                    text=self.name(f.read(p + 24)), typography=self.name(f.read(p + 28)),
                    styles=f.read(p + 32, 'B'), align=f.read(p + 33, 'B'),
                    fontSize=f.read(p + 34, 'B'), outlineAngle=f.read(p + 36, 'i'))

    def embedded_texture(self, index):
        require(0 <= index < len(self._texture_data), 'Invalid embedded texture index')
        f, table = self._texture_data[index]
        require(f.field(table, 5) is None and f.scalar(table, 0, 'B') == 8 and
                f.scalar(table, 1, 'B') == 0, 'Only embedded Khronos RGBA8 textures are supported')
        values = f.vector(table, 4, 1)
        require(values, 'Missing embedded texture payload')
        image = decode_ktx_astc(f.span(values.start, len(values)))
        require(image.size == (self.textures[index]['width'], self.textures[index]['height']),
                'Embedded texture dimensions differ')
        return image

    def clip(self, id_):
        if id_ in self._clips:
            return self._clips[id_]
        require(id_ in self.clips, f'Unsupported display object {id_}')
        f, t = self.clips[id_]
        require(f.scalar(t, 12) == 0 and f.field(t, 11) is None,
                'Compressed timelines and scaling grids are unsupported')
        children = f.values(t, 5, 'H')
        names = f.values(t, 6, 'I')
        blending = f.values(t, 7, 'B')
        require(len(names) in (0, len(children)), 'Child name count differs')
        require(len(blending) in (0, len(children)), 'Child blend count differs')
        frames, labels = [], []
        start = f.scalar(t, 9)
        for p in f.vector(t, 8, 8):
            count = f.read(p)
            labels.append(self.name(f.read(p + 4)))
            require(start + count * 3 <= len(self.elements), 'Timeline exceeds frame elements')
            frame = []
            for i in range(count):
                values = [self.ds.read(self.elements[start + i * 3 + j], 'H') for j in range(3)]
                require(values[0] < len(children), 'Invalid timeline child')
                frame.append(values)
            frames.append(frame)
            start += count * 3
        fps = f.scalar(t, 2, 'B')
        require(len(frames) == f.scalar(t, 3, 'H') and frames and fps > 0,
                'Invalid timeline frame count or rate')
        result = dict(id=id_, fps=fps, frames=frames, labels=labels, children=children,
                      names=[self.name(n) for n in names] if names else [''] * len(children),
                      blending=blending or [0] * len(children), bank=f.scalar(t, 10))
        self._clips[id_] = result
        return result

    def matrix(self, bank, index):
        if index == 65535:
            return np.eye(3)
        require(bank < len(self.banks), 'Invalid matrix bank')
        full = self.ds.vector(self.banks[bank], 0, 24)
        half = self.ds.vector(self.banks[bank], 2, 12)
        table = full or half
        require(index < len(table), 'Invalid matrix index')
        values = struct.unpack('<6f' if full else '<6h', self.ds.span(table[index], 24 if full else 12))
        if not full:
            values = [v / (self.scale if i < 4 else self.translate) for i, v in enumerate(values)]
        a, b, c, d, tx, ty = values
        require(all(math.isfinite(v) for v in values), 'Nonfinite transform')
        return np.array([[a, c, tx], [b, d, ty], [0, 0, 1]])

    def color(self, bank, index):
        if index == 65535:
            return np.ones(4), np.zeros(4)
        require(bank < len(self.banks), 'Invalid color bank')
        colors = self.ds.vector(self.banks[bank], 1, 7)
        require(index < len(colors), 'Invalid color index')
        values = list(self.ds.span(colors[index], 7))
        return np.array(values[:4]) / 255, np.array([*values[4:], 0]) / 255

    def commands(self, id_):
        f, t = self.shapes[id_]
        for at in f.vector(t, 1, 16):
            texture, count, offset = (f.read(at + n) for n in (4, 8, 12))
            require(texture < len(self.textures) and 3 <= count <= 255 and (offset + count) * 12 <= len(self.vertices),
                    'Invalid bitmap triangle strip')
            vertices = [struct.unpack('<ffHH', self.ds.span(self.vertices[(offset + i) * 12], 12))
                        for i in range(count)]
            yield texture, np.array(vertices)

    def instances(self, id_, frame):
        """Retain each child instance's name, blend, placement and nested phase.

        Named turret/ammo timelines are native engine controls, not ordinary
        looping animation. Importers can select those instances independently.
        Parsing blend metadata does not authorize flattening it as normal alpha.
        """
        clip = self.clip(id_)
        f = frame % len(clip['frames'])
        for child, transform, tint in clip['frames'][f]:
            placed = frame
            while placed > 0 and any(e[0] == child for e in clip['frames'][(placed - 1) % len(clip['frames'])]):
                placed -= 1
            nested = clip['children'][child]
            child_frame = frame - placed
            if nested in self.clips:
                child_frame = child_frame * self.clip(nested)['fps'] // clip['fps']
            yield dict(index=child, id=nested, name=clip.get('names', [''] * len(clip['children']))[child],
                       blend=clip.get('blending', [0] * len(clip['children']))[child], frame=child_frame,
                       matrix=self.matrix(clip['bank'], transform), color=self.color(clip['bank'], tint))

    def draw_list(self, id_, frame, matrix=None, color=None, ancestors=()):
        """Advance nested timelines from their latest continuous placement.

        This Flash-style playback convention is an explicit reconstruction rule;
        native engine subclip clock/reset semantics have not been verified.
        """
        require(id_ not in ancestors and len(ancestors) < 32, 'Recursive display object')
        matrix = np.eye(3) if matrix is None else matrix
        color = (np.ones(4), np.zeros(4)) if color is None else color
        if id_ in self.shapes:
            for texture, vertices in self.commands(id_):
                yield texture, vertices, matrix, color
            return
        require(id_ not in self.modifiers, 'Masks are unsupported')
        clip = self.clip(id_)
        require(not any(clip.get('blending', [])), 'Only normal blending can be flattened')
        for instance in self.instances(id_, frame):
            cmul, cadd = instance['color']
            yield from self.draw_list(instance['id'], instance['frame'],
                                      matrix @ instance['matrix'],
                                      (color[0] * cmul, color[0] * cadd + color[1]),
                                      (*ancestors, id_))


def decode_ktx_astc(data):
    """Strict KTX 1 reader for the pinned UI's single-mip ASTC RGBA 4x4 textures."""
    f = Flat(data)
    require(f.span(0, 12) == b'\xabKTX 11\xbb\r\n\x1a\n', 'Expected KTX 1 identifier')
    header = [f.read(12 + i * 4) for i in range(13)]
    endian, type_, type_size, format_, internal, base, width, height, depth, arrays, faces, mips, metadata = header
    require((endian, type_, type_size, format_, internal, base) ==
            (0x04030201, 0, 1, 0, 0x93B0, 0x1908), 'Unsupported KTX pixel format')
    require(0 < width <= 4096 and 0 < height <= 4096, 'KTX dimensions exceed limit')
    require((depth, arrays, faces, mips, metadata) == (0, 0, 1, 1, 0),
            'Unsupported KTX layers, mips or metadata')
    expected = math.ceil(width / 4) * math.ceil(height / 4) * 16
    require(f.read(64) == expected and len(data) == 68 + expected, 'KTX payload size differs')
    decoded = texture2ddecoder.decode_astc(f.span(68, expected), width, height, 4, 4)
    return Image.frombytes('RGBA', (width, height), decoded, 'raw', 'BGRA')


def decode_sctx(data):
    f = Flat(data)
    size = f.read(0)
    h = Flat(f.span(4, size))
    require(h.span(4, 4) == b'SCTX', 'Expected SCTX header identifier')
    root = h.ref(0)
    width, height = h.scalar(root, 2, 'H'), h.scalar(root, 3, 'H')
    flags = h.scalar(root, 6)
    require(h.scalar(root, 1) == 208, 'Only ASTC RGBA8 6x6 is supported')
    require(0 < width <= 4096 and 0 < height <= 4096, 'Texture dimensions exceed limit')
    # Bit 4 is present in this pinned source and ignored by the reference loader.
    require(h.scalar(root, 4, 'B', 1) == 1 and flags & ~13 == 0, 'Unsupported mip levels or flags')
    at = 4 + size
    mip_size = f.read(at)
    mip = Flat(f.span(at + 8, f.read(at + 4)))
    require(f.read(at + 4) + 4 == mip_size, 'Unexpected mip records')
    mr = mip.ref(0)
    require((mip.scalar(mr, 0, 'H'), mip.scalar(mr, 1, 'H'), mip.scalar(mr, 2)) == (width, height, 0),
            'Invalid base mip dimensions/offset')
    at += 4 + mip_size
    if flags & 8:
        at = (at + 15) & ~15
    payload = f.span(at, len(data) - at)
    expected = math.ceil(width / 6) * math.ceil(height / 6) * 16
    require(h.scalar(root, 7, 'i') == expected, 'ASTC payload size differs from header')
    if flags & 1:
        payload = zstandard.ZstdDecompressor().decompress(payload, max_output_size=expected)
    require(len(payload) == expected, 'Incomplete or trailing ASTC payload')
    decoded = texture2ddecoder.decode_astc(payload, width, height, 6, 6)
    return Image.frombytes('RGBA', (width, height), decoded, 'raw', 'BGRA')


def rasterize(draws, textures, bounds):
    """Rasterize affine bitmap quads with premultiplied bilinear sampling.

    Pixel centers and all fractional native transforms are retained. Straight
    alpha is restored only for PNG output, avoiding dark transparent fringes.
    """
    left, top, right, bottom = bounds
    require(0 < right - left <= 512 and 0 < bottom - top <= 512, 'Sprite bounds exceed limit')
    yy, xx = np.mgrid[top:bottom, left:right]
    points = np.stack([xx + .5, yy + .5, np.ones_like(xx)], axis=-1)
    canvas = np.zeros((*xx.shape, 4), dtype=np.float64)
    for index, vertices, matrix, (mul, add) in draws:
        xy = np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T
        uv = vertices[:, 2:] / 65535
        if len(vertices) == 4 and np.allclose(xy[0] + xy[3], xy[1] + xy[2], atol=1e-5) and np.allclose(uv[0] + uv[3], uv[1] + uv[2], atol=2 / 65535):
            # Keep the affine fast path (and its established Pumpkin pixel digest).
            basis = np.column_stack([xy[1] - xy[0], xy[2] - xy[0], xy[0]])
            if abs(np.linalg.det(basis)) < 1e-10:
                continue  # Native reveal frames intentionally collapse the sprite.
            local = points @ np.linalg.inv(basis).T
            inside = (local[..., :2] >= 0).all(axis=-1) & (local[..., :2] < 1).all(axis=-1)
            sample = uv[0] + local[..., :1] * (uv[1] - uv[0]) + local[..., 1:2] * (uv[2] - uv[0])
        else:
            # SC advanced shapes are triangle strips, not their bounding rectangles.
            # Shared edges are sampled once, avoiding double-alpha diagonal seams.
            inside = np.zeros(xx.shape, dtype=bool)
            sample = np.zeros((*xx.shape, 2), dtype=float)
            for i in range(len(vertices) - 2):
                basis = np.column_stack([xy[i + 1] - xy[i], xy[i + 2] - xy[i], xy[i]])
                if abs(np.linalg.det(basis)) < 1e-10:
                    continue
                local = points @ np.linalg.inv(basis).T
                cover = (local[..., :2] >= -1e-9).all(axis=-1) & (local[..., :2].sum(axis=-1) <= 1 + 1e-9)
                interior = (local[..., :2] > 1e-6).all(axis=-1) & (local[..., :2].sum(axis=-1) < 1 - 1e-6)
                require(not (interior & inside).any(), 'Overlapping bitmap triangles are unsupported')
                selected = cover & ~inside
                coordinates = uv[i] + local[..., :1] * (uv[i + 1] - uv[i]) + local[..., 1:2] * (uv[i + 2] - uv[i])
                sample[selected] = coordinates[selected]
                inside |= cover
        texture = textures[index]
        h, w, _ = texture.shape
        sample = sample * [w, h] - .5
        base = np.floor(sample).astype(int)
        fraction = sample - base
        rgba = np.zeros_like(canvas)
        for dy in (0, 1):
            for dx in (0, 1):
                weight = (fraction[..., 0] if dx else 1 - fraction[..., 0]) * (fraction[..., 1] if dy else 1 - fraction[..., 1])
                texel = texture[np.clip(base[..., 1] + dy, 0, h - 1), np.clip(base[..., 0] + dx, 0, w - 1)].copy()
                texel = np.clip(texel * mul + add, 0, 1)
                texel[..., :3] *= texel[..., 3:4]
                rgba += texel * weight[..., None]
        rgba *= inside[..., None]
        canvas = rgba + canvas * (1 - rgba[..., 3:4])
    canvas[..., :3] /= np.where(canvas[..., 3:4] > 0, canvas[..., 3:4], 1)
    return Image.fromarray(np.round(np.clip(canvas, 0, 1) * 255).astype(np.uint8), 'RGBA')
