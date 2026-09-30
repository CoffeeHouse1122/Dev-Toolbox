const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadToast() {
  const exports = {};
  const timers = new Map();
  let timerId = 0;
  const source = fs.readFileSync(require.resolve("../src/renderer/composables/useWorkspaceToast.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require, Error,
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) }
  });
  return { ...exports, timers, toast: exports.useWorkspaceToast().toast };
}

test("toast replacement and owner cleanup cannot dismiss a newer message", () => {
  const api = loadToast();
  const old = api.showWorkspaceToast("目录不存在", "error");
  const staleTimer = [...api.timers.values()][0];
  const current = api.showWorkspaceToast("已保存", "success");
  assert.equal(api.timers.size, 1);
  api.clearWorkspaceToast(old);
  staleTimer();
  assert.equal(api.toast.value.visible, true);
  assert.equal(api.toast.value.id, current);
  api.clearWorkspaceToast(current);
  assert.equal(api.toast.value.visible, false);
  assert.equal(api.timers.size, 0);
});

test("timeout does not persist dismissal, manual close does and actions run only once", async () => {
  const api = loadToast();
  let dismissed = 0;
  let actions = 0;
  const options = { onDismiss: () => { dismissed++; }, action: { label: "重新选择", run: () => { actions++; } } };
  api.showWorkspaceToast("不存在", "error", 8000, options);
  [...api.timers.values()][0]();
  assert.equal(dismissed, 0);
  api.showWorkspaceToast("不存在", "error", 8000, options);
  await api.dismissWorkspaceToast();
  assert.equal(dismissed, 1);
  api.showWorkspaceToast("不存在", "error", 8000, options);
  await api.runWorkspaceToastAction();
  await api.runWorkspaceToastAction();
  assert.equal(actions, 1);
  assert.equal(dismissed, 1);
});

test("toast action failures are reported and IPC wrappers are removed", async () => {
  const api = loadToast();
  api.showWorkspaceToast("重试", "error", 8000, { action: { label: "重试", run: () => { throw new Error("Error invoking remote method 'test': Error: 权限不足"); } } });
  await api.runWorkspaceToastAction();
  assert.equal(api.toast.value.message, "操作失败：权限不足");
  assert.equal(api.toast.value.tone, "error");
  assert.equal(api.toast.value.actionLabel, "");
});
