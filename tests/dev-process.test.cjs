const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

test("development scripts avoid nested Windows batch wrappers", () => {
  assert.doesNotMatch(packageJson.scripts.dev, /npm:dev:/);
  assert.match(packageJson.scripts.dev, /^node node_modules\/concurrently\/dist\/bin\/index\.js /);
  assert.match(packageJson.scripts.dev, /"node node_modules\/vite\/bin\/vite\.js"/);
  assert.match(packageJson.scripts.dev, /"node scripts\/dev-electron\.cjs"/);
  assert.equal(packageJson.scripts["dev:renderer"], "node node_modules/vite/bin/vite.js");
  assert.equal(packageJson.scripts["dev:electron"], "node scripts/dev-electron.cjs");
});
