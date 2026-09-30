const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/history-ui-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('force-prefers-reduced-motion');
const fixtures = ['folder', 'missing', 'none', 'failed', 'throw'].map((id, index) => ({
  id, toolType: 'video-background', status: id === 'failed' ? 'error' : 'success',
  sourcePath: `C:\\fixtures\\source-${index}.mp4`, outputPath: id === 'none' ? '' : `C:\\fixtures\\output-${index}`,
  optionsJson: '{}', errorMessage: id === 'failed' ? '模拟转换失败原因' : null,
  createdAt: '2026-09-30T03:37:55.445Z', finishedAt: '2026-09-30T03:38:55.445Z'
}));
let records = fixtures, openCalls = [], revealCalls = 0, failList = false;
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'history:list': () => { if (failList) throw new Error('test database failure'); return records; },
  'history:clear': () => { records = []; },
  'shell:reveal-path': () => { revealCalls++; throw new Error('must not call general reveal'); },
  'history:open-output': async (_event, id) => {
    openCalls.push(id); await new Promise(resolve => setTimeout(resolve, 80));
    if (id === 'throw') throw new Error('test unexpected IPC error');
    return id === 'missing' ? { status: 'missing', path: '', message: '输出文件或目录已移动、删除，或所在磁盘未连接。' } : { status: 'opened', path: fixtures[0].outputPath };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('History UI timed out'); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, '../dist/electron/preload/index.js'), sandbox: true,
    contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
  async function details(index) {
    await evaluate(`document.querySelectorAll('button.history-row')[${index}].click()`);
    await waitFor("!!document.querySelector('.app-dialog[open]')");
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/history' });
  await waitFor("document.querySelectorAll('button.history-row').length === 5");
  assert.equal(await evaluate("document.querySelectorAll('.history-table .history-open-output, .history-operation-label').length"), 0, 'no operation column in list');
  assert.equal(await evaluate("document.querySelector('.table-head').children.length"), 5);
  for (const theme of ['dark', 'light']) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`); await pause(120);
    assert.equal(await evaluate("document.querySelector('.history-table').scrollWidth <= document.querySelector('.history-table').clientWidth + 1"), true);
    fs.writeFileSync(path.join(output, `${theme}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await click('button.history-row'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(openCalls.length, 0); assert.equal(revealCalls, 0);
  assert.ok((await evaluate("document.querySelector('.history-details').textContent")).includes(fixtures[0].outputPath));
  await click('.history-detail-close');
  await waitFor("!document.querySelector('.app-dialog[open]')");
  await pause(100);
  win.webContents.focus();
  await evaluate("document.querySelector('button.history-row').focus()");
  assert.equal(await evaluate("document.activeElement === document.querySelector('button.history-row')"), true);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await waitFor("!!document.querySelector('.app-dialog[open]')");
  await click('.history-open-output');
  await waitFor("document.querySelector('.history-open-output').textContent.includes('打开中')");
  assert.equal(await evaluate("!!document.querySelector('.app-dialog[open]')"), true);
  await waitFor("!document.querySelector('.history-open-output').disabled"); assert.deepEqual(openCalls, ['folder']);
  await click('.history-detail-close'); await details(1); await click('.history-open-output');
  await waitFor("document.querySelector('.history-open-output').textContent.includes('位置不可用')");
  assert.ok((await evaluate("document.querySelector('.history-details').textContent")).includes('输出文件或目录已移动、删除'));
  assert.equal(await evaluate("document.querySelector('.history-open-output').disabled"), true);
  await click('.history-detail-close'); await details(2);
  assert.equal(await evaluate("document.querySelector('.history-open-output').disabled"), true);
  await click('.history-detail-close'); await details(3);
  assert.ok((await evaluate("document.querySelector('.history-details').textContent")).includes('模拟转换失败原因'));
  await click('.history-detail-close'); await click('.history-refresh');
  await waitFor("!document.querySelector('.history-refresh').disabled");
  await details(1);
  assert.equal(await evaluate("document.querySelector('.history-open-output').disabled"), false);
  await click('.history-detail-close'); await details(4); await click('.history-open-output');
  await waitFor("document.body.textContent.includes('无法打开历史输出目录，请刷新后重试。')");
  assert.equal(revealCalls, 0);
  await click('.history-detail-close');
  await waitFor("!document.querySelector('.history-refresh').disabled");
  failList = true; await click('.history-refresh');
  await waitFor("document.body.textContent.includes('历史记录读取失败')");
  assert.equal(await evaluate("document.querySelectorAll('button.history-row').length"), 5, 'failed refresh preserves the list');
  failList = false; await click('.history-refresh'); await waitFor("!document.querySelector('.history-refresh').disabled");
  await evaluate("[...document.querySelectorAll('.history-actions button')].find(el => el.textContent.includes('清空')).click()");
  await waitFor("document.querySelectorAll('button.history-row').length === 0");
  assert.equal(await evaluate("document.querySelector('.history-table .empty-state').textContent"), '暂无记录');
  console.log('History UI passed: no list operation column, row/keyboard details, detail-only ID-based folder action, no generic reveal, missing/empty outputs, retry, Chinese error feedback, both themes and clear.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
