# Release verification

`npm run build && npm run test:production` checks the actual static build. The runner starts its own Vite preview on an available loopback port, passes that origin to the smoke checks, and shuts down the server on success or failure. It cannot silently attach to an older preview already running on port 4173. Browser checks have a three-minute process timeout.

The production smoke checks exercise Chromium and WebKit: village boot, collection animation and cleanup, required replacement artwork requests, shop, research, and transfer of save ownership between tabs. Chromium additionally reloads offline and opens the army drawer. Browser errors, console errors, missing required art and failed HTTP responses fail verification. Results go to `output/playtest/production-report.json`.

Install the test browsers once with `npx playwright install chromium webkit`. The existing direct command, `node scripts/production-check.mjs`, still works with a preview at `http://127.0.0.1:4173`; `PRODUCTION_BASE_URL` can select another preview origin.

## GitHub Actions

The deployment workflow now requires simulation tests, a production build, all Chromium gameplay scenarios, the focused WebKit visual-feedback scenarios, and the production/offline smoke checks before publishing. Browser traces, screenshots and reports are retained for seven days. Both pull requests and manual workflow runs on other branches perform verification without deploying. Concurrency is scoped to each Git ref, so a pull-request run cannot cancel the live main-branch release.

The browser-install and artifact steps follow the primary [Playwright CI guidance](https://playwright.dev/docs/ci-intro) and [GitHub artifact action documentation](https://github.com/actions/upload-artifact). This configuration has been reviewed and its test commands run locally; a hosted GitHub Actions run is still needed to verify the Linux runner itself. Physical-device testing and server-authoritative online systems remain separate production requirements.
