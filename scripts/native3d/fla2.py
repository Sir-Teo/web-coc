#!/usr/bin/env python3
"""Strict reader and converter for Supercell Odin 3D models (client 18.400.21 ``sc3d/*.glb``).

Container
    A glTF 2.0 binary (``glTF`` magic, version 2, exact total length) with exactly two
    chunks: ``FLA2`` then ``BIN\\0``. The FLA2 chunk replaces the usual JSON chunk with a
    FlatBuffers encoding of the glTF document; BIN is the ordinary binary buffer 0.

FlatBuffers document
    Every glTF object is a table whose field slots follow the glTF 2.0 JSON property names in
    ASCII order (for example accessor: bufferView=0, byteOffset=1, componentType=2, count=3,
    extensions=4, extras=5, max=6, min=7, name=8, normalized=9, sparse=10, type=11). Scalars
    that equal a glTF default are usually omitted, but index fields (node.mesh, node.skin,
    primitive.indices/material) are written even when zero. Observed encodings:

    ==============  ==============================================================
    root (glTF)     accessors 0, asset 2, bufferViews 3, buffers 4, extensions 6,
                    extensionsRequired 7, extensionsUsed 8, meshes 12, nodes 13, skins 17
    accessor        bufferView u32, byteOffset u32, componentType u16 (GL enum),
                    count u32, type u8 enum (0 SCALAR ... 6 MAT4)
    bufferView      buffer u32, byteLength u32, byteOffset u32
    buffer          byteLength u32
    asset           version string
    mesh            extensions, primitives [table]
    primitive       extensions, indices u32, material u32 (no attributes table)
    node            extensions, mesh u32, name string, rotation [f32 x4], scale [f32 x3],
                    skin u32, translation [f32 x3] (no children; parent is an extension)
    skin            extensions, inverseBindMatrices u32, joints [u32]
    ==============  ==============================================================

    Every ``extensions``/``extras`` field is a ``[ubyte]`` vector containing a FlexBuffers
    blob whose root map is ``{"SC_odin_format": ...}``. Slots that never occur in the pinned
    archive are rejected rather than guessed.

SC_odin_format extension
    root       ``bufferView`` (vertex data view), ``materials`` [{name, shader, blendMode,
               constants, variables}], ``meshDataInfos`` [{vertexDescriptors: [{offset,
               stride, attributes: [{name, index, format, offset}]}]}], optional
               ``animation``.
    mesh       ``bounds`` [[min xyz], [max xyz]], ``skinnedSubMeshMask`` [low32, high32]
               (bit i = primitive i is skinned), rarely ``inversePretransform``.
    primitive  ``meshDataInfoIndex``; ``indices`` addresses that shared vertex buffer.
    node       ``parent`` (absent/null for the scene root).
    skin       ``bounds`` per joint [min xyz, max xyz].

    Vertex ``format`` values are Metal ``MTLVertexFormat`` numbers: 3 uchar4 (joint
    indices), 9 uchar4 normalized (colour), 12 char4 normalized (normal xyz, tangent xyzw),
    22 ushort2 normalized (UV, stored at half scale: uv = value / 65535 * 2), 29 float2,
    30 float3 (position), 36 uint32 bit-packed bone weights: w1 = bits 21-31, w2 = bits
    10-20, w3 = bits 0-9, all fixed point with a 1/4096 step (so the 10-bit w3
    covers [0, 0.25)); w0 = 1 - w1 - w2 - w3. Weights are stored in (near) descending order;
    the 1/4096 step gives the fewest order violations over all 3.86 M archived vertices.

Packed animation (``SC_odin_format.animation``)
    ``frameRate``, ``keyframeCount``, ``firstFrame``, ``lastFrame`` and ``packed``:
    ``nodes`` [{nodeIndex, flags, frameCount, dataSize}], ``dataAccessor`` (int16 stream),
    ``nodeAccessor`` (8 float32 per track: base translation xyz, base scale xyz,
    translation step, scale step), ``uintAccessor`` (4 int16 per track: constant rotation
    quaternion / 32767) and ``stride`` (sum of per-frame components). Track flags: 2 rotation
    (4 int16, quaternion xyzw / 32767), 4 translation (3 int16, base + value * step),
    8 scale (1 int16 applied to x, y and z, or 3 int16 when 16 is also set; base + value *
    step). A track is a sequence of int16 run headers: n > 0 is followed by n explicit keys;
    n < 0 repeats the previous key for -n frames. Runs cover exactly ``frameCount`` frames and
    consume exactly ``dataSize`` values. Animation files carry the full authoring rig (e.g. 442
    nodes for the Barbarian King walk); tracks for engine joints (``*_s``) match skeleton node
    names in the geometry files. Geometry files omit joints without skin influence and re-parent
    their children, so poses must be evaluated in the clip hierarchy and mapped by name
    (``Retarget``); ``to_gltf`` bakes that into geometry-local channels.

Verified over the whole pinned archive: all 3,079 .glb files parse, all 559 geometry files pass
``validate_geometry`` (indices in range, joints in range) and all 2,514 packed animations decode
with exact frame counts, data sizes and strides. For the 18 default hero/pet skins, primitive
bounds equal the declared bounds and node rest poses reproduce the inverse bind matrices to 3e-3
(a few seasonal skins store non-bind node poses).

    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/fla2.py validate GEO.glb --animation CLIP.glb
    PYTHONPATH=scripts output/native-art-venv/bin/python scripts/native3d/fla2.py convert GEO.glb OUT.glb \\
        --animation CLIP.glb [--base-texture base.png] [--normal-texture normal.png]
"""
import argparse
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np


