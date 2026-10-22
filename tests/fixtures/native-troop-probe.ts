/** The sampled native pose and the objects that actually stand in for a troop. */
export function nativeTroopProbe(scene: unknown, id: number) {
  const presentation = scene as {
    unitSprites: Map<number, { visible: boolean }>;
    troopNativePresentation: {
      views: Map<
        number,
        {
          state: string;
          sample?: { frame: number; mirror: number; poses: unknown };
          view: { objects: { visible: boolean; alpha: number }[] };
        }
      >;
    };
  };
  const view = presentation.troopNativePresentation.views.get(id);
  return {
    state: view?.state,
    frame: view?.sample?.frame,
    mirror: view?.sample?.mirror,
    pose: JSON.stringify(view?.sample?.poses),
    drawn: view?.view.objects.filter((object) => object.visible && object.alpha > 0).length ?? 0,
    fallback: presentation.unitSprites.get(id)?.visible ?? false,
  };
}
