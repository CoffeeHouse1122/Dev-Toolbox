const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../out/output-authorizations-ui');
fs.mkdirSync(out, { recursive: true });
const fixture = fs.mkdtempSync(path.join(out, 'fixture-'));
const profile = path.join(fixture, 'profile'); fs.mkdirSync(profile);
const directory = path.join(fixture, 'output'); fs.mkdirSync(directory);
app.setPath('userData', profile); app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-prefers-reduced-motion');

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Output authorization UI timed out'); app.exit(1); }, 60_000);
  assert.equal(safeStorage.isEncryptionAvailable(), true, 'OS encrypted storage is required for this integration test');
  const { createOutputAuthorizations } = require('../dist/electron/main/services/output-authorizations.service.js');
  const security = require('../dist/electron/main/utils/ipc-security.js');
  const { checkOutputDirectory } = require('../dist/electron/main/services/output-directory.service.js');
  const ledger = path.join(profile, 'security', 'output-directories.enc');
  let grants, cancelChooser = true, failClear = false;
  let config = { '/qr-code': { selectedPath: directory } };
  async function restartGrants() {
    security.initializePathAuthorization(profile);
    grants = createOutputAuthorizations(ledger, safeStorage, security.setOutputDirectoryGrants);
    await grants.initialize();
  }
  await restartGrants();
  for (const [channel, handler] of Object.entries({
    'config:load': (_e, key) => key === 'output-picker' ? config : null,
    'config:save': (_e, key, value) => { if (key === 'output-picker') config = value; return value; },
    'window:get-state': () => ({ isMaximized: false, isAlwaysOnTop: false }),
    'update:current-version': () => '0.1.8', 'update:state': () => ({ status: 'disabled', activeTasks: 0 }),
    'settings:load': () => ({ closeBehavior: 'minimize-to-tray', autoLaunch: false }),
    'diagnostics:get': () => ({ userDataDir: profile, logsDir: profile, ports: [] }),
    'file:check-output-directory': (_e, value) => checkOutputDirectory(value),
    'output-authorizations:state': () => grants.getState(),
    'output-authorizations:clear': () => { if (failClear) throw new Error('simulated failure'); return grants.clear(); },
    'dialog:select-output-dir': async () => {
      if (cancelChooser) return null;
      await grants.rememberSelection(directory); return directory;
    }
  })) ipcMain.handle(channel, handler);
  const win = new BrowserWindow({ show: false, frame: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, '../dist/electron/preload/index.js'), sandbox: true, contextIsolation: true,
    nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(30); } throw new Error(`Timed out: ${expression}`); }
  const click = async selector => { await waitFor(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const reload = async () => { const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.reload(); await loaded; };
  const navigate = async (route, selector) => { await evaluate(`location.hash = '${route}'`); await waitFor(`!!document.querySelector('${selector}')`); };
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'), { hash: '/qr-code' });
  await waitFor("document.querySelector('.output-picker')?.textContent.includes('待确认授权')");
  assert.equal(security.isAuthorizedPath(directory), false);
  await click('[title="选择输出目录"]');
  assert.equal(fs.existsSync(ledger), false, 'cancel does not create a grant');
  cancelChooser = false; await click('[title="选择输出目录"]');
  await waitFor("!document.querySelector('.task-flow-actions .primary-button').disabled");
  assert.equal((await grants.getState()).rememberedCount, 1);
  assert.equal(fs.readFileSync(ledger).includes(Buffer.from(directory)), false);
  await restartGrants(); await reload();
  await waitFor("!!document.querySelector('.task-flow-actions .primary-button') && !document.querySelector('.task-flow-actions .primary-button').disabled");
  assert.equal(await evaluate("!!document.querySelector('.workspace-toast')"), false, 'remembered directory restores silently after restart');
  assert.equal(await evaluate("document.querySelector('.output-picker input').value"), directory);
  assert.equal(security.isAuthorizedPath(directory), true);
  fs.writeFileSync(path.join(out, 'restored-directory.png'), (await win.webContents.capturePage()).toPNG());
  await navigate('/settings', '.output-authorization-settings');
  await waitFor("document.querySelector('.authorization-summary')?.textContent.includes('已记住 1')");
  await evaluate("document.querySelector('.output-authorization-settings').scrollIntoView({ block: 'center' })");
  await pause(100);
  fs.writeFileSync(path.join(out, 'settings.png'), (await win.webContents.capturePage()).toPNG());
  await click('.authorization-clear');
  await waitFor("!!document.querySelector('.app-dialog[open]')");
  fs.writeFileSync(path.join(out, 'revoke-confirmation.png'), (await win.webContents.capturePage()).toPNG());
  await click('.authorization-cancel');
  assert.equal(security.isAuthorizedPath(directory), true);
  failClear = true; await click('.authorization-clear'); await click('.authorization-confirm');
  await waitFor("document.querySelector('.workspace-toast')?.textContent.includes('清除失败')");
  assert.equal(security.isAuthorizedPath(directory), true);
  failClear = false; await click('.authorization-clear'); await click('.authorization-confirm');
  await waitFor("document.querySelector('.authorization-summary')?.textContent.includes('已记住 0')");
  assert.equal(security.isAuthorizedPath(directory), false);
  assert.equal(config['/qr-code'].selectedPath, directory); assert.equal(fs.existsSync(directory), true);
  await navigate('/qr-code', '.output-picker');
  await waitFor("document.querySelector('.output-picker')?.textContent.includes('待确认授权')");
  assert.equal(await evaluate("document.querySelector('.task-flow-actions .primary-button').disabled"), true);
  await restartGrants(); await reload();
  await waitFor("document.querySelector('.output-picker')?.textContent.includes('待确认授权')");
  assert.equal(security.isAuthorizedPath(directory), false);
  console.log('Output authorizations UI passed: real OS encryption, restart restore, cancellation, settings revoke/cancel/failure, inactive picker invalidation, no data deletion.');
  win.destroy(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
