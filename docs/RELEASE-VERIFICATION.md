# Release and hosting

## Verify a release

Use Node.js 24 and a clean dependency install:

```sh
npm ci
npx playwright install chromium webkit
npm run check
npm run test:production
```

`check` builds `dist/`. The production runner requires that build, starts its own
preview on an available loopback port, and stops it on success or failure. It has a
three-minute process timeout and cannot silently attach to an old preview server.

The smoke suite covers village boot, collection, required artwork, shop, research,
replay controls and transfer of save ownership between tabs in Chromium and WebKit.
Chromium also checks offline reload and cached gameplay flows. Console errors,
failed HTTP responses and missing required assets fail the check. The report is
`output/playtest/production-report.json`.

Run relevant gameplay specs for the feature being released. The on-demand
`browser-regression.yml` workflow shards the broader Chromium/WebKit suite and
runs additional asset and production checks. Passing smoke tests alone does not
qualify every map, device or browser.

## Feature-specific production runners

The `test:*:production` scripts in `package.json` target individual systems. Most
expect a separately running preview at port 4173; check the script's header and
`PRODUCTION_BASE_URL` support before running one. Only `test:production` guarantees
that it starts and owns an isolated preview server.

## Deployment

The GitHub deployment workflow runs on pull requests to `main`, pushes to `main`
and manual dispatch. It requires runtime and test typechecks, documentation link
validation and a production build before publishing. Only a main-branch run can
deploy. The full simulation, browser and offline suites remain explicit release checks;
the on-demand `browser-regression.yml` workflow retains browser evidence for seven days.

The repository targets Firebase Hosting site `coc-teozeng` in project
`personal-website-3bc37`, serving <https://coc.teozeng.dev>. CI needs the repository's
`FIREBASE_TOKEN` secret. Never commit credentials.

`npm run deploy` performs the local checks and smoke suite, then deploys to that
same site using an authenticated Firebase CLI. It publishes immediately. For a
fork, change `firebase.json`, `.firebaserc`, the package command and workflow target
before using it. Other static hosts can serve `dist/` with equivalent routing and
cache headers.

## Cache and rollback

`firebase.json` revalidates HTML and `sw.js`, gives hashed JS/CSS/font assets a long
cache lifetime and caches images for one day. Build-generated service-worker
manifests track content hashes. Keep the build and its assets together when releasing.

To roll back, restore the previous Hosting release through Firebase, or build and
deploy a known-good Git revision through the same checks. Verify an existing browser
session updates correctly as well as a fresh load. Do not delete a user's stored
village as an update workaround; storage migrations must remain compatible.

## Readiness limits

This is a client-only fan game: saves and results are user-controlled, and there is
no server-side trust boundary. Physical-device performance, the hosted Linux
workflow and rights to distribute third-party artwork require their own
verification; local checks do not establish them.
