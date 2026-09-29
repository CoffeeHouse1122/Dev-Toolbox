// Run after npm run build: npm run test:navigation (also included in npm run check).
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const output = path.resolve(__dirname, "../out/navigation-smoke");
fs.mkdirSync(output, { recursive: true });
// Never load or mutate the real desktop profile during UI checks.
app.setPath("userData", fs.mkdtempSync(path.join(output, "profile-")));
app.disableHardwareAcceleration();
const reducedMotion = !process.argv.includes("--motion");
// Exercise both OS animation preferences explicitly instead of inheriting the CI desktop.
app.commandLine.appendSwitch(reducedMotion ? "force-prefers-reduced-motion" : "force-prefers-no-reduced-motion");
let navigation = {
  groups: ["seo", "system-files", "assist"].map(id => ({ id, tools: [] })),
  collapsedGroups: { favorites: true, images: true, media: true, font: true, text: true },
  favoriteToolIds: []
};
for (const [channel, handler] of Object.entries({
  "config:load": (_e, key) => key === "navigation" ? navigation : null,
  "config:save": (_e, key, value) => { if (key === "navigation") navigation = value; return value; },
  "window:get-state": () => ({ isMaximized: false, isAlwaysOnTop: false }),
  "update:current-version": () => "0.1.6",
  "update:state": () => ({ status: "disabled", activeTasks: 0 })
})) ipcMain.handle(channel, handler);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error("Navigation smoke exceeded 60 seconds"); app.exit(1); }, 60_000);
  const win = new BrowserWindow({ show: false, width: 1280, height: 820, webPreferences: {
    preload: path.resolve(__dirname, "../dist/electron/preload/index.js"),
    contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } });
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const query = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const click = selector => evaluate(`${query(selector)}.click()`);
  async function waitFor(expression) {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const state = await evaluate("JSON.stringify({ hash: location.hash, heading: document.querySelector('.workbench-page h2')?.textContent, visibility: document.visibilityState })");
    throw new Error(`Timed out: ${expression}; state=${state}; rendererErrors=${JSON.stringify(errors)}`);
  }
  const heading = id => `.nav-workbench-link[href='#/workbench/${id}']`;
  const toggle = id => `.nav-group-toggle[aria-controls='nav-group-${id}']`;
  const active = ".nav-workbench-link[aria-current=page]";
  const page = path.resolve(__dirname, "../dist/renderer/index.html");
  await win.loadFile(page, { hash: "/workbench/seo" });
  console.log("Navigation smoke: page loaded");
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), reducedMotion);
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === 'SEO 发布工作台'");
  assert.equal(await evaluate("document.querySelectorAll('.workbench-overview-link').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.nav-workbench-link').length"), 7);
  assert.equal(await evaluate("new Set([...document.querySelectorAll('.nav-workbench-link')].map(el => el.getAttribute('aria-label'))).size"), 7);
  assert.equal(await evaluate(`document.querySelectorAll('${active}').length`), 1);

  // Collapsing must not navigate. The overview remains reachable while collapsed.
  await click(toggle("system-files"));
  assert.equal(await evaluate("location.hash"), "#/workbench/seo");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "false");
  await click(heading("system"));
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === '文件与网络工作台'");
  console.log("Navigation smoke: category navigation passed");
  assert.equal(await evaluate(`${query(active)}.getAttribute('href')`), "#/workbench/system");
  assert.equal(await evaluate(`${query(toggle("system-files"))}.getAttribute('aria-expanded')`), "false");
  await click(toggle("system-files"));
  assert.equal(await evaluate("location.hash"), "#/workbench/system");

  // Tool routes have no active overview. Pinning still updates the favorites group.
  await click("#nav-group-system-files .nav-item-pin");
  await waitFor("document.querySelector('#nav-group-favorites').textContent.includes('网站与文档')");
  await click("#nav-group-assist .nav-item[href='#/timestamp']");
  await waitFor("location.hash === '#/timestamp'");
  assert.equal(await evaluate(`document.querySelectorAll('${active}').length`), 0);
  await evaluate(`${query(heading("seo"))}.focus()`);
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  await waitFor("document.querySelector('.workbench-page h2')?.textContent === 'SEO 发布工作台'");
  console.log("Navigation smoke: keyboard navigation passed");
  await waitFor("document.querySelector('.workbench-page')?.getBoundingClientRect().height > 100");
  await new Promise(resolve => setTimeout(resolve, 400));
  await evaluate("document.fonts.ready");
  for (const theme of ["dark", "light"]) {
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    const surface = theme === "dark" ? "rgb(22, 27, 34)" : "rgb(255, 255, 255)";
    await waitFor(`getComputedStyle(document.querySelector('.workbench-tool-card')).backgroundColor === '${surface}'`);
    await new Promise(resolve => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(output, `${theme}.png`), (await win.webContents.capturePage()).toPNG());
    assert.equal(await evaluate("[...document.querySelectorAll('.nav-workbench-link')].every(el => el.getBoundingClientRect().right <= document.querySelector('.sidebar').getBoundingClientRect().right)"), true);
  }
  assert.deepEqual(errors, []);
  assert.ok(navigation.favoriteToolIds.includes("links"));
  console.log(`Navigation UI passed (${reducedMotion ? "reduced" : "normal"} motion): unique category entries, separate expand/navigation, exact active state, keyboard activation, pinning and both themes.`);
  win.destroy();
  clearTimeout(watchdog);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
