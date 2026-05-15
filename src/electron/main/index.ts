import { app, BrowserWindow, Menu, Tray, net, protocol, nativeImage, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./ipc";
import { loadAppSettings, getCachedSettings } from "./services/settings.service";
import { getPreloadEntryPath, getRendererIndexPath, getRuntimeIconPath } from "./utils/app-paths";
import { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate } from "./services/autoUpdater.service";
import type { ThemeTitleBarPayload, WindowFrameState } from "../../shared/types";
import fs from "node:fs";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// Single instance lock — focus existing window if already running.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const DEFAULT_TITLEBAR_THEME: ThemeTitleBarPayload = {
  accentColor: "#0969da",
  surfaceColor: "#f6f8fa",
  textColor: "#1f2328"
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
  protocol.handle("devtoolbox-file", (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.slice(1));
    return net.fetch(pathToFileURL(filePath).toString());
  });
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
      sandbox: false
    }
  });

  mainWindow = win;

  win.setMenuBarVisibility(false);
  win.removeMenu();

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(getRendererIndexPath());
  }

  win.on("close", (event) => {
    if (quitting) return;
    const settings = getCachedSettings();
    if (settings.closeBehavior === "minimize-to-tray") {
      event.preventDefault();
      ensureTray();
      win.hide();
    }
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

ipcMain.handle("app:quit", () => {
  quitting = true;
  app.quit();
});

ipcMain.handle("app:show", () => {
  showMainWindow();
});

ipcMain.handle("window:get-state", () => {
  return getWindowState();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
  return getWindowState();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return getWindowState();
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return getWindowState();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:get-always-on-top", () => {
  return Boolean(mainWindow?.isAlwaysOnTop());
});

ipcMain.handle("window:set-always-on-top", (_event, enabled: boolean) => {
  mainWindow?.setAlwaysOnTop(Boolean(enabled));
  emitWindowState();
  return Boolean(mainWindow?.isAlwaysOnTop());
});

// 渲染进程手动触发更新检查
ipcMain.handle("update:check", async () => {
  await checkForUpdates();
});

// 渲染进程手动触发更新下载
ipcMain.handle("update:download", async () => {
  await downloadUpdate();
});

// 渲染进程手动触发更新安装
ipcMain.handle("update:install", () => {
  installUpdate();
});

// 获取当前版本号
ipcMain.handle("update:current-version", () => {
  try {
    if (app.isPackaged) return app.getVersion();
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "..", "package.json"), "utf8"));
    return String(pkg.version || "").trim();
  } catch {
    return app.getVersion();
  }
});

// 渲染进程通知主题变化 → 更新标题栏颜色
ipcMain.on("theme:background", (_event, payload: ThemeTitleBarPayload) => {
  const surfaceColor = payload?.surfaceColor || DEFAULT_TITLEBAR_THEME.surfaceColor;

  mainWindow?.setBackgroundColor(surfaceColor);
});

app.whenReady().then(async () => {
  await loadAppSettings();
  registerPreviewProtocol();
  registerIpc();
  createWindow();

  // 初始化自动更新（仅在打包后的生产环境生效）
  if (mainWindow) {
    initAutoUpdater(mainWindow);
  }

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
  quitting = true;
});