class Fla2Error(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Fla2Error(message)


# --------------------------------------------------------------------------- GLB container

def split_glb(data):
    """Return (flatbuffer_chunk, bin_chunk) from an Odin glTF binary."""
    require(len(data) >= 28, 'File too small for glTF binary')
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    require(magic == b'glTF' and version == 2, 'Expected glTF binary version 2')
    require(length == len(data), 'glTF length header differs from file size')
    chunks, at = [], 12
    while at < len(data):
        require(at + 8 <= len(data), 'Truncated chunk header')
        size, kind = struct.unpack_from('<I4s', data, at)
        require(at + 8 + size <= len(data), 'Chunk exceeds file')
        chunks.append((kind, data[at + 8:at + 8 + size]))
        at += 8 + size
    require(at == len(data), 'Trailing bytes after chunks')
    kinds = [kind for kind, _ in chunks]
    require(kinds in ([b'FLA2', b'BIN\0'], [b'FLA2']), f'Unsupported chunk layout {kinds}')
    return chunks[0][1], (chunks[1][1] if len(chunks) > 1 else b'')


# --------------------------------------------------------------------------- FlatBuffers

class Flat:
    def __init__(self, data):
        self.data = data

    def span(self, at, size):
        require(0 <= at and 0 <= size and at + size <= len(self.data), 'FlatBuffer range outside chunk')
        return self.data[at:at + size]

    def read(self, at, fmt):
        return struct.unpack('<' + fmt, self.span(at, struct.calcsize('<' + fmt)))[0]

    def ref(self, at):
        target = at + self.read(at, 'I')
        self.span(target, 4)
        return target

    def slots(self, table):
        vtable = table - self.read(table, 'i')
        size, object_size = self.read(vtable, 'H'), self.read(vtable + 2, 'H')
        require(size >= 4 and size % 2 == 0, 'Invalid vtable size')
        self.span(table, object_size)
        slots = {}
        for index in range((size - 4) // 2):
            offset = self.read(vtable + 4 + 2 * index, 'H')
            if offset:
                require(4 <= offset < object_size, 'Field offset outside table')
                slots[index] = table + offset
        return slots

    def vector(self, at):
        start = self.ref(at)
        count = self.read(start, 'I')
        return start + 4, count

    def string(self, at):
        start, count = self.vector(at)
        require(self.span(start + count, 1) == b'\0', 'String lacks terminator')
        return self.span(start, count).decode('utf-8')


# Supported slots per object type. Kinds: u8/u16/u32 scalars, str, flex (FlexBuffers bytes),
# [str], [u32], [f32], obj:<type>, [obj:<type>]. Enumerations are converted afterwards.
ROOT_TYPE = 'glTF'
SCHEMA = {
    'glTF': {0: ('accessors', '[obj:accessor]'), 2: ('asset', 'obj:asset'), 3: ('bufferViews', '[obj:bufferView]'),
             4: ('buffers', '[obj:buffer]'), 6: ('extensions', 'flex'), 7: ('extensionsRequired', '[str]'),
             8: ('extensionsUsed', '[str]'), 12: ('meshes', '[obj:mesh]'), 13: ('nodes', '[obj:node]'),
             17: ('skins', '[obj:skin]')},
    'accessor': {0: ('bufferView', 'u32'), 1: ('byteOffset', 'u32'), 2: ('componentType', 'u16'), 3: ('count', 'u32'),
                 11: ('type', 'u8')},
    'asset': {5: ('version', 'str')},
    'bufferView': {0: ('buffer', 'u32'), 1: ('byteLength', 'u32'), 2: ('byteOffset', 'u32')},
    'buffer': {0: ('byteLength', 'u32')},
    'mesh': {0: ('extensions', 'flex'), 3: ('primitives', '[obj:primitive]')},
    'primitive': {1: ('extensions', 'flex'), 3: ('indices', 'u32'), 4: ('material', 'u32')},
    'node': {2: ('extensions', 'flex'), 5: ('mesh', 'u32'), 6: ('name', 'str'), 7: ('rotation', '[f32]'),
             8: ('scale', '[f32]'), 9: ('skin', 'u32'), 10: ('translation', '[f32]')},
    'skin': {0: ('extensions', 'flex'), 2: ('inverseBindMatrices', 'u32'), 3: ('joints', '[u32]')},
}
# Property names in ASCII order, used only for precise error messages.
PROPERTY_ORDER = {
    'glTF': ['accessors', 'animations', 'asset', 'bufferViews', 'buffers', 'cameras', 'extensions',
             'extensionsRequired', 'extensionsUsed', 'extras', 'images', 'materials', 'meshes', 'nodes',
             'samplers', 'scene', 'scenes', 'skins', 'textures'],
    'accessor': ['bufferView', 'byteOffset', 'componentType', 'count', 'extensions', 'extras', 'max', 'min',
                 'name', 'normalized', 'sparse', 'type'],
    'asset': ['copyright', 'extensions', 'extras', 'generator', 'minVersion', 'version'],
    'bufferView': ['buffer', 'byteLength', 'byteOffset', 'byteStride', 'extensions', 'extras', 'name', 'target'],
    'buffer': ['byteLength', 'extensions', 'extras', 'name', 'uri'],
    'mesh': ['extensions', 'extras', 'name', 'primitives', 'weights'],
    'primitive': ['attributes', 'extensions', 'extras', 'indices', 'material', 'mode', 'targets'],
    'node': ['camera', 'children', 'extensions', 'extras', 'matrix', 'mesh', 'name', 'rotation', 'scale', 'skin',
             'translation', 'weights'],
    'skin': ['extensions', 'extras', 'inverseBindMatrices', 'joints', 'name', 'skeleton'],
}
ACCESSOR_TYPES = {0: 'SCALAR', 6: 'MAT4'}
COMPONENT_TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
TYPE_WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_object(flat, table, kind):
    schema = SCHEMA[kind]
    result = {}
    for slot, at in flat.slots(table).items():
        if slot not in schema:
            names = PROPERTY_ORDER[kind]
            label = names[slot] if slot < len(names) else f'slot {slot}'
            raise Fla2Error(f'Unsupported {kind}.{label} field')
        name, field = schema[slot]
        if field in ('u8', 'u16', 'u32'):
            result[name] = flat.read(at, {'u8': 'B', 'u16': 'H', 'u32': 'I'}[field])
        elif field == 'str':
            result[name] = flat.string(at)
        elif field == 'flex':
            start, count = flat.vector(at)
            result[name] = flex_decode(flat.span(start, count))
        elif field == '[str]':
            start, count = flat.vector(at)
            result[name] = [flat.string(start + 4 * i) for i in range(count)]
        elif field in ('[u32]', '[f32]'):
            start, count = flat.vector(at)
            result[name] = list(struct.unpack('<%d%s' % (count, 'I' if field == '[u32]' else 'f'), flat.span(start, 4 * count)))
        elif field.startswith('obj:'):
            result[name] = read_object(flat, flat.ref(at), field[4:])
        elif field.startswith('[obj:'):
            start, count = flat.vector(at)
            result[name] = [read_object(flat, flat.ref(start + 4 * i), field[5:-1]) for i in range(count)]
        else:
            raise AssertionError(field)
    return result


# --------------------------------------------------------------------------- FlexBuffers

def flex_decode(blob):
    """Decode a complete FlexBuffers buffer (https://flatbuffers.dev/flexbuffers)."""
    require(len(blob) >= 3, 'FlexBuffer too small')
    width, packed = blob[-1], blob[-2]
    require(width in (1, 2, 4, 8), 'Invalid FlexBuffer root width')
    return _flex_value(blob, len(blob) - 2 - width, width, packed)


def _flex_int(blob, at, width, signed):
    require(0 <= at and at + width <= len(blob) and width in (1, 2, 4, 8), 'FlexBuffer read outside buffer')
    return int.from_bytes(blob[at:at + width], 'little', signed=signed)


def _flex_float(blob, at, width):
    require(width in (4, 8) and 0 <= at and at + width <= len(blob), 'Invalid FlexBuffer float')
    return struct.unpack_from('<f' if width == 4 else '<d', blob, at)[0]


def _flex_key(blob, at):
    require(0 <= at < len(blob), 'FlexBuffer key outside buffer')
    end = blob.find(b'\0', at)
    require(end >= 0, 'FlexBuffer key lacks terminator')
    return blob[at:end].decode('utf-8')


def _flex_value(blob, at, parent_width, packed):
    kind, width = packed >> 2, 1 << (packed & 3)
    if kind == 0:
        return None
    if kind == 1:
        return _flex_int(blob, at, parent_width, True)
    if kind == 2:
        return _flex_int(blob, at, parent_width, False)
    if kind == 3:
        return _flex_float(blob, at, parent_width)
    if kind == 26:
        return bool(_flex_int(blob, at, parent_width, False))
    target = at - _flex_int(blob, at, parent_width, False)
    require(0 <= target < len(blob), 'FlexBuffer offset outside buffer')
    if kind == 4:
        return _flex_key(blob, target)
    if kind in (6, 7):
        return _flex_int(blob, target, width, kind == 6)
    if kind == 8:
        return _flex_float(blob, target, width)
    if kind in (5, 25):
        size = _flex_int(blob, target - width, width, False)
        require(target + size <= len(blob), 'FlexBuffer string outside buffer')
        raw = blob[target:target + size]
        return raw.decode('utf-8') if kind == 5 else bytes(raw)
    if kind in (9, 10):
        size = _flex_int(blob, target - width, width, False)
        types = target + size * width
        require(types + size <= len(blob), 'FlexBuffer vector outside buffer')
        values = [_flex_value(blob, target + i * width, width, blob[types + i]) for i in range(size)]
        if kind == 10:
            return values
        keys_at = target - 3 * width
        keys = keys_at - _flex_int(blob, keys_at, width, False)
        key_width = _flex_int(blob, target - 2 * width, width, False)
        require(_flex_int(blob, keys - key_width, key_width, False) == size, 'FlexBuffer map key count differs')
        names = [_flex_key(blob, keys + i * key_width - _flex_int(blob, keys + i * key_width, key_width, False))
                 for i in range(size)]
        require(len(set(names)) == size, 'Duplicate FlexBuffer map key')
        return dict(zip(names, values))
    if kind in (11, 12, 13, 14, 36):
        size = _flex_int(blob, target - width, width, False)
        if kind == 13:
            return [_flex_float(blob, target + i * width, width) for i in range(size)]
        if kind == 14:
            return [_flex_key(blob, target + i * width - _flex_int(blob, target + i * width, width, False))
                    for i in range(size)]
        values = [_flex_int(blob, target + i * width, width, kind == 11) for i in range(size)]
        return [bool(v) for v in values] if kind == 36 else values
    if 16 <= kind <= 24:
        size, element = (kind - 16) // 3 + 2, (kind - 16) % 3
        if element == 2:
            return [_flex_float(blob, target + i * width, width) for i in range(size)]
        return [_flex_int(blob, target + i * width, width, element == 0) for i in range(size)]
    raise Fla2Error(f'Unsupported FlexBuffer type {kind}')


# --------------------------------------------------------------------------- document model

class Document:
    """A decoded Odin model or animation file."""

    def __init__(self, data, name='<memory>'):
        self.name = name
        flat_chunk, self.bin = split_glb(data)
        flat = Flat(flat_chunk)
        self.gltf = read_object(flat, flat.ref(0), ROOT_TYPE)
        g = self.gltf
        require(g.get('asset', {}).get('version') == '2.0', 'Expected glTF asset version 2.0')
        require(g.get('extensionsUsed') == ['SC_odin_format'] and g.get('extensionsRequired') == ['SC_odin_format'],
                'Unexpected extension declarations')
        require(len(g.get('buffers', [])) == 1 and 0 <= len(self.bin) - g['buffers'][0]['byteLength'] < 4,
                'Buffer 0 must match the (4-byte padded) BIN chunk')
        for view in g.get('bufferViews', []):
            require(view['buffer'] == 0, 'Only buffer 0 is supported')
            require(view.get('byteOffset', 0) + view.get('byteLength', 0) <= len(self.bin), 'Buffer view exceeds BIN')
        self.odin = self.extension(g)
        require(isinstance(self.odin, dict), 'Missing root SC_odin_format extension')
        self.nodes = g.get('nodes', [])
        self.parents = []
        for index, node in enumerate(self.nodes):
            ext = self.extension(node, required=False)
            parent = ext.get('parent') if isinstance(ext, dict) else None
            require(parent is None or 0 <= parent < len(self.nodes) and parent != index, 'Invalid node parent')
            self.parents.append(parent)
        for index in range(len(self.nodes)):  # reject cycles
            seen, cursor = set(), index
            while cursor is not None:
                require(cursor not in seen, 'Node hierarchy contains a cycle')
                seen.add(cursor)
                cursor = self.parents[cursor]
        self.names = [node.get('name') for node in self.nodes]

    @staticmethod
    def extension(obj, required=True):
        ext = obj.get('extensions')
        if ext is None and not required:
            return None
        require(isinstance(ext, dict) and set(ext) == {'SC_odin_format'}, 'Expected only SC_odin_format extension')
        return ext['SC_odin_format']

    # ---- accessors
    def accessor(self, index):
        accessors = self.gltf.get('accessors', [])
        require(0 <= index < len(accessors), 'Accessor index out of range')
        acc = accessors[index]
        kind = ACCESSOR_TYPES.get(acc.get('type', 0))
        require(kind is not None, 'Unsupported accessor type enum')
        dtype = COMPONENT_TYPES.get(acc['componentType'])
        require(dtype is not None, 'Unsupported accessor component type')
        view = self.gltf['bufferViews'][acc.get('bufferView', 0)]
        width = TYPE_WIDTH[kind]
        count = acc.get('count', 0)
        size = count * width * np.dtype(dtype).itemsize
        start = acc.get('byteOffset', 0)
        require(start + size <= view.get('byteLength', 0), 'Accessor exceeds its buffer view')
        array = np.frombuffer(self.bin, dtype=dtype, count=count * width, offset=view.get('byteOffset', 0) + start)
        return array.reshape(count, width) if width > 1 else array

    # ---- geometry
    def vertex_data(self, info_index):
        """Decode one meshDataInfo into float/int numpy arrays keyed by glTF attribute semantic."""
        infos = self.odin.get('meshDataInfos') or []
        require(0 <= info_index < len(infos), 'meshDataInfoIndex out of range')
        view_index = self.odin['bufferView']
        view = self.gltf['bufferViews'][view_index]
        view_bytes = self.bin[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        # Streams carry no count: bound each by the next stream or accessor start in the same view.
        starts = {d['offset'] for info in infos for d in info['vertexDescriptors']}
        starts |= {a.get('byteOffset', 0) for a in self.gltf.get('accessors', []) if a['bufferView'] == view_index}
        boundaries = sorted(starts | {len(view_bytes)})
        descriptors = infos[info_index]['vertexDescriptors']
        referenced = [int(indices.max(initial=0)) + 1 for _, _, info, indices, _, _ in self.meshes() if info == info_index]
        require(referenced, 'meshDataInfo is not referenced by any primitive')
        count = None
        for d in descriptors:
            end = boundaries[boundaries.index(d['offset']) + 1]
            require(d['stride'] > 0 and end - d['offset'] >= d['stride'], 'Empty vertex stream')
            available = (end - d['offset']) // d['stride']
            count = available if count is None else min(count, available)
        require(count >= max(referenced), 'Vertex stream shorter than referenced indices')
        out = {}
        for d in descriptors:
            end = boundaries[boundaries.index(d['offset']) + 1]
            require(end - d['offset'] - count * d['stride'] < 2 * d['stride'], 'Vertex streams disagree on count')
            raw = np.frombuffer(view_bytes, dtype=np.uint8, count=count * d['stride'], offset=d['offset'])
            raw = raw.reshape(count, d['stride'])
            spans = sorted(d['attributes'], key=lambda a: a['offset'])
            for i, attr in enumerate(spans):
                limit = spans[i + 1]['offset'] if i + 1 < len(spans) else d['stride']
                column = raw[:, attr['offset']:limit]
                name, values = decode_attribute(attr['name'], attr['format'], column)
                require(name not in out, f'Duplicate vertex attribute {name}')
                out[name] = values
        out['count'] = count
        return out

    def meshes(self):
        """Yield (mesh_index, primitive_index, info_index, indices uint32, material, skinned)."""
        for m, mesh in enumerate(self.gltf.get('meshes', [])):
            ext = self.extension(mesh)
            mask = ext.get('skinnedSubMeshMask', [0, 0])
            for p, prim in enumerate(mesh.get('primitives', [])):
                pext = self.extension(prim)
                indices = self.accessor(prim['indices'])
                require(indices.ndim == 1 and len(indices) % 3 == 0, 'Primitive indices must be triangle list')
                skinned = bool((mask[p // 32] >> (p % 32)) & 1)
                yield m, p, pext['meshDataInfoIndex'], indices.astype(np.uint32), prim.get('material', 0), skinned

    def skin(self, index=0):
        skins = self.gltf.get('skins', [])
        require(0 <= index < len(skins), 'Skin index out of range')
        skin = skins[index]
        joints = skin['joints']
        ibm = self.accessor(skin['inverseBindMatrices']).astype(np.float64)
        require(ibm.shape == (len(joints), 16), 'Inverse bind matrix count differs from joints')
        # A few non-default skins list a joint twice; the engine tolerates it, so only ranges are enforced.
        require(all(0 <= j < len(self.nodes) for j in joints), 'Invalid skin joints')
        return joints, ibm.reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row-major 4x4

    def local_matrix(self, index):
        node = self.nodes[index]
        return trs_matrix(node.get('translation'), node.get('rotation'), node.get('scale'))

    def global_matrices(self, locals_=None):
        count = len(self.nodes)
        locals_ = [self.local_matrix(i) for i in range(count)] if locals_ is None else locals_
        result = [None] * count

        def resolve(i):
            if result[i] is None:
                parent = self.parents[i]
                result[i] = locals_[i] if parent is None else resolve(parent) @ locals_[i]
            return result[i]
        for i in range(count):
            resolve(i)
        return result

    # ---- animation
    def animation(self):
        """Decode packed tracks into per-frame float arrays."""
        an = self.odin.get('animation')
        require(isinstance(an, dict), 'File has no packed animation')
        packed = an['packed']
        frames = an['keyframeCount']
        data = self.accessor(packed['dataAccessor'])
        bases = self.accessor(packed['nodeAccessor'])
        constants = self.accessor(packed['uintAccessor'])
        require(data.dtype == np.int16 and data.ndim == 1, 'Animation data must be int16 scalars')
        require(bases.dtype == np.float32 and bases.size == 8 * len(packed['nodes']), 'Track base count differs')
        require(constants.dtype == np.int16 and constants.size == 4 * len(packed['nodes']), 'Track rotation count differs')
        bases = bases.reshape(-1, 8).astype(np.float64)
        constants = constants.reshape(-1, 4).astype(np.float64) / 32767.0
        tracks, cursor, stride = [], 0, 0
        seen = set()
        for k, entry in enumerate(packed['nodes']):
            node, flags = entry['nodeIndex'], entry['flags']
            require(0 <= node < len(self.nodes) and node not in seen, 'Invalid or duplicate animated node')
            seen.add(node)
            require(flags & ~30 == 0 and not (flags & 16 and not flags & 8), f'Unsupported track flags {flags}')
            require(entry['frameCount'] == frames, 'Track frame count differs from keyframeCount')
            width = track_width(flags)
            stride += width
            values = np.zeros((frames, max(width, 1)), dtype=np.float64)
            end = cursor + entry['dataSize']
            require(end <= len(data), 'Track data exceeds accessor')
            if entry['dataSize']:
                require(width > 0, 'Track data without channels')
                frame, at = 0, cursor
                while frame < frames:
                    require(at < end, 'Track run header outside data')
                    run = int(data[at])
                    at += 1
                    require(run != 0, 'Zero-length track run')
                    if run > 0:
                        require(frame + run <= frames and at + run * width <= end, 'Track keys exceed bounds')
                        values[frame:frame + run, :width] = data[at:at + run * width].reshape(run, width)
                        at += run * width
                        frame += run
                    else:
                        require(frame > 0 and frame - run <= frames, 'Invalid repeat run')
                        values[frame:frame - run] = values[frame - 1]
                        frame -= run
                require(at == end, 'Track consumed a different data size')
            else:
                require(width == 0, 'Animated channels without data')
            cursor = end
            base = bases[k]
            column = 0
            if flags & 2:
                rotation = values[:, column:column + 4] / 32767.0
                column += 4
            else:
                rotation = np.repeat(constants[k][None], frames, axis=0)
            translation = np.repeat(base[None, 0:3], frames, axis=0)
            if flags & 4:
                translation = translation + values[:, column:column + 3] * base[6]
                column += 3
            scale = np.repeat(base[None, 3:6], frames, axis=0)
            if flags & 8:
                count = 3 if flags & 16 else 1
                scale = scale + values[:, column:column + count] * base[7]
                column += count
            norms = np.linalg.norm(rotation, axis=1, keepdims=True)
            require(np.all(norms > 0.5), 'Degenerate animation quaternion')
            tracks.append(dict(node=node, name=self.names[node], flags=flags, rotation=rotation / norms,
                               translation=translation, scale=scale))
        require(cursor == len(data), 'Packed data has unused values')
        require(stride == packed.get('stride'), 'Packed stride differs from track channels')
        return dict(frameRate=an['frameRate'], keyframeCount=frames, firstFrame=an['firstFrame'],
                    lastFrame=an['lastFrame'], tracks=tracks)


def sample_tracks(an, time, wrap_to=None):
    """Local TRS per animated node at a fractional frame (slerp/lerp between native frames).

    ``wrap_to`` is the frame that follows the last one when sampling past it (loop start).
    """
    frames = an['keyframeCount']
    lo = int(math.floor(time))
    frac = time - lo
    require(0 <= lo < frames, 'Sample time outside animation')
    hi = lo + 1
    if hi >= frames:
        require(frac < 1e-9 or wrap_to is not None, 'Sample past the last frame without a loop target')
        hi = wrap_to if wrap_to is not None else lo
    result = {}
    for track in an['tracks']:
        if frac < 1e-9:
            result[track['node']] = (track['translation'][lo], track['rotation'][lo], track['scale'][lo])
            continue
        qa, qb = track['rotation'][lo], track['rotation'][hi]
        result[track['node']] = (track['translation'][lo] * (1 - frac) + track['translation'][hi] * frac,
                                 slerp(qa, qb, frac), track['scale'][lo] * (1 - frac) + track['scale'][hi] * frac)
    return result


def slerp(a, b, t):
    dot = float(np.dot(a, b))
    if dot < 0:
        b, dot = -b, -dot
    if dot > 0.9995:
        q = a + (b - a) * t
    else:
        theta = math.acos(min(1.0, dot))
        q = (math.sin((1 - t) * theta) * a + math.sin(t * theta) * b) / math.sin(theta)
    return q / np.linalg.norm(q)


class Retarget:
    """Evaluate an animation file's own rig hierarchy and map joint globals onto a geometry skeleton by name.

    Geometry files omit joints without skin influence (e.g. upper/lower leg or neck joints) and
    re-parent their children, so animation locals are only meaningful in the animation hierarchy.
    Nodes without a track keep the animation file's stored TRS. A geometry node absent from the
    animation keeps its bind offset relative to its nearest mapped geometry ancestor.
    """

    def __init__(self, geometry, animation_doc):
        self.geometry, self.doc = geometry, animation_doc
        self.an = animation_doc.animation()
        by_name = {}
        for i, name in enumerate(animation_doc.names):
            if name:
                require(name not in by_name or name not in geometry.names, f'Ambiguous animation node name {name}')
                by_name.setdefault(name, i)
        self.map = [by_name.get(name) for name in geometry.names]
        self.static = [animation_doc.local_matrix(i) for i in range(len(animation_doc.nodes))]
        self.bind = geometry.global_matrices()

    def geometry_globals(self, time, wrap_to=None):
        pose = sample_tracks(self.an, time, wrap_to)
        locals_ = list(self.static)
        for node, (t, r, s) in pose.items():
            locals_[node] = trs_matrix(t, r, s)
        anim_globals = self.doc.global_matrices(locals_)
        result = [None] * len(self.geometry.nodes)

        def resolve(i):
            if result[i] is None:
                if self.map[i] is not None:
                    result[i] = anim_globals[self.map[i]]
                else:
                    parent = self.geometry.parents[i]
                    if parent is None:
                        result[i] = self.bind[i]
                    else:
                        result[i] = resolve(parent) @ np.linalg.inv(self.bind[parent]) @ self.bind[i]
            return result[i]
        for i in range(len(self.geometry.nodes)):
            resolve(i)
        return result


def decompose(matrix):
    translation = matrix[:3, 3].copy()
    basis = matrix[:3, :3]
    scale = np.linalg.norm(basis, axis=0)
    rotation = basis / np.where(scale > 1e-12, scale, 1.0)
    if np.linalg.det(rotation) < 0:
        scale[0], rotation[:, 0] = -scale[0], -rotation[:, 0]
    m = rotation
    trace = m[0, 0] + m[1, 1] + m[2, 2]
    if trace > 0:
        k = 0.5 / math.sqrt(trace + 1.0)
        q = np.array([(m[2, 1] - m[1, 2]) * k, (m[0, 2] - m[2, 0]) * k, (m[1, 0] - m[0, 1]) * k, 0.25 / k])
    else:
        i = int(np.argmax([m[0, 0], m[1, 1], m[2, 2]]))
        j, k_ = (i + 1) % 3, (i + 2) % 3
        root = math.sqrt(max(0.0, m[i, i] - m[j, j] - m[k_, k_] + 1.0))
        q = np.zeros(4)
        q[i] = 0.5 * root
        root = 0.5 / root if root > 1e-12 else 0.0
        q[3] = (m[k_, j] - m[j, k_]) * root
        q[j] = (m[j, i] + m[i, j]) * root
        q[k_] = (m[k_, i] + m[i, k_]) * root
    return translation, q / np.linalg.norm(q), scale


def track_width(flags):
    return (4 if flags & 2 else 0) + (3 if flags & 4 else 0) + ((3 if flags & 16 else 1) if flags & 8 else 0)


def decode_attribute(name, fmt, column):
    width = column.shape[1]
    if name == 'a_pos':
        require(fmt == 30 and width == 12, 'Unsupported position format')
        return 'POSITION', column.copy().view(np.float32).reshape(-1, 3)
    if name in ('a_normal', 'a_tangent'):
        require(fmt == 12 and width == 4, f'Unsupported {name} format')
        values = np.maximum(column.astype(np.int8).astype(np.float32) / 127.0, -1.0)
        if name == 'a_normal':
            return 'NORMAL', values[:, :3].copy()
        return 'TANGENT', values
    if name in ('a_uv0', 'a_uv1'):
        semantic = 'TEXCOORD_0' if name == 'a_uv0' else 'TEXCOORD_1'
        if fmt == 22 and width == 4:
            return semantic, column.copy().view(np.uint16).reshape(-1, 2).astype(np.float32) / 65535.0 * 2.0
        require(fmt == 29 and width == 8, f'Unsupported {name} format')
        return semantic, column.copy().view(np.float32).reshape(-1, 2)
    if name == 'a_boneindex':
        require(fmt == 3 and width == 4, 'Unsupported bone index format')
        return 'JOINTS_0', column.copy()
    if name == 'a_boneweights':
        require(fmt == 36 and width == 4, 'Unsupported bone weight format')
        packed = column.copy().view(np.uint32).reshape(-1).astype(np.int64)
        w1, w2, w3 = packed >> 21, (packed >> 10) & 0x7FF, packed & 0x3FF
        rest = np.stack([w1, w2, w3], axis=1).astype(np.float32) / 4096.0
        w0 = 1.0 - rest.sum(axis=1, keepdims=True)
        require(np.all(w0 >= -1e-6), 'Bone weights exceed one')
        return 'WEIGHTS_0', np.concatenate([np.maximum(w0, 0), rest], axis=1)
    if name == 'a_color1':
        require(fmt == 9 and width == 4, 'Unsupported colour format')
        return 'COLOR_1', column.astype(np.float32) / 255.0
    raise Fla2Error(f'Unsupported vertex attribute {name} format {fmt}')


# --------------------------------------------------------------------------- math

def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs_matrix(translation=None, rotation=None, scale=None):
    m = np.eye(4)
    r = quat_matrix(rotation) if rotation is not None else np.eye(3)
    s = np.asarray(scale if scale is not None else (1, 1, 1), dtype=np.float64)
    m[:3, :3] = r * s[None, :]
    if translation is not None:
        m[:3, 3] = translation
    return m


# --------------------------------------------------------------------------- validation

def validate_geometry(doc):
    report = dict(file=doc.name, nodes=len(doc.nodes), meshes=len(doc.gltf.get('meshes', [])), primitives=[])
    infos = {}
    for m, p, info, indices, material, skinned in doc.meshes():
        if info not in infos:
            infos[info] = doc.vertex_data(info)
        data = infos[info]
        require(indices.max(initial=0) < data['count'], 'Index exceeds vertex count')
        require(material < len(doc.odin.get('materials') or []), 'Material index out of range')
        used = np.unique(indices)
        pos = data['POSITION'][used]
        mesh_bounds = doc.extension(doc.gltf['meshes'][m])['bounds']
        report['primitives'].append(dict(mesh=m, primitive=p, triangles=len(indices) // 3, uniqueVertices=int(len(used)),
                                         material=material, skinned=skinned,
                                         min=[round(float(v), 4) for v in pos.min(0)],
                                         max=[round(float(v), 4) for v in pos.max(0)],
                                         declaredBounds=[[round(v, 4) for v in b] for b in mesh_bounds]))
    for info, data in infos.items():
        entry = dict(vertices=data['count'], attributes=sorted(k for k in data if k != 'count'))
        if 'NORMAL' in data:
            lengths = np.linalg.norm(data['NORMAL'], axis=1)
            entry['normalLength'] = [round(float(lengths.min()), 4), round(float(lengths.max()), 4)]
        if 'TEXCOORD_0' in data:
            entry['uvRange'] = [[round(float(v), 4) for v in data['TEXCOORD_0'].min(0)],
                                [round(float(v), 4) for v in data['TEXCOORD_0'].max(0)]]
        if 'WEIGHTS_0' in data:
            sums = data['WEIGHTS_0'].sum(1)
            entry['weightSum'] = [round(float(sums.min()), 5), round(float(sums.max()), 5)]
            entry['weightsDescending'] = bool(np.all(np.diff(data['WEIGHTS_0'], axis=1) <= 1e-6))
        report.setdefault('vertexData', {})[info] = entry
    if doc.gltf.get('skins'):
        joints, ibm = doc.skin(0)
        globals_ = doc.global_matrices()
        errors = [float(np.abs(globals_[j] @ ibm[i] - np.eye(4)).max()) for i, j in enumerate(joints)]
        for info, data in infos.items():
            if 'JOINTS_0' in data:
                active = data['WEIGHTS_0'] > 0
                require(int(data['JOINTS_0'][active].max(initial=0)) < len(joints), 'Joint index exceeds skin joints')
        report['skin'] = dict(joints=len(joints), inverseBindMatrices=len(ibm),
                              maxBindPoseError=round(max(errors), 6),
                              jointNames=[doc.names[j] for j in joints])
    return report


def validate_animation(doc, geometry=None):
    an = doc.animation()
    report = dict(file=doc.name, frameRate=round(an['frameRate'], 4), keyframeCount=an['keyframeCount'],
                  tracks=len(an['tracks']), rigNodes=len(doc.nodes))
    for t in an['tracks']:
        require(0 <= t['node'] < len(doc.nodes), 'Channel targets a missing node')
    report['maxTranslation'] = round(float(max(np.abs(t['translation']).max() for t in an['tracks'])), 4)
    report['scaleRange'] = [round(float(min(t['scale'].min() for t in an['tracks'])), 4),
                            round(float(max(t['scale'].max() for t in an['tracks'])), 4)]
    if geometry is not None:
        joints, _ = geometry.skin(0)
        names = {n: i for i, n in enumerate(doc.names)}
        joint_names = [geometry.names[j] for j in joints]
        missing = [n for n in joint_names if n not in names]
        parent_mismatch = []
        for j in joints:
            name = geometry.names[j]
            if name in names:
                gp = geometry.parents[j]
                ap = doc.parents[names[name]]
                gname = geometry.names[gp] if gp is not None else None
                aname = doc.names[ap] if ap is not None else None
                if gname != aname:
                    parent_mismatch.append((name, gname, aname))
        animated = {t['name'] for t in an['tracks']}
        report['sharedSkeleton'] = dict(geometryJoints=len(joint_names), missingInAnimation=missing,
                                        parentMismatches=parent_mismatch,
                                        animatedJoints=sum(1 for n in joint_names if n in animated))
    return report


# --------------------------------------------------------------------------- standard glTF export

class _Bin:
    def __init__(self):
        self.data = bytearray()
        self.views, self.accessors = [], []

    def add(self, array, component, kind, target=None, minmax=False, normalized=False):
        array = np.ascontiguousarray(array)
        while len(self.data) % 4:
            self.data.append(0)
        view = dict(buffer=0, byteOffset=len(self.data), byteLength=array.nbytes)
        if target:
            view['target'] = target
        self.data.extend(array.tobytes())
        self.views.append(view)
        acc = dict(bufferView=len(self.views) - 1, componentType=component, count=int(array.shape[0]), type=kind)
        if normalized:
            acc['normalized'] = True
        if minmax:
            flat = array.reshape(array.shape[0], -1)
            acc['min'] = [float(v) for v in flat.min(0)]
            acc['max'] = [float(v) for v in flat.max(0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def to_gltf(doc, animations=(), textures=None):
    """Convert to standard glTF 2.0 (dict, bytes). ``animations`` are Documents retargeted by node name."""
    out = _Bin()
    if not animations and doc.odin.get('animation'):
        animations = [doc]
    nodes = []
    children = {}
    for i, parent in enumerate(doc.parents):
        if parent is not None:
            children.setdefault(parent, []).append(i)
    for i, node in enumerate(doc.nodes):
        entry = dict(name=node.get('name') or f'node{i}')
        for key in ('translation', 'rotation', 'scale'):
            if key in node:
                entry[key] = [float(v) for v in node[key]]
        if i in children:
            entry['children'] = children[i]
        nodes.append(entry)
    gltf = dict(asset=dict(version='2.0', generator='web-coc scripts/native3d/fla2.py'), nodes=nodes,
                scenes=[dict(nodes=[i for i, p in enumerate(doc.parents) if p is None])], scene=0)
    if doc.odin.get('meshDataInfos'):
        shared = {}
        materials = []
        remap = None
        if doc.gltf.get('skins'):
            skin_joints, _ = doc.skin(0)
            unique_joints = list(dict.fromkeys(skin_joints))
            remap = np.array([unique_joints.index(j) for j in skin_joints] + [0] * (256 - len(skin_joints)), dtype=np.uint8)
        for index, material in enumerate(doc.odin.get('materials') or []):
            pbr = dict(metallicFactor=0.0, roughnessFactor=1.0)
            if textures and textures.get('base') is not None:
                pbr['baseColorTexture'] = dict(index=0)
            entry = dict(name=material.get('name') or f'material{index}', pbrMetallicRoughness=pbr)
            if textures and textures.get('normal') is not None:
                entry['normalTexture'] = dict(index=1 if textures.get('base') is not None else 0)
            materials.append(entry)
        meshes = []
        mesh_prims = {}
        for m, p, info, indices, material, skinned in doc.meshes():
            if info not in shared:
                data = doc.vertex_data(info)
                attrs = dict(POSITION=out.add(data['POSITION'].astype(np.float32), 5126, 'VEC3', 34962, minmax=True))
                if 'NORMAL' in data:
                    n = data['NORMAL'] / np.maximum(np.linalg.norm(data['NORMAL'], axis=1, keepdims=True), 1e-8)
                    attrs['NORMAL'] = out.add(n.astype(np.float32), 5126, 'VEC3', 34962)
                if 'TANGENT' in data:
                    t = data['TANGENT'].copy()
                    t[:, :3] /= np.maximum(np.linalg.norm(t[:, :3], axis=1, keepdims=True), 1e-8)
                    t[:, 3] = np.where(t[:, 3] < 0, -1.0, 1.0)
                    attrs['TANGENT'] = out.add(t.astype(np.float32), 5126, 'VEC4', 34962)
                if 'TEXCOORD_0' in data:
                    attrs['TEXCOORD_0'] = out.add(data['TEXCOORD_0'].astype(np.float32), 5126, 'VEC2', 34962)
                if 'JOINTS_0' in data:
                    weights = data['WEIGHTS_0'].astype(np.float32)
                    joints = np.where(weights > 0, data['JOINTS_0'], 0).astype(np.uint8)
                    if remap is not None:
                        joints = remap[joints]
                    weights = weights / weights.sum(1, keepdims=True)
                    attrs['JOINTS_0'] = out.add(joints, 5121, 'VEC4', 34962)
                    attrs['WEIGHTS_0'] = out.add(weights.astype(np.float32), 5126, 'VEC4', 34962)
                shared[info] = attrs
            if indices.max(initial=0) < 65536:
                ind = out.add(indices.astype(np.uint16), 5123, 'SCALAR', 34963)
            else:
                ind = out.add(indices.astype(np.uint32), 5125, 'SCALAR', 34963)
            prim = dict(attributes=shared[info], indices=ind, mode=4)
            if materials:
                prim['material'] = material
            mesh_prims.setdefault(m, []).append(prim)
        for m in range(len(doc.gltf.get('meshes', []))):
            meshes.append(dict(primitives=mesh_prims[m]))
        gltf['meshes'] = meshes
        if materials:
            gltf['materials'] = materials
        for i, node in enumerate(doc.nodes):
            if 'mesh' in node:
                nodes[i]['mesh'] = node['mesh']
            if 'skin' in node:
                nodes[i]['skin'] = node['skin']
        if doc.gltf.get('skins'):
            joints, ibm = doc.skin(0)
            unique = list(dict.fromkeys(joints))
            require(all(np.allclose(ibm[i], ibm[joints.index(j)], atol=1e-4) for i, j in enumerate(joints)),
                    'Duplicate skin joints disagree on inverse bind matrices')
            keep = [joints.index(j) for j in unique]
            ibm_columns = ibm[keep].transpose(0, 2, 1).reshape(-1, 16).astype(np.float32)
            gltf['skins'] = [dict(joints=unique, inverseBindMatrices=out.add(ibm_columns, 5126, 'MAT4'))]
    if textures:
        images, gl_textures = [], []
        for key in ('base', 'normal'):
            png = textures.get(key)
            if png is None:
                continue
            while len(out.data) % 4:
                out.data.append(0)
            out.views.append(dict(buffer=0, byteOffset=len(out.data), byteLength=len(png)))
            out.data.extend(png)
            images.append(dict(bufferView=len(out.views) - 1, mimeType='image/png'))
            gl_textures.append(dict(source=len(images) - 1))
        gltf['images'], gltf['textures'] = images, gl_textures
    gl_animations = []
    for anim_doc in animations:
        samplers, channels = [], []
        if anim_doc is doc:
            # A clip exported on its own rig: tracks target their own nodes directly.
            an = anim_doc.animation()
            times = np.arange(an['keyframeCount'], dtype=np.float32) / np.float32(an['frameRate'])
            time_acc = out.add(times, 5126, 'SCALAR', minmax=True)
            for track in an['tracks']:
                for path, values, kind in (('rotation', track['rotation'], 'VEC4'), ('translation', track['translation'], 'VEC3'),
                                           ('scale', track['scale'], 'VEC3')):
                    samplers.append(dict(input=time_acc, output=out.add(values.astype(np.float32), 5126, kind),
                                         interpolation='LINEAR'))
                    channels.append(dict(sampler=len(samplers) - 1, target=dict(node=track['node'], path=path)))
        else:
            # Retarget onto the geometry skeleton: bake geometry-local TRS for every node per native frame.
            retarget = Retarget(doc, anim_doc)
            an = retarget.an
            times = np.arange(an['keyframeCount'], dtype=np.float32) / np.float32(an['frameRate'])
            time_acc = out.add(times, 5126, 'SCALAR', minmax=True)
            per_frame = [retarget.geometry_globals(float(f)) for f in range(an['keyframeCount'])]
            for node in range(len(doc.nodes)):
                if retarget.map[node] is None:
                    continue
                parent = doc.parents[node]
                trs = [decompose(g[node] if parent is None else np.linalg.inv(g[parent]) @ g[node]) for g in per_frame]
                rotations = np.array([r for _, r, _ in trs])
                for i in range(1, len(rotations)):
                    if np.dot(rotations[i], rotations[i - 1]) < 0:
                        rotations[i] = -rotations[i]
                for path, values, kind in (('translation', np.array([t for t, _, _ in trs]), 'VEC3'),
                                           ('rotation', rotations, 'VEC4'), ('scale', np.array([c for _, _, c in trs]), 'VEC3')):
                    samplers.append(dict(input=time_acc, output=out.add(values.astype(np.float32), 5126, kind),
                                         interpolation='LINEAR'))
                    channels.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
        gl_animations.append(dict(name=Path(anim_doc.name).stem, samplers=samplers, channels=channels))
    if gl_animations:
        gltf['animations'] = gl_animations
    while len(out.data) % 4:
        out.data.append(0)
    if out.data:
        gltf['bufferViews'] = out.views
        gltf['accessors'] = out.accessors
        gltf['buffers'] = [dict(byteLength=len(out.data))]
    return gltf, bytes(out.data)


def write_glb(gltf, binary, path):
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    blob = struct.pack('<I4s', len(text), b'JSON') + text
    if binary:
        blob += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    blob = struct.pack('<4sII', b'glTF', 2, 12 + len(blob)) + blob
    Path(path).write_bytes(blob)


def load(path):
    path = Path(path)
    return Document(path.read_bytes(), path.name)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = parser.add_subparsers(dest='command', required=True)
    convert = sub.add_parser('convert', help='Write a standard .glb (optionally with retargeted animations/textures)')
    convert.add_argument('source')
    convert.add_argument('target')
    convert.add_argument('--animation', action='append', default=[], help='Odin animation .glb to retarget by node name')
    convert.add_argument('--base-texture', help='PNG embedded as baseColorTexture')
    convert.add_argument('--normal-texture', help='PNG embedded as normalTexture (standard RGB tangent space)')
    check = sub.add_parser('validate', help='Print a structural validation report as JSON')
    check.add_argument('geometry')
    check.add_argument('--animation', action='append', default=[])
    args = parser.parse_args(argv)
    if args.command == 'convert':
        doc = load(args.source)
        animations = [load(p) for p in args.animation]
        textures = {}
        if args.base_texture:
            textures['base'] = Path(args.base_texture).read_bytes()
        if args.normal_texture:
            textures['normal'] = Path(args.normal_texture).read_bytes()
        gltf, binary = to_gltf(doc, animations, textures or None)
        if str(args.target).endswith('.gltf'):
            bin_path = Path(args.target).with_suffix('.bin')
            gltf['buffers'][0]['uri'] = bin_path.name
            bin_path.write_bytes(binary)
            Path(args.target).write_text(json.dumps(gltf, indent=1))
        else:
            write_glb(gltf, binary, args.target)
        print(f'wrote {args.target}')
    else:
        geometry = load(args.geometry)
        report = dict(geometry=validate_geometry(geometry))
        report['animations'] = [validate_animation(load(p), geometry) for p in args.animation]
        json.dump(report, sys.stdout, indent=1)
        print()


if __name__ == '__main__':
    main()
