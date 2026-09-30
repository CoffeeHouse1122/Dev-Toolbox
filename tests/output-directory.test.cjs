const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(id, ...args) { return id === 'electron' ? { ipcMain: {} } : originalLoad.call(this, id, ...args); };
const { checkOutputDirectory } = require('../dist/electron/main/services/output-directory.service.js');
const security = require('../dist/electron/main/utils/ipc-security.js');
Module._load = originalLoad;

test('existing output directories require explicit selection again after restart, without false missing results', async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'output-directory-test-'));
  try {
    const userData = path.join(fixture, 'user-data');
    const output = path.join(fixture, 'output');
    fs.mkdirSync(userData); fs.mkdirSync(output);
    security.initializePathAuthorization(userData);
    let probes = 0;
    const stat = async () => { probes++; throw new Error('must not probe unselected paths'); };
    assert.equal((await checkOutputDirectory(output, security.isAuthorizedPath, stat)).status, 'needs-authorization');
    assert.equal(probes, 0);
    assert.equal(security.isAuthorizedPath(output), false);
    security.authorizeUserSelectedPaths([output], true);
    assert.equal((await checkOutputDirectory(output)).status, 'ready');
    security.initializePathAuthorization(userData);
    assert.equal(fs.statSync(output).isDirectory(), true);
    assert.equal((await checkOutputDirectory(output)).status, 'needs-authorization');
    assert.equal(security.isAuthorizedPath(output), false);
    security.authorizeUserSelectedPaths([output], true);
    assert.equal((await checkOutputDirectory(path.join(output, 'removed'))).status, 'missing');
    const file = path.join(output, 'file.txt'); fs.writeFileSync(file, 'fixture');
    assert.equal((await checkOutputDirectory(file)).status, 'unavailable');
  } finally {
    assert.equal(path.dirname(fixture), os.tmpdir());
    assert.ok(path.basename(fixture).startsWith('output-directory-test-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('directory checks distinguish unavailable OS access from absent paths and hide OS errors', async () => {
  for (const code of ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EIO']) {
    const result = await checkOutputDirectory('fixture', () => true, async () => { throw Object.assign(new Error('private OS detail'), { code }); });
    assert.equal(result.status, ['ENOENT', 'ENOTDIR'].includes(code) ? 'missing' : 'unavailable');
    assert.match(result.message, /[\u4e00-\u9fff]/);
    assert.ok(!result.message.includes('private'));
  }
});
