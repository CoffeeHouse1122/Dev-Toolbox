const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/font-face-layout-smoke');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');
for (const [channel, handler] of Object.entries({
  'config:load': () => null, 'config:save': (_event, _key, value) => value,
  'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
  'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 })
})) ipcMain.handle(channel, handler);
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Font-face layout timed out'); app.exit(1); }, 60_000);
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
  async function assertFits(label) {
    await pause(180);
    const sizes = await evaluate(`['.font-face-page', '.task-flow-settings-content', '.task-flow-preview-content', '.font-face-code'].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const inside = (el, parent) => { const b = el.getBoundingClientRect(); const p = parent.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1 && b.top >= p.top - 1 && b.bottom <= p.bottom + 1; };
      return [...document.querySelectorAll('.option-grid input, .select-trigger, .select-option')].every(el => inside(el, document.querySelector('.task-flow-settings-content'))) &&
        [...document.querySelectorAll('.font-source-grid input')].every(el => inside(el, document.querySelector('.task-flow-source-panel'))) &&
        document.querySelector('.task-flow-preview-panel').getBoundingClientRect().bottom <= innerHeight;
    })()`), true, `${label}: all controls and menu options must remain visible`);
    assert.equal(await evaluate("document.querySelector('.font-face-code').clientHeight >= document.querySelector('.task-flow-preview-content').clientHeight - 3"), true, 'preview should fill its panel');
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/font-face' });
  await waitFor("!!document.querySelector('.font-face-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`default-${width}-${height}-${font}`);
    for (let index = 0; index < 2; index++) {
      await evaluate(`document.querySelectorAll('.select-trigger')[${index}].click()`);
      await assertFits(`menu-${width}-${height}-${font}-${index}`);
      await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      assert.equal(await evaluate("document.querySelectorAll('.select-popover').length"), 0);
    }
  }
  win.setSize(1280, 768);
  for (const [index, labels, values, property] of [
    [0, ['WOFF2', 'WOFF', 'TTF', 'OTF'], ['woff2', 'woff', 'truetype', 'opentype'], 'format'],
    [1, ['swap', 'block', 'fallback', 'optional'], ['swap', 'block', 'fallback', 'optional'], 'font-display']
  ]) {
    for (let i = 0; i < labels.length; i++) {
      await evaluate(`document.querySelectorAll('.select-trigger')[${index}].click()`);
      await waitFor("!!document.querySelector('.select-option')");
      await evaluate(`[...document.querySelectorAll('.select-option')].find(el => el.querySelector('span').textContent === '${labels[i]}').click()`);
      const expected = property === 'format' ? `format("${values[i]}")` : `font-display: ${values[i]};`;
      await waitFor(`document.querySelector('.font-face-code').value.includes(${JSON.stringify(expected)})`);
    }
  }
  const values = ['Layout Test Font', './fonts/a-very-long-folder-name/'.repeat(4) + 'custom.woff2', '100 900', 'italic'];
  await evaluate(`[...document.querySelectorAll('.font-source-grid input, .option-grid input')].forEach((el, index) => { el.value = ${JSON.stringify(values)}[index]; el.dispatchEvent(new Event('input', { bubbles: true })); })`);
  await waitFor("document.querySelector('.font-face-code').value.includes('font-weight: 100 900;')");
  const css = await evaluate("document.querySelector('.font-face-code').value");
  for (const value of values) assert.ok(css.includes(value));
  assert.equal(await evaluate("document.querySelector('.font-face-code').readOnly"), true);
  await assertFits('long-source-live-preview');
  await evaluate("document.querySelector('.font-face-code').select()");
  assert.equal(await evaluate("document.querySelector('.font-face-code').selectionEnd"), css.length);
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.font-face-page').scrollWidth <= document.querySelector('.font-face-page').clientWidth + 1"), true);
  console.log('Font-face layout passed: window sizes/fonts/themes, full controls/dropdowns, all formats/display modes, live CSS, long paths, text selection and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
