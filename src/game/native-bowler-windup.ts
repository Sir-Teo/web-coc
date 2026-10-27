/** Historical Bowler API; the shared ground windup preserves its state and clocks. */
export {
  stepNativeAttackWindup as stepBowlerWindup,
  beginNativeAttackWindup as beginBowlerWindup,
  type NativeAttackWindupState as BowlerWindupState,
} from './native-attack-windup';
