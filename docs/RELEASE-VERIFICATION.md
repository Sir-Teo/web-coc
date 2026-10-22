# Release and hosting

## Verify a release

Use Node.js 24 and a clean dependency install:

```sh
npm ci
npx playwright install chromium webkit
npm run check
npm run test:production
npm run test:late-art:production
```

`check` builds `dist/`. The production runner requires that build, starts its own
preview on an available loopback port, and stops it on success or failure. It has a
five-minute process timeout (its CI steps allow six) and cannot silently attach to an old
preview server.

The smoke suite covers village boot, collection, required artwork, shop, research,
replay controls and transfer of save ownership between tabs in Chromium and WebKit.
Chromium also checks offline reload and cached gameplay flows. Console errors,
failed HTTP responses and missing required assets fail the check. The report is
`output/playtest/production-report.json`.
Canvas checks verify native density at boot and proportional adaptive density after resizing.

Production loads each defense family the first time something draws it, and ships
converted PNGs as WebP. So the required-art list counts a WebP response as its PNG.
At the end of the session, the check fetches any listed file that the session did
not draw. The host answers an unknown path with the page itself (200, `text/html`),
so only an image or audio response counts as deployed. Deleting a deployed file
from `dist` fails the check.

Run relevant gameplay specs for the feature being released. The on-demand
`browser-regression.yml` workflow shards the broader Chromium/WebKit suite and
runs additional asset and production checks. Passing smoke tests alone does not
qualify every map, device or browser.

## Feature-specific production runners

The `test:*:production` scripts in `package.json` target individual systems. Check the
script's header and `PRODUCTION_BASE_URL` support: some own a preview, while others
expect one at port 4173. Both `test:production` and `test:late-art:production` start
and own isolated previews.

The late-art check injects temporary failures into the built late-presentation and
character-graph chunks, verifies fresh-URL recovery and interactive UI, and preserves
the reload path for removed release chunks. It also checks that these chunks stay out
of the startup cache. It runs Chromium and WebKit by default; `PRODUCTION_BROWSER`
can select either engine. Fault-injection cases block service workers. A separate case
uses the real worker with an unavailable preview host to verify cached retry downloads;
the general smoke suite also checks the ordinary worker and offline boot.

## Deployment

The GitHub deployment workflow runs on pull requests to `main`, pushes to `main`
and manual dispatch. A first job runs the test typecheck, documentation link validation
and the full unit suite (`npm test`). Only when it passes does the second job build the
production bundle and run the Chromium production smoke suite (`npm run test:production`:
boot, required art, save and reload, and an offline reload through the service worker)
and the lazy art recovery checks before publishing. Only a main-branch run can deploy.
The full browser matrix remains on demand: the `browser-regression.yml` workflow
retains browser evidence for seven days.

The repository publishes `dist/` to GitHub Pages at <https://coc.teozeng.dev>.
Pages uses GitHub Actions as its build source and `coc.teozeng.dev` as its custom
domain. DNS has a `coc` CNAME pointing to `sir-teo.github.io` (without `/web-coc`).
The custom domain serves the game at `/`, as required by its asset and offline URLs.
CI uses the workflow's short-lived GitHub token; no hosting credentials are needed.

Pushes to `main` publish after the checks above pass. `npm run deploy` uses an
authenticated GitHub CLI to dispatch that same workflow for the committed remote
`main` branch; it does not publish local working-tree changes. For a fork, update
the package command, Pages custom domain and DNS before deploying.
The Firebase configuration is retained only for rollback to the former host.

## Cache and rollback

GitHub Pages controls HTTP cache headers. Build-generated service-worker manifests
track content hashes. Keep the build and its assets together when releasing.

To roll back, revert the release commit on `main` and let the same checks and Pages
deployment run. Verify an existing browser
session updates correctly as well as a fresh load. Do not delete a user's stored
village as an update workaround; storage migrations must remain compatible.

## Readiness limits

This is a client-only fan game: saves and results are user-controlled, and there is
no server-side trust boundary. Physical-device performance, the hosted Linux
workflow and rights to distribute third-party artwork require their own
verification; local checks do not establish them.
