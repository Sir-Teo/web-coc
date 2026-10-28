import { REPLAY_VERSION } from '../../src/game/replay';
import {
  nativeDirectBattle,
  nativeDirectRecording,
  type NativeDirectTarget,
} from './native-direct-attacks';

export function attackingIceGolemBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle('icegolem', level, version, x, target);
}
export function attackingIceGolemRecording(version = REPLAY_VERSION, level = 1, garrison = false) {
  return nativeDirectRecording('icegolem', 172, version, level, garrison);
}
