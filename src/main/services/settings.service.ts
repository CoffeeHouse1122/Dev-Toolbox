import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../../shared/types";

const defaultSettings: AppSettings = {
  closeBehavior: "minimize-to-tray"
};

function settingsPath() {
  return path.join(app.getPath("userData"), "data", "settings.json");
}

let cache: AppSettings | null = null;

export async function loadAppSettings(): Promise<AppSettings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    cache = { ...defaultSettings, ...parsed };
  } catch {
    cache = { ...defaultSettings };
  }
  return cache;
}

export async function saveAppSettings(next: AppSettings): Promise<AppSettings> {
  const merged: AppSettings = { ...defaultSettings, ...next };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  cache = merged;
  return merged;
}

export function getCachedSettings(): AppSettings {
  return cache ?? { ...defaultSettings };
}
