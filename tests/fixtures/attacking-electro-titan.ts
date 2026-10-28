import { REPLAY_VERSION } from '../../src/game/replay';
import {
  nativeDirectBattle,
  nativeDirectRecording,
  type NativeDirectTarget,
} from './native-direct-attacks';

export function attackingElectroTitanBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
) {
  return nativeDirectBattle('electrotitan', level, version, x, target);
}
export function attackingElectroTitanRecording(
  version = REPLAY_VERSION,
  level = 1,
  garrison: boolean | 'air' = false,
) {
  return nativeDirectRecording('electrotitan', 174, version, level, garrison);
}
