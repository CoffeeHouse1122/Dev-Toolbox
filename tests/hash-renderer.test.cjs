const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash, webcrypto } = require("node:crypto");
const ts = require("typescript");

function loadHashTool() {
  const source = fs.readFileSync(require.resolve("../src/renderer/pages/HashTool.vue"), "utf8").match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const exportsObject = {};
  const compiled = ts.transpileModule(`${source}\nexport { md5, doEncrypt, doDecrypt, input, encryptKey, output };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(compiled, { exports: exportsObject, require, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto, atob, btoa });
  return exportsObject;
}

test("renderer MD5 matches known hashes for empty, ASCII, Unicode and multi-block inputs", async () => {
  const { md5 } = loadHashTool();
  for (const input of ["", "abc", "共享连接", "a".repeat(1000)]) {
    assert.equal(await md5(new TextEncoder().encode(input)), createHash("md5").update(input).digest("hex"));
  }
});

test("renderer AES round-trips Unicode and rejects an incorrect password", async () => {
  const tool = loadHashTool();
  tool.input.value = "本地测试 / navigation";
  tool.encryptKey.value = "test-only-password";
  await tool.doEncrypt();
  const cipher = tool.output.value;
  assert.match(cipher, /^DTBX1\./);
  tool.input.value = cipher;
  await tool.doDecrypt();
  assert.equal(tool.output.value, "本地测试 / navigation");
  tool.encryptKey.value = "incorrect-test-password";
  await tool.doDecrypt();
  assert.match(tool.output.value, /^解密失败:/);
});
