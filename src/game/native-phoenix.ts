import type { Battle, Unit } from './model';
import { reviveHeroAuras } from './native-hero-aura-revival';
import { resetHeroRegeneration } from './native-hero-regeneration';
import type { NativeBattleHero } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import type { CombatProjectile } from './projectiles';
import { launchProjectile } from './projectiles';
import { nativeUnitRow, nativeUnitStats } from './native-units';
import { nativeRow, num, seconds, text } from './native-data';
import { unitEffects, unitFrozen } from './native-status';
import { TROOPS } from './data';

type Spawn = (
  kind: Unit['kind'],
  level: number,
  x: number,
  y: number,
  at: number,
  owner?: number,
) => Unit;
const EPS = 1e-9;
const unitById = (battle: Battle, id: number | null | undefined) =>
  battle.units.find((u) => u.id === id);

function protection(unit: Unit, until: number) {
  const effects = unitEffects(unit);
  effects.immortalUntil = Math.max(effects.immortalUntil ?? 0, until);
  effects.shield = { until: Math.max(effects.shield?.until ?? 0, until), percent: 1 };
}

/** The source bird waits behind its separate, visible and invulnerable Egg actor. */
export function initializePhoenix(
  ctx: NativeTroopContext,
  owner: NativeBattleHero,
  hero: Unit,
  bird: Unit,
  spawn: Spawn,
) {
  if (!ctx.battle.nativePhoenixResurrection || owner.pet?.kind !== 'phoenix') return;
  const state = (owner.phoenix ??= { used: false, eggId: null });
  if (!state.used) {
    bird.native!.phoenixWaiting = true;
    bird.native!.untargetable = true;
    const egg = spawn('phoenixegg', owner.pet.level, bird.x, bird.y, ctx.battle.elapsed, hero.id);
    egg.native!.phoenixEgg = true;
    egg.native!.untargetable = true;
    state.eggId = egg.id;
  }
  if ((state.pausedRevive ?? 0) > 0) {
    const duration = state.pausedRevive!;
    const until = ctx.battle.elapsed + duration;
    unitEffects(hero).phoenixRevive = { until, duration: state.reviveDuration ?? duration };
    protection(hero, until);
  }
  if ((state.pausedProtection ?? 0) > 0)
    protection(bird, ctx.battle.elapsed + state.pausedProtection!);
  delete state.pausedRevive;
  delete state.pausedProtection;
}

/** Temporary revival ends before the next combat sample; the waiting Egg follows its Hero. */
export function stepPhoenix(ctx: NativeTroopContext, dt: number) {
  const battle = ctx.battle;
  if (!battle.nativePhoenixResurrection) return;
  for (const owner of battle.nativeHeroes ?? []) {
    if (owner.pet?.kind !== 'phoenix' || !owner.phoenix) continue;
    const hero = unitById(battle, owner.unitId);
    if (!hero || hero.native?.recalled) continue;
    const revived = hero.native?.effects?.phoenixRevive;
    if (revived && revived.until <= battle.elapsed + EPS && hero.hp > 0) {
      hero.hp = 0;
      hero.defeatedAt = revived.until;
      delete hero.native!.effects!.phoenixRevive;
    }
    if (owner.phoenix.used || hero.hp <= 0) continue;
    const egg = unitById(battle, owner.phoenix.eggId);
    const bird = unitById(battle, owner.petId);
    if (!egg || !bird || egg.hp <= 0 || bird.hp <= 0 || bird.native?.recalled) continue;
    if (!unitFrozen(egg, battle.elapsed)) {
      const stats = nativeUnitStats('phoenixegg', owner.pet.level);
      const dx = hero.x - egg.x,
        dy = hero.y - egg.y,
        distance = Math.hypot(dx, dy);
      const move = Math.min(stats.speed * dt, Math.max(0, distance - stats.range - stats.leash));
      if (distance > EPS && move > 0) {
        egg.x += (dx / distance) * move;
        egg.y += (dy / distance) * move;
      }
    }
    egg.attacking = bird.attacking = false;
    bird.x = egg.x;
    bird.y = egg.y;
  }
}

