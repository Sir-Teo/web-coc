import path from 'node:path';

const KEY = 'crown-clan.import-retry';
const TARGETS = ['late-campaign-scene', 'character-graphs'];
const selected = (id) =>
  !!id && TARGETS.some((name) => id.split('?')[0].endsWith(`/src/game/${name}.ts`));
const call = `globalThis[Symbol.for(${JSON.stringify(KEY)})]`;
const NATIVE = '__crownNativeArtImport__';

/** Keep ordinary lazy chunk boundaries, but let a failed art import use a fresh URL. */
export function importRetry() {
  let config;
  const wrapped = new Set();
  let nativeWrapped = false;
  return {
    name: 'art-import-retry',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    renderChunk(code, chunk, _options, meta) {
      const targets = new Map(
        Object.values(meta.chunks)
          .filter((candidate) => selected(candidate.facadeModuleId))
          .map((candidate) => [candidate.fileName, candidate.facadeModuleId]),
      );
      if (!chunk.dynamicImports.some((name) => targets.has(name)) && !code.includes(NATIVE)) return;
      const edits = [];
      const program = this.parse(code);
      for (const node of nativeCalls(program)) {
        const argument = node.arguments[0];
        edits.push({
          start: node.start,
          end: node.end,
          text: `import(${code.slice(argument.start, argument.end)})`,
        });
        nativeWrapped = true;
      }
      for (const node of importExpressions(program)) {
        const filename = path.posix.normalize(
          path.posix.join(path.posix.dirname(chunk.fileName), node.source.value),
        );
        if (!targets.has(filename)) continue;
        wrapped.add(targets.get(filename));
        edits.push({
          start: node.start,
          end: node.end,
          text: `${call}(${JSON.stringify(node.source.value)}, import.meta.url)`,
        });
      }
      return applyEdits(code, edits);
    },
    buildStart() {
      wrapped.clear();
      nativeWrapped = false;
    },
    generateBundle() {
      if (config.command === 'build' && (wrapped.size !== TARGETS.length || !nativeWrapped))
        this.error('The late art and character graph imports must retain their retry wrappers.');
    },
    async transform(code, id, options) {
      if (
        config.command !== 'serve' ||
        options?.ssr ||
        this.environment?.consumer === 'server' ||
        !/\/src\/game\/(scene|character-art|import-retry)\.ts(?:\?|$)/.test(id)
      )
        return;
      const edits = [];
      const program = this.parse(code);
      for (const node of nativeCalls(program)) {
        const argument = node.arguments[0];
        edits.push({
          start: node.start,
          end: node.end,
          text: `import(/* @vite-ignore */ ${code.slice(argument.start, argument.end)})`,
        });
      }
      for (const node of importExpressions(program)) {
        const resolved = await this.resolve(node.source.value, id);
        if (!selected(resolved?.id)) continue;
        const relative = path.relative(config.root, resolved.id).split(path.sep).join('/');
        const url = config.base + relative;
        edits.push({
          start: node.start,
          end: node.end,
          text: `${call}(${JSON.stringify(url)}, import.meta.url)`,
        });
      }
      return applyEdits(code, edits);
    },
  };
}

function findNodes(program, matches) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (matches(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(program);
  return found;
}
const importExpressions = (program) =>
  findNodes(
    program,
    (node) => node.type === 'ImportExpression' && typeof node.source?.value === 'string',
  );
const nativeCalls = (program) =>
  findNodes(
    program,
    (node) =>
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === NATIVE,
  );
function applyEdits(code, edits) {
  if (!edits.length) return;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return { code, map: null };
}
