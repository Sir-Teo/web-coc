import { REPLAY_VERSION } from '../../src/game/replay';
import {
  nativeDirectBattle,
  nativeDirectRecording,
  type NativeDirectTarget,
} from './native-direct-attacks';

export function attackingMinerBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle('miner', level, version, x, target);
}
export function attackingMinerRecording(version = REPLAY_VERSION, level = 1, garrison = false) {
  return nativeDirectRecording('miner', 178, version, level, garrison);
}
