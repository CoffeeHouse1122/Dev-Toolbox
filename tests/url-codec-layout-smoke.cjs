const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../out/url-codec-layout-smoke');
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
  const watchdog = setTimeout(() => { console.error('URL layout timed out'); app.exit(1); }, 60_000);
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
  async function setInput(value) {
    await evaluate(`{ const el = document.querySelector('.url-source'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); }`);
  }
  async function assertFits(label) {
    await pause(180);
    const sizes = await evaluate(`['.url-codec-page', '.task-flow-settings-content', '.task-flow-preview-content', '.url-output-wrap', '.url-output', '.url-source', ...Array.from({ length: 4 }, (_, i) => '.url-mode-grid button:nth-child(' + (i + 1) + ')')].map(selector => { const el = document.querySelector(selector); return { selector, width: el.clientWidth, sw: el.scrollWidth, height: el.clientHeight, sh: el.scrollHeight }; })`);
    assert.ok(sizes.every(item => item.sw <= item.width + 1 && item.sh <= item.height + 1), `${label}: ${JSON.stringify(sizes)}`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.task-flow-settings-content').getBoundingClientRect();
      return [...document.querySelectorAll('.url-mode-grid button, .url-usage-list li')].every(el => { const b = el.getBoundingClientRect(); return b.left >= panel.left - 1 && b.right <= panel.right + 1 && b.bottom <= panel.bottom + 1; }) &&
        document.querySelector('.task-flow-preview-panel').getBoundingClientRect().bottom <= innerHeight;
    })()`), true, `${label}: all modes and tips must remain visible`);
    assert.equal(await evaluate("document.querySelector('.url-output-wrap').clientHeight >= document.querySelector('.task-flow-preview-content').clientHeight - 3"), true);
    fs.writeFileSync(path.join(output, `${label}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/url-codec' });
  await waitFor("!!document.querySelector('.url-codec-page')");
  for (const [width, height, theme, font] of [[1280, 820, 'dark', 'system'], [1280, 820, 'dark', 'wdxl-lubrifont'], [1280, 768, 'light', 'system'], [1366, 768, 'light', 'system'], [1440, 900, 'dark', 'system']]) {
    win.setSize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.documentElement.dataset.uiFont = '${font}'; document.fonts.ready`);
    await assertFits(`empty-${width}-${height}-${font}`);
  }
  win.setSize(1280, 768);
  const sample = 'https://example.com/目录?q=中文 &x=1#片段';
  const cases = [
    [0, sample, encodeURI(sample)], [1, encodeURI(sample), sample],
    [2, sample, encodeURIComponent(sample)], [3, encodeURIComponent(sample), sample]
  ];
  for (const [index, input, expected] of cases) {
    await setInput(input);
    await evaluate(`document.querySelectorAll('.url-mode-grid button')[${index}].click()`);
    await waitFor(`document.querySelector('.url-output').value === ${JSON.stringify(expected)}`);
    assert.equal(await evaluate("document.querySelectorAll('.url-mode-grid [aria-pressed=true]').length"), 1);
    assert.equal(await evaluate("document.querySelector('.url-output-count').textContent"), `${expected.length} 字符`);
    await assertFits(`mode-${index}`);
  }
  await setInput('%E0%A4');
  await waitFor("document.querySelector('.url-output').value === 'URI malformed'");
  await assertFits('invalid-escape');
  await setInput(''); await waitFor("document.querySelector('.url-output').value === ''");
  const longText = '长内容/参数值&'.repeat(300);
  await setInput(longText);
  await evaluate("document.querySelectorAll('.url-mode-grid button')[2].click()");
  await waitFor(`document.querySelector('.url-output').value === ${JSON.stringify(encodeURIComponent(longText))}`);
  assert.equal(await evaluate("document.querySelector('.url-output').scrollHeight > document.querySelector('.url-output').clientHeight"), true, 'long text must remain scrollable rather than clipped');
  assert.equal(await evaluate("document.querySelector('.url-codec-page').scrollHeight <= document.querySelector('.url-codec-page').clientHeight + 1"), true);
  await evaluate("document.querySelector('.url-output').select()");
  assert.equal(await evaluate("document.querySelector('.url-output').selectionEnd"), encodeURIComponent(longText).length);
  win.setSize(1024, 700); await pause(180);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-flow-settings-content')).overflowY"), 'visible');
  assert.equal(await evaluate("document.querySelector('.url-codec-page').scrollWidth <= document.querySelector('.url-codec-page').clientWidth + 1"), true);
  console.log('URL layout passed: sizes/fonts/themes, complete modes/tips, all four operations, counts, malformed input, long-text access and small-window fallback.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
