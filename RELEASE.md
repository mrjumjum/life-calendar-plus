# Release checklist

1. `npm run release -- <version>`: bumps `manifest.json`, `package.json`, `package-lock.json` and `versions.json`, runs `npm run check` and `npm test`, commits and creates the tag `<version>` (no `v` prefix).
2. `git push origin main <version>`: `.github/workflows/release.yml` verifies tag == manifest version, re-runs the checks and publishes a GitHub release with `main.js`, `manifest.json` and `styles.css` (the files BRAT installs).
3. Add a `CHANGELOG.md` entry before step 1.

Never push upstream's `1.0.0` / `1.0.1` tags to this repository (the workflow refuses them because their manifest id is `life-calendar`).
