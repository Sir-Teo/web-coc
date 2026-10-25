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
    'assets/garrison-native/dragon7/texture/texture-0-compact-v1.png': SharedTexture(
        'assets/characters-native/dragon/golden-dragon/texture/texture-0-compact-v1.png', (992, 4021),
        '757a20fd505440b401eb7ba3997e96c978d4137a63a008b6376e659cb8c4956b'),
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
    'assets/village-native/airdefense/buildings/texture-2.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-2.png', (128, 97),
        '3c272231b0bd802ba75e2882042e4f91e2230815137b773171c4abfacc668859'),
    'assets/village-native/airdefense/buildings/texture-25.png': SharedTexture(
        'assets/buildings/tesla-native/texture-25.png', (256, 189),
        '4e26718cfd6d8b41d70f6e51cad62ab10751fc117b75a6ac63ea4a65d3ce508e'),
    'assets/village-native/airdefense/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/barracks/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/blacksmith/buildings/texture-25.png': SharedTexture(
        'assets/buildings/scattershot-native/texture-25.png', (256, 407),
        'f5305428e7b770dea164c4fe95afba81bf22f59f66222a22e151803c1c283faf'),
    'assets/village-native/blacksmith/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/builder/buildings/texture-25.png': SharedTexture(
        'assets/buildings/builder-hut-native/texture/texture-25.png', (256, 415),
        'e08e79a876b4c1559cd3b155f846bd3406a7f1608840d07eac90bd6525bcb927'),
    'assets/village-native/builder/buildings/texture-8.png': _BUILDER_SHADOW,
    'assets/village-native/darkbarracks/buildings/texture-25.png': SharedTexture(
        'assets/village-native/barracks/buildings/texture-25.png', (256, 384),
        '0a4fa342cadf3562c74cbd47a1eae9a18d1785b62cf183bb1f90059e167f9bb3'),
    'assets/village-native/darkbarracks/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/eagle/building_bases/texture-0.png': SharedTexture(
        'assets/buildings/eagle-artillery-native/base/texture-0.png', (58, 85),
        '5287a992727b56266f144fe455784dd58d9bd6cb363271d6a998f5a14b8e62c6'),
    'assets/village-native/eagle/buildings/texture-2.png': SharedTexture(
        'assets/buildings/eagle-artillery-native/texture-2.png', (2, 2),
        'a19d56e2cd0a4873180b81641f7278b3db727f3c42ae918364b1c8c0794224aa'),
    'assets/village-native/eagle/buildings/texture-25.png': SharedTexture(
        'assets/buildings/eagle-artillery-native/texture-25.png', (256, 283),
        'd412ea104111efb3ed8a01c9a622da15f95ff7e8a6f9e3515fb7c0c00c91fedc'),
    'assets/village-native/elixirstorage/buildings/texture-2.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-2.png', (128, 97),
        '3c272231b0bd802ba75e2882042e4f91e2230815137b773171c4abfacc668859'),
    'assets/village-native/elixirstorage/buildings/texture-41.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-41.png', (128, 98),
        '169d0551b6915493c2cb3c12aade750204fee92ac9d34fb9b30fa221ffa1d960'),
    'assets/village-native/firespitter/buildings/texture-2.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-2.png', (128, 97),
        '3c272231b0bd802ba75e2882042e4f91e2230815137b773171c4abfacc668859'),
    'assets/village-native/firespitter/buildings/texture-8.png': SharedTexture(
        'assets/village-native/darkspellfactory/buildings/texture-8.png', (87, 128),
        '04586f06b78cf38f2fbe40e98bb1081787feea022662e64554df8d7218a358a7'),
    'assets/village-native/goldmine/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/goldstorage/buildings/texture-2.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-2.png', (128, 97),
        '3c272231b0bd802ba75e2882042e4f91e2230815137b773171c4abfacc668859'),
    'assets/village-native/goldstorage/buildings/texture-8.png': SharedTexture(
        'assets/village-native/darkspellfactory/buildings/texture-8.png', (87, 128),
        '04586f06b78cf38f2fbe40e98bb1081787feea022662e64554df8d7218a358a7'),
    'assets/village-native/herohall/buildings/texture-8.png': SharedTexture(
        'assets/village-native/darkspellfactory/buildings/texture-8.png', (87, 128),
        '04586f06b78cf38f2fbe40e98bb1081787feea022662e64554df8d7218a358a7'),
    'assets/village-native/laboratory/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/monolith/buildings/texture-18.png': SharedTexture(
        'assets/buildings/monolith-native/texture-18.png', (512, 138),
        '5f097f6f33eae9375c2a9552cad08ab2fa4c5df5b2562c18f720d15e35e20ee2'),
    'assets/village-native/monolith/buildings/texture-25.png': SharedTexture(
        'assets/buildings/monolith-native/texture-25.png', (256, 407),
        '0fa14e664545be421443b0e5958f4655dca0785a7c0e7eac3e9b57fbbdafa24f'),
    'assets/village-native/monolith/buildings/texture-35.png': SharedTexture(
        'assets/buildings/monolith-native/texture-35.png', (752, 1530),
        'fbaf841e7d36edccebeff523a6fce95e93e7d6194eb0c2ac1e53497d22fff6b9'),
    'assets/village-native/monolith/buildings/texture-8.png': _BUILDER_SHADOW,
    'assets/village-native/multiarchertower/buildings/texture-8.png': SharedTexture(
        'assets/village-native/darkspellfactory/buildings/texture-8.png', (87, 128),
        '04586f06b78cf38f2fbe40e98bb1081787feea022662e64554df8d7218a358a7'),
    'assets/village-native/multigeartower/buildings/texture-25.png': SharedTexture(
        'assets/buildings/mortar-native/texture/texture-25.png', (256, 192),
        'c4bd3a9dff02a5fcdf36cbc1b8608e4c7a234d57f87c61101ba016a6648425b9'),
    'assets/village-native/multigeartower/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/pethouse/buildings/texture-25.png': SharedTexture(
        'assets/buildings/scattershot-native/texture-25.png', (256, 407),
        'f5305428e7b770dea164c4fe95afba81bf22f59f66222a22e151803c1c283faf'),
    'assets/village-native/pethouse/buildings/texture-29.png': SharedTexture(
        'assets/village-native/eagle/buildings/texture-29.png', (512, 177),
        'efdc2890e157900c12843352f8787cd3761c934b204a928e142d4cfb2de7ecd8'),
    'assets/village-native/revengetower/buildings/texture-18.png': SharedTexture(
        'assets/village-native/airdefense/buildings/texture-18.png', (256, 263),
        '20dff7fd0edbe60560e49332d6cfb7c3e692159b85945a73fc1ef90dbc357e1d'),
    'assets/village-native/revengetower/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/ricochetcannon/buildings/texture-25.png': SharedTexture(
        'assets/village-native/revengetower/buildings/texture-25.png', (256, 192),
        '4c486b256a345919b83d30a020e62f826faa172bcd04670411c6fcb54770a574'),
    'assets/village-native/ricochetcannon/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/scattershot/buildings/texture-18.png': SharedTexture(
        'assets/village-native/firespitter/buildings/texture-18.png', (256, 271),
        'a5681dc9d7db3dd61782656df64701eb76fac234290d7a87556c734841c1edff'),
    'assets/village-native/scattershot/buildings/texture-2.png': SharedTexture(
        'assets/buildings/cannon-native/texture/texture-2.png', (128, 97),
        '3c272231b0bd802ba75e2882042e4f91e2230815137b773171c4abfacc668859'),
    'assets/village-native/scattershot/buildings/texture-25.png': SharedTexture(
        'assets/buildings/scattershot-native/texture-25.png', (256, 407),
        'f5305428e7b770dea164c4fe95afba81bf22f59f66222a22e151803c1c283faf'),
    'assets/village-native/scattershot/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/spellfactory/buildings/texture-8.png': _ARCHER_SHADOW,
    'assets/village-native/spelltower/buildings/texture-1.png': SharedTexture(
        'assets/buildings/spell-tower-native/texture-1.png', (128, 97),
        'd973be5d59af78a36b984af7b5e4d1d861e833c211cd366d34ac71e5975d3c90'),
    'assets/village-native/spelltower/buildings/texture-17.png': SharedTexture(
        'assets/buildings/spell-tower-native/texture-17.png', (512, 812),
        'b479d205ee8e6bd3866e990c66582778f012500bf28b29050ba28db4af087ba1'),
    'assets/village-native/spelltower/buildings/texture-25.png': SharedTexture(
        'assets/buildings/spell-tower-native/texture-25.png', (512, 261),
        '94b881acf418fbbd96fbca2ab2631b68b8648b0757e639099736260ec21ec63b'),
    'assets/village-native/spelltower/buildings/texture-8.png': _BUILDER_SHADOW,
    'assets/village-native/superwizardtower/buildings/texture-25.png': SharedTexture(
        'assets/village-native/revengetower/buildings/texture-25.png', (256, 192),
        '4c486b256a345919b83d30a020e62f826faa172bcd04670411c6fcb54770a574'),
    'assets/village-native/tornadotrap/buildings/texture-66.png': SharedTexture(
        'assets/buildings/tornado-trap-native/texture/texture-66.png', (256, 1363),
        'e02c74e92ed1a3aa5e8b1186f3601902bc0950c15294437432a9d72055c8d3f6'),
    'assets/village-native/wall/buildings/texture-2.png': SharedTexture(
        'assets/buildings/air-sweeper-native/texture/texture-2.png', (2, 2),
        '5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b'),
}


