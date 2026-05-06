import { app, BrowserWindow, Menu, Tray, net, protocol, nativeImage, ipcMain } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpc } from "./ipc";
import { loadAppSettings, getCachedSettings } from "./services/settings.service";
import { getPreloadEntryPath, getRendererIndexPath, getRuntimeIconPath } from "./utils/app-paths";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

// Single instance lock — focus existing window if already running.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

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

function createWindow() {
  const iconPath = getRuntimeIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    title: "Dev Toolbox",
    backgroundColor: "#0d1117",
    icon: iconPath,
    webPreferences: {
      preload: getPreloadEntryPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow = win;

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
}

app.on("second-instance", () => {
  showMainWindow();
});

ipcMain.handle("app:quit", () => {
  quitting = true;
  app.quit();
});

ipcMain.handle("app:show", () => {
  showMainWindow();
});

app.whenReady().then(async () => {
  await loadAppSettings();
  registerPreviewProtocol();
  registerIpc();
  createWindow();

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
