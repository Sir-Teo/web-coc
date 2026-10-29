import { runtimeBudget } from './runtime-budget';

interface FrameState {
  structuralRevision: number;
  reducedMotion: boolean;
  editing: boolean;
  state: { settings: { batterySaver?: boolean } };
  battle?: { finished: boolean } | null;
  replay?: unknown;
  placement?: unknown;
  wallMove?: unknown;
}

/** Frame caps for idle villages, DOM dialogs and battery saver; never changes simulation time. */
export class FramePacing {
  private revision = -1;
  constructor(private activeAt: number) {}

  private playRate(model: FrameState, blocked: boolean) {
    if (blocked && !model.replay && (!model.battle || model.battle.finished)) return 15;
    return model.state.settings.batterySaver ? 30 : runtimeBudget.playFps;
  }

  wake(model: FrameState, blocked: boolean, now: number) {
    this.activeAt = now;
    return this.playRate(model, blocked);
  }

  sample(model: FrameState, blocked: boolean, now: number) {
    if (model.structuralRevision !== this.revision) {
      this.revision = model.structuralRevision;
      this.activeAt = now;
    }
    if (
      model.battle ||
      model.replay ||
      model.placement ||
      model.wallMove ||
      model.editing ||
      blocked
    )
      this.activeAt = now;
    return now - this.activeAt < 5000
      ? this.playRate(model, blocked)
      : model.reducedMotion
        ? 15
        : 30;
  }
}
