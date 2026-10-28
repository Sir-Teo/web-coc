import type { TroopKind } from './data';

export const SPLIT_HOG_KINDS = ['superhog', 'superrider'] as const;
export type SplitHogKind = (typeof SPLIT_HOG_KINDS)[number];
export type DeployTroopKind = TroopKind | SplitHogKind;
export const isSplitHog = (kind: string): kind is SplitHogKind =>
  kind === 'superhog' || kind === 'superrider';
export interface RecalledSplitTroop {
  level: number;
  hp: number;
  owner?: number;
}
