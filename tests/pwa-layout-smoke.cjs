const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const output = path.resolve(__dirname, '../out/pwa-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
protocol.registerSchemesAsPrivileged([{ scheme: 'devtoolbox-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let selectedFiles = ['C:\\fixtures\\app.png'];
let submitted;
let releaseProcessing;
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
  'dialog:select-files': () => selectedFiles,
  'dialog:select-output-dir': () => 'C:\\fixtures\\output',
  'convert:pwa-icons': async (_event, options) => {
    submitted = options;
    await new Promise(resolve => { releaseProcessing = resolve; });
    return { status: 'success', files: ['C:\\fixtures\\output\\app.zip'], logs: [] };
  }
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('PWA layout timed out'); app.exit(1); }, 60_000);
  const fixture = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="90" fill="#109ca0"/><circle cx="256" cy="256" r="140" fill="#d8f8ed"/><path d="M170 275L230 330L350 180" fill="none" stroke="#22647b" stroke-width="40"/></svg>')).png().toBuffer();
  protocol.handle('devtoolbox-file', () => new Response(fixture, { headers: { 'Content-Type': 'image/png' } }));
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
    await waitFor(`${el} && !${el}.disabled`);
    await evaluate(`${el}.click()`);
  }
  async function setValue(selector, value) {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  async function assertFits(label) {
    await pause(180);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
    const sizes = await evaluate(`['.pwa-page', '.task-flow-settings-content', '.task-flow-preview-content', '.pwa-preview-stage', '.phone-preview', '.package-list', '.result-panel'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const inside = (el, parent) => { const b = el.getBoundingClientRect(); const p = parent.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1; };
      const settings = document.querySelector('.task-flow-settings-content');
      const stage = document.querySelector('.pwa-preview-stage');
      const phone = document.querySelector('.phone-preview');
      return [...document.querySelectorAll('.pwa-options .field, .pwa-options input')].every(el => inside(el, settings)) &&
        [...document.querySelectorAll('.phone-preview, .package-list, .package-list span, .pwa-preview-caption')].every(el => inside(el, stage)) &&
        [...document.querySelectorAll('.phone-status, .launcher-icon, .phone-preview strong')].every(el => inside(el, phone)) &&
        [...document.querySelectorAll('.launcher-icon > i')].every(el => inside(el, el.parentElement));
    })()`), true, `${label}: controls, phone and package entries must remain fully visible`);
    assert.equal(await evaluate("document.querySelector('.launcher-icon').clientHeight >= 32"), true, 'icon must remain legible');
    assert.equal(await evaluate("document.querySelectorAll('.package-list span').length"), 5);
    assert.equal(await evaluate("document.querySelector('.task-flow-action-bar').getBoundingClientRect().bottom <= innerHeight"), true);
    assert.equal(await evaluate("(document.querySelector('.result-panel .empty-state') || document.querySelector('.result-panel .result-content')).clientHeight >= 40"), true);
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/pwa-icons' });
  await waitFor("!!document.querySelector('.pwa-options')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768);
  await click('.task-flow-source-panel .drop-zone');
  await waitFor("document.querySelector('.launcher-icon img')?.naturalWidth === 512");
  await assertFits('image');
  await setValue('.pwa-options .field:nth-child(2) input', '这是一个用于测试完整显示的超长移动应用短名称示例');
  await setValue('[aria-label="主题色色值"]', '#246482');
  await setValue('[aria-label="背景色色值"]', '#d5f3ee');
  await assertFits('long-name');
  for (const [key, expected] of [['Home', .8], ['End', .2]]) {
    await evaluate(`document.querySelector('[role=slider]').dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }))`);
    await assertFits(`padding-${key}`);
    const scale = await evaluate("document.querySelector('.launcher-icon img').getBoundingClientRect().width / document.querySelector('.launcher-icon').getBoundingClientRect().width");
    assert.ok(Math.abs(scale - expected) < .01, 'preview padding must keep its ratio while the icon resizes');
  }
  await click("[title='选择输出目录']");
  await setValue('[aria-label="主题色色值"]', '#bad');
  await assertFits('invalid-color');
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  await setValue('[aria-label="主题色色值"]', '#246482');
  await click('.task-flow-actions .primary-button');
  await waitFor("document.querySelector('.task-flow-actions .primary-button').textContent.includes('生成中')");
  await assertFits('busy');
  for (let i = 0; !releaseProcessing && i < 200; i++) await pause(30);
  assert.equal(typeof releaseProcessing, 'function');
  releaseProcessing();
  await waitFor("document.querySelector('.result-panel .status-pill')?.textContent === '成功'");
  assert.equal(submitted.maskablePadding, .4);
  assert.equal(submitted.themeColor, '#246482');
  assert.equal(submitted.backgroundColor, '#d5f3ee');
  await assertFits('result');
  await click(".task-flow-source-panel [title='移除']");
  selectedFiles = ['C:\\fixtures\\vector.svg'];
  await click('.task-flow-source-panel .drop-zone');
  await waitFor("document.querySelector('.pwa-preview-caption').textContent.includes('SVG')");
  assert.equal(await evaluate("!!document.querySelector('.launcher-icon img')"), false, 'raw SVG must not be rendered');
  await assertFits('svg-placeholder');
  win.setSize(1024, 700);
  await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.pwa-page').scrollWidth <= document.querySelector('.pwa-page').clientWidth + 1"), true);
  console.log('PWA layout passed: dimensions/fonts/themes, complete phone and package contents, long names, colors, padding, image/SVG preview, generation and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
