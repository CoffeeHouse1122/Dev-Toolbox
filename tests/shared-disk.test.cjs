const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { parseSharedPath, sharedDirectory } = require("../dist/shared/shared-disk.js");

let root;
let encryptionAvailable = true;
let nativeResult = { code: 0 };
let nativeAction = async () => nativeResult;
const nativeCalls = [];
const openedPaths = [];
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === "electron") return {
    app: { getPath: () => root }, shell: { openPath: async (target) => { openedPaths.push(target); return ""; } },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString: (value) => Buffer.from(`sealed:${value}`),
      decryptString: (value) => {
        const text = value.toString();
        if (!text.startsWith("sealed:")) throw new Error("invalid");
        return text.slice(7);
      }
    }
  };
  if (request === "./shared-disk-native") return {
    runSharedDiskNative: async (request) => { nativeCalls.push(request); return nativeAction(request); },
    sharedDiskError: (code) => `共享连接失败 ${code}`
  };
  return originalLoad.call(this, request, parent, main);
};
const service = require("../dist/electron/main/services/shared-disk.service.js");
const { getSharedDiskStatus } = require("../dist/electron/main/services/shared-disk-status.service.js");
Module._load = originalLoad;
const fixture = {
  sharePath: "\\\\files.example.test\\team\\素材", authMode: "account", username: "DOMAIN\\tester",
  password: "test-fixture-secret", defaultDirectory: "", rememberCredentials: true
};
async function withProfile(run) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "toolbox-share-test-"));
  encryptionAvailable = true;
  nativeCalls.length = 0;
  openedPaths.length = 0;
  nativeResult = { code: 0 };
  nativeAction = async () => nativeResult;
  try { await run(path.join(root, "data", "shared-disk.json")); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("UNC parsing rejects protocols, traversal, alternate streams and device paths", () => {
  assert.equal(parseSharedPath(" //server/share/素材 ").baseRoot, "\\\\server\\share\\素材");
  assert.equal(sharedDirectory(fixture.sharePath, ""), fixture.sharePath);
  for (const input of ["http://server:5000", "\\\\server", "\\\\server\\share\\..\\secret", "\\\\?\\C:\\secret", "\\\\server:445\\share", "\\\\server\\share\\data:stream", "\\\\server\\share\\x.\\secret", "\\\\server\\share\0"]) {
    assert.throws(() => parseSharedPath(input));
  }
  assert.throws(() => sharedDirectory(fixture.sharePath, "\\\\files.example.test\\team\\素材-other"));
  assert.throws(() => sharedDirectory(fixture.sharePath, "\\\\other\\team"));
});

test("empty profile contains no built-in target or credentials", async () => withProfile(async () => {
  const loaded = await service.loadSharedDiskConfig();
  assert.equal(loaded.sharePath, "");
  assert.equal(loaded.rememberCredentials, false);
  assert.equal(loaded.authMode, "windows");
  assert.equal(loaded.password, "");
}));

test("saved passwords stay in main, bind to identity, and forgetting removes only the app copy", async () => withProfile(async (file) => {
  const saved = await service.saveSharedDiskConfig(fixture);
  assert.equal(saved.password, "");
  assert.equal(saved.hasSavedPassword, true);
  assert.doesNotMatch(await fs.readFile(file, "utf8"), /test-fixture-secret/);
  const loaded = await service.loadSharedDiskConfig();
  await service.connectSharedDisk(loaded);
  assert.equal(nativeCalls[0].password, fixture.password);
  assert.equal(nativeCalls[0].action, "connect");
  await assert.rejects(service.connectSharedDisk({ ...loaded, username: "other" }), /请输入密码/);
  await assert.rejects(service.connectSharedDisk({ ...loaded, sharePath: "\\\\different\\team" }), /请输入密码/);
  assert.equal(nativeCalls.length, 1);
  await fs.writeFile(file + ".bak", "old credential fixture");
  const forgotten = await service.forgetSharedDiskCredentials();
  assert.equal(forgotten.hasSavedPassword, false);
  assert.equal(forgotten.rememberCredentials, false);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).passwordCiphertext, "");
  await assert.rejects(fs.stat(file + ".bak"), /ENOENT/);
  assert.equal(nativeCalls.length, 1, "forget does not touch Windows connections or credentials");
}));

test("remember off never stores a password and unavailable encryption never falls back to plaintext", async () => withProfile(async (file) => {
  encryptionAvailable = false;
  await assert.rejects(service.saveSharedDiskConfig(fixture), /安全存储不可用/);
  await service.saveSharedDiskConfig({ ...fixture, rememberCredentials: false });
  const text = await fs.readFile(file, "utf8");
  assert.doesNotMatch(text, /test-fixture-secret/);
  assert.equal(JSON.parse(text).passwordCiphertext, "");
}));

test("legacy HTTP config migrates without returning or keeping plaintext", async () => withProfile(async (file) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ url: "http://files.example.test:5000", basePath: "/team/素材", username: "tester", password: "old-fixture-password", encrypted: false, persistent: true, defaultDirectory: "" }));
  const loaded = await service.loadSharedDiskConfig();
  assert.equal(loaded.sharePath, fixture.sharePath);
  assert.equal(loaded.password, "");
  assert.equal(loaded.hasSavedPassword, false);
  assert.match(loaded.migrationNotice, /HTTP/);
  assert.doesNotMatch(await fs.readFile(file, "utf8"), /old-fixture-password|http:|5000|persistent/);
}));

