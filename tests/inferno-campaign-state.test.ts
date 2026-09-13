import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { NATIVE_CAMPAIGN, nativeCampaignIssues } from '../src/game/native-campaign';
import { nativeInfernoStates } from '../src/game/inferno-campaign-state';

it('preserves all 182 original Infernos, including explicit false modes and full ammo', () => {
  const originals = readFileSync('reference/campaign/layouts.jsonl', 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  let total = 0,
    single = 0,
    alternate = 0;
  NATIVE_CAMPAIGN.forEach((stage, i) => {
    const raw = originals[i].buildings.filter((b) => b.data === 1000027);
    expect(stage.infernoStates).toEqual(raw);
    const parsed = nativeInfernoStates(stage);
    parsed.forEach((state, index) => {
      expect(state).toEqual({
        id: raw[index].id,
        x: raw[index].x,
        y: raw[index].y,
        level: raw[index].lvl + 1,
        attackMode: raw[index].attack_mode,
        ammunition: raw[index].ammo,
      });
      total++;
      if (state.attackMode) alternate++;
      else single++;
    });
  });
  expect({ total, single, alternate }).toEqual({ total: 182, single: 79, alternate: 103 });
  expect(nativeInfernoStates(NATIVE_CAMPAIGN[58])).toHaveLength(4);
  expect(
    nativeInfernoStates(NATIVE_CAMPAIGN[58]).every((v) => !v.attackMode && v.ammunition === 1000),
  ).toBe(true);
  expect(nativeCampaignIssues(58)).toEqual(['Inferno Tower']);
});
it('rejects missing, unmatched, duplicate or invalid state while retaining zero ammunition', () => {
  const fresh = () => structuredClone(NATIVE_CAMPAIGN[58]);
  for (const mutate of [
    (s) => {
      s.infernoStates.pop();
    },
    (s) => {
      s.infernoStates[1] = structuredClone(s.infernoStates[0]);
    },
    (s) => {
      delete s.infernoStates[0].attack_mode;
    },
    (s) => {
      s.infernoStates[0].attack_mode = 'false';
    },
    (s) => {
      s.infernoStates[0].x++;
    },
    (s) => {
      s.infernoStates[0].ammo = -1;
    },
    (s) => {
      s.infernoStates[0].ammo = 1001;
    },
    (s) => {
      s.infernoStates[0].ammo = 1.5;
    },
  ]) {
    const stage = fresh();
    mutate(stage);
    expect(() => nativeInfernoStates(stage)).toThrow();
  }
  const stage = fresh();
  (stage.infernoStates![0] as Record<string, unknown>).ammo = 0;
  expect(nativeInfernoStates(stage)[0].ammunition).toBe(0);
});
