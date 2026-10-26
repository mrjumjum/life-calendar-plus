// Usage: npm run release -- <version>      e.g. npm run release -- 1.2.0
// Bumps manifest.json, package.json, package-lock.json and versions.json,
// runs the checks, commits "release: <version>" and creates tag <version>
// (no "v" prefix, matching upstream). It never pushes.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
const readJson = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const writeJson = (file, data) => writeFileSync(join(root, file), `${JSON.stringify(data, null, 2)}\n`);

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || "")) {
  console.error("Usage: npm run release -- <semver>   (e.g. 1.2.0, no 'v' prefix)");
  process.exit(1);
}
if (out("git", ["status", "--porcelain"])) {
  console.error("Working tree is not clean; commit or stash first.");
  process.exit(1);
}
if (out("git", ["tag", "-l", version])) {
  console.error(`Tag ${version} already exists.`);
  process.exit(1);
}

const manifest = readJson("manifest.json");
manifest.version = version;
writeJson("manifest.json", manifest);

const pkg = readJson("package.json");
pkg.version = version;
writeJson("package.json", pkg);

const lock = readJson("package-lock.json");
lock.version = version;
if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
writeJson("package-lock.json", lock);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

run("npm", ["run", "-s", "check"]);
run("npm", ["test"]);

run("git", ["add", "manifest.json", "package.json", "package-lock.json", "versions.json"]);
run("git", ["commit", "-m", `release: ${version}`]);
run("git", ["tag", "-a", version, "-m", version]);

console.log(`\nTagged ${version}. Publish with:\n  git push origin main ${version}`);
