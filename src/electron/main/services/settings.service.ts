import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../../shared/types";

const defaultSettings: AppSettings = {
  closeBehavior: "minimize-to-tray",
  autoLaunch: false
};

function settingsPath() {
  return path.join(app.getPath("userData"), "data", "settings.json");
}

let cache: AppSettings | null = null;

function systemAutoLaunchEnabled() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function syncAutoLaunch(enabled: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      path: process.execPath
    });
  } catch {
    // Some portable/dev environments do not allow writing login item settings.
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    cache = { ...defaultSettings, ...parsed };
  } catch {
    cache = { ...defaultSettings, autoLaunch: systemAutoLaunchEnabled() };
  }
  syncAutoLaunch(cache.autoLaunch);
  return cache;
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
  const merged: AppSettings = { ...defaultSettings, ...next };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  cache = merged;
  syncAutoLaunch(merged.autoLaunch);
  return merged;
}

export function getCachedSettings(): AppSettings {
  return cache ?? { ...defaultSettings };
}
