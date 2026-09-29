const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { getRuntimeError, MIN_NODE_VERSION } = require("../scripts/check-runtime.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));

test("runtime guard rejects incompatible Node and Node-API versions before native loading", () => {
  for (const versions of [
    { node: "22.12.0", napi: "9" },
    { node: "22.13.1", napi: "9" },
    { node: "23.0.0", napi: "9" },
    { node: "20.20.0", napi: "10" },
    { node: "24.14.0" },
  ]) {
    assert.match(getRuntimeError(versions), /Node-API 10/);
  }
  for (const node of ["22.14.0", "22.23.0", "24.14.0"]) {
    assert.equal(getRuntimeError({ node, napi: "10" }), null);
  }
});

test("Node version requirements stay aligned across CI, releases, lockfile and docs", () => {
  assert.equal(read(".nvmrc").trim(), MIN_NODE_VERSION);
  assert.equal(pkg.engines.node, `>=${MIN_NODE_VERSION}`);
  assert.deepEqual(JSON.parse(read("package-lock.json")).packages[""].engines, pkg.engines);
  assert.ok(read("README.md").includes(`Node.js ${MIN_NODE_VERSION}`));
  for (const workflow of ["ci.yml", "release.yml"]) {
    const config = yaml.load(read(`.github/workflows/${workflow}`));
    const setupSteps = Object.values(config.jobs).flatMap((job) => job.steps)
      .filter((step) => step.uses?.startsWith("actions/setup-node@"));
    assert.ok(setupSteps.length > 0);
    for (const step of setupSteps) {
      assert.equal(step.with["node-version-file"], ".nvmrc");
      assert.equal(step.with["node-version"], undefined);
    }
  }
});

test("install and test entry points check runtime compatibility", () => {
  assert.equal(pkg.scripts.preinstall, "node scripts/check-runtime.cjs");
  assert.equal(pkg.scripts.pretest, "node scripts/check-runtime.cjs");
  assert.equal(pkg.scripts["check:runtime"], "node scripts/check-runtime.cjs");
  assert.ok(pkg.scripts.check.startsWith("npm run check:runtime && "));
});
