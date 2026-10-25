import type { CharacterGraph, CharacterGraphEntry } from './character-art';

/** Preserve captured graph identity, texture namespaces and original shadow shapes. */
export function characterGraphEntry(
  value: unknown,
  prefix: string,
  shadows?: readonly number[],
): CharacterGraphEntry {
  const graph = value as CharacterGraph;
  return { graph, prefix, shadows: shadows ?? graph.shadowShapes ?? [] };
}
