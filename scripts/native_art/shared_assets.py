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
    'assets/dark-drill-native/texture/texture-8.png': _ARCHER_SHADOW,
    'assets/inferno-native/texture/texture-8.png': _BUILDER_SHADOW,
    'assets/inferno-multiply-native/texture/texture-8.png': _BUILDER_SHADOW,
    'assets/dark-drill-native/texture/texture-25.png': SharedTexture(
        'assets/buildings/mortar-native/texture/texture-25.png', (256, 192),
        'c4bd3a9dff02a5fcdf36cbc1b8608e4c7a234d57f87c61101ba016a6648425b9'),
    'assets/dark-drill-native/texture/texture-39.png': SharedTexture(
        'assets/buildings/air-sweeper-native/texture/texture-39.png', (64, 560),
        '9aa66ab9bb45fc624f63df72db7b995358ceed2b79cc0129b41efb5eb687d36a'),
    'assets/characters-native/pekka/pekka8/texture/texture-0.png': SharedTexture(
        'assets/characters-native/pekka/momma/texture/texture-0.png', (1024, 1087),
        '0a25ff366aff5070317aeca0797f1d49c5e2f1a9afa25f6cd0a8a4424fe2bff8'),
    'assets/garrison-native/dragon7/texture/texture-0.png': SharedTexture(
        'assets/characters-native/dragon/golden-dragon/texture/texture-0.png', (2030, 2748),
        '1964189f257c421168295fe90f6f8defc484163a2c8d18fdb988072e69a783ab'),
    'assets/dark-drill-native/portrait/1.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-1.png', (109, 119),
        'c04e8def6de79ff1e256ffba3a615c0bcd01691f6bc892756a7ca6b825232417'),
    'assets/dark-drill-native/portrait/2.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-2.png', (108, 121),
        'f550f4380ad74f9d5d6c1302a277848ab6943aa6ffc7ec9371864055e6081fbf'),
    'assets/dark-drill-native/portrait/3.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-3.png', (107, 120),
        'd38fc24852e8613cffe857ddb4fab971d031a4f019daa4dda0e66199617f15a0'),
    'assets/dark-drill-native/portrait/4.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-4.png', (109, 120),
        'f20b7e226727616a64c8ff84cd70df234560549285e415497cd08b0ee65ec131'),
    'assets/dark-drill-native/portrait/5.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-5.png', (124, 138),
        'a0217d994f521a41d75bac911a98e62ebef992213ac93bd1650afcda0cef6d6f'),
    'assets/dark-drill-native/portrait/6.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-6.png', (125, 139),
        'f2811aec1b87551172767ca469395dd08598ae99d376eb906f05a6e1dd96da74'),
    'assets/dark-drill-native/portrait/7.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-7.png', (121, 137),
        '9f1b8a2664dd85f9315a7b8a1340194874d1cda3b8c1e291cc69efe9c6736da2'),
    'assets/dark-drill-native/portrait/8.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-8.png', (117, 136),
        '1d81349cddc7ced0a0fea739a780d9f86f90a9a1998163f8be1c143e610fbf02'),
    'assets/dark-drill-native/portrait/9.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-9.png', (117, 139),
        '41db23f0ffd514c6f481de87eaa874687bfba20577abd3b2391c229f043fd5ca'),
    'assets/dark-drill-native/portrait/10.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-10.png', (113, 131),
        'e5d8cdff3c708d7754a8e7ddf3145ce759160826fc06ec40b74c5f51d66479e5'),
    'assets/dark-drill-native/portrait/11.png': SharedTexture(
        'assets/catalog-native/dark-elixir-drill/level-11.png', (113, 131),
        'ea688745a7c96b1257acf6d758231ef74d04965c1200fda842d38e182eaa451b'),
    'assets/inferno-native/portrait/1-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-1.png', (92, 160),
        'a8aff05376d32a06f1b5cbcff07dd069bdf720c78a24e582e54701f8d1dec7ca'),
    'assets/inferno-native/portrait/2-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-2.png', (91, 142),
        '40565e3da0b5148374bb0bc2fbf91cd6fb8ebb27d05d8fab706ea447d82b2b7b'),
    'assets/inferno-native/portrait/3-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-3.png', (94, 142),
        'd8ddca6b18bc6dd3b6972fda18d0fa1f12b677a86678df716e5dc51416fbf849'),
    'assets/inferno-native/portrait/4-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-4.png', (105, 150),
        'c4e9c5d8c734375f350c6f11fd0ed9b863f3815b5652c47afc96f412688852fe'),
    'assets/inferno-native/portrait/5-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-5.png', (114, 156),
        'e877dd7cdf900250faae2f634035f435cb34bfae3d113199dd010ce927552174'),
    'assets/inferno-native/portrait/6-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-6.png', (99, 149),
        '1893da71c3ff55d7dcc9d9953ff8f82ca28c366df5ef63ed04265e4524ed755e'),
    'assets/inferno-native/portrait/7-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-7.png', (105, 152),
        '83130178281d5df2402248272ab0e3aa8dd342b8d6f65d149d7b1389e1013c6b'),
    'assets/inferno-native/portrait/8-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-8.png', (124, 166),
        'df24e9ee8944be4f351af50115e41d4d37b58f066b769432d649699037a92b94'),
    'assets/inferno-native/portrait/9-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-9.png', (107, 149),
        'a382f31d091518beff01acbc49ba3da2c37c18efa57d0f7c78dd184757d05520'),
    'assets/inferno-native/portrait/10-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-10.png', (95, 150),
        '4eaeedeca16a509da430b34c7361575f4944915fae668f70846eeeef97fd22ad'),
    'assets/inferno-native/portrait/11-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-11.png', (97, 150),
        '51a30b80a66fe11cb69b35e2a95182e3cabb77bcdb72488ab9427ce065d379c1'),
    'assets/inferno-native/portrait/12-single.png': SharedTexture(
        'assets/catalog-native/inferno-tower/level-12.png', (173, 178),
        'a6167d61910801b763ce8dcca1f8ad21f8f54d55663cb804165df18c04830812'),
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
