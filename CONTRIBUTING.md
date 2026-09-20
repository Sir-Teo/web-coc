# Contributing

## Setup

Use Node.js 24, then run `npm ci` and `npm run dev`. The lockfile and committed
runtime assets are enough to run the game. Python and native client files are only
needed for asset reconstruction; see [the asset guide](docs/ASSETS.md).

Read [the architecture guide](docs/ARCHITECTURE.md) before changing simulation,
persistence or rendering. Browse [the documentation index](docs/README.md) for
feature-specific behavior and source references.

## Make a change

1. Create a branch and keep the change focused. Separate mechanical formatting
   from gameplay changes so reviewers can see the behavior being changed.
2. Follow nearby TypeScript conventions. Runtime code uses strict types and rejects
   unused locals and parameters. Use Prettier on the files you edit.
3. Add regression coverage for behavior changes. Reuse fixtures under `tests/fixtures/`.
   Keep test-only helpers out of `src/`.
4. Run `npm run check`. For UI, rendering, input, storage or offline changes, run the
   relevant [browser tests](docs/QA.md). Check a production build before a release.
5. Update the relevant guide when behavior, commands or a data format changes.

## Boundaries to preserve

- Combat must remain deterministic. Keep wall-clock time, browser APIs and rendering
  out of simulation steps; preserve save migrations and replay compatibility.
- Keep mesh graphs and scene classes out of the simulation dependency tree. Lazy
  campaign and developer tools must remain lazy.
- Treat generated data and assets as build outputs. Change their source or importer,
  regenerate them, and include reproducibility checks and provenance.
- Keep `output/`, `dist/`, downloaded native client files and local credentials out of Git.
- Do not delete artwork based only on a text search: URLs can be assembled from level,
  direction and state at runtime.

## Pull requests

Describe the problem, the resulting behavior and how you verified it. Include
screenshots for visible changes and call out save/replay format changes, asset size
changes and known limitations. Include source and generated outputs together when
reviewers need both to reproduce a change.

`npm run typecheck:tests` checks the unit tests and shared fixtures. Keep fixtures
complete by using `emptyArmy()` and `emptySpells()` from `src/game/army.ts`, then
overriding the values a scenario needs.

Do not add a license or assume rights to third-party artwork on behalf of its owner.
