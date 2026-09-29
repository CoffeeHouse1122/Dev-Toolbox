import { app, BrowserWindow, Menu, Tray, net, protocol, nativeImage, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./ipc";
import { loadAppSettings, getCachedSettings } from "./services/settings.service";
import { getPreloadEntryPath, getRendererIndexPath, getRuntimeIconPath } from "./utils/app-paths";
import {
  assertAuthorizedPath,
  handleTrustedIpc,
  initializePathAuthorization,
  isAllowedRendererPermission,
  isTrustedRendererUrl,
  onTrustedIpc,
  parseBooleanPayload,
  parseTitleBarThemePayload,
  parseWindowActionReadyPayload
} from "./utils/ipc-security";
import { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, getUpdateState, stopAutoUpdater } from "./services/autoUpdater.service";
import type { ThemeTitleBarPayload, WindowFrameState } from "../../shared/types";
import fs from "node:fs";
import fsp from "node:fs/promises";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// Single instance lock — focus existing window if already running.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const closeAfterFlush = new WeakSet<BrowserWindow>();
const rendererFlushRequests = new Map<
  string,
  { senderId: number; resolve: (ok: boolean) => void; timeout: ReturnType<typeof setTimeout> }
>();

onTrustedIpc("window:action-ready", (event, raw: unknown) => {
  const parsed = parseWindowActionReadyPayload(raw);
  if (!parsed.success) return;
  const payload = parsed.data;
  const request = rendererFlushRequests.get(payload.requestId);
  if (!request || request.senderId !== event.sender.id) return;
  clearTimeout(request.timeout);
  rendererFlushRequests.delete(payload.requestId);
  request.resolve(payload.ok === true);
});

function flushRendererBeforeAction(win: BrowserWindow, reason: "reload" | "close" | "install-update") {
  if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed() || win.webContents.isLoadingMainFrame()) {
    return Promise.resolve(true);
  }
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      rendererFlushRequests.delete(requestId);
      // Do not silently proceed while a live renderer may still own unsaved
      // drafts. A crashed renderer is handled by the early return above.
      resolve(false);
    }, 10_000);
    rendererFlushRequests.set(requestId, { senderId: win.webContents.id, resolve, timeout });
    win.webContents.send("window:before-action", { requestId, reason });
  });
}

type PreviewCacheEntry = {
  sourcePath: string;
  previewPath: string;
  size: number;
  mtimeMs: number;
};

const previewCache = new Map<string, PreviewCacheEntry>();
const previewCopyTasks = new Map<string, Promise<string>>();
const previewExtensions = new Set([
  ".apng", ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp",
  ".aac", ".avi", ".flac", ".m4a", ".m4v", ".mkv", ".mov", ".mp3", ".mp4", ".mpeg", ".mpg", ".ogg", ".ts", ".wav", ".webm",
  ".eot", ".otf", ".ttf", ".woff", ".woff2"
]);

const DEFAULT_TITLEBAR_THEME: ThemeTitleBarPayload = {
  accentColor: "#0969da",
  surfaceColor: "#161b22",
  textColor: "#e5eefb"
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: "devtoolbox-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function registerPreviewProtocol() {
  protocol.handle("devtoolbox-file", async (request) => {
    const url = new URL(request.url);
    const queryPath = url.searchParams.get("path");
    const legacyPath = url.pathname ? decodeURIComponent(url.pathname.slice(1)) : "";
    const filePath = queryPath || legacyPath;
    if (!filePath) throw new Error("Preview file path is empty.");
    const resolvedFilePath = path.resolve(filePath);
    assertAuthorizedPath(resolvedFilePath);
    if (!previewExtensions.has(path.extname(resolvedFilePath).toLowerCase())) throw new Error("This file type cannot be previewed.");
    const stat = await fsp.stat(resolvedFilePath);
    if (!stat.isFile()) throw new Error("Preview path is not a file.");
    const previewPath = url.searchParams.get("cache") === "1" ? await resolvePreviewCachePath(resolvedFilePath) : resolvedFilePath;
    return net.fetch(pathToFileURL(previewPath).toString());
  });
}

function previewCacheDir() {
  return path.join(app.getPath("temp"), "dev-toolbox-preview-cache");
}

async function clearPreviewCache() {
  previewCache.clear();
  previewCopyTasks.clear();
  await fsp.rm(previewCacheDir(), { recursive: true, force: true }).catch(() => undefined);
}

