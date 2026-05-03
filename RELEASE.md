# Release checklist

Current release version: `1.0.0`

## GitHub release assets

Attach these files to the GitHub release that matches the manifest version:

- `manifest.json`
- `main.js`
- `styles.css`

## Repository files

Keep these files at the repository root:

- `README.md`
- `LICENSE`
- `versions.json`

## Submission checks

Before submitting to the Obsidian community plugins review process:

1. Confirm `manifest.json` and the git tag use the same version.
2. Confirm `versions.json` maps that version to the minimum supported Obsidian app version.
3. Confirm local vault state is not committed:
   - `data.json`
   - `.DS_Store`
   - private screenshots or notes
4. Confirm the release screenshots are generic and do not expose private vault content.
5. Confirm the plugin still makes no network requests and uses no telemetry.
