import { defendingHero, type DefendingHeroSetup } from './defending-heroes';
import { validLadderMatch, type LadderMatch } from './ladder';
import { validCraftedFields } from './crafted-defenses';
import { isSiege, superOriginal } from './special-troops';
import { MAX_ARCHER_TOWER_LEVEL } from './archer-tower-stats';
import { validGearMode, validSpellTowerMode, validWeaponLevel } from './native-defense-stats';
import { superchargeCount } from './native-supercharge';
import { guardianLevels, validGuardian } from './native-guardians';
import {
  heroMaxLevel,
  itemHero,
  itemMaxLevel,
  petMaxLevel,
  validHero,
  validItem,
  validPet,
  type HeroKind,
} from './native-hero-data';
import type { HeroSetup } from './native-heroes';
import { HERO_MAX_LEVEL } from './heroes';
import { MAX_DARK_DRILL_LEVEL } from './dark-drill-stats';
import { validInfernoAmmo, validInfernoMode } from './inferno-weapon';
import { isLateBuilding, isLateCampaignBuilding, validLateBuilding } from './late-campaign';
import {
  campaignStage,
  campaignStages,
  validCampaignCatalog,
  type CampaignCatalog,
} from './campaign-catalog';
import { NATIVE_SCENERY, type CampaignScenery } from './native-campaign';
import { validNpcBuilding, npcMaxLevel } from './npc-buildings';
import {
  validCampaignResources,
  campaignResources,
  campaignAmount,
  type CampaignResources,
} from './campaign-loot';
import { validDirection } from './air-control-stats';
import { validSkeletonMode } from './skeleton-stats';
import { validXbowMode } from './xbow-stats';
import { initializeGarrison, isGarrisonBunker, type GarrisonSetup } from './garrison-release';
import { createGarrisonReserve, MAX_GARRISON_TROOPS } from './garrison-reserve';
import { garrisonStats, garrisonTroopVersion } from './garrison-kinds';
import { gridSize, footprintSize, type GridVersion } from './grid';
import {
  BUILDINGS,
  MAX_TOWNHALL,
  MAX_TROOP_LEVEL,
  maxTroopLevel,
  SPELL_KEYS,
  TROOP_KEYS,
  LEGACY_TROOP_KEYS,
  PRE_EXPANSION_TROOP_KEYS,
  type SpellKind,
} from './data';
import type { Army, Battle, Building, SpellBook } from './model';
import { MAX_SPELL_LEVEL, maxSpellLevelFor } from './spell-progression';
import {
  EQUIPMENT_LEVEL_BEFORE_47,
  EQUIPMENT_MAX_LEVEL,
  validEquipment,
  type KingEquipment,
} from './equipment';

// Bump when combat rules change; old results remain readable even if playback expires.
export const REPLAY_VERSION = 173;
/**
 * Version 51 runs the battle from the client's own tables: the native troop roster with its
 * abilities, spawned units and statuses, the Town Hall 11–18 defenses with their weapon columns,
 * and the complete hero roster with equipment and pets in place of the single King.
 */
