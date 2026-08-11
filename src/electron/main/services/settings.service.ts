import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../../shared/types";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";

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
    const parsed = await readJsonWithBackup<Partial<AppSettings>>(settingsPath());
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
  await writeFileAtomic(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`);
  cache = merged;
  syncAutoLaunch(merged.autoLaunch);
  return merged;
}

export function getCachedSettings(): AppSettings {
  return cache ?? { ...defaultSettings };
}
