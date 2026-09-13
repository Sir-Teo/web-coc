import type { GarrisonDefender } from './defenders';
import type { Battle } from './model';
import type { NativeScenePose } from './native-mesh';
import { GARRISON_GRAPHS, garrisonPoses } from './garrison-poses';

// Verified original black-alpha shadow shapes: troop files use 0; common death uses 45.
const shadowVertices = new Set(
  [
    ...GARRISON_GRAPHS.dragon.shapes[0],
    ...GARRISON_GRAPHS.balloon.shapes[0],
    ...GARRISON_GRAPHS.dragonDeath.shapes[45],
  ].map(([, vertices]) => vertices),
);

/** Separate original shadow commands without changing their texels, transforms or timeline. */
export function garrisonLayers(defender: GarrisonDefender, battle: Battle, reduced = false) {
  const split = (poses: NativeScenePose[]) => {
    const body: NativeScenePose[] = [],
      shadow: NativeScenePose[] = [];
    for (const pose of poses) {
      if ('group' in pose) {
        const nested = split(pose.group);
        if (nested.body.length) body.push({ ...pose, group: nested.body });
        if (nested.shadow.length) shadow.push({ ...pose, group: nested.shadow });
      } else (shadowVertices.has(pose.vertices) ? shadow : body).push(pose);
    }
    return { body, shadow };
  };
  return split(garrisonPoses(defender, battle, reduced));
}