/** Called after the Hero's automatic KO ability had its chance to save it. */
export function hatchPhoenix(ctx: NativeTroopContext, owner: NativeBattleHero, hero: Unit) {
  const battle = ctx.battle,
    state = owner.phoenix;
  if (
    !battle.nativePhoenixResurrection ||
    owner.pet?.kind !== 'phoenix' ||
    !state ||
    state.used ||
    hero.hp > 0 ||
    hero.ejected ||
    hero.native?.recalled
  )
    return;
  const bird = unitById(battle, owner.petId),
    egg = unitById(battle, state.eggId);
  if (!bird || !egg || bird.hp <= 0 || egg.hp <= 0 || bird.native?.recalled) return;
  state.used = true;
  state.pending = true;
  const ability = nativeUnitStats('phoenix', owner.pet.level).abilities.find(
    (a) => a.name === 'PhoenixSpawnAbility',
  )!;
  const duration = seconds(
    nativeRow('abilities', ability.name, ability.level),
    'DeactivateAfterTime',
  );
  protection(bird, battle.elapsed + duration);
  delete bird.native!.phoenixWaiting;
  delete bird.native!.untargetable;
  bird.spawnedAt = battle.elapsed;
  const row = nativeUnitRow('phoenixegg', owner.pet.level);
  launchProjectile(
    battle,
    {
      weapon: 'native',
      native: {
        name: text(row, 'AltProjectile'),
        kind: 'phoenixegg',
        level: owner.pet.level,
        phoenixRevive: {
          heroId: hero.id,
          birdId: bird.id,
          spellLevel: num(row, 'HeroDeathAbilityLevel', 1),
        },
      },
      sourceId: egg.id,
      targetId: hero.id,
      targetBuilding: false,
      fromX: egg.x,
      fromY: egg.y,
      x: hero.x,
      y: hero.y,
      fromAir: false,
      toAir: !!TROOPS[hero.kind].flying,
      damage: 0,
    },
    ctx.effect,
  );
  // A hatch is not a troop casualty (notably for Dark Crown's lost-housing calculation).
  const index = battle.units.indexOf(egg);
  if (index >= 0) battle.units.splice(index, 1);
  state.eggId = null;
  ctx.effect({ type: 'spawn', x: bird.x, y: bird.y, sourceId: bird.id });
}

/** Resolve the fixed 500 ms source resurrection projectile even though its Hero is knocked out. */
export function resolvePhoenixRevive(ctx: NativeTroopContext, projectile: CombatProjectile) {
  const revive = projectile.native?.phoenixRevive;
  if (!ctx.battle.nativePhoenixResurrection || !revive) return false;
  const owner = ctx.battle.nativeHeroes?.find(
    (h) => h.unitId === revive.heroId && h.petId === revive.birdId,
  );
  if (!owner?.phoenix?.pending) return true;
  delete owner.phoenix.pending;
  const hero = unitById(ctx.battle, revive.heroId);
  if (!hero || hero.hp > 0 || hero.ejected || hero.native?.recalled) return true;
  const row = nativeRow('spells', 'TroopImmortality', revive.spellLevel);
  const duration = seconds(row, 'ImmortalTime'),
    until = projectile.impact + duration;
  owner.phoenix.reviveDuration = duration;
  // The runtime requires positive HP for an acting unit. This is temporary life, not a heal.
  hero.hp = 1;
  hero.spent = false;
  delete hero.defeatedAt;
  hero.target = null;
  delete hero.defenderTarget;
  hero.path = [];
  hero.pathAt = 0;
  if (ctx.battle.nativeRevengeDeck && hero.native) delete hero.native.revengeHits;
  unitEffects(hero).phoenixRevive = { until, duration };
  protection(hero, until);
  const activationId = reviveHeroAuras(ctx.battle, hero, projectile.impact);
  resetHeroRegeneration(ctx.battle, hero, projectile.impact);
  ctx.effect({
    type: 'spawn',
    x: hero.x,
    y: hero.y,
    sourceId: hero.id,
    ...(activationId ? { abilityCastId: activationId } : {}),
  });
  return true;
}

/** Phoenix revival time pauses in the Recall bar; the Egg only returns with its Hero. */
export function recallPhoenix(battle: Battle, owner: NativeBattleHero, hero: Unit) {
  const state = owner.phoenix;
  if (!battle.nativePhoenixResurrection || !state) return;
  const remaining = (hero.native?.effects?.phoenixRevive?.until ?? 0) - battle.elapsed;
  if (remaining > EPS) state.pausedRevive = remaining;
  const bird = unitById(battle, owner.petId);
  const protectedFor = (bird?.native?.effects?.immortalUntil ?? 0) - battle.elapsed;
  if (protectedFor > EPS && state.used) state.pausedProtection = protectedFor;
  const egg = unitById(battle, state.eggId);
  if (egg) battle.units.splice(battle.units.indexOf(egg), 1);
  state.eggId = null;
}
