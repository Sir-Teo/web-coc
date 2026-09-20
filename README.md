# Crown & Clan

A browser village-building and strategy game built with TypeScript, Phaser and Vite.
Build a village, train an army, raid campaign maps and replay battles. Saves stay in
your browser; there is no backend or account system.

**[Play the game](https://coc.teozeng.dev)**

## Run locally

Use Node.js 24 (`nvm use` if you have nvm).

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. No environment variables or asset rebuild is needed.

## Check and build

```sh
npm run check           # Types, documentation links, unit tests and build
npm run preview         # Serve dist/ locally
```

For browser and offline checks, see the [testing guide](docs/QA.md).

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture guide](docs/ARCHITECTURE.md)
and the [documentation index](docs/README.md). [Release instructions](docs/RELEASE-VERIFICATION.md)
cover hosting, verification and rollback.

This is an independent educational fan project. Clash of Clans assets and trademarks
belong to Supercell. No project-wide open-source license has been granted; do not assume
code or bundled artwork is licensed for redistribution.
