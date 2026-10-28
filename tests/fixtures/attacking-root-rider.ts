import { REPLAY_VERSION } from '../../src/game/replay';
import {
  nativeDirectBattle,
  nativeDirectRecording,
  type NativeDirectTarget,
} from './native-direct-attacks';

export function attackingRootRiderBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle('rootrider', level, version, x, target);
}
export function attackingRootRiderRecording(version = REPLAY_VERSION, level = 1, garrison = false) {
  return nativeDirectRecording('rootrider', 173, version, level, garrison);
}
