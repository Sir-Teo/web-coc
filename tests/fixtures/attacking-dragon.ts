import { REPLAY_VERSION } from '../../src/game/replay';
import { nativeDirectRecording } from './native-direct-attacks';

export const dragonRecording = (
  version = REPLAY_VERSION,
  level = 1,
  guard: boolean | 'air' = false,
) => nativeDirectRecording('dragon', 189, version, level, guard, 0.4);