test("legacy encrypted credentials are retained without exposing decrypted values", async () => withProfile(async (file) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ url: "http://files.example.test:5000", basePath: "team/素材", username: "DOMAIN\\tester", password: Buffer.from("sealed:" + fixture.password).toString("base64"), encrypted: true, defaultDirectory: "" }));
  const loaded = await service.loadSharedDiskConfig();
  assert.equal(loaded.password, "");
  assert.equal(loaded.hasSavedPassword, true);
  await service.connectSharedDisk(loaded);
  assert.equal(nativeCalls[0].password, fixture.password);
}));

test("corrupt config is not silently overwritten", async () => withProfile(async (file) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "{broken");
  await assert.rejects(service.loadSharedDiskConfig(), /未覆盖/);
  await assert.rejects(service.saveSharedDiskConfig(fixture), /未覆盖/);
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
}));

test("Windows identity sends no credentials; conflicts never trigger automatic disconnect", async () => withProfile(async () => {
  await service.connectSharedDisk({ ...fixture, authMode: "windows", rememberCredentials: false });
  assert.deepEqual(nativeCalls[0], { action: "connect", shareRoot: "\\\\files.example.test\\team" });
  nativeResult = { code: 1219 };
  await assert.rejects(service.connectSharedDisk(fixture), /1219/);
  assert.equal(nativeCalls.length, 2);
  assert.ok(nativeCalls.every((call) => call.action === "connect"));
}));

test("disconnect preserves errors and treats only absent connections as success", async () => withProfile(async () => {
  nativeResult = { code: 5 };
  await assert.rejects(service.disconnectSharedDisk(fixture), /5/);
  nativeResult = { code: 2250 };
  assert.match((await service.disconnectSharedDisk(fixture)).message, /没有连接/);
  assert.ok(nativeCalls.every((call) => Object.keys(call).sort().join() === "action,shareRoot"));
}));

test("concurrent mutations are rejected until native action settles", async () => withProfile(async () => {
  let complete;
  nativeAction = () => new Promise((resolve) => { complete = resolve; });
  const connecting = service.connectSharedDisk(fixture);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.forgetSharedDiskCredentials(), /正在进行/);
  complete({ code: 0 });
  await connecting;
  await service.forgetSharedDiskCredentials();
}));

test("status uses native codes and sends only the target", async () => withProfile(async () => {
  nativeResult = { code: 0, status: 0 };
  assert.equal((await getSharedDiskStatus(fixture)).state, "connected");
  nativeResult = { code: 2250 };
  assert.equal((await getSharedDiskStatus(fixture)).state, "disconnected");
  nativeResult = { code: 5 };
  assert.equal((await getSharedDiskStatus(fixture)).state, "unknown");
  assert.ok(nativeCalls.every((call) => !('password' in call) && !('username' in call)));
}));

test("implicit SMB sessions expose only this server and discovery failure is not disconnected", async () => withProfile(async () => {
  nativeResult = { code: 0, status: 0, username: "DOMAIN\\tester", sessions: [
    { shareRoot: "\\\\files.example.test\\team", username: "DOMAIN\\tester", openFiles: 1 },
    { shareRoot: "\\\\other.example.test\\private", username: "other", openFiles: 2 },
    { shareRoot: "invalid", username: "other", openFiles: 0 }
  ] };
  const result = await getSharedDiskStatus(fixture);
  assert.equal(result.connected, true);
  assert.equal(result.username, "DOMAIN\\tester");
  assert.equal(result.sessions.length, 1);
  nativeResult = { code: 2250, discoveryUnavailable: true };
  assert.equal((await getSharedDiskStatus(fixture)).state, "unknown");
}));

test("opening an existing session never authenticates, saves, or disconnects", { skip: process.platform !== "win32" }, async () => withProfile(async file => {
  nativeResult = { code: 0, status: 0 };
  assert.equal(await service.openExistingSharedDiskDirectory(fixture), fixture.sharePath);
  assert.deepEqual(openedPaths, [fixture.sharePath]);
  assert.deepEqual(nativeCalls, [{ action: "status", shareRoot: "\\\\files.example.test\\team" }]);
  await assert.rejects(fs.stat(file), /ENOENT/);
  await assert.rejects(service.openExistingSharedDiskDirectory({ ...fixture, defaultDirectory: "\\\\other\\share" }));
  assert.equal(nativeCalls.length, 1);
  nativeResult = { code: 2250 };
  await assert.rejects(service.openExistingSharedDiskDirectory(fixture), /未检测到/);
  assert.equal(openedPaths.length, 1);
}));

test("disconnect verifies implicit sessions instead of falsely reporting success", async () => withProfile(async () => {
  nativeAction = async request => request.action === "disconnect" ? { code: 2250 } : { code: 0, status: 0 };
  await assert.rejects(service.disconnectSharedDisk(fixture), /Windows 仍报告该共享已连接/);
  assert.deepEqual(nativeCalls.map(call => call.action), ["disconnect", "status"]);
  nativeAction = async request => request.action === "disconnect" ? { code: 0 } : { code: 2250, discoveryUnavailable: true };
  await assert.rejects(service.disconnectSharedDisk(fixture), /无法确认/);
}));
