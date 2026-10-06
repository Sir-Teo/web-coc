import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { PRACTICE_LEVELS, practiceLevelAt } from '../src/game/practice-mode';
import { freshNativeCampaign } from '../src/game/native-campaign';
import { validateReplay } from '../src/game/replay';

/** Giant Smash, the first Practice level: campaign stage 91. */
const GIANT_SMASH = 90;

function village() {
  const m = new GameModel();
  m.townhall!.level = 13;
  m.state.nativeCampaign = freshNativeCampaign();
  return m;
}
/** Deploys the guide's unit on its spot, as a player following the guide would. */
function follow(m: GameModel) {
  const step = m.guideStep!,
    spot = m.practiceGuide!.spot ?? { x: 2, y: 2 };
  const unit = step.unit!;
  if ('troop' in unit) {
    m.activeTroop = unit.troop;
    m.activeSpell = null;
    m.activeHeroKind = null;
    return m.deploy(spot.x, spot.y);
  }
  if ('spell' in unit) {
    m.activeSpell = unit.spell;
    return m.castSpell(spot.x, spot.y);
  }
  m.activeSpell = null;
  m.activeHeroKind = unit.hero;
  return m.deploy(spot.x, spot.y);
}

describe('Practice Mode guide', () => {
  it('imports the client’s steps for every fielded level, in its words', () => {
    const fielded = PRACTICE_LEVELS.filter((level) => level.stage);
    expect(fielded.every((level) => level.steps.length > 0)).toBe(true);
    const smash = practiceLevelAt(GIANT_SMASH)!.steps;
    expect(smash.map((s) => s.name)).toEqual([
      'TH4_Giant_Giants1',
      'Wait_500ms',
      'TH4_Giant_WallBreakers',
      'Wait_5000ms',
      'TH4_Giant_Giants2',
      'Wait_5000ms',
      'TH4_Giant_Goblins',
    ]);
    expect(smash[0]).toMatchObject({
      text: 'Deploy a <c54a0fe>Giant</c> to shield the <c54a0fe>Wall Breakers</c>.',
      unit: { troop: 'giant' },
      count: 1,
      at: { x: 25, y: 37 },
      radius: 1,
      pause: true,
      forceType: true,
      forceLocation: true,
      exact: true,
    });
    expect(smash[2]).toMatchObject({ unit: { troop: 'wallbreaker' }, count: 2, slowdown: 10 });
    expect(smash[6]).toMatchObject({ duration: 25 });
    // Hog Rush waits for a Cannon to fall before its Heal Spells.
    const hog = PRACTICE_LEVELS.find((l) => l.id === 'CHALLENGE_TH7_HOG')!.steps;
    expect(hog.find((s) => s.name === 'TH7_Hog_Wait_For_Heal')!.waitFor).toEqual({ x: 37, y: 22 });
  });

  it('guides a first attempt, holds the battle for its steps and enforces what they ask', () => {
    const m = village();
    const toasts: string[] = [];
    m.onToast = (message) => toasts.push(message);
    m.startCampaign(GIANT_SMASH);
    const b = m.battle!;
    expect(m.guideStep!.name).toBe('TH4_Giant_Giants1');
    expect(m.guideText).toContain('Deploy a <c54a0fe>Giant</c>');
    // The step's unit is put in hand; another one is refused.
    expect(m.activeTroop).toBe('giant');
    m.activeTroop = 'goblin';
    expect(m.deploy(25, 40)).toBe(false);
    expect(toasts.at(-1)).toBe('Follow the guide: deploy Giant now.');
    // Outside the circle is refused; inside, the Giant lands on the spot itself.
    m.activeTroop = 'giant';
    const spot = m.practiceGuide!.spot!;
    expect(m.deploy(spot.x + 6, spot.y)).toBe(false);
    expect(toasts.at(-1)).toBe('Deploy inside the marked circle.');
    expect(m.deploy(spot.x + 0.6, spot.y)).toBe(true);
    expect(b.units[0]).toMatchObject({ kind: 'giant', x: spot.x, y: spot.y });
    // Half a second's wait runs at full speed, refusing deploys.
    expect(m.guideStep!.name).toBe('Wait_500ms');
    m.activeTroop = 'goblin';
    expect(m.deploy(2, 2)).toBe(false);
    expect(toasts.at(-1)).toBe('Wait for the guide’s next step.');
    for (let i = 0; i < 12; i++) m.step(0.05);
    // The Wall Breakers' step runs the battle at a tenth of its speed until they are down.
    expect(m.guideStep!.name).toBe('TH4_Giant_WallBreakers');
    expect(m.activeTroop).toBe('wallbreaker');
    let before = b.elapsed;
    m.step(1);
    expect(b.elapsed - before).toBeCloseTo(0.1, 5);
    expect(follow(m)).toBe(true);
    expect(follow(m)).toBe(true);
    expect(m.guideStep!.name).toBe('Wait_5000ms');
    for (let i = 0; i < 101; i++) m.step(0.05);
    // The second Giants step freezes the battle until all twelve are down.
    expect(m.guideStep!.name).toBe('TH4_Giant_Giants2');
    before = b.elapsed;
    m.step(1);
    expect(b.elapsed).toBe(before);
    for (let i = 0; i < 12; i++) expect(follow(m)).toBe(true);
    expect(m.guideStep!.name).toBe('Wait_5000ms');
    // Skipping leaves the player free.
    m.skipPracticeGuide();
    expect(m.practiceGuide).toBeNull();
    m.activeTroop = 'goblin';
    expect(m.deploy(2, 2)).toBe(true);
  });

  it('plays every fielded level’s guide through to its end', { timeout: 120_000 }, () => {
    for (const level of PRACTICE_LEVELS.filter((l) => l.stage)) {
      const m = village();
      m.startCampaign(level.stage! - 1);
      m.discardRecording();
      expect(m.practiceGuide, level.name).not.toBeNull();
      let ticks = 0;
      while (m.practiceGuide && ticks < 30_000 && !m.battle!.finished) {
        const step = m.guideStep!;
        if (step.unit && !step.ability) expect(follow(m), `${level.name}: ${step.name}`).toBe(true);
        else {
          if (step.ability && step.unit && 'hero' in step.unit)
            m.activateNativeHeroAbility(step.unit.hero);
          m.step(0.05);
          ticks++;
        }
      }
      expect(m.practiceGuide, `${level.name} stuck at ${m.guideStep?.name}`).toBeNull();
    }
  });

  it('guides first attempts only, unless a guided attack is asked for', () => {
    const m = village();
    m.state.nativeCampaign!.stars[GIANT_SMASH] = 1;
    m.startCampaign(GIANT_SMASH);
    expect(m.practiceGuide).toBeNull();
    m.returnHome();
    m.startCampaign(GIANT_SMASH, true);
    expect(m.practiceGuide).not.toBeNull();
    m.returnHome();
    expect(m.practiceGuide).toBeNull();
    // The Goblin map's villages have no guide.
    m.startCampaign(0, true);
    expect(m.practiceGuide).toBeNull();
  });

  it('records only the time fought: frozen moments are not in the replay', () => {
    const m = village();
    m.startCampaign(GIANT_SMASH);
    follow(m);
    for (let i = 0; i < 12; i++) m.step(0.05);
    // Frozen: the Wall Breakers' slowed step, then the Giants' frozen one.
    follow(m);
    follow(m);
    for (let i = 0; i < 101; i++) m.step(0.05);
    for (let i = 0; i < 20; i++) m.step(0.05);
    const b = m.battle!;
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    expect(replay.steps.reduce((a, s) => a + s, 0)).toBeCloseTo(b.elapsed, 6);
  });
});