export const NATIVE_VERSION = 51;
/** Heroes, equipment and pets arrived with the same version as the rest of the native rules. */
export const NATIVE_HERO_VERSION = NATIVE_VERSION;
/** Versions 34–35 preserve their prior Cannon rules; 34 also keeps fixed Mortar flight.
 * Version 44 adds late single-player campaign levels and entities without changing earlier rules.
 * Version 45 adds the Town Hall 9 home ceilings without changing any combat rule.
 * Version 46 carries the catalog to Town Hall 18, again with no combat rule change.
 * Version 47 adds the fifth Skeleton Trap tier, whose coffin releases level 2 skeletons,
 * and arms the home Builder's Hut with the turret campaign huts already carried.
 * Version 48 adds the Freeze Spell, 49 the Invisibility Spell and 50 the Jump, Clone, Recall
 * and Revive Spells; no recording older than the version that added a spell may carry, cast
 * or research it.
 * Version 51 hands combat to the native client tables; every recording before it keeps the
 * rules it was written with.
 * Version 55 adds the Helper Hut building without changing any combat rule.
 * Version 56 adds Builder's Hut levels 5–8; earlier recordings retain the four-tier ceiling.
 * Version 57 lets offensive full freezes halt Defending Builder movement and repairs.
 * Version 58 lets native Lightning pulses reset Defending Builder repair targets.
 * Version 59 applies native offensive poison slows to Defending Builders.
 * Version 60 corrects poison slows and damage scaling on defending heroes.
 * Version 61 applies native poison slows to garrison and Skeleton Trap defenders.
 * Version 62 caps aggregate poison damage on defenders, including staggered clouds.
 * Version 63 prevents overdue poison pulses from rewinding the shared allowance clock.
 * Version 64 lets idle garrison troops avoid active offensive poison clouds.
 * Version 65 adds idle hero and Skeleton Trap avoidance, holding heroes clear of poisoned homes.
 * Version 66 prevents overdue defensive Poison pulses from rewinding the attacker damage clock.
 * Version 67 applies the client hero movement multiplier to native spell Poison slows.
 * Version 68 records distinct full-freeze deadlines for defender status artwork.
 * Version 69 fixes equipment dash hits on stacked/unborn defenders and clips hero stun time.
 * Version 70 applies offensive spell defender immunities, hero damage scaling and spawn time.
 * Version 71 captures projectile frost and selects the native Frozen Arrow projectile.
 * Version 72 counts Monolith Arrow housing cumulatively, including heroes and siege machines.
 * Version 73 applies Headhunter Hero targeting, damage and wall-jumping against defenders.
 * Version 74 launches native Headhunter cards against defenders, including their flight speed.
 * Version 75 keeps non-strike spell pulses centered on their cast or following owner.
 * Version 76 applies intrinsic attacker poison-on-hit to defenders, including native Lizard spit.
 * Version 77 carries ranged frost-on-hit into defender movement and attack clocks.
 * Version 78 applies Royal Champion Haste to combat intervals with passive equipment speed.
 * Version 79 applies equipped Hero life steal after actual building and defender attacks.
 * Version 80 applies the Queen's Invisibility Vial flat bonus to ordinary attack damage.
 * Version 81 applies charged Royal Champion spear overrides and spends actual throws.
 * Version 82 grants Noble Iron on deployment and retains finite-hit Hero effects through Recall.
 * Version 83 applies Stick Horse's deployment timing, attack interval and personal wall jumping.
 * Version 84 preserves Hero damage per hit while passive equipment shortens the attack interval.
 * Version 85 applies the King's active Giant Gauntlet ground splash without granting wall jumping.
 * Version 86 retains every native source jumper's wall bypass during defender pursuit.
 * Version 87 applies underground defender pursuit and surfaces attackers before their hits.
 * Version 88 applies native Hero projectile/direct-hit shapes during defender combat.
 * Version 89 captures Monolith Arrow's target-max-HP damage against defenders.
 * Version 90 applies Diggy's defense stun once per emergence.
 * Version 91 follows the living Hero's eligible target with Diggy.
 * Version 92 conceals building and defending-unit targets with Invisibility.
 * Version 93 applies source Rage coverage, movement, healing and independent source expiries.
 * Version 94 applies per-target native troop damage stages to buildings and defenders.
 * Version 95 runs Phoenix's waiting Egg, hatch and temporary Hero revival, and excludes pets from Clone.
 * Version 96 respects friendly participation and native healing immunity across support paths.
 * Version 97 gives Mighty Yak its source Hero-death boost once per raid.
 * Version 98 captures each Healer level's source Hero healing ratio in its pulse.
 * Version 99 binds Unicorn healing to its living Hero and applies its single-target support rules.
 * Version 100 resolves native healing through source projectile travel and chain hops.
 * Version 101 routes ground healing units around buildings while allowing their wall jumps.
 * Version 102 gives Sneezy its source spawner/attacker modes and summon wind-up.
 * Version 103 retains logical pet summon ownership through Recall and redeployment.
 * Version 104 restores Frosty Frostmites and their source single-use area frost jump.
 * Version 105 gives Yetimite/Firemite defender attacks their source single-use jumps.
 * Version 106 includes activated native weapons in preferred targets and damage.
 * Version 107 restores Electromite source chain lightning and its single-use cast.
 * Version 108 preserves Meteor Golem throws, split arrivals and clone lifetimes against defenders.
 * Version 109 restores Electro Dragon charge and mixed-target chain lightning.
 * Version 110 restores Super Wizard primary-centered Chain Magic.
 * Version 111 advances Super Archer piercing arrows through both enemy layers.
 * Version 112 makes native chain geometry consistent and lets Overgrowth absorb secondary hops.
 * Version 113 captures Overgrowth root lifetimes for original presentation.
 * Version 114 retains Overgrowth bottle, field and cast-audio timelines.
 * Version 115 retains original Freeze Spell cast art and audio timelines.
 * Version 116 captures Jump in a versioned source-spell presentation history.
 * Version 117 enables original Rage and Haste cast presentation.
 * Version 118 enables original Healing and Poison cast fields.
 * Version 119 reconstructs original Healing pulse graphics from captured cast seeds.
 * Version 120 enables original Clone and Invisibility cast fields.
 * Version 121 retains original Recall cast effects and audio after its live pulse ends.
 * Version 122 captures primary unit Recall disappearance and redeployment presentation.
 * Version 123 preserves the selected Hero in direct Revive commands.
 * Version 124 enables original Lightning bottle, charging and impact presentation.
 * Version 125 retains original Earthquake fields and durable ground scars.
 * Version 126 retains original Skeleton and Bat spell summon fields.
 * Version 127 enables Totem and delayed Angry spell presentation.
 * Version 128 retains the original Ice Block platform and delayed melt sequence.
 * Version 129 captures original Revive effects at the actual restored Hero.
 * Version 130 launches Warden Fireball with source flight and area damage.
 * Version 131 launches the Queen's source Giant Arrow through both enemy layers.
 * Version 132 preserves Giant Arrow constructs in Invisibility Spell Tower triggers.
 * Version 133 launches distinct-target Frost Flakes with captured full freezes.
 * Version 134 launches the King's distinct-target Spiky Ball ricochets.
 * Version 135 launches the Prince's bounded Dark Orb corridor with captured frost.
 * Version 136 launches the Champion's Seeking Shield after its source wind-up.
 * Version 137 retains moving equipment target aims for cadence-independent original trails.
 * Version 138 resumes passive Hero auras after Revive or Phoenix resurrection.
 * Version 139 prevents self-regeneration debt across death and Recall.
 * Version 140 captures original Electro Boots passive activation effects.
 * Version 141 corrects Meteor Staff visibility, defense preference and building fallback.
 * Version 142 retains original Meteor Staff cast origins, art and source audio.
 * Version 143 shares garrison damage protections and records direct Revenge Deck hit sources.
 * Version 144 preserves Snake Bracelet damage and the per-battle summon cap through Recall.
 * Version 145 preserves normal/Super Yeti damage progress and mite stock through Recall.
 * Version 146 enables original primary and chain samples for later garrison defenders.
 * Version 147 extends shared incoming-damage protections to trap-only Royal Ghost layouts.
 * Version 148 retains Witch/Super Witch summon ownership and cooldown through Recall.
 * Version 149 starts deployed bunker decay and Druid evolution at the body's actual birth.
 * Version 150 lets live life-aura health extend Furnace's fixed-rate degeneration lifetime.
 * Version 151 pins Furnace release geometry to remove host sine/cosine rounding differences.
 * Version 152 corrects defending PEKKA/Valkyrie split windup and recovery timing.
 * Version 153 makes later split families spend each recovery tick once when retargeting.
 * Version 154 binds original Electro Dragon garrison charge audio to active wall time.
 * Version 155 binds original Bowler pre-attack takes to garrison windups and their natural tails.
 * Version 156 starts attacking Bowler windups at engagement and holds them through Freeze.
 * Version 157 uses native Bowler boulders against defenders and fixes second landings.
 * Version 158 captures Bowler bounce and shatter sound clocks.
 * Version 159 retains original attacking Bowler windup clocks and throw tails.
 * Version 160 binds original defending Bowler bounce and shatter samples.
 * Version 161 separates boulder bounce/shatter art and retains flights through seeks.
 * Version 162 gives attacking Golem/Golemite source split windup/recovery.
 * Version 163 routes Bowler pursuit-wall attacks through native timing and boulders.
 * Version 164 gives legacy-path PEKKA source split attack phases.
 * Version 165 gives Valkyrie/Super Valkyrie split clocks and defender sweeps.
 * Version 166 gives Witch/Super Witch a source first-projectile windup.
 * Version 167 retains Witch flights for original trail tails after replay seeks.
 * Version 168 reconstructs original Witch launch/impact audio from physical events.
 * Version 169 gives Hound parents source phases and Lava Hound flight.
 * Version 170 makes seeded Hound death-spawn geometry independent of host trigonometry.
 * Version 171 gives Giant/Super Giant source split attack phases.
 * Version 172 gives Ice Golem split attack phases and direct defender frost.
 * Version 173 gives Root Rider split attack phases independently of her wall aura. */