async function resolvePreviewCachePath(sourcePath: string) {
  const stat = await fsp.stat(sourcePath);
  const cached = previewCache.get(sourcePath);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    return cached.previewPath;
  }
  const extension = path.extname(sourcePath) || ".bin";
  const cacheKey = Buffer.from(`${sourcePath}:${stat.size}:${stat.mtimeMs}`).toString("base64url").slice(0, 80);
  const previewPath = path.join(previewCacheDir(), `${cacheKey}${extension}`);
  const taskKey = `${sourcePath}:${stat.size}:${stat.mtimeMs}`;
  const runningTask = previewCopyTasks.get(taskKey);
  if (runningTask) return runningTask;
  const task = (async () => {
    await fsp.mkdir(previewCacheDir(), { recursive: true });
    await fsp.copyFile(sourcePath, previewPath);
    previewCache.set(sourcePath, { sourcePath, previewPath, size: stat.size, mtimeMs: stat.mtimeMs });
    return previewPath;
  })();
  previewCopyTasks.set(taskKey, task);
  try {
    return await task;
  } finally {
    previewCopyTasks.delete(taskKey);
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return tray;
  const iconPath = getRuntimeIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Dev Toolbox");
  const menu = Menu.buildFromTemplate([
    { label: "显示主窗口", click: () => showMainWindow() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  return tray;
}

function getWindowState(): WindowFrameState {
  return {
    isMaximized: Boolean(mainWindow?.isMaximized()),
    isMinimized: Boolean(mainWindow?.isMinimized()),
    isAlwaysOnTop: Boolean(mainWindow?.isAlwaysOnTop())
  };
}

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window:state-changed", getWindowState());
}

function createWindow() {
  const iconPath = getRuntimeIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1280,
    minHeight: 820,
    title: "Dev Toolbox",
    frame: false,
    backgroundColor: DEFAULT_TITLEBAR_THEME.surfaceColor,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: getPreloadEntryPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow = win;

  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, targetUrl) => {
    const currentUrl = win.webContents.getURL();
    if (!currentUrl) return;
    try {
      const current = new URL(currentUrl);
      const target = new URL(targetUrl);
      const sameApplication = current.protocol === target.protocol && current.origin === target.origin &&
        (current.protocol !== "file:" || current.pathname === target.pathname);
      if (!sameApplication) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(getRendererIndexPath());
  }

  win.on("close", (event) => {
    const settings = getCachedSettings();
    if (!quitting && settings.closeBehavior === "minimize-to-tray") {
      event.preventDefault();
      ensureTray();
      win.hide();
      return;
    }
    if (closeAfterFlush.has(win)) {
      closeAfterFlush.delete(win);
      return;
    }
    event.preventDefault();
    void flushRendererBeforeAction(win, "close").then((ok) => {
      if (!ok || win.isDestroyed()) return;
      closeAfterFlush.add(win);
      win.close();
    });
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.on("maximize", emitWindowState);
  win.on("unmaximize", emitWindowState);
  win.on("minimize", emitWindowState);
  win.on("restore", emitWindowState);
  win.webContents.on("did-finish-load", emitWindowState);
}

app.on("second-instance", () => {
  showMainWindow();
});

Menu.setApplicationMenu(null);

handleTrustedIpc("app:quit", () => {
  quitting = true;
  app.quit();
});

handleTrustedIpc("app:show", () => {
  showMainWindow();
});

handleTrustedIpc("window:get-state", () => {
  return getWindowState();
});

handleTrustedIpc("window:minimize", () => {
  mainWindow?.minimize();
  return getWindowState();
});

handleTrustedIpc("window:toggle-maximize", () => {
  if (!mainWindow) return getWindowState();
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return getWindowState();
});

handleTrustedIpc("window:close", () => {
  mainWindow?.close();
});

handleTrustedIpc("window:reload", async () => {
  const win = mainWindow;
  if (!win || !(await flushRendererBeforeAction(win, "reload"))) return;
  win.webContents.reload();
});

handleTrustedIpc("window:get-always-on-top", () => {
  return Boolean(mainWindow?.isAlwaysOnTop());
});

handleTrustedIpc("window:set-always-on-top", (_event, enabled: unknown) => {
  const requestedState = parseBooleanPayload(enabled);
  mainWindow?.setAlwaysOnTop(requestedState);
  emitWindowState();
  return Boolean(mainWindow?.isAlwaysOnTop());
});

// 渲染进程手动触发更新检查
handleTrustedIpc("update:check", async () => {
  await checkForUpdates();
});

// 渲染进程手动触发更新下载
handleTrustedIpc("update:download", async () => {
  await downloadUpdate();
});

// 渲染进程手动触发更新安装
handleTrustedIpc("update:install", async () => {
  await installUpdate();
});

handleTrustedIpc("update:state", () => getUpdateState());

// 获取当前版本号
handleTrustedIpc("update:current-version", () => {
  try {
    if (app.isPackaged) return app.getVersion();
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "..", "package.json"), "utf8"));
    return String(pkg.version || "").trim();
  } catch {
    return app.getVersion();
  }
});

// 渲染进程通知主题变化 → 更新标题栏颜色
onTrustedIpc("theme:background", (_event, raw: unknown) => {
  const parsed = parseTitleBarThemePayload(raw);
  if (!parsed.success) return;
  mainWindow?.setBackgroundColor(parsed.data.surfaceColor);
});

app.whenReady().then(async () => {
  initializePathAuthorization(app.getPath("userData"));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    Boolean(webContents && isTrustedRendererUrl(webContents.getURL()) && isAllowedRendererPermission(permission))
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isTrustedRendererUrl(webContents.getURL()) && isAllowedRendererPermission(permission));
  });
  session.defaultSession.setDevicePermissionHandler(() => false);
  await loadAppSettings();
  await clearPreviewCache();
  registerPreviewProtocol();
  registerIpc();
  ensureTray();
  createWindow();

  // 初始化自动更新（仅在打包后的生产环境生效）
  initAutoUpdater(
    async () => mainWindow ? flushRendererBeforeAction(mainWindow, "install-update") : true,
    (installing) => {
      quitting = installing;
      // The install barrier already saved drafts; do not cancel quitAndInstall with a second flush.
      if (mainWindow) {
        if (installing) closeAfterFlush.add(mainWindow);
        else closeAfterFlush.delete(mainWindow);
      }
    }
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopAutoUpdater();
  quitting = true;
  void clearPreviewCache();
});
