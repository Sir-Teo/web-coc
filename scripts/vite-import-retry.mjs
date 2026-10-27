import path from 'node:path';

const KEY = 'crown-clan.import-retry';
const REQUIRED_TARGETS = ['late-campaign-scene', 'character-graphs', 'character-shared-graphs'];
const TARGETS = [
  ...REQUIRED_TARGETS,
  'spell-tower-scene',
  'tornado-trap-scene',
  'freeze-trap-scene',
  'ghost-trap-scene',
  'eagle-artillery-scene',
  'scattershot-scene',
  'monolith-scene',
  'late-goblin-buildings-scene',
  'builder-hut-scene',
  'defending-builder-scene',
];
const coreModule = (id) =>
  !!id && TARGETS.some((name) => id.split('?')[0].endsWith(`/src/game/${name}.ts`));
const selected = (id, root) => {
  const file = id?.split('?')[0];
  return (
    !!file &&
    (coreModule(file) ||
      (file.startsWith(path.posix.join(root, 'reference') + '/') && file.endsWith('.json')))
  );
};
const call = `globalThis[Symbol.for(${JSON.stringify(KEY)})]`;
const NATIVE = '__crownNativeArtImport__';

/** Keep ordinary lazy chunk boundaries, but let a failed art import use a fresh URL. */
export function importRetry() {
  let config;
  const wrapped = new Set();
  const expected = new Set();
  let nativeWrapped = false;
  return {
    name: 'art-import-retry',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      const prefix =
        path.posix.join(new URL(config.base, 'http://vite.local').pathname, 'reference') + '/';
      server.middlewares.use((request, _response, next) => {
        if (request.url?.includes('art-retry=')) {
          const url = new URL(request.url, 'http://vite.local');
          if (
            url.pathname.startsWith(prefix) &&
            url.pathname.endsWith('.json') &&
            /^[1-9][0-9]*$/.test(url.searchParams.get('art-retry') ?? '')
          ) {
            // The browser needs a fresh module identity; Vite's JSON transform needs the
            // ordinary source ID. Keep the cache buster on the client side only.
            url.searchParams.delete('art-retry');
            request.url = url.pathname + url.search;
          }
        }
        next();
      });
    },
    handleHotUpdate({ file, server }) {
      // Native variable imports bypass dependency-edge analysis. Art edits still need to
      // refresh the modules cached by LazyGraph and the retry registry.
      if (selected(file, config.root)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    renderChunk(code, chunk, _options, meta) {
      const chunks = Object.values(meta.chunks);
      const dynamicFiles = new Set(chunks.flatMap((candidate) => candidate.dynamicImports));
      const targets = new Map(
        chunks
          .filter(
            (candidate) =>
              selected(candidate.facadeModuleId, config.root) &&
              dynamicFiles.has(candidate.fileName),
          )
          .map((candidate) => [candidate.fileName, candidate.facadeModuleId]),
      );
      for (const id of targets.values()) expected.add(id);
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
      expected.clear();
      nativeWrapped = false;
    },
    generateBundle() {
      const core = REQUIRED_TARGETS.every((name) =>
        [...expected].some((id) => id.split('?')[0].endsWith(`/src/game/${name}.ts`)),
      );
      if (
        config.command === 'build' &&
        (!core || !nativeWrapped || [...expected].some((id) => !wrapped.has(id)))
      )
        this.error('Every lazy art import must retain its retry wrapper.');
    },
    async transform(code, id, options) {
      if (
        config.command !== 'serve' ||
        options?.ssr ||
        this.environment?.consumer === 'server' ||
        !/\/src\/game\/[^?]+\.ts(?:\?|$)/.test(id) ||
        (!code.includes(NATIVE) && !/\bimport\s*\(/.test(code))
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
        if (!selected(resolved?.id, config.root)) continue;
        const relative = path.relative(config.root, resolved.id).split(path.sep).join('/');
        let url = config.base + relative;
        // Native imports must receive Vite's transformed JS, including for raw JSON facades.
        if (relative.split('?')[0].endsWith('.json') && !/[?&]import\b/.test(relative))
          url += relative.includes('?') ? '&import' : '?import';
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