export const compatibleReplayVersion = (version: unknown) =>
  version === 34 ||
  version === 35 ||
  version === 36 ||
  version === 37 ||
  version === 38 ||
  version === 39 ||
  version === 40 ||
  version === 41 ||
  version === 42 ||
  version === 43 ||
  version === 44 ||
  version === 45 ||
  version === 46 ||
  version === 47 ||
  version === 48 ||
  version === 49 ||
  version === 50 ||
  version === 51 ||
  version === 52 ||
  version === 53 ||
  version === 54 ||
  version === 55 ||
  version === 56 ||
  version === 57 ||
  version === 58 ||
  version === 59 ||
  version === 60 ||
  version === 61 ||
  version === 62 ||
  version === 63 ||
  version === 64 ||
  version === 65 ||
  version === 66 ||
  version === 67 ||
  version === 68 ||
  version === 69 ||
  version === 70 ||
  version === 71 ||
  version === 72 ||
  version === 73 ||
  version === 74 ||
  version === 75 ||
  version === 76 ||
  version === 77 ||
  version === 78 ||
  version === 79 ||
  version === 80 ||
  version === 81 ||
  version === 82 ||
  version === 83 ||
  version === 84 ||
  version === 85 ||
  version === 86 ||
  version === 87 ||
  version === 88 ||
  version === 89 ||
  version === 90 ||
  version === 91 ||
  version === 92 ||
  version === 93 ||
  version === 94 ||
  version === 95 ||
  version === 96 ||
  version === 97 ||
  version === 98 ||
  version === 99 ||
  version === 100 ||
  version === 101 ||
  version === 102 ||
  version === 103 ||
  version === 104 ||
  version === 105 ||
  version === 106 ||
  version === 107 ||
  version === 108 ||
  version === 109 ||
  version === 110 ||
  version === 111 ||
  version === 112 ||
  version === 113 ||
  version === 114 ||
  version === 115 ||
  version === 116 ||
  version === 117 ||
  version === 118 ||
  version === 119 ||
  version === 120 ||
  version === 121 ||
  version === 122 ||
  version === 123 ||
  version === 124 ||
  version === 125 ||
  version === 126 ||
  version === 127 ||
  version === 128 ||
  version === 129 ||
  version === 130 ||
  version === 131 ||
  version === 132 ||
  version === 133 ||
  version === 134 ||
  version === 135 ||
  version === 136 ||
  version === 137 ||
  version === 138 ||
  version === 139 ||
  version === 140 ||
  version === 141 ||
  version === 142 ||
  version === 143 ||
  version === 144 ||
  version === 145 ||
  version === 146 ||
  version === 147 ||
  version === 148 ||
  version === 149 ||
  version === 150 ||
  version === 151 ||
  version === 152 ||
  version === 153 ||
  version === 154 ||
  version === 155 ||
  version === 156 ||
  version === 157 ||
  version === 158 ||
  version === 159 ||
  version === 160 ||
  version === 161 ||
  version === 162 ||
  version === 163 ||
  version === 164 ||
  version === 165 ||
  version === 166 ||
  version === 167 ||
  version === 168 ||
  version === 169 ||
  version === 170 ||
  version === 171 ||
  version === 172 ||
  version === REPLAY_VERSION;
/** Roster ceilings before version 47 took every troop and spell to its own original last level. */
export const PRE_ROSTER_TROOP_LEVELS: Readonly<Record<string, number>> = Object.fromEntries(
  TROOP_KEYS.map((kind) => [
    kind,
    kind === 'healer' || kind === 'dragon' || kind === 'pekka' ? 3 : 5,
  ]),
);
const PRE_ROSTER_SPELL_LEVEL = 5;
/**
 * Spells added after version 47, by the version that first carried one. A recording older
 * than that version may not carry, cast or research the spell, and is validated against the
 * book it was written with rather than today's.
 */
const SPELLS_ADDED_AT: Readonly<Record<number, readonly SpellKind[]>> = {
  48: ['freeze'],
  49: ['invisibility'],
  50: ['jump', 'clone', 'recall', 'revive'],
  51: [
    'totem',
    'poison',
    'earthquake',
    'haste',
    'skeleton',
    'bat',
    'overgrowth',
    'iceblock',
    'angry',
  ],
};
/** The spell book a recording of this version was written with, in its own key order. */
export const spellKeysAt = (version: number): readonly SpellKind[] =>
  SPELL_KEYS.filter((kind) =>
    Object.entries(SPELLS_ADDED_AT).every(
      ([added, kinds]) => version >= Number(added) || !kinds.includes(kind),
    ),
  );
/**
 * The book every recording before version 48 was replayed with, written out in the order
 * those recordings hashed it. An archived battle state is compared as JSON, so the key order
 * is part of the result and cannot be rebuilt from today's key list.
 */
const PRE_VERSION_48_SPELL_LEVELS = { lightning: 1, heal: 1, rage: 1 } as unknown as SpellBook;
const spellLevelsAt = (version: number): SpellBook =>
  version < 48
    ? PRE_VERSION_48_SPELL_LEVELS
    : (Object.fromEntries(spellKeysAt(version).map((k) => [k, 1])) as SpellBook);
