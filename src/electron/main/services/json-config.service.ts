import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolConfigKey } from "../../../shared/types";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";

const allowedConfigKeys = new Set<ToolConfigKey>(["navigation", "capture-proxy", "output-picker"]);

function configDir() {
  return path.join(app.getPath("userData"), "data", "configs");
}

function configPath(key: ToolConfigKey) {
  if (!allowedConfigKeys.has(key)) throw new Error("不支持的配置类型");
  return path.join(configDir(), `${key}.json`);
}

export async function loadToolConfig(key: ToolConfigKey): Promise<unknown | null> {
  try {
    return await readJsonWithBackup<unknown>(configPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveToolConfig(key: ToolConfigKey, value: unknown): Promise<unknown> {
  await fs.mkdir(configDir(), { recursive: true });
  await writeFileAtomic(configPath(key), `${JSON.stringify(value, null, 2)}\n`);
  return value;
}
