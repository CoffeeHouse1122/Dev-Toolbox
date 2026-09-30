const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-toolbox-history-test-'));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => path.join(root, 'user-data') } };
  return originalLoad.call(this, request, parent, isMain);
};
const { createHistoryService } = require('../dist/electron/main/services/history.service.js');
Module._load = originalLoad;
const { openHistoryOutput } = require('../dist/electron/main/services/history-output.service.js');
const { initializePathAuthorization, isAuthorizedPath } = require('../dist/electron/main/utils/ipc-security.js');

test('history output opens only persisted directories without restoring generic file grants', async () => {
  const userData = path.join(root, 'user-data');
  const directory = path.join(root, 'output');
  fs.mkdirSync(userData); fs.mkdirSync(directory);
  const executable = path.join(directory, 'output.exe');
  fs.writeFileSync(executable, 'fixture, not executable');
  const history = createHistoryService();
  await history.startTask({ id: 'folder-record', toolType: 'favicon', sourcePath: 'fixture', outputPath: directory, options: {} });
  await history.finishTask('folder-record', 'success');
  await history.startTask({ id: 'file-record', toolType: 'favicon', sourcePath: 'fixture', outputPath: executable, options: {} });
  await history.finishTask('file-record', 'success');
  // Simulate a new process: no selections from the previous session remain.
  initializePathAuthorization(userData);
  const reopened = createHistoryService();
  assert.equal((await reopened.get('folder-record')).outputPath, directory);
  assert.equal(await reopened.get("' OR 1=1 --"), undefined);
  const opened = [];
  const openFolder = async target => { opened.push(target); return ''; };
  assert.equal((await openHistoryOutput('folder-record', id => reopened.get(id), openFolder)).status, 'opened');
  assert.equal((await openHistoryOutput('file-record', id => reopened.get(id), openFolder)).status, 'opened');
  // Windows short paths can differ between the JS sync resolver and the native async resolver.
  const expectedDirectory = await fs.promises.realpath(directory);
  assert.deepEqual(opened, [expectedDirectory, expectedDirectory], 'never execute the recorded output file');
  assert.ok(opened.every(target => fs.statSync(target).isDirectory()), 'only directories may be opened');
  assert.equal(isAuthorizedPath(directory), false);
  assert.equal(isAuthorizedPath(executable), false);
  assert.equal((await openHistoryOutput(executable, id => reopened.get(id), openFolder)).status, 'missing', 'a renderer-supplied path is not a record ID');
  await reopened.clear();
  assert.equal((await openHistoryOutput('folder-record', id => reopened.get(id), openFolder)).status, 'missing');
  assert.equal(opened.length, 2);
});

test('history output rejects malformed IDs and unavailable paths with Chinese guidance', async () => {
  let lookups = 0, opens = 0;
  const openFolder = async () => { opens++; return ''; };
  const lookup = async () => { lookups++; return undefined; };
  for (const id of [null, {}, [], '', ' '.repeat(2), 'x'.repeat(257), 'x\0y']) {
    assert.equal((await openHistoryOutput(id, lookup, openFolder)).status, 'missing');
  }
  assert.equal(lookups, 0);
  for (const outputPath of ['', 'inline-og-content', 'https://example.com', path.join(root, 'missing'), 'x\0y']) {
    const result = await openHistoryOutput('record', async () => ({ outputPath }), openFolder);
    assert.equal(result.status, 'missing'); assert.match(result.message, /[\u4e00-\u9fff]/);
  }
  assert.equal(opens, 0);
  const find = async () => ({ outputPath: root });
  assert.match((await openHistoryOutput('record', find, async () => 'Shell error details')).message, /无法打开输出目录/);
  const denied = await openHistoryOutput('record', find, async () => { throw Object.assign(new Error('secret OS error'), { code: 'EACCES' }); });
  assert.match(denied.message, /系统拒绝访问/); assert.ok(!denied.message.includes('secret'));
});

test.after(() => {
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('dev-toolbox-history-test-'));
  fs.rmSync(root, { recursive: true, force: true });
});