# Pack aliases share one pixel pin per canonical page. Owned-pack checks still inspect
# every redirected page, while pack membership and byte counts include owned files only.
_PACK_TEXTURE_ALIASES = {
    SharedTexture(
        'assets/buildings/air-sweeper-native/texture/texture-2.png', (2, 2),
        '5ac6a5945f16500911219129984ba8b387a06f24fe383ce4e81a73294065461b'): (
        'assets/projectiles-native/healerenergy/buildings/texture-2.png',
    ),
    SharedTexture(
        'assets/buildings/bombtower-native/particles/texture-30.png', (69, 191),
        '579c387b90dc95cf083546523e30a00d2fb2691f1a524f434d597b6a830fbf17'): (
        'assets/effects-native/super-bomb/buildings/texture-30.png',
    ),
    SharedTexture(
        'assets/buildings/freeze-trap-native/texture/texture-18.png', (100, 100),
        '83033ddecd7cb0c8f24f09ccb8976ad857f34cc413cf48186df1137c552ad499'): (
        'assets/effects-native/shrink-trap-appear/buildings/texture-18.png',
    ),
    SharedTexture(
        'assets/buildings/late-goblin-native/characters/texture/texture-7.png', (64, 21),
        '96dc5974d97bb90b4247037ac8bc72693cbcdef2f8711ee551174f5dd5527acd'): (
        'assets/projectiles-native/arrow-small/characters/texture-7.png',
    ),
    SharedTexture(
        'assets/buildings/late-goblin-native/texture/texture-5.png', (64, 29),
        '001e59691fa2819d8abf487b30182d1ca32ef3efd046853b80e715e0f8474b8e'): (
        'assets/projectiles-native/bomb-tower-ammo1/buildings/texture-5.png',
    ),
    SharedTexture(
        'assets/buildings/seeking-mine-native/world/texture-8.png', (26, 21),
        'c432716ab7915b0a2c540991ece8bf4697ddcdeb4cc885bab25b6ae8102365dd'): (
        'assets/projectiles-native/airtrapballoon-lvl11/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon-lvl13/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon-lvl3/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon-lvl5/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon-lvl6/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon-lvl8/buildings/texture-8.png',
        'assets/projectiles-native/airtrapballoon/buildings/texture-8.png',
        'assets/projectiles-native/amazonqueen-javelin/buildings/texture-8.png',
        'assets/projectiles-native/amazonqueen-shield/buildings/texture-8.png',
        'assets/projectiles-native/bomb-tower-ammo1/buildings/texture-8.png',
        'assets/projectiles-native/bomb-tower-ammo2/buildings/texture-8.png',
        'assets/projectiles-native/bomb-tower-ammo3/buildings/texture-8.png',
        'assets/projectiles-native/commandtower-barrel1/buildings/texture-8.png',
        'assets/projectiles-native/firecatapultprojectile1/buildings/texture-8.png',
        'assets/projectiles-native/largedarkelixirballoon-lvl3/buildings/texture-8.png',
        'assets/projectiles-native/largedarkelixirballoon-lvl5/buildings/texture-8.png',
        'assets/projectiles-native/largedarkelixirballoon-lvl7/buildings/texture-8.png',
        'assets/projectiles-native/largedarkelixirballoon/buildings/texture-8.png',
        'assets/projectiles-native/minionheroattackprojectile/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo-lvl16/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo-lvl17/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo-lvl18/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo1/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo10/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo11/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo2/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo3/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo4/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo5/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo6/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo8/buildings/texture-8.png',
        'assets/projectiles-native/mortar-ammo9/buildings/texture-8.png',
        'assets/projectiles-native/phoenixprojectile/buildings/texture-8.png',
        'assets/projectiles-native/phoenixresurrect/buildings/texture-8.png',
        'assets/projectiles-native/rocketspearprojectile/buildings/texture-8.png',
        'assets/projectiles-native/scattershot-projectile-1/buildings/texture-8.png',
        'assets/projectiles-native/scattershot-projectile-2/buildings/texture-8.png',
        'assets/projectiles-native/scattershot-projectile-5/buildings/texture-8.png',
        'assets/projectiles-native/scattershot-projectile-6/buildings/texture-8.png',
        'assets/projectiles-native/scattershot-projectile-7/buildings/texture-8.png',
        'assets/projectiles-native/th17cannonprojectile/buildings/texture-8.png',
        'assets/projectiles-native/throwerprojectile1/buildings/texture-8.png',
        'assets/projectiles-native/throwerprojectile2/buildings/texture-8.png',
        'assets/projectiles-native/throwerprojectile3/buildings/texture-8.png',
        'assets/projectiles-native/throwerprojectile4/buildings/texture-8.png',
        'assets/projectiles-native/turbostartprojectile/buildings/texture-8.png',
    ),
    SharedTexture(
        'assets/buildings/tornado-trap-native/texture/texture-39.png', (64, 61),
        '165ac1adc4958896ba9683a6ba4dafe83540a84831b948c7a33937d90671bd6b'): (
        'assets/effects-native/shrink-trap-appear/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/buildings/tornado-trap-native/vfx-texture/texture-0.png', (1024, 512),
        'b12e730293dfbe02f6d3306ff8fdc1e39eb80046f11667e74ef95de677e6e934'): (
        'assets/effects-native/ps-trap-tornadotrap/vfx_env/texture-0.png',
    ),
    SharedTexture(
        'assets/characters-native/lava_hound/tinybaby-lvl1/texture/texture-1.png', (222, 256),
        '91e8e7cca39a88d82616cd8ffec511b11e0eeda9c4e123b7f3f1a6470df38416'): (
        'assets/troops-native/lavapup/chr_lava_hound/texture-1.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/bowler/texture/texture-6.png', (512, 534),
        'ce5ac2c18e55449c07da8daf6bec15db087e7fd496bcdf5af695bcdaaa0cf876'): (
        'assets/projectiles-native/trollboulder-lvl2/buildings/texture-6.png',
        'assets/projectiles-native/trollboulder-lvl3/buildings/texture-6.png',
        'assets/projectiles-native/trollboulder-lvl5/buildings/texture-6.png',
        'assets/projectiles-native/trollboulder-lvl6/buildings/texture-6.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/buildings/texture/texture-39.png', (64, 168),
        '35e12cc85ce08338cc80c3268d4677cd6fe2171bbfe7b276f549ef24f101f31b'): (
        'assets/projectiles-native/babydragon-projectile-lvl10/buildings/texture-39.png',
        'assets/projectiles-native/babydragon-projectile-lvl3/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/characters/texture/texture-7.png', (64, 132),
        '8ede6c1e3e69c7b2a381af501c8bc54cb200b9e403a51925df160b7618cb9f8a'): (
        'assets/projectiles-native/arrow-small-darkelixirfire2/characters/texture-7.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/chr-headhunter/texture/texture-0.png', (64, 69),
        '6a7078398ac4141797fb00088d2a31f5ad3d6212a9caf2aabd49c46ecdee093d'): (
        'assets/projectiles-native/headhunter-card-lvl1/chr_headhunter/texture-0.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/lava-hound/texture/texture-7.png', (64, 16),
        '2187a936c474fe19b2163265bf032d7687702764361ffd1e6373009c944b7989'): (
        'assets/projectiles-native/hound-projectile/characters/texture-7.png',
        'assets/projectiles-native/icy-tinyhound-projectile/characters/texture-7.png',
        'assets/projectiles-native/tinyhound-projectile/characters/texture-7.png',
    ),
    SharedTexture(
        'assets/characters-native/projectiles/witch/texture/texture-39.png', (64, 90),
        'f7b04edef1b6255c1d6be9e78f414dee5024c9554dbd7a5e5e2aeee56cda5d71'): (
        'assets/projectiles-native/witch-projectile/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/characters-native/skeleton/skeleton/texture/texture-1.png', (256, 433),
        '6571936cb1ec6fa0e1ace694d15118b340ceaa18b8a5b4d07f5a352b09e57e9c'): (
        'assets/troops-native/skeleton/chr_skeleton/texture-1.png',
        'assets/troops-native/trapskeleton/chr_skeleton/texture-1.png',
    ),
    SharedTexture(
        'assets/characters-native/super_minion/superminion/texture/texture-0.png', (508, 764),
        'bcd024f895f9440deff7aa4425a0b1d8f80c3d2cfe64b537caa88cd39e5dd20a'): (
        'assets/troops-native/superminion/chr_super_minion/texture-0.png',
    ),
    SharedTexture(
        'assets/characters-native/worker/defending-builder/texture/texture-0.png', (512, 513),
        'a9a860623ec586f6264a5662b33770c78001076ce2e7cf2ff5b73d5a80d677d8'): (
        'assets/troops-native/defendingbuilder/chr_worker/texture-0.png',
    ),
    SharedTexture(
        'assets/effects-native/emitter-apprentice-warden-projectile1-trail/buildings/texture-39.png', (25, 25),
        'bf56b4eaafa43b1606aacd2a2ca77132af47a91bfb199d040454adc3508202f8'): (
        'assets/effects-native/emitter-apprentice-warden-projectile2-trail/buildings/texture-39.png',
        'assets/effects-native/emitter-spark-trail-blue/buildings/texture-39.png',
        'assets/effects-native/emitter-spark-trail-jungle/buildings/texture-39.png',
        'assets/effects-native/emitter-spark-trail-yellow/buildings/texture-39.png',
        'assets/effects-native/emitter-super-minion-missile-traile-emitter/buildings/texture-39.png',
        'assets/projectiles-native/superdragonprojectile/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/emitter-healer-projectile-trail/buildings/texture-39.png', (22, 2),
        'c9d4ce26c7443abee1a415dd7e39e4bb84ce403e60ab79dd79828a6f4131d72d'): (
        'assets/effects-native/emitter-unicorn-projectile-trail/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/emitter-super-dragon-trail/buildings/texture-39.png', (256, 159),
        '9d2301c4bea738bad47ef1ef04a6df8a30de129f4a5bc70ec6794f312e9c534f'): (
        'assets/effects-native/th16-attack-fx/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/emitter-trollboulder-dust-emitter-lvl1/buildings/texture-6.png', (32, 31),
        '69a0f77248cee741ba5563f322f2522e855fd063b6f2a02f844ffe56e1a55ba7'): (
        'assets/effects-native/emitter-trollboulder-dust-emitter-lvl2/buildings/texture-6.png',
    ),
    SharedTexture(
        'assets/effects-native/hero-equip-aq-giant-arrow-trail/buildings/texture-39.png', (64, 47),
        '716851bd760e1cbbd96a7b9745a37f8e73ec9af4a3c247f891692bc748889eed'): (
        'assets/effects-native/monolithprojectiltrailmineffect/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/merge-cat-cannon-attack/buildings/texture-39.png', (256, 260),
        '9d9b6ff6a33801b86a644eae0cb0e913f329b4eb86f1dfad592a3b5711f89dc9'): (
        'assets/effects-native/th17-attack/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/merged-cannon-projectile-destroyed-lvl4/buildings/texture-39.png', (256, 496),
        'b81892c6d8e9b17005ba2885813f724390693f47eb4562d6c7a4637fc8e1ca64'): (
        'assets/effects-native/merged-cannon-projectile-destroyed/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/phoenix-resurrect/buildings/texture-36.png', (25, 24),
        'eaefbed6fb889debd59828d5dab15df04db119376a5ef57dc909482b30c23097'): (
        'assets/projectiles-native/phoenixprojectile/buildings/texture-36.png',
        'assets/projectiles-native/phoenixresurrect/buildings/texture-36.png',
    ),
    SharedTexture(
        'assets/effects-native/ps-chr-gw-fireballl-impact-lvl1/vfx_character/texture-3.png', (512, 186),
        'fdbf65edd78daf746c467138360914bffba0f1bb438c5b053c551a1a37a2c04a'): (
        'assets/effects-native/ps-chr-gw-fireballl-impact-lvl3/vfx_character/texture-3.png',
    ),
    SharedTexture(
        'assets/effects-native/ps-chr-superwizard-atkchain-01/buildings/texture-39.png', (512, 500),
        '879663feab1bb91023e903cdd6ccf890b562fb78b8632da3750a3cf797ac037f'): (
        'assets/effects-native/ps-chr-superwizard-attack-01/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/effects-native/th13-attack-2/buildings/texture-39.png', (256, 349),
        'b8d9375932bd476cce0d28ae2a65ca670f01e6cc370f3e4bda29f1f5bae5d23d'): (
        'assets/effects-native/th14-attack-1/buildings/texture-39.png',
        'assets/effects-native/th15-attack-1/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/garrison-death-native/texture/texture-2.png', (128, 43),
        '7a86657cc27cb68e70c727b9bb5398c2eaf14e705286d1c5d37c46e2eda4fbc7'): (
        'assets/troops-native/apprenticewarden/characters/texture-2.png',
        'assets/troops-native/archer/characters/texture-2.png',
        'assets/troops-native/babydragon/characters/texture-2.png',
        'assets/troops-native/bear/characters/texture-2.png',
        'assets/troops-native/bigboy/characters/texture-2.png',
        'assets/troops-native/bowler/characters/texture-2.png',
        'assets/troops-native/dragon/characters/texture-2.png',
        'assets/troops-native/druid/characters/texture-2.png',
        'assets/troops-native/electrotitan/characters/texture-2.png',
        'assets/troops-native/furnace/characters/texture-2.png',
        'assets/troops-native/giant/characters/texture-2.png',
        'assets/troops-native/goblin/characters/texture-2.png',
        'assets/troops-native/golem/characters/texture-2.png',
        'assets/troops-native/golemite/characters/texture-2.png',
        'assets/troops-native/gwlavaloonpup/characters/texture-2.png',
        'assets/troops-native/headhunter/characters/texture-2.png',
        'assets/troops-native/healer/characters/texture-2.png',
        'assets/troops-native/henchman/characters/texture-2.png',
        'assets/troops-native/hogrider/characters/texture-2.png',
        'assets/troops-native/icegolem/characters/texture-2.png',
        'assets/troops-native/icehound/characters/texture-2.png',
        'assets/troops-native/icehoundpup/characters/texture-2.png',
        'assets/troops-native/infernodragon/characters/texture-2.png',
        'assets/troops-native/lavahound/characters/texture-2.png',
        'assets/troops-native/lavapup/characters/texture-2.png',
        'assets/troops-native/meteorgolem/characters/texture-2.png',
        'assets/troops-native/meteormite/characters/texture-2.png',
        'assets/troops-native/miner/characters/texture-2.png',
        'assets/troops-native/minion/characters/texture-2.png',
        'assets/troops-native/pekka/characters/texture-2.png',
        'assets/troops-native/rootrider/characters/texture-2.png',
        'assets/troops-native/ruinknight/characters/texture-2.png',
        'assets/troops-native/ruinwitch/characters/texture-2.png',
        'assets/troops-native/skeleton/characters/texture-2.png',
        'assets/troops-native/snake/characters/texture-2.png',
        'assets/troops-native/sneakygoblin/characters/texture-2.png',
        'assets/troops-native/superarcher/characters/texture-2.png',
        'assets/troops-native/superbarbarian/characters/texture-2.png',
        'assets/troops-native/superbowler/characters/texture-2.png',
        'assets/troops-native/superdragon/characters/texture-2.png',
        'assets/troops-native/supergiant/characters/texture-2.png',
        'assets/troops-native/superhog/characters/texture-2.png',
        'assets/troops-native/superminer/characters/texture-2.png',
        'assets/troops-native/superminion/characters/texture-2.png',
        'assets/troops-native/superrider/characters/texture-2.png',
        'assets/troops-native/supervalkyrie/characters/texture-2.png',
        'assets/troops-native/superwallbreaker/characters/texture-2.png',
        'assets/troops-native/superwitch/characters/texture-2.png',
        'assets/troops-native/superwizard/characters/texture-2.png',
        'assets/troops-native/superyeti/characters/texture-2.png',
        'assets/troops-native/swordsman/characters/texture-2.png',
        'assets/troops-native/thrower/characters/texture-2.png',
        'assets/troops-native/trapairskeleton/characters/texture-2.png',
        'assets/troops-native/trapskeleton/characters/texture-2.png',
        'assets/troops-native/valkyrie/characters/texture-2.png',
        'assets/troops-native/wallbreaker/characters/texture-2.png',
        'assets/troops-native/witch/characters/texture-2.png',
        'assets/troops-native/wizard/characters/texture-2.png',
        'assets/troops-native/yeti/characters/texture-2.png',
    ),
    SharedTexture(
        'assets/projectiles-native/apprenticewarden-small/chr_apprentice_warden/texture-0.png', (19, 16),
        'ff8e186f964792c58d23d3e5dbb6ec3bc1c61403cd7354a984b5e3fb9144773c'): (
        'assets/projectiles-native/apprenticewarden-small2/chr_apprentice_warden/texture-0.png',
    ),
    SharedTexture(
        'assets/projectiles-native/archerqueen-arrow-lvl1/buildings/texture-39.png', (64, 61),
        'b4c6b9c30a18dda848d839f1b4e2a87ded13381913d3f4ff6ac99dacd4a836ea'): (
        'assets/projectiles-native/archerqueen-arrow-lvl2/buildings/texture-39.png',
        'assets/projectiles-native/archerqueen-arrow-lvl3/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/projectiles-native/arrow-small-elixirfire/characters/texture-7.png', (64, 116),
        'cd6e484919b07599b9e719684ec6bf1b404a09b74118177257c26fa655cab0af'): (
        'assets/projectiles-native/arrow-small-fire/characters/texture-7.png',
    ),
    SharedTexture(
        'assets/projectiles-native/artillery-ammo1/buildings/texture-19.png', (68, 71),
        '51e5ed02153bff68ac64fc8c3c3919865ce9b0e7ced96af0979d21e02ca9e5fa'): (
        'assets/projectiles-native/artillery-ammo2/buildings/texture-19.png',
    ),
    SharedTexture(
        'assets/projectiles-native/babydragon-projectile-lvl2/buildings/texture-39.png', (64, 124),
        'abcee9a3205d16610b2075856549ceee12a68706386627636b44b9e7e35d2d2d'): (
        'assets/projectiles-native/babydragon-projectile/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/projectiles-native/barbariankinggearfootball/buildings/texture-6.png', (64, 56),
        '33e634012de66e5f7850bceac23d89b40414e1d9ec86f110501967d69c3058c9'): (
        'assets/projectiles-native/kickedfootball/buildings/texture-6.png',
        'assets/projectiles-native/meteoritegolemprojectile/buildings/texture-6.png',
        'assets/projectiles-native/meteoritegolemprojectilelvl2/buildings/texture-6.png',
        'assets/projectiles-native/meteoritegolemprojectilelvl3/buildings/texture-6.png',
        'assets/projectiles-native/rollinglog/buildings/texture-6.png',
        'assets/projectiles-native/superbowlerprojectile/buildings/texture-6.png',
    ),
    SharedTexture(
        'assets/projectiles-native/cannonball13/buildings/texture-18.png', (64, 67),
        'a1aece4118fdad4134c1c309ec15724b62470d0f2afdd733a45dd446d9edf4e7'): (
        'assets/projectiles-native/cannonball14/buildings/texture-18.png',
        'assets/projectiles-native/dragonriderprojectile-3/buildings/texture-18.png',
    ),
    SharedTexture(
        'assets/projectiles-native/cannonball15/buildings/texture-18.png', (128, 133),
        'f4718a3cbe197639572bad4f814e3006ea1c3bdc64a95b1a3ab4283bace43a52'): (
        'assets/projectiles-native/cannonball16/buildings/texture-18.png',
    ),
    SharedTexture(
        'assets/projectiles-native/crowprojectile/buildings/texture-39.png', (14, 16),
        '82a1401106a96cc0dd63053f3e6abe1933db999fa601b737ad2bf4a9fc07d65b'): (
        'assets/projectiles-native/gatlinggunammo/buildings/texture-39.png',
        'assets/projectiles-native/gw-equipment-lavaloonprojectile1/buildings/texture-39.png',
        'assets/projectiles-native/jumpingriderprojectile1/buildings/texture-39.png',
        'assets/projectiles-native/siege-zeppelin-projectile/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/projectiles-native/mergedcannonprojectile-lvl3/buildings/texture-36.png', (256, 262),
        'fb5828ba018775aa92a78fd11c5d6f57ce5a0f147bb394c55617c2c52f24753e'): (
        'assets/projectiles-native/mortar-ammo-lvl17/buildings/texture-36.png',
    ),
    SharedTexture(
        'assets/projectiles-native/mergedcannonprojectile-lvl4/buildings/texture-36.png', (256, 270),
        '151bd0c7bc4de6be3caeefe797dbf7ba2bf1d5a9cbd74d0075e07802ccab7fc5'): (
        'assets/projectiles-native/mortar-ammo-lvl18/buildings/texture-36.png',
    ),
    SharedTexture(
        'assets/projectiles-native/mergedcannonprojectile/buildings/texture-36.png', (64, 628),
        'cb713522b759c58632ed3e8899b797c959ee212b43a4ff709dcd7e4b4531f768'): (
        'assets/projectiles-native/mortar-ammo-lvl16/buildings/texture-36.png',
    ),
    SharedTexture(
        'assets/projectiles-native/mortar-ammo1/buildings/texture-36.png', (64, 78),
        'dc86a58fa7a43f61220e4b4024e7ab386af29b58da88166d1df0443b2efd8bf9'): (
        'assets/projectiles-native/mortar-ammo2/buildings/texture-36.png',
        'assets/projectiles-native/mortar-ammo3/buildings/texture-36.png',
        'assets/projectiles-native/mortar-ammo4/buildings/texture-36.png',
        'assets/projectiles-native/mortar-ammo5/buildings/texture-36.png',
    ),
    SharedTexture(
        'assets/projectiles-native/revengetowerprojectile2/vfx_env/texture-2.png', (128, 140),
        'a74c195e99c2ac0280c116e4d598cf3021433a43d51cafa2167b74bec492b196'): (
        'assets/projectiles-native/revengetowerprojectile3/vfx_env/texture-2.png',
    ),
    SharedTexture(
        'assets/projectiles-native/x-bow-projectile-1/buildings/texture-39.png', (64, 18),
        '113121ef47445f49862a4d0bbd61264fc93b54ac0c8e4e01255871af446f5e6f'): (
        'assets/projectiles-native/x-bow-projectile-2/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/projectiles-native/x-bow-projectile-4/buildings/texture-39.png', (64, 242),
        '8aec0bbbd5f80d7cc4b610ca9f9915aa280966d28c4e5e8c38b596f960abbf6c'): (
        'assets/projectiles-native/x-bow-projectile-5/buildings/texture-39.png',
        'assets/projectiles-native/x-bow-projectile-6/buildings/texture-39.png',
        'assets/projectiles-native/x-bow-projectile-7/buildings/texture-39.png',
    ),
    SharedTexture(
        'assets/projectiles-native/yetimitejump3/chr_yeti/texture-0.png', (64, 34),
        'b9fc9ac1c12d9360a5c86a9ced4e3b62a93a035a55982d9b8d233ccb03d318bc'): (
        'assets/projectiles-native/yetimitejump4/chr_yeti/texture-0.png',
        'assets/projectiles-native/yetimitejump6/chr_yeti/texture-0.png',
    ),
    SharedTexture(
        'assets/projectiles-native/yetimitejump3/chr_yeti/texture-1.png', (33, 30),
        '3851c5417ccf05878d71152c2bac512bcca86c0f51f533a102a2de95c324248e'): (
        'assets/projectiles-native/yetimitejump4/chr_yeti/texture-1.png',
        'assets/projectiles-native/yetimitejump6/chr_yeti/texture-1.png',
    ),
    SharedTexture(
        'assets/troops-native/battledrill/characters/texture-8.png', (950, 958),
        'd5a6cb13619dedb06df08b85e30d5a5c9abccf9b4e518cbaaba892229db89a20'): (
        'assets/troops-native/flameflinger/characters/texture-8.png',
        'assets/troops-native/loglauncher/characters/texture-8.png',
        'assets/troops-native/trooplauncher/characters/texture-8.png',
        'assets/troops-native/wallwrecker/characters/texture-8.png',
    ),
    SharedTexture(
        'assets/troops-native/golem/chr_golem/texture-0.png', (1896, 2550),
        '933b4c5c6169b88c38722a33619451ce950c6cc003138194cfb0135f50395740'): (
        'assets/troops-native/golemite/chr_golem/texture-0.png',
    ),
}
SHARED_TEXTURES.update({alias: shared for shared, aliases in _PACK_TEXTURE_ALIASES.items()
                        for alias in aliases})


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
