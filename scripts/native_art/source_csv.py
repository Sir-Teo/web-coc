"""Read pinned client CSV tables without conflating levels and animation events."""
import csv
import io
import lzma

from .sc6 import require


def decoded_rows(blob):
    if blob.startswith(b'Sig:'):
        blob = blob[68:]
    if not blob.startswith(b'"'):
        blob = lzma.decompress(blob[:9] + b'\0' * 4 + blob[9:])
    return list(csv.reader(io.StringIO(blob.decode('utf-8-sig'))))


def records(rows):
    """Keep nonempty fields and ordered continuation rows, without inheritance."""
    require(len(rows) >= 2 and rows[0][0] == 'Name', 'Missing table header')
    headers = rows[0]
    require(all(headers) and len(set(headers)) == len(headers), 'Invalid table columns')
    require(len(rows[1]) == len(headers), 'Invalid table type row')
    result, name = {}, None
    for row in rows[2:]:
        require(len(row) == len(headers), 'Malformed source row')
        if not any(row):
            continue
        if row[0]:
            name = row[0]
            require(name not in result, 'Duplicate source record')
            result[name] = []
        require(name is not None, 'Orphan continuation row')
        result[name].append({k: v for k, v in zip(headers, row) if v})
    return result


def animation_blocks(rows):
    """Each animation has its own header and type rows, starting in column one.

    Empty event names represent additional variants, not character levels. Keep
    every cell (including an empty SWF) so asset resolution remains explicit.
    """
    result, name, headers, types, values = {}, None, None, None, []

    def finish():
        if name is not None:
            require(headers and types and values, 'Incomplete animation block')
            result[name] = dict(columns=headers, types=types, rows=values)

    for row in rows:
        if not any(row):
            continue
        if row[0]:
            finish()
            name = row[0]
            require(name not in result and not any(row[1:]), 'Invalid animation block name')
            headers, types, values = None, None, []
            continue
        require(name is not None, 'Orphan animation row')
        cells = row[1:]
        if headers is None:
            while cells and cells[-1] == '':
                cells.pop()
            require(cells and cells[0] == 'Name' and all(cells) and len(set(cells)) == len(cells),
                    'Invalid animation columns')
            headers = cells
            continue
        require(len(cells) >= len(headers) and not any(cells[len(headers):]),
                'Animation row exceeds its block columns')
        cells = cells[:len(headers)]
        if types is None:
            require(all(cells), 'Missing animation column type')
            types = cells
        else:
            require(values or cells[0], 'Orphan animation event variant')
            values.append(dict(zip(headers, cells)))
    finish()
    return result


def inherited_levels(rows):
    """Explicit level-table inheritance. Never use this on NPC/event row lists."""
    inherited, result = {}, []
    for row in rows:
        inherited.update(row)
        result.append(inherited.copy())
    return result
