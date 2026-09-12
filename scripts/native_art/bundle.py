"""Pinned public client inputs shared by native trap importers."""
import hashlib
from pathlib import Path
import subprocess
from .sc6 import require

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3'
BASE = f'https://game-assets.clashofclans.com/{BUNDLE}/'
SOURCES = {
    'sc/buildings.sc': 'f73ec949fc070bc03175d6bb3af8b62d8f607094bf2b343c9846a499a35be0ed',
    'sc/buildings_66.sctx': 'c65a2f6e362edfd51d5fc634d5a6c30ec353bd936fa06fa8775b856aeb7baff0',
    'logic/traps.csv': '757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(path, pins=SOURCES):
    require(path in pins, 'Unpinned source requested')
    target = ROOT / 'output/native-campaign-source' / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '2',
                        BASE + path, '-o', str(temporary)], check=True)
        require(digest(temporary.read_bytes()) == pins[path], f'Source checksum differs: {path}')
        temporary.replace(target)
    data = target.read_bytes()
    require(digest(data) == pins[path], f'Source checksum differs: {path}')
    return data
