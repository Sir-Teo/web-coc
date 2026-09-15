#!/usr/bin/env python3
"""Acquire the complete pinned client art/audio and its data definitions; never ship this archive."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import shutil
import time
import subprocess
from pathlib import Path
from native_art.bundle import ROOT, BUNDLE, BASE, digest, source
from native_art.sc6 import require

VERSION = '18.400.21'
DEST = ROOT / f'art/source/native-client-{VERSION}'
FINGERPRINT_SHA256 = 'ecb5b05d632831cd706e4e993158b63635445257ad254bec97c371b078e3044b'


def inventory():
    raw = source('fingerprint.json', {'fingerprint.json': FINGERPRINT_SHA256})
    fp = json.loads(raw)
    require(fp['sha'] == BUNDLE and fp['version'] == VERSION, 'Client identity differs')
    return raw, fp['files']


def fetch(row, check):
    relative = Path(row['file'])
    require(not relative.is_absolute() and '..' not in relative.parts, 'Unsafe bundle path')
    target = DEST / 'files' / relative
    cached = ROOT / 'output/native-campaign-source' / relative
    if not target.exists():
        require(not check, f'Missing source: {relative}')
        target.parent.mkdir(parents=True, exist_ok=True)
        if cached.exists() and hashlib.sha1(cached.read_bytes()).hexdigest() == row['sha']:
            shutil.copyfile(cached, target)
        else:
            for attempt in range(4):
                try:
                    data = subprocess.run(['curl', '--fail', '--silent', '--show-error',
                                           '--max-time', '90', BASE + relative.as_posix()],
                                          check=True, capture_output=True).stdout
                    require(hashlib.sha1(data).hexdigest() == row['sha'], f'Fingerprint mismatch: {relative}')
                    temporary = target.with_suffix(target.suffix + '.part')
                    temporary.write_bytes(data)
                    temporary.replace(target)
                    break
                except Exception:
                    if attempt == 3: raise
                    time.sleep(attempt + 1)
    data = target.read_bytes()
    require(hashlib.sha1(data).hexdigest() == row['sha'], f'Fingerprint mismatch: {relative}')
    return dict(path=relative.as_posix(), bytes=len(data), sha1=row['sha'], sha256=digest(data))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check', action='store_true')
    p.add_argument('--workers', type=int, default=24)
    args = p.parse_args()
    raw, rows = inventory()
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(fetch, row, args.check): row for row in rows}
        for future in as_completed(pending):
            try: results.append(future.result())
            except Exception as exc: errors.append(dict(path=pending[future]['file'], error=str(exc)))
            done = len(results) + len(errors)
            if done % 200 == 0 or done == len(rows):
                print(f'{done}/{len(rows)} files; {len(errors)} errors; {sum(r["bytes"] for r in results)/1024**2:.1f} MiB verified', flush=True)
    metadata = dict(clientVersion=VERSION, bundle=BUNDLE, baseUrl=BASE,
                    fingerprintSha256=FINGERPRINT_SHA256, archive=str(DEST.relative_to(ROOT)),
                    scope='Every file in the pinned official client fingerprint, a superset of Home Village TH8–18. Original formats are not all browser-ready.',
                    files=sorted(results, key=lambda r:r['path']), errors=sorted(errors,key=lambda r:r['path']))
    path = ROOT / 'reference/full-client/manifest.json'
    serialized = json.dumps(metadata, indent=2) + '\n'
    if args.check:
        require(path.read_text() == serialized, 'Archive manifest differs')
    else:
        DEST.mkdir(parents=True, exist_ok=True)
        (DEST/'fingerprint.json').write_bytes(raw)
        path.write_text(serialized)
    require(not errors, f'{len(errors)} source downloads failed; rerun to resume')
    print(f'Verified {len(results)} original files ({sum(r["bytes"] for r in results):,} bytes)', flush=True)

if __name__ == '__main__': main()
