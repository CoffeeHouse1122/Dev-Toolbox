import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { UpdateController, supportsUpdates } from "./update-controller";
import { updateTaskGate } from "./update-task-gate";
import type { UpdateStatus } from "../../../shared/types";

let controller: UpdateController | undefined;

export function initAutoUpdater(prepareInstall: () => Promise<boolean>, setInstalling: (value: boolean) => void) {
  if (controller) return;
  controller = new UpdateController(
    autoUpdater,
    supportsUpdates(app.isPackaged, process.platform, process.arch),
    updateTaskGate,
    (state) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send("update:status", state);
      }
    },
    prepareInstall,
    setInstalling
  );
  controller.start();
}

export function getUpdateState(): UpdateStatus {
  return controller?.getState() || { status: "disabled", message: "更新服务尚未初始化", activeTasks: 0 };
}
export async function checkForUpdates() { await controller?.check(); }
export async function downloadUpdate() { await controller?.download(); }
export async function installUpdate() { await controller?.install(); }
export function stopAutoUpdater() { controller?.stop(); }
