const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/rename-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
const files = Array.from({ length: 13 }, (_, i) => `C:\\fixtures\\folder-${i}\\${i < 2 ? 'same-name' : 'sample-' + i}.txt`);
let submitted, releaseProcessing, revealed;
let failNext = false;
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'dialog:select-files': () => files,
  'shell:reveal-path': (_event, file) => { revealed = file; },
  'files:rename': async (_event, options) => {
    submitted = options; await new Promise(resolve => { releaseProcessing = resolve; });
    return failNext ? { status: 'error', files: [], logs: [], errorMessage: '测试：文件名冲突' } : {
      status: 'success', files: options.dryRun ? [] : options.inputPaths.map((file, i) => file.replace(/[^\\]+$/, `renamed-${i}.txt`)),
      logs: Array.from({ length: 100 }, (_, i) => `模拟重命名计划 ${i + 1}`)
    };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Rename layout timed out'); app.exit(1); }, 60_000);
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
  async function click(selector) {
    const el = `document.querySelector(${JSON.stringify(selector)})`;
    await waitFor(`${el} && !${el}.disabled`); await evaluate(`${el}.click()`);
  }
  async function finish() {
    for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
    assert.equal(typeof releaseProcessing, 'function'); const resolve = releaseProcessing; releaseProcessing = undefined; resolve();
    await waitFor("document.querySelector('.result-panel .status-pill')?.textContent !== '运行中'");
  }
  async function assertFits(label) {
    await pause(160);
    const sizes = await evaluate(`['.rename-page', '.task-flow-source-panel', '.drop-file-list', '.task-flow-settings-content', '.task-flow-preview-content', '.rename-preview', '.result-panel', '.result-content'].flatMap(selector => { const el = document.querySelector(selector); return el ? [{ selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }] : []; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const inside = (el, parent) => { const b = el.getBoundingClientRect(); const p = parent.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1; };
      return [...document.querySelectorAll('.rename-options input, .rename-hint')].every(el => inside(el, document.querySelector('.task-flow-settings-content'))) &&
        [...document.querySelectorAll('.rename-row, .plan-pagination')].every(el => inside(el, document.querySelector('.task-flow-preview-content'))) &&
        document.querySelector('.result-panel').getBoundingClientRect().bottom < document.querySelector('.task-flow-action-bar').getBoundingClientRect().top &&
        document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight;
    })()`), true, `${label}: full controls, plans, results and actions must fit`);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/rename' });
  await waitFor("!!document.querySelector('.rename-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768); await click('.drop-zone');
  const queue = [], plans = [];
  for (let page = 0; page < 7; page++) {
    await assertFits(`queue-and-plan-${page}`);
    queue.push(...await evaluate("[...document.querySelectorAll('.drop-file-item > span:first-child')].map(el => el.title)"));
    plans.push(...await evaluate("[...document.querySelectorAll('.rename-row:not(.table-head) span:last-child')].map(el => el.title)"));
    if (page < 6) { await click('[title="下一页文件"]'); await click('[title="下一页计划"]'); }
  }
  assert.deepEqual(queue, files);
  assert.deepEqual(plans, files.map((file, i) => `${path.win32.basename(file, '.txt')}-${String(i + 1).padStart(3, '0')}.txt`));
  await click('.drop-file-item [title="移除"]'); await assertFits('remove-last-page');
  assert.equal(await evaluate("document.querySelector('.selection-pagination span').textContent"), '6/6');
  assert.equal(await evaluate("document.querySelector('.plan-pagination').textContent.includes('6 / 6')"), true);
  await click('.drop-file-item [title="上移"]');
  assert.equal(await evaluate("document.querySelector('.selection-pagination span').textContent"), '5/6', 'moving across pages should follow the file');
  const moved = [...files.slice(0, 12)]; [moved[9], moved[10]] = [moved[10], moved[9]];
  await evaluate("[...document.querySelectorAll('.rename-options input')].forEach((el, i) => { el.value = ['{name}_{n}', '10', 'sample', 'asset'][i]; el.dispatchEvent(new Event('input', { bubbles: true })); })");
  await click('.task-flow-actions .secondary-button'); await assertFits('validating'); await finish();
  assert.equal(submitted.dryRun, true); assert.deepEqual(submitted.inputPaths, moved); assert.equal(submitted.start, 10); assert.equal(submitted.replaceFrom, 'sample'); assert.equal(submitted.replaceTo, 'asset');
  await assertFits('validated'); await click('.result-details-button'); await waitFor("!!document.querySelector('.app-dialog[open]')");
  assert.equal(await evaluate("document.querySelector('.result-dialog-log').textContent.includes('模拟重命名计划 100')"), true);
  await click('.app-dialog footer button');
  await click('.task-flow-actions .primary-button'); await finish(); assert.equal(submitted.dryRun, false);
  await assertFits('renamed-page-1'); await click('.result-toolbar [title="下一页"]'); await assertFits('renamed-page-2');
  await click('.result-panel .file-item');
  for (let i = 0; !revealed && i < 200; i++) await pause(30);
  assert.ok(revealed.endsWith('renamed-6.txt'));
  failNext = true; await click('.task-flow-actions .secondary-button'); await finish(); await assertFits('failure');
  for (let i = 0; i < 12; i++) await click('.drop-file-item [title="移除"]');
  await assertFits('cleared'); assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.rename-page').scrollWidth <= document.querySelector('.rename-page').clientWidth + 1"), true);
  console.log('Rename layout passed: sizes/fonts/themes, full queue/plan/result pagination, duplicate basenames, reorder/remove boundaries, rules, dry-run/rename payloads, logs/errors and small-window fallback; all file operations mocked.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