/** Ceilings before version 47 reconstructed the fifth coffin tier. */
const PRE_VERSION_47_LEVELS: Readonly<Record<string, number>> = { skeletontrap: 4 };
/** Ceilings before version 46 carried the home catalog to Town Hall 18. */
const PRE_TOWNHALL_18_LEVELS: Readonly<Record<string, number>> = {
  townhall: 9,
  herohall: 3,
  darkdrill: 6,
  goldmine: 14,
  collector: 14,
  goldstorage: 16,
  elixirstorage: 16,
  archertower: 12,
  camp: 8,
  barracks: 11,
  laboratory: 7,
  spellfactory: 5,
  airdefense: 13,
  wall: 16,
  bomb: 11,
  giantbomb: 8,
  airbomb: 10,
  springtrap: 5,
};
/** Ceilings before version 45 raised the home catalog to Town Hall 9. */
const PRE_TOWNHALL_9_LEVELS: Readonly<Record<string, number>> = {
  barracks: 10,
  laboratory: 6,
  herohall: 2,
  darkdrill: 3,
};
/** Ceilings before version 44 added late single-player campaign levels. */
const PRE_LATE_CAMPAIGN_LEVELS: Readonly<Record<string, number>> = {
  wall: 12,
  goldstorage: 11,
  elixirstorage: 11,
  goldmine: 12,
  collector: 12,
  airdefense: 10,
  bomb: 8,
  giantbomb: 5,
  airbomb: 6,
};
export const REPLAY_LIMIT = 5;
export const MAX_REPLAY_STEPS = 60_000;
export const MAX_REPLAY_ACTIONS = 2000;
export const MAX_REPLAY_TROOPS = 700;
export const MAX_REPLAY_SPELLS = 100;
export const MAX_REPLAY_STEPS_PER_UPDATE = 100;
export const MAX_REPLAY_UPDATE_MS = 8;
export type ReplayAction = { step: number } & (
  | { type: 'troop'; kind: keyof Army; x: number; y: number }
  | { type: 'spell'; kind: keyof SpellBook; x: number; y: number; targetHero?: HeroKind }
  | { type: 'hero'; x: number; y: number; hero?: HeroKind }
  | { type: 'ability'; hero?: HeroKind }
  | { type: 'end' }
);
export interface ReplaySetup {
  defendingHeroes?: DefendingHeroSetup[];
  garrisons?: GarrisonSetup[];
  catalog?: CampaignCatalog;
  scenery?: CampaignScenery[];
  index: number;
  practice: boolean;
  /** Version 54+: a ladder match (timed, trophies at stake, no loot). */
  ladder?: LadderMatch;
  /** A Practice Mode level, fought with the army it provides (the setup's army and levels). */
  fixedArmy?: boolean;
  buildings: Building[];
  army: Army;
  spells: SpellBook;
  hero?: { level: number; townhall: number; equipment?: KingEquipment };
  /** Version 46+: every hero that may be deployed, with its items and pet. */
  heroes?: HeroSetup[];
  townhall?: number;
  troopLevels: Army;
  spellLevels?: SpellBook;
  nextId: number;
  /** Remaining enemy inventory at entry; never inferred from the viewer's progress. */
  availableLoot?: CampaignResources;
  /** Raid-limited storage headroom, not the player's balance or total capacity. */
  lootRoom?: CampaignResources;
}
export interface ReplayData {
  version: number;
  initial: ReplaySetup;
  /** Actual simulation deltas preserve ordering even in deterministic test advances. */
  steps: number[];
  actions: ReplayAction[];
}
export interface ReplayPlayback {
  recordId: number | null;
  seeking: boolean;
  seekTarget: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  time: number;
  duration: number;
  complete: boolean;
}
export function replayBattle(s: ReplaySetup, version = REPLAY_VERSION): Battle {
  return {
    ...(version >= 173 && s.army.rootrider > 0 ? { nativeRootRiderWindup: true as const } : {}),
    ...(version >= 172 && s.army.icegolem > 0 ? { nativeIceGolemWindup: true as const } : {}),
    ...(version >= 171 && (s.army.giant > 0 || s.army.supergiant > 0)
      ? { nativeGiantWindup: true as const }
      : {}),
    ...(version >= 170 && (s.army.lavahound > 0 || s.army.icehound > 0)
      ? { nativeHoundSpawnGeometry: true as const }
      : {}),
    ...(version >= 169 && (s.army.lavahound > 0 || s.army.icehound > 0)
      ? { nativeHoundWindup: true as const }
      : {}),
    ...(version >= 168 && (s.army.witch > 0 || s.army.superwitch > 0)
      ? { nativeWitchSounds: true as const }
      : {}),
    ...(version >= 167 && (s.army.witch > 0 || s.army.superwitch > 0)
      ? { nativeWitchFlightArt: true as const }
      : {}),
    ...(version >= 166 && (s.army.witch > 0 || s.army.superwitch > 0)
      ? { nativeWitchWindup: true as const }
      : {}),
    ...(version >= 165 && (s.army.valkyrie > 0 || s.army.supervalkyrie > 0)
      ? { nativeValkyrieWindup: true as const }
      : {}),
    ...(version >= 164 && (s.army.pekka > 0 || s.army.siegebarracks > 0)
      ? { nativePekkaWindup: true as const }
      : {}),
    ...(version >= 163 && s.army.bowler > 0 ? { nativeBowlerWallWindup: true as const } : {}),
    ...(version >= 162 && s.army.golem > 0 ? { nativeGolemWindup: true as const } : {}),
    ...(version >= 161 &&
    (s.army.bowler > 0 ||
      s.garrisons?.some((reserve) => reserve.troops.some((troop) => troop.kind === 'bowler')))
      ? { nativeBowlerImpactArt: true as const }
      : {}),
    ...(version >= 160 &&
    s.garrisons?.some((reserve) => reserve.troops.some((troop) => troop.kind === 'bowler'))
      ? { nativeGarrisonBowlerImpacts: true as const }
      : {}),
    ...(version >= 159 && s.army.bowler > 0 ? { nativeBowlerPreAttack: true as const } : {}),
    ...(version >= 158 && s.army.bowler > 0 ? { nativeBowlerImpactSounds: true as const } : {}),
    ...(version >= 157 && s.army.bowler > 0 ? { nativeBowlerBoulders: true as const } : {}),
    ...(version >= 156 && s.army.bowler > 0 ? { nativeBowlerWindup: true as const } : {}),
    ...(version >= 155 &&
    s.garrisons?.some((reserve) => reserve.troops.some((troop) => troop.kind === 'bowler'))
      ? { nativeGarrisonBowlerPreAttack: true as const }
      : {}),
    ...(version >= 154 &&
    s.garrisons?.some((reserve) => reserve.troops.some((troop) => troop.kind === 'electrodragon'))
      ? { nativeGarrisonPreAttack: true as const }
      : {}),
    ...(version >= 153 &&
    s.garrisons?.some((reserve) =>
      reserve.troops.some((troop) => {
        const stats = garrisonStats(troop.kind, troop.level);
        return stats.split && stats.recovery > 0;
      }),
    )
      ? { nativeGarrisonRecovery: true as const }
      : {}),
    ...(version >= 152 &&
    s.garrisons?.some((reserve) =>
      reserve.troops.some((troop) => troop.kind === 'pekka' || troop.kind === 'valkyrie'),
    )
      ? { nativeGarrisonMeleeTiming: true as const }
      : {}),
    ...(version >= 151 && s.army.furnace > 0 ? { nativeFurnaceSpawnGeometry: true as const } : {}),
    ...(version >= 150 &&
    s.army.furnace > 0 &&
    (s.army.apprenticewarden > 0 ||
      s.heroes?.some(
        (hero) => hero.kind === 'warden' && hero.items.some((item) => item.slug === 'life-gem'),
      ))
      ? { nativeFurnaceAuraDecay: true as const }
      : {}),
    ...(version >= 149 && (s.army.furnace > 0 || s.army.siegebarracks > 0 || s.army.druid > 0)
      ? { nativeLifecycleBirth: true as const }
      : {}),
    ...(version >= 148 && (s.army.witch > 0 || s.army.superwitch > 0)
      ? { nativeWitchRecall: true as const }
      : {}),
    ...(version >= 146 &&
    (s.garrisons?.some((reserve) =>
      reserve.troops.some((troop) => troop.kind !== 'dragon' && troop.kind !== 'balloon'),
    ) ||
      s.buildings.some((building) => building.npc === 'ghost-trap'))
      ? { nativeGarrisonSounds: true as const }
      : {}),
    ...(version >= 145 && (s.army.yeti > 0 || s.army.superyeti > 0)
      ? { nativeYetiRecall: true as const }
      : {}),
    ...(version >= 144 &&
    s.heroes?.some(
      (hero) => hero.kind === 'king' && hero.items.some((item) => item.slug === 'snake-bracelet'),
    )
      ? { nativeSnakeBraceletRecall: true as const }
      : {}),
    ...((version >= 143 && s.garrisons?.length) ||
    (version >= 147 && s.buildings.some((building) => building.npc === 'ghost-trap'))
      ? { nativeGarrisonDamage: true as const }
      : {}),
    ...(version >= 143 &&
    s.heroes?.some(
      (hero) => hero.kind === 'duke' && hero.items.some((item) => item.slug === 'draconic-counter'),
    )
      ? { nativeRevengeDeck: true as const }
      : {}),
    ...(version >= 141 &&
    s.heroes?.some(
      (hero) => hero.kind === 'prince' && hero.items.some((item) => item.slug === 'meteor-staff'),
    )
      ? { nativeMeteorStaffTargeting: true as const }
      : {}),
    ...(version >= 140 &&
    s.heroes?.some(
      (hero) =>
        hero.kind === 'champion' && hero.items.some((item) => item.slug === 'electro-boots'),
    )
      ? { nativeElectroBootsPresentation: true as const }
      : {}),
    ...(version >= 139 &&
    s.heroes?.some((hero) =>
      hero.items.some(
        (item) =>
          (hero.kind === 'king' && item.slug === 'giant-gauntlet') ||
          (hero.kind === 'queen' &&
            (item.slug === 'healer-puppet' || item.slug === 'action-figure')) ||
          (hero.kind === 'champion' && item.slug === 'electro-boots') ||
          (hero.kind === 'duke' && item.slug === 'fire-heart'),
      ),
    )
      ? { nativeHeroRegeneration: true as const }
      : {}),
    ...(version >= 138 &&
    s.heroes?.some((hero) =>
      hero.items.some(
        (item) =>
          (hero.kind === 'champion' && item.slug === 'electro-boots') ||
          (hero.kind === 'warden' && (item.slug === 'life-gem' || item.slug === 'rage-gem')),
      ),
    )
      ? { nativeHeroAuraRevival: true as const }
      : {}),
    ...(version >= 137 &&
    s.heroes?.some((hero) =>
      hero.items.some(
        (item) =>
          (hero.kind === 'champion' &&
            (item.slug === 'frost-charm' || item.slug === 'seeking-shield')) ||
          (hero.kind === 'king' && item.slug === 'spiky-ball'),
      ),
    )
      ? { nativeEquipmentFlightHistory: true as const }
      : {}),
    ...(version >= 136 &&
    s.heroes?.some(
      (hero) =>
        hero.kind === 'champion' && hero.items.some((item) => item.slug === 'seeking-shield'),
    )
      ? { nativeSeekingShield: true as const }
      : {}),
    ...(version >= 135 &&
    s.heroes?.some(
      (hero) => hero.kind === 'prince' && hero.items.some((item) => item.slug === 'dark-orb'),
    )
      ? { nativeDarkOrb: true as const }
      : {}),
    ...(version >= 134 &&
    s.heroes?.some(
      (hero) => hero.kind === 'king' && hero.items.some((item) => item.slug === 'spiky-ball'),
    )
      ? { nativeSpikyBall: true as const }
      : {}),
    ...(version >= 133 &&
    s.heroes?.some(
      (hero) => hero.kind === 'champion' && hero.items.some((item) => item.slug === 'frost-charm'),
    )
      ? { nativeFrostFlake: true as const }
      : {}),
    ...(version >= 131 &&
    s.heroes?.some(
      (hero) => hero.kind === 'queen' && hero.items.some((item) => item.slug === 'piercing-arrow'),
    )
      ? {
          nativeGiantArrow: true as const,
          ...(version >= 132 ? { nativeGiantArrowConstructs: true as const } : {}),
        }
      : {}),
    ...(version >= 130 &&
    s.heroes?.some(
      (hero) => hero.kind === 'warden' && hero.items.some((item) => item.slug === 'fireball'),
    )
      ? { nativeWardenFireball: true as const }
      : {}),
    ...(version >= 123 ? { nativeReviveTargets: true as const } : {}),
    ...(version >= 122 ? { nativeRecallPresentation: true as const } : {}),
    ...(version >= 119 ? { nativeSpellPulsePresentation: true as const } : {}),
    ...(version >= 118
      ? {
          nativeSpellArt: [
            'Jump',
            'Rage',
            'Haste',
            'Healing',
            'Poison',
            ...(version >= 120 ? ['Clone', 'Invisibility'] : []),
            ...(version >= 121 ? ['Recall'] : []),
            ...(version >= 124 ? ['Lightning'] : []),
            ...(version >= 125 ? ['Earthquake'] : []),
            ...(version >= 126 ? ['Skeleton Spell', 'Bat Spell'] : []),
            ...(version >= 127 ? ['Totem Spell', 'AngrySpell'] : []),
            ...(version >= 128 ? ['Ice Block'] : []),
            ...(version >= 129 ? ['Revive'] : []),
            ...(version >= 142 &&
            s.heroes?.some(
              (hero) =>
                hero.kind === 'prince' && hero.items.some((item) => item.slug === 'meteor-staff'),
            )
              ? ['MPMeteorStaffSpell']
              : []),
          ],
          nativeSpellEffectTimelines: true as const,
        }
      : version >= 117
        ? { nativeSpellArt: ['Jump', 'Rage', 'Haste'] }
        : version >= 116
          ? { nativeSpellArt: ['Jump'] }
          : {}),
    ...(version >= 115 ? { nativeFreezeCastPresentation: true as const } : {}),
    ...(version >= 114 ? { nativeOvergrowthCastPresentation: true as const } : {}),
    ...(version >= 113 ? { nativeOvergrowthPresentation: true as const } : {}),
    ...(version >= 112 ? { nativeChainGeometry: true as const } : {}),
    ...(version >= 111 ? { nativeArcherPiercing: true as const } : {}),
    ...(version >= 110 ? { nativeSuperWizard: true as const } : {}),
    ...(version >= 109 ? { nativeElectroDragon: true as const } : {}),
    ...(version >= 108 ? { nativeMeteorThrows: true as const } : {}),
    ...(version >= 107 ? { nativeElectromites: true as const } : {}),
    ...(version >= 106 ? { nativeActivatedPreference: true as const } : {}),
    ...(version >= 105 ? { nativeSingleUseMiteJumps: true as const } : {}),
    ...(version >= 104 ? { nativeFrostmites: true as const } : {}),
    ...(version >= 103 ? { nativePetSummonRecall: true as const } : {}),
    ...(version >= 102 ? { nativeSneezyController: true as const } : {}),
    ...(version >= 101 ? { nativeHealerRoutes: true as const } : {}),
    ...(version >= 100 ? { nativeHealingProjectiles: true as const } : {}),
    ...(version >= 99 ? { nativeUnicornController: true as const } : {}),
    ...(version >= 98 ? { nativeHealerHeroScaling: true as const } : {}),
    ...(version >= 97 ? { nativeYakMasterRage: true as const } : {}),
    ...(version >= 96 ? { nativeFriendlyEligibility: true as const } : {}),
    ...(version >= 95 ? { nativePhoenixResurrection: true as const } : {}),
    ...(version >= 95 ? { nativePetCloneImmunity: true as const } : {}),
    ...(version >= 94 ? { nativeTroopDamageRamp: true as const } : {}),
    ...(version >= 93 ? { nativeRageRules: true as const } : {}),
    ...(version >= 92 ? { nativeInvisibilityTargets: true as const } : {}),
    ...(version >= 91 ? { nativeDiggyMasterTarget: true as const } : {}),
    ...(version >= 90 ? { nativeDiggySurfaceStun: true as const } : {}),
    ...(version >= 89 ? { nativeMonolithDefenderDamage: true as const } : {}),
    ...(version >= 88 ? { nativeHeroDefenderAttacks: true as const } : {}),
    ...(version >= 87 ? { nativeUndergroundDefenderChase: true as const } : {}),
    ...(version >= 86 ? { nativeSourceJumperChase: true as const } : {}),
    ...(version >= 85 ? { nativeKingGauntletSplash: true as const } : {}),
    ...(version >= 84 ? { nativeHeroPassiveSpeedDamage: true as const } : {}),
    ...(version >= 83 ? { nativeKingStickHorse: true as const } : {}),
    ...(version >= 82
      ? { nativePrinceNobleIron: true as const, nativeChargedHeroRecall: true as const }
      : {}),
    ...(version >= 81 ? { nativeChampionRocketSpears: true as const } : {}),
    ...(version >= 80 ? { nativeQueenVialDamage: true as const } : {}),
    ...(version >= 79 ? { nativeHeroLifeSteal: true as const } : {}),
    ...(version >= 78 ? { nativeChampionHaste: true as const } : {}),
    ...(version >= 77 ? { nativeDefenderFrost: true as const } : {}),
    ...(version >= 76 ? { nativeAttackerHitPoison: true as const } : {}),
    ...(version >= 75 ? { nativeSpellAreaCenters: true as const } : {}),
    ...(version >= 74 ? { nativeHeadhunterCards: true as const } : {}),
    ...(version >= 73 ? { nativeHeadhunterHeroRules: true as const } : {}),
    ...(version >= 72 ? { nativeMonolithHousing: 0 } : {}),
    ...(version >= 71 ? { nativeProjectileFrost: true as const } : {}),
    ...(version >= 70 ? { nativeDefenderSpellRules: true as const } : {}),
    ...(version >= 69
      ? { nativeEquipmentDashHits: true as const, nativeDefendingHeroStunTime: true as const }
      : {}),
    ...(version >= 68 ? { nativeDefenderFreezeCue: true as const } : {}),
    ...(version >= 67 ? { nativeHeroPoisonSpeed: true as const } : {}),
    ...(version >= 66 ? { nativeAttackerPoisonClock: true as const } : {}),
    ...(version >= 65 ? { nativeIdlePoisonAvoidance: true as const } : {}),
    ...(version >= 64 ? { nativePoisonAvoidance: true as const } : {}),
    ...(version >= 63 ? { nativePoisonClock: true as const } : {}),
    ...(version >= 62 ? { nativeDefenderPoisonOverlap: true as const } : {}),
    ...(version >= 61 ? { nativeDefenderPoison: true as const } : {}),
    ...(version >= 60 ? { nativeDefendingHeroPoison: true as const } : {}),
    ...(version >= 59 ? { nativeBuilderPoison: true as const } : {}),
    ...(version >= 58 ? { nativeBuilderLightning: true as const } : {}),
    ...(version >= 57 ? { nativeBuilderFreeze: true as const } : {}),
    // Version 54: capped crowd separation, the stalled-summons battle end, and fallen units
    // without route waypoints.
    ...(version >= 54
      ? {
          separationCap: true as const,
          stalledSupportEnds: true as const,
          dropFallenPaths: true as const,
        }
      : {}),
    ...(version >= 53 ? { nativeHeroPassives: true as const } : {}),
    ...(version >= 52 ? { nativeContentExpansion: true as const } : {}),
    ...(version >= 52 && s.defendingHeroes?.length
      ? { defenders: s.defendingHeroes.map(defendingHero) }
      : {}),
    // Version 51 deploys the complete hero roster with equipment and pets.
    ...(version >= NATIVE_HERO_VERSION && s.heroes?.length
      ? {
          nativeHeroRoster: true as const,
          nativeHeroes: s.heroes.map((hero) => ({
            ...structuredClone(hero),
            unitId: null,
            petId: null,
          })),
          townhall: s.townhall,
        }
      : {}),
    // Version 51 enables native roster abilities, spawned units and their statuses.
    ...(version >= NATIVE_VERSION ? { nativeRoster: true as const } : {}),
    ...(version >= 44 && s.catalog === 'goblin-v1' ? { nativeSubtiles: true as const } : {}),
    // Late families step wherever they stand: campaign villages from version 44, late home
    // defenses and traps from version 46, and an armed Builder's Hut anywhere from version 47.
    ...((version >= 44 && s.catalog === 'goblin-v1' && s.buildings.some(isLateCampaignBuilding)) ||
    (version >= 46 && s.buildings.some(isLateBuilding)) ||
    (version >= 47 && s.buildings.some(isLateCampaignBuilding))
      ? { late: {} }
      : {}),
    ...(version >= 43 && s.buildings.some((b) => b.kind === 'inferno')
      ? { nativeInfernoAmmo: true as const }
      : {}),
    ...(version >= 42 && s.buildings.some((b) => b.kind === 'archertower')
      ? { archerTowerWindups: {} }
      : {}),
    ...(version >= 41 && s.buildings.some((b) => b.kind === 'archertower')
      ? { nativeArcherTowers: true as const }
      : {}),
    ...(version >= 40 && s.buildings.some((b) => b.kind === 'darkdrill')
      ? { drillDestructions: {} }
      : {}),
    // The battle seed orders different garrison troops of equal housing (no effect on older rosters).
    ...(s.garrisons
      ? { garrisons: s.garrisons.map((g) => initializeGarrison(g, 1337 + s.index)) }
      : {}),
    ...((version === 34 || version === 35) && s.buildings.some((b) => b.kind === 'cannon' && !b.npc)
      ? { legacyCannonFlight: true as const }
      : {}),
    ...(version === 34 && s.buildings.some((b) => b.kind === 'mortar')
      ? { legacyMortarFlight: true as const }
      : {}),
    ...(s.catalog ? { catalog: s.catalog } : {}),
    ...(s.scenery ? { scenery: structuredClone(s.scenery) } : {}),
    index: s.index,
    practice: s.practice,
    ...(s.ladder ? { ladder: { ...s.ladder } } : {}),
    ...(s.fixedArmy ? { fixedArmy: true } : {}),
    buildings: structuredClone(s.buildings),
    carriedArmy: { ...s.army },
    remaining: { ...s.army },
    carried: { ...s.spells },
    spells: { ...s.spells },
    troopLevels: { ...s.troopLevels },
    // A spell added after a recording was written has no level in it, and adding one would
    // change that recording's archived battle state.
    spellLevels: { ...spellLevelsAt(version), ...s.spellLevels },
    hero: s.hero
      ? { ...structuredClone(s.hero), unitId: null, abilityUsed: false, rageUntil: 0 }
      : undefined,
    units: [],
    auras: [],
    shells: [],
    defenseTargets: {},
    defenseStuns: {},
    traps: {},
    elapsed: 0,
    prep: s.practice || s.ladder ? 30 : 0,
    started: false,
    finished: false,
    destruction: 0,
    stars: 0,
    loot: { gold: 0, elixir: 0 },
    ...(s.lootRoom ? { lootRoom: { ...s.lootRoom } } : {}),
    ...(!s.practice
      ? {
          availableLoot: {
            ...(s.availableLoot ?? campaignResources(campaignStage(s.index, s.catalog))),
          },
          lootTaken: { gold: 0, elixir: 0 },
        }
      : {}),
    seed: 1337 + s.index,
  };
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const counts = (v: unknown, keys: readonly string[], min: number, max: number) =>
  object(v) && keys.every((k) => integer(v[k], min, max));
/** Treat imported recordings as untrusted, bounded input, independently of home layout. */
export function validateReplay(value: unknown): value is ReplayData {
  if (!object(value) || !integer(value.version, 1, 1000000) || !object(value.initial)) return false;
  const s = value.initial;
  // The native roster arrived with version 51; earlier recordings carry the ten original troops.
  const troopKeys =
    value.version >= 52
      ? TROOP_KEYS
      : value.version >= NATIVE_VERSION
        ? TROOP_KEYS.filter((k) => !isSiege(k) && !superOriginal(k))
        : value.version >= 18
          ? PRE_EXPANSION_TROOP_KEYS
          : LEGACY_TROOP_KEYS;
  // A recording is checked against the book it was written with, not today's.
  const spellKeys = spellKeysAt(value.version);
  const equipmentCeiling = value.version < 47 ? EQUIPMENT_LEVEL_BEFORE_47 : EQUIPMENT_MAX_LEVEL;
  if (
    !validCampaignCatalog(s.catalog) ||
    (s.catalog !== undefined && value.version < 27) ||
    (s.practice && s.catalog === 'goblin-v1') ||
    !integer(s.index, 0, campaignStages(s.catalog).length - 1) ||
    typeof s.practice !== 'boolean' ||
    !integer(s.nextId, 1, Number.MAX_SAFE_INTEGER - 10000) ||
    !counts(s.army, troopKeys, 0, 9999) ||
    !counts(s.spells, spellKeys, 0, 999) ||
    !counts(s.troopLevels, troopKeys, 1, MAX_TROOP_LEVEL) ||
    // The roster reached each troop's own original ceiling in version 47; before that every
    // troop stopped at five and the Healer, Dragon and P.E.K.K.A at three.
    (value.version >= 18 &&
      troopKeys.some(
        (k) =>
          s.troopLevels[k] > (value.version < 47 ? PRE_ROSTER_TROOP_LEVELS[k] : maxTroopLevel(k)),
      )) ||
    (value.version >= 17 && !counts(s.spellLevels, spellKeys, 1, MAX_SPELL_LEVEL)) ||
    (s.spellLevels !== undefined &&
      spellKeys.some(
        (k) =>
          s.spellLevels![k] < 1 ||
          s.spellLevels![k] > (value.version < 47 ? PRE_ROSTER_SPELL_LEVEL : maxSpellLevelFor(k)),
      )) ||
    (value.version >= 4 &&
      (troopKeys.reduce((n, k) => n + s.army[k], 0) > MAX_REPLAY_TROOPS ||
        spellKeys.reduce((n, k) => n + s.spells[k], 0) > MAX_REPLAY_SPELLS)) ||
    (value.version >= 25 &&
      !s.practice &&
      !validCampaignResources(
        s.availableLoot,
        campaignStage(s.index, s.catalog),
        value.version >= 32 && campaignAmount(campaignStage(s.index, s.catalog), 'dark') > 0,
      )) ||
    (s.availableLoot !== undefined &&
      !validCampaignResources(s.availableLoot, campaignStage(s.index, s.catalog))) ||
    (value.version >= 4 && !s.practice && !object(s.lootRoom)) ||
    (s.lootRoom !== undefined &&
      (!object(s.lootRoom) ||
        !validCampaignResources(
          s.lootRoom,
          s.availableLoot ?? campaignStage(s.index, s.catalog),
          value.version >= 32 &&
            !s.practice &&
            campaignAmount(campaignStage(s.index, s.catalog), 'dark') > 0,
        ))) ||
    (s.hero !== undefined &&
      (!object(s.hero) ||
        !integer(
          s.hero.level,
          1,
          value.version < 45 ? 20 : value.version < 46 ? 30 : HERO_MAX_LEVEL,
        ) ||
        !integer(
          s.hero.townhall,
          4,
          value.version < 45 ? 8 : value.version < 46 ? 9 : MAX_TOWNHALL,
        ) ||
        // Equipment reached level 18 in version 47; every earlier recording stops at nine.
        (value.version >= 24 && !validEquipment(s.hero.equipment, equipmentCeiling)) ||
        (s.hero.equipment !== undefined && !validEquipment(s.hero.equipment, equipmentCeiling)))) ||
    !Array.isArray(s.buildings) ||
    !s.buildings.length ||
    // Version 44 admits complete late villages (Underground Workaround has 820 source entities).
    s.buildings.length > (value.version >= 44 ? 1000 : value.version >= 27 ? 600 : 400)
  )
    return false;
  if (
    s.scenery !== undefined &&
    (value.version < 27 ||
      s.catalog !== 'goblin-v1' ||
      !Array.isArray(s.scenery) ||
      s.scenery.length > 600 ||
      !s.scenery.every(
        (o: any) =>
          object(o) &&
          integer(o.data, 0, 1e9) &&
          Object.hasOwn(NATIVE_SCENERY, o.data) &&
          integer(o.x, 0, 48 - NATIVE_SCENERY[o.data].size) &&
          integer(o.y, 0, 48 - NATIVE_SCENERY[o.data].size),
      ))
  )
    return false;
  // A Practice level is a campaign village fought with its own army.
  if (
    s.fixedArmy !== undefined &&
    (s.fixedArmy !== true || s.practice || s.ladder !== undefined || s.catalog !== 'goblin-v1')
  )
    return false;
  // A ladder match fights a native layout with nothing to loot.
  if (
    s.ladder !== undefined &&
    (value.version < 54 ||
      !validLadderMatch(s.ladder) ||
      s.practice ||
      s.catalog !== 'goblin-v1' ||
      !object(s.availableLoot) ||
      Object.values(s.availableLoot).some((amount) => amount !== 0))
  )
    return false;
  if (
    s.defendingHeroes !== undefined &&
    (value.version < 52 ||
      !Array.isArray(s.defendingHeroes) ||
      s.defendingHeroes.length > 4 ||
      new Set(s.defendingHeroes.map((h) => h?.kind)).size !== s.defendingHeroes.length ||
      s.defendingHeroes.some(
        (h) =>
          !object(h) ||
          !validHero(h.kind) ||
          !integer(h.level, 1, heroMaxLevel(h.kind as HeroKind)) ||
          !Number.isFinite(h.x) ||
          !Number.isFinite(h.y) ||
          h.x < 0 ||
          h.y < 0 ||
          h.x > gridSize(4) ||
          h.y > gridSize(4),
      ))
  )
    return false;
  if (s.heroes !== undefined) {
    if (value.version < NATIVE_HERO_VERSION || !Array.isArray(s.heroes) || s.heroes.length > 4)
      return false;
    const kinds = new Set<string>();
    const pets = new Set<string>();
    for (const hero of s.heroes) {
      if (
        !object(hero) ||
        !validHero(hero.kind) ||
        kinds.has(hero.kind) ||
        !integer(hero.level, 1, heroMaxLevel(hero.kind as HeroKind)) ||
        !Array.isArray(hero.items) ||
        hero.items.length > 2
      )
        return false;
      kinds.add(hero.kind);
      const slugs = new Set<string>();
      for (const item of hero.items) {
        if (
          !object(item) ||
          !validItem(item.slug) ||
          slugs.has(item.slug) ||
          itemHero(item.slug) !== hero.kind ||
          !integer(item.level, 1, itemMaxLevel(item.slug))
        )
          return false;
        slugs.add(item.slug);
      }
      if (hero.pet !== undefined) {
        if (
          !object(hero.pet) ||
          !validPet(hero.pet.kind) ||
          pets.has(hero.pet.kind) ||
          !integer(hero.pet.level, 1, petMaxLevel(hero.pet.kind))
        )
          return false;
        pets.add(hero.pet.kind);
      }
    }
    if (s.hero !== undefined) return false;
    if (s.townhall !== undefined && !integer(s.townhall, 1, 18)) return false;
  } else if (value.version >= NATIVE_HERO_VERSION && s.hero !== undefined) return false;
  if (s.garrisons !== undefined) {
    if (value.version < 38 || !Array.isArray(s.garrisons) || s.garrisons.length > 20) return false;
    const castles = new Set<number>();
    let total = 0;
    for (const g of s.garrisons) {
      if (
        !object(g) ||
        !integer(g.castleId, 1, Number.MAX_SAFE_INTEGER) ||
        castles.has(g.castleId) ||
        !['guard', 'sleep'].includes(g.mode) ||
        !Array.isArray(g.troops) ||
        g.troops.length > MAX_GARRISON_TROOPS ||
        !s.buildings.some(
          (b: any) => object(b) && b.id === g.castleId && isGarrisonBunker(b as Building),
        )
      )
        return false;
      for (const troop of g.troops) {
        if (
          !object(troop) ||
          !integer(troop.level, 1, 100) ||
          !integer(troop.count, 1, MAX_GARRISON_TROOPS) ||
          // Dragon 7 and Balloon 8 exist since version 38; other kinds and levels since 44.
          (garrisonTroopVersion(troop.kind, troop.level) ?? Infinity) > value.version
        )
          return false;
        total += troop.count;
      }
      if (total > MAX_GARRISON_TROOPS) return false;
      try {
        createGarrisonReserve(g.castleId, g.troops, g.mode);
      } catch {
        return false;
      }
      castles.add(g.castleId);
    }
  }
  const ids = new Set<number>();
  const gridVersion: GridVersion = value.version < 12 ? 2 : value.version < 13 ? 3 : 4;
  const mapSize = gridSize(gridVersion);
  for (const b of s.buildings) {
    if (!object(b) || !Object.hasOwn(BUILDINGS, b.kind)) return false;
    const d = BUILDINGS[b.kind as keyof typeof BUILDINGS];
    const size = footprintSize(b.kind, d.size, gridVersion);
    if (
      !integer(b.id, 1, Number.MAX_SAFE_INTEGER) ||
      ids.has(b.id) ||
      !integer(b.x, 0, mapSize - size) ||
      !integer(b.y, 0, mapSize - size) ||
      !validDirection(b.direction) ||
      !validSkeletonMode(b.skeletonMode) ||
      !validXbowMode(b.xbowMode) ||
      !validInfernoMode(b.infernoMode) ||
      !validLateBuilding(b as Building, value.version, s.practice) ||
      !validInfernoAmmo(b.infernoAmmo, b.level) ||
      !validCraftedFields(b as Building) ||
      // The Crafting Station arrived in version 54 recordings, the Helper Hut in version 55.
      (b.kind === 'craftingstation' && value.version < 54) ||
      (b.kind === 'helperhut' && value.version < 55) ||
      (b.kind === 'builder' && b.level > 4 && value.version < 56) ||
      ((b.spellMode !== undefined ||
        b.gearMode !== undefined ||
        b.weaponLevel !== undefined ||
        b.geared !== undefined ||
        b.supercharge !== undefined ||
        b.guardian !== undefined ||
        b.guardianLevel !== undefined ||
        // The Tornado Trap is not here: it shipped as a campaign family in version 44.
        b.kind === 'gigabomb') &&
        value.version < NATIVE_VERSION) ||
      !validSpellTowerMode(b.spellMode, b.kind, b.level) ||
      !validGearMode(b.gearMode, b.kind) ||
      !validWeaponLevel(b.weaponLevel, b.kind, b.level) ||
      (b.geared !== undefined &&
        (b.geared !== true || !['cannon', 'archertower', 'mortar'].includes(b.kind))) ||
      ((b.guardian !== undefined || b.guardianLevel !== undefined) &&
        (b.kind !== 'townhall' ||
          b.level < 18 ||
          !validGuardian(b.guardian) ||
          (b.guardianLevel !== undefined &&
            !integer(b.guardianLevel, 1, guardianLevels(b.guardian ?? 'longshot'))))) ||
      (b.supercharge !== undefined &&
        (!integer(b.supercharge, 1, superchargeCount(b.kind)) || b.level !== d.maxLevel)) ||
      (b.infernoAmmo !== undefined && (b.kind !== 'inferno' || value.version < 43)) ||
      (b.infernoMode !== undefined && b.kind !== 'inferno') ||
      ((b.kind === 'inferno' || b.infernoMode !== undefined) && value.version < 39) ||
      (b.kind === 'clancastle' && value.version < 37) ||
      !integer(
        b.level,
        1,
        npcMaxLevel(b.npc) ??
          (b.kind === 'archertower' && value.version >= 42
            ? MAX_ARCHER_TOWER_LEVEL
            : b.kind === 'darkdrill' && value.version >= 40
              ? MAX_DARK_DRILL_LEVEL
              : ((value.version < 44 ? PRE_LATE_CAMPAIGN_LEVELS[b.kind] : undefined) ??
                (value.version < 45 ? PRE_TOWNHALL_9_LEVELS[b.kind] : undefined) ??
                (value.version < 46 ? PRE_TOWNHALL_18_LEVELS[b.kind] : undefined) ??
                (value.version < 47 ? PRE_VERSION_47_LEVELS[b.kind] : undefined) ??
                d.maxLevel)),
      ) ||
      !validNpcBuilding(b.npc, b.kind, b.level) ||
      (b.npc !== undefined && (s.practice || value.version < 26)) ||
      (b.npc === 'pumpkin-bomb' && value.version < 28) ||
      (b.npc === 'santa-trap' && value.version < 30) ||
      (b.npc === 'shrink-trap' && value.version < 34) ||
      (b.kind === 'skeletontrap' && b.level > 2 && value.version < 29) ||
      !number(b.maxHp, 1, 1e9) ||
      b.hp !== b.maxHp ||
      b.cooldown !== 0 ||
      !number(b.stored, 0, 1e12) ||
      (b.constructing !== undefined && typeof b.constructing !== 'boolean') ||
      (b.upgradeEnd !== undefined && !number(b.upgradeEnd, 0, Number.MAX_SAFE_INTEGER)) ||
      (b.upgradeStart !== undefined && !number(b.upgradeStart, 0, Number.MAX_SAFE_INTEGER))
    )
      return false;
    ids.add(b.id);
  }
  if (
    !Array.isArray(value.steps) ||
    value.steps.length > (value.version >= 25 ? MAX_REPLAY_STEPS : 6000) ||
    !value.steps.every((d) => number(d, 0.000001, 10)) ||
    value.steps.reduce((n, d) => n + d, 0) > (value.version >= 25 ? MAX_REPLAY_STEPS * 10 : 230) ||
    !Array.isArray(value.actions) ||
    !value.actions.length ||
    value.actions.length > MAX_REPLAY_ACTIONS
  )
    return false;
  let last = 0;
  for (const [i, a] of value.actions.entries()) {
    if (!object(a) || !integer(a.step, last, value.steps.length)) return false;
    if (
      a.targetHero !== undefined &&
      (value.version < 123 ||
        a.type !== 'spell' ||
        a.kind !== 'revive' ||
        !validHero(a.targetHero) ||
        !(
          s.heroes?.some((hero: HeroSetup) => hero.kind === a.targetHero) ||
          (a.targetHero === 'king' && !!s.hero)
        ))
    )
      return false;
    last = a.step;
    if (a.type === 'end') {
      if (i !== value.actions.length - 1 || a.step !== value.steps.length) return false;
    } else if (a.type === 'ability') {
      if (!s.hero && !s.heroes?.some((hero: HeroSetup) => hero.kind === a.hero)) return false;
    } else if (a.type === 'troop' || a.type === 'spell' || a.type === 'hero') {
      if (!number(a.x, 0, mapSize) || !number(a.y, 0, mapSize)) return false;
      if (a.type === 'troop' && !troopKeys.includes(a.kind)) return false;
      if (a.type === 'spell' && !spellKeys.includes(a.kind)) return false;
      if (a.type === 'hero' && !s.hero && !s.heroes?.some((h: HeroSetup) => h.kind === a.hero))
        return false;
    } else return false;
  }
  return value.actions.at(-1).type === 'end';
}
