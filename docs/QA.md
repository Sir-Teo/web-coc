# Testing

## Everyday checks

```sh
npm run check
```

This typechecks unit tests and shared fixtures, checks documentation links, runs
the Vitest suite, typechecks runtime code and builds the production app with its
service worker. It does not start a browser or deploy anything.

| Command                              | Use                                                   |
| ------------------------------------ | ----------------------------------------------------- |
| `npm test`                           | Unit, simulation, replay, save and asset tests        |
| `npx vitest run tests/model.test.ts` | One focused test file                                 |
| `npm run typecheck`                  | Strict runtime types, including unused code           |
| `npm run typecheck:tests`            | Unit test and shared fixture types, including imports |
| `npm run test:docs`                  | Local Markdown file links in project documentation    |

The test project intentionally uses looser types than runtime source, but all its
diagnostics must pass. Browser specs run through Playwright separately.
`npm run test:imports` remains an alias for the complete test-project typecheck.

## Browser checks

Install browsers once, and again when Playwright changes:

```sh
npx playwright install chromium webkit
npm run test:e2e
npx playwright test tests/browser/game.spec.ts --browser=webkit
npx playwright test --config=playwright.retina.config.ts --browser=webkit
```

The default configuration uses Chromium and starts Vite on port 5173. It may reuse
an existing local dev server; CI always starts its own. Stop unrelated servers on
that port before testing. The Retina configuration runs its selected specs at 2×
device scale. Traces and failure screenshots go under `output/`.

For visible changes, inspect desktop and phone layouts, pointer/touch input,
reduced motion and relevant replay pause/seek behavior. Automated pixel or layout
checks do not replace reviewing the actual rendered result.

## Production and offline checks

```sh
npm run build
npm run test:production
```

The production runner owns an isolated preview server and exercises Chromium and
WebKit. Chromium also checks offline reload. See [release verification](RELEASE-VERIFICATION.md)
for coverage, reports, feature-specific runners and deployment requirements.

## Asset changes

Use the changed importer's `--check` mode where supported and run its asset tests.
Native reconstruction needs the pinned source client and Python dependencies; it is
not part of ordinary app setup. See [assets](ASSETS.md) and [script conventions](../scripts/README.md).

## Failures and evidence

Reproduce a failing file on its own before changing timeouts or worker counts. Save
the command, commit, browser and failing assertion in the PR. `output/` is ignored;
upload useful traces or screenshots as review/CI artifacts instead of committing them.

Historical milestone results are available in Git history. They are not evidence
that the current revision passes. Current CI and fresh reports are the release record.
