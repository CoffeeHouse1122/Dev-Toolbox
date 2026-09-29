const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const Module = require("node:module");
const actual = require("node:child_process");
let latest;
let response = '{"code":0}';
let exitCode = 0;
let hanging = false;
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === "node:child_process") return { ...actual, spawn(command, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    const call = latest = { command, args, options, input: "", killed: false };
    child.kill = () => { call.killed = true; };
    child.stdin.on("data", (chunk) => { call.input += chunk.toString(); });
    child.stdin.on("finish", () => queueMicrotask(() => {
      if (!hanging) { child.stdout.write(response); child.emit("close", exitCode); }
    }));
    return child;
  } };
  return originalLoad.call(this, request, parent, main);
};
const { runSharedDiskNative, sharedDiskError } = require("../dist/electron/main/services/shared-disk-native.js");
Module._load = originalLoad;

test("native credentials travel only over stdin, with no interpolation, persistence or forced disconnect", { skip: process.platform !== "win32" }, async () => {
  const input = { action: "connect", shareRoot: "\\\\server.example.test\\share", username: "用户", password: "fixture-'$;&秘密" };
  assert.deepEqual(await runSharedDiskNative(input), { code: 0 });
  assert.deepEqual(JSON.parse(latest.input), input);
  const command = latest.args.join(" ");
  for (const value of [input.password, input.username, input.shareRoot]) assert.equal(command.includes(value), false);
  const script = Buffer.from(latest.args.at(-1), "base64").toString("utf16le");
  assert.match(script, /In\.ReadToEnd/);
  assert.match(script, /WNetAddConnection2W/);
  assert.match(script, /WNetCancelConnection2W\(\$request.shareRoot, 0, \$false\)/);
  assert.doesNotMatch(script, /cmdkey|\/pass:|net use/);
  assert.equal(latest.options.windowsHide, true);
});

test("native failures are redacted and timeouts kill the helper", { skip: process.platform !== "win32" }, async () => {
  const request = { action: "status", shareRoot: "\\\\server.example.test\\share" };
  response = "fixture-secret-from-system";
  await assert.rejects(runSharedDiskNative(request), (error) => !error.message.includes(response));
  exitCode = 1;
  await assert.rejects(runSharedDiskNative(request), /系统策略/);
  exitCode = 0;
  hanging = true;
  try {
    await assert.rejects(runSharedDiskNative(request, 10), /超时/);
    assert.equal(latest.killed, true);
  } finally { hanging = false; response = '{"code":0}'; }
});

test("common Windows errors have actionable messages", () => {
  assert.match(sharedDiskError(1219), /不会自动清理/);
  assert.match(sharedDiskError(1326), /身份验证/);
  assert.match(sharedDiskError(2401), /打开的文件/);
});
