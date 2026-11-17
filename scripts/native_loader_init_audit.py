#!/usr/bin/env python3
"""Authenticate an ELF64 ARM64 wrapper and audit its conventional initializer metadata.

Static file inspection only. No loading, relocation application or target execution.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct


class InvalidElf(ValueError):
    pass


def audit_bytes(data, expected_sha256):
    if not re.fullmatch(r'[a-fA-F0-9]{64}', expected_sha256):
        raise InvalidElf('Supply an independently retained full-file SHA256')
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected_sha256.lower():
        raise InvalidElf('Original wrapper SHA256 does not match')

    def read(fmt, offset):
        size = struct.calcsize(fmt)
        if offset < 0 or offset + size > len(data):
            raise InvalidElf('Truncated file structure')
        return struct.unpack_from(fmt, data, offset)

    if len(data) < 64 or data[:7] != b'\x7fELF\x02\x01\x01':
        raise InvalidElf('Require a little-endian ELF64 version-1 file')
    (kind, machine, version, entry, phoff, shoff, flags, ehsize, phentsize,
     phnum, shentsize, shnum, shstrndx) = read('<HHIQQQIHHHHHH', 16)
    if (kind, machine, version, ehsize, phentsize) != (3, 183, 1, 64, 56):
        raise InvalidElf('Require an ordinary ARM64 ET_DYN ELF64 header')
    if not phnum or phnum == 0xffff or phoff < ehsize:
        raise InvalidElf('Missing, extended or overlapping program-header table')
    if phoff + phnum * phentsize > len(data):
        raise InvalidElf('Truncated program-header table')
    loads, dynamics = [], []
    for i in range(phnum):
        ptype, pflags, offset, va, pa, filesz, memsz, align = read('<IIQQQQQQ', phoff + i * phentsize)
        if ptype not in (1, 2):
            continue
        if filesz > memsz or offset + filesz > len(data):
            raise InvalidElf('Invalid file-backed segment extent')
        item = {'offset': offset, 'va': va, 'filesz': filesz, 'flags': pflags}
        (loads if ptype == 1 else dynamics).append(item)
    if len(dynamics) != 1:
        raise InvalidElf('Require one conventional PT_DYNAMIC segment')

    def file_offset(va, size):
        matches = [p for p in loads if p['va'] <= va and va + size <= p['va'] + p['filesz']]
        if len(matches) != 1:
            raise InvalidElf('Virtual range is absent, zero-filled or ambiguously mapped')
        p = matches[0]
        return p['offset'] + va - p['va']

    dynamic = dynamics[0]
    if file_offset(dynamic['va'], dynamic['filesz']) != dynamic['offset']:
        raise InvalidElf('PT_DYNAMIC disagrees with its PT_LOAD mapping')
    if dynamic['filesz'] % 16:
        raise InvalidElf('Partial dynamic record')
    tags = {}
    terminated = False
    singleton_tags = {7, 8, 9, 12, 25, 27}
    for pos in range(dynamic['offset'], dynamic['offset'] + dynamic['filesz'], 16):
        tag, value = read('<qQ', pos)
        if tag == 0:
            terminated = True
            break
        if tag in singleton_tags:
            if tag in tags:
                raise InvalidElf('Ambiguous duplicate initializer/RELA dynamic tag')
            tags[tag] = value
    if not terminated:
        raise InvalidElf('Unterminated PT_DYNAMIC')
    if not {7, 8, 9, 25, 27}.issubset(tags):
        raise InvalidElf('Missing conventional DT_RELA or DT_INIT_ARRAY metadata')
    if tags[9] != 24 or tags[8] % 24 or tags[27] % 8:
        raise InvalidElf('Invalid RELA or initializer entry extent')
    rela_start = file_offset(tags[7], tags[8])
    array_start = file_offset(tags[25], tags[27])
    relocs = []
    for pos in range(rela_start, rela_start + tags[8], 24):
        offset, info, addend = read('<QQq', pos)
        relocs.append((offset, info >> 32, info & 0xffffffff, addend))
    array = []
    for i in range(tags[27] // 8):
        va = tags[25] + i * 8
        matches = [r for r in relocs if r[0] == va]
        raw, = read('<Q', array_start + i * 8)
        item = {'address': hex(va), 'raw_cell': hex(raw),
                'standard_rela_matches': [
                    {'symbol': r[1], 'type': r[2], 'addend': hex(r[3])} for r in matches]}
        if len(matches) == 1 and matches[0][1:3] == (0, 1027):
            target = matches[0][3]
            if target < 0 or target % 4:
                raise InvalidElf('Initializer is not an aligned ARM64 address')
            prefix_start = file_offset(target, 64)
            if not any(p['flags'] & 1 and p['va'] <= target and target + 64 <= p['va'] + p['filesz']
                       for p in loads):
                raise InvalidElf('Initializer prefix is not file-backed executable data')
            item['conditional_target'] = hex(target)
            item['prefix_hex'] = data[prefix_start:prefix_start + 64].hex()
            item['prefix_words_le'] = [hex(word) for word in read('<16I', prefix_start)]
        array.append(item)
    checkpoint = (12 not in tags and tags[25] == 0x676898 and tags[27] == 8
                  and len(array) == 1 and array[0]['raw_cell'] == '0x0'
                  and array[0]['standard_rela_matches'] == [
                      {'symbol': 0, 'type': 1027, 'addend': '0x60e5e8'}])
    return {'schema': 1, 'mode': 'hash-checked-static-elf-metadata', 'sha256': digest,
            'expected_sha256': expected_sha256.lower(),
            'size_bytes': len(data), 'dt_init_present': 12 in tags,
            'standard_rela_count': len(relocs), 'init_array': array,
            'matches_published_20261116_metadata': checkpoint,
            'scope': 'Conventional DT_RELA metadata only; packed/PLT relocations and runtime writes '
                     'are not evaluated. Conditional target assumes normal relocation and no '
                     'later mutation. No native code, TLS, initializer invocation or gameplay executed.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wrapper', type=Path)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    try:
        result = audit_bytes(args.wrapper.read_bytes(), args.expected_sha256)
        print(json.dumps(result, indent=2))
        return 0 if result['matches_published_20261116_metadata'] else 2
    except (InvalidElf, OSError) as error:
        parser.exit(1, f'Native initializer audit failed: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
