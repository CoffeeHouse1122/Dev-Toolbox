const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(require.resolve("../src/renderer/navigation.ts"), "utf8");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { defaultGroups, mergeGroups, workbenchRoutes } = exportsObject;

test("navigation merge preserves custom labels, hidden tools and cross-category ordering", () => {
  const merged = mergeGroups([{ id: "system-files", label: "团队文件", tools: [
    { id: "uuid", label: "业务 ID", to: "javascript:invalid" }, { id: "links", label: "团队资料", visible: false },
    { id: "shared-disk", label: "共享盘登录" }, { id: "shared-disk" }, { id: "unknown" }
  ] }]);
  const group = merged.find(item => item.id === "system-files");
  assert.equal(group.label, "团队文件");
  assert.equal(group.tools[0].id, "uuid");
  assert.equal(group.tools[0].label, "业务 ID");
  assert.equal(group.tools[0].to, "/uuid");
  assert.equal(group.tools[1].visible, false);
  assert.equal(group.tools[2].label, "共享连接");
  const ids = merged.flatMap(item => item.tools.map(tool => tool.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, defaultGroups.flatMap(item => item.tools).length);
  assert.equal(ids.includes("unknown"), false);
  assert.equal(merged.find(item => item.id === "assist").tools.some(tool => tool.id === "uuid"), false);
});

test("custom shared connection names survive and merging does not mutate defaults", () => {
  const before = JSON.stringify(defaultGroups);
  const merged = mergeGroups([{ id: "system-files", tools: [{ id: "shared-disk", label: "我的共享" }] }]);
  assert.equal(merged.find(item => item.id === "system-files").tools[0].label, "我的共享");
  assert.equal(JSON.stringify(defaultGroups), before);
  assert.equal(Object.keys(workbenchRoutes).length, 7);
});

test("renderer typecheck explicitly covers the renderer project", () => {
  assert.match(require("../package.json").scripts["typecheck:renderer"], /-p tsconfig\.renderer\.json/);
});
