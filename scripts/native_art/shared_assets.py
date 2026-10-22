"""Preserve shipping native texture aliases without accepting a different source crop."""
from dataclasses import dataclass
import hashlib

from PIL import Image


@dataclass(frozen=True)
class SharedTexture:
    path: str
    size: tuple[int, int]
    rgba_sha256: str


_ARCHER_SHADOW = SharedTexture(
    'assets/archer-tower-native/buildings/texture/texture-8.png', (59, 85),
    '0bb66a525f7ce00b2cfe5b52e94c5d180fadd205e27aa150cc5f0b29fbc17b77')
_MORTAR_SHADOW = SharedTexture(
    'assets/buildings/bombtower-native/body/texture-8.png', (64, 110),
    '3ca4c1c3ba2b016c9e872c007fd83ba24e259c719a0abc903b2e54a08515e19d')
_MORTAR_PARTICLES = SharedTexture(
    'assets/buildings/bombtower-native/particles/texture-66.png', (733, 461),
    'cfd2394e9b507f9e86a3e231e32527aade8d25afb5189414ed347c1424fc4a18')

_BUILDER_SHADOW = SharedTexture(
    'assets/buildings/builder-hut-native/texture/texture-8.png', (47, 33),
    '6ec6bcf02e24f3504a54b5eea32ea1fb94e63e6949a4dcdc581f4a7e75b325b1')
_FREEZE_SHADOW = SharedTexture(
    'assets/buildings/freeze-trap-native/texture/texture-18.png', (100, 100),
    '83033ddecd7cb0c8f24f09ccb8976ad857f34cc413cf48186df1137c552ad499')

# These crops were deduplicated in the shipping inventory. A changed crop must not overwrite
# another family's page: both its dimensions and every RGBA byte (including transparency) pin it.
SHARED_TEXTURES = {
    'assets/buildings/xbow-native/texture-8.png': _ARCHER_SHADOW,
    'assets/buildings/cannon-native/texture/texture-8.png': _ARCHER_SHADOW,
    'assets/buildings/air-sweeper-native/texture/texture-8.png': _ARCHER_SHADOW,
    'assets/buildings/wizard-tower-native/body/texture-8.png': _ARCHER_SHADOW,
    'assets/buildings/mortar-native/texture/texture-8.png': _MORTAR_SHADOW,
    'assets/buildings/mortar-native/texture/texture-66.png': _MORTAR_PARTICLES,
    'assets/buildings/monolith-native/texture-8.png': _BUILDER_SHADOW,
    'assets/buildings/spell-tower-native/texture-8.png': _BUILDER_SHADOW,
    'assets/buildings/scattershot-native/texture-8.png': _MORTAR_SHADOW,
    'assets/buildings/seeking-mine-native/world/texture-18.png': _FREEZE_SHADOW,
    'assets/buildings/shrink-trap-native/texture/texture-18.png': _FREEZE_SHADOW,
    'assets/buildings/tornado-trap-native/texture/texture-18.png': _FREEZE_SHADOW,
}


def _matches(image, shared):
    return (isinstance(image, Image.Image) and image.mode == 'RGBA'
            and image.size == shared.size
            and hashlib.sha256(image.tobytes()).hexdigest() == shared.rgba_sha256)


def redirect_shared_textures(outputs, references, aliases=SHARED_TEXTURES):
    """Validate all aliases before changing output keys and nested reference path values."""
    replacements = {}
    for path, shared in aliases.items():
        if path not in outputs:
            continue
        if not _matches(outputs[path], shared):
            raise ValueError(f'Shared texture pixels differ: {path}')
        if shared.path in outputs and not _matches(outputs[shared.path], shared):
            raise ValueError(f'Shared texture target differs: {shared.path}')
        replacements[path] = shared.path
    for path, target in replacements.items():
        outputs[target] = outputs.pop(path)

    def rewrite(value):
        if isinstance(value, str):
            return replacements.get(value, value)
        if isinstance(value, dict):
            for key, child in value.items():
                value[key] = rewrite(child)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                value[index] = rewrite(child)
        return value

    rewrite(references)


def owned_asset_paths(outputs, prefix):
    """Shared pages are checked as outputs, but live outside the importing family's directory."""
    return {path for path in outputs if path.startswith(prefix.rstrip('/') + '/')}
