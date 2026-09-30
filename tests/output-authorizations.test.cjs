const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const original = Module._load;
Module._load = function(id, ...args) { return id === 'electron' ? { ipcMain: {} } : original.call(this, id, ...args); };
const { createOutputAuthorizations } = require('../dist/electron/main/services/output-authorizations.service.js');
const security = require('../dist/electron/main/utils/ipc-security.js');
Module._load = original;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'output-grants-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('output-grants-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const userData = path.join(root, 'profile'); fs.mkdirSync(userData);
  const output = path.join(root, 'output'); fs.mkdirSync(output);
  const ledger = path.join(userData, 'security', 'output-directories.enc');
  const key = crypto.randomBytes(32);
  let available = true;
  const secure = {
    isEncryptionAvailable: () => available,
    encryptString(value) {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString(value) {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8');
    }
  };
  const create = () => createOutputAuthorizations(ledger, secure, security.setOutputDirectoryGrants);
  security.initializePathAuthorization(userData);
  return { root, userData, output, ledger, secure, create, setAvailable: value => { available = value; } };
}

test('only confirmed output directories survive restart; clearing revokes persisted and live grants', async t => {
  const f = fixture(t); let service = f.create(); await service.initialize();
  const config = path.join(f.userData, 'data', 'configs', 'output-picker.json');
  fs.mkdirSync(path.dirname(config), { recursive: true }); fs.writeFileSync(config, JSON.stringify({ selectedPath: f.output }));
  assert.equal(security.isAuthorizedPath(f.output), false, 'plain configuration cannot grant access');
  assert.equal((await service.rememberSelection(f.output)).rememberedCount, 1);
  assert.equal(security.isAuthorizedPath(path.join(f.output, 'new.txt')), true);
  assert.equal(security.isAuthorizedPath(path.join(f.root, 'outside.txt')), false);
  assert.equal(security.isAuthorizedPath(f.ledger), false, 'private ledger is not exposed through file APIs');
  assert.equal(fs.readFileSync(f.ledger).includes(Buffer.from(f.output)), false);
  security.initializePathAuthorization(f.userData); service = f.create(); await service.initialize();
  assert.equal(security.isAuthorizedPath(f.output), true);
  await service.clear();
  assert.equal(security.isAuthorizedPath(f.output), false);
  assert.equal(fs.existsSync(f.output), true); assert.equal(fs.existsSync(config), true);
  service = f.create(); await service.initialize();
  assert.equal(security.isAuthorizedPath(f.output), false);
});

test('corrupt ciphertext, plaintext, wrong-purpose payloads and backups cannot restore grants', async t => {
  const f = fixture(t); let service = f.create(); await service.initialize();
  await service.rememberSelection(f.output); const valid = fs.readFileSync(f.ledger);
  fs.writeFileSync(f.ledger + '.bak', valid);
  const corrupt = Buffer.from(valid); corrupt[corrupt.length - 1] ^= 1;
  for (const invalid of [corrupt, Buffer.from(JSON.stringify({ selectedPath: f.output })), f.secure.encryptString(JSON.stringify({ purpose: 'password', version: 1, directories: [] }))]) {
    fs.writeFileSync(f.ledger, invalid);
    security.initializePathAuthorization(f.userData); service = f.create();
    assert.ok((await service.initialize()).warning);
    assert.equal(security.isAuthorizedPath(f.output), false);
  }
  await service.clear();
  await f.create().initialize(); assert.equal(security.isAuthorizedPath(f.output), false, 'never recover revoked authorization from backup');
});

test('same-name replacement, removed directory and redirected junction cannot reuse remembered identities', async t => {
  const f = fixture(t); const service = f.create(); await service.initialize();
  await service.rememberSelection(f.output);
  fs.renameSync(f.output, f.output + '-original');
  assert.equal(security.isAuthorizedPath(f.output), false);
  fs.mkdirSync(f.output);
  assert.equal(security.isAuthorizedPath(f.output), false, 'same path is a different directory');
  await service.rememberSelection(f.output);
  assert.equal(security.isAuthorizedPath(f.output), true);
  const other = path.join(f.root, 'other'); fs.mkdirSync(other);
  const link = path.join(f.root, 'link'); fs.symlinkSync(f.output, link, process.platform === 'win32' ? 'junction' : 'dir');
  await service.clear(); await service.rememberSelection(link);
  fs.unlinkSync(link); fs.symlinkSync(other, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(security.isAuthorizedPath(link), false);
  assert.equal(security.isAuthorizedPath(other), false);
});

test('secure storage failure is session-only and concurrent selections are serialized', async t => {
  const f = fixture(t); let service = f.create(); await service.initialize();
  f.setAvailable(false);
  const state = await service.rememberSelection(f.output);
  assert.equal(state.sessionCount, 1); assert.equal(state.rememberedCount, 0); assert.ok(state.warning);
  assert.equal(security.isAuthorizedPath(f.output), true); assert.equal(fs.existsSync(f.ledger), false);
  security.initializePathAuthorization(f.userData); service = f.create(); await service.initialize();
  assert.equal(security.isAuthorizedPath(f.output), false);
  f.setAvailable(true);
  const second = path.join(f.root, 'second'); fs.mkdirSync(second);
  await Promise.all([service.rememberSelection(f.output), service.rememberSelection(second)]);
  security.initializePathAuthorization(f.userData); service = f.create();
  assert.equal((await service.initialize()).rememberedCount, 2);
  assert.equal(security.isAuthorizedPath(f.output), true); assert.equal(security.isAuthorizedPath(second), true);
});
