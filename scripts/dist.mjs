// Copies the three runtime files into dist/<manifest id>/ (no bundling needed:
// main.js is plain CommonJS that Obsidian loads directly).
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outDir = join(root, "dist", manifest.id);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  copyFileSync(join(root, file), join(outDir, file));
}
console.log(`Wrote ${outDir} (version ${manifest.version})`);
