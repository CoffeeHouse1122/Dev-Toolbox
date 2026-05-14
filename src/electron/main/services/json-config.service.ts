import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { ToolConfigKey } from "../../../shared/types";

const allowedConfigKeys = new Set<ToolConfigKey>(["navigation", "capture-proxy"]);

function configDir() {
  return path.join(app.getPath("userData"), "data", "configs");
}

function configPath(key: ToolConfigKey) {
  if (!allowedConfigKeys.has(key)) throw new Error("不支持的配置类型");
  return path.join(configDir(), `${key}.json`);
}

export async function loadToolConfig(key: ToolConfigKey): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(configPath(key), "utf8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveToolConfig(key: ToolConfigKey, value: unknown): Promise<unknown> {
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configPath(key), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}