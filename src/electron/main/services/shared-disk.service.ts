import { app, safeStorage, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SharedDiskConfig, SharedDiskConnectResult } from "../../../shared/types";
import { ensureDir } from "./file-utils";

interface StoredSharedDiskConfig extends Omit<SharedDiskConfig, "password"> {
  password: string;
  encrypted: boolean;
}

const defaultConfig: SharedDiskConfig = {
  url: "http://10.0.15.5:5000",
  username: "",
  password: "",
  basePath: "",
  defaultDirectory: "",
  persistent: true
};

function parseHostFromUrl(url: string) {
  if (!url.trim()) {
    throw new Error("共享盘地址不能为空");
  }

  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  }
}

function splitSegments(value: string) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildUncPath(config: Pick<SharedDiskConfig, "url" | "basePath">, subPath = "") {
  const host = parseHostFromUrl(config.url);
  const segments = [...splitSegments(config.basePath), ...splitSegments(subPath)];

  if (!host) {
    throw new Error("无法解析共享盘主机地址");
  }

  return segments.length > 0 ? `\\\\${host}\\${segments.join("\\")}` : `\\\\${host}`;
}

function buildShareRoot(config: Pick<SharedDiskConfig, "url" | "basePath">) {
  const host = parseHostFromUrl(config.url);
  const [shareName] = splitSegments(config.basePath);

  if (!host) {
    throw new Error("无法解析共享盘主机地址");
  }
  if (!shareName) {
    throw new Error("共享盘基础路径至少需要包含共享名");
  }

  return `\\\\${host}\\${shareName}`;
}

function configPath() {
  return path.join(app.getPath("userData"), "data", "shared-disk.json");
}

function encryptPassword(password: string) {
  if (!password) return { password: "", encrypted: false };
  if (!safeStorage.isEncryptionAvailable()) {
    return { password, encrypted: false };
  }
  return {
    password: safeStorage.encryptString(password).toString("base64"),
    encrypted: true
  };
}

function decryptPassword(password: string, encrypted: boolean) {
  if (!password) return "";
  if (!encrypted) return password;
  try {
    return safeStorage.decryptString(Buffer.from(password, "base64"));
  } catch {
    return "";
  }
}

function runCommand(command: string, args: string[], ignoreFailure = false) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || ignoreFailure) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} ${args.join(" ")} 执行失败，退出码 ${code}`));
    });
  });
}

function normalizeConfig(config: SharedDiskConfig): SharedDiskConfig {
  return {
    ...defaultConfig,
    ...config,
    url: config.url.trim(),
    username: config.username.trim(),
    basePath: config.basePath.trim(),
    defaultDirectory: config.defaultDirectory.trim()
  };
}

export async function loadSharedDiskConfig(): Promise<SharedDiskConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const stored = JSON.parse(raw) as StoredSharedDiskConfig;
    return normalizeConfig({
      ...stored,
      password: decryptPassword(stored.password, stored.encrypted)
    });
  } catch {
    return { ...defaultConfig };
  }
}

export async function saveSharedDiskConfig(config: SharedDiskConfig): Promise<SharedDiskConfig> {
  const normalized = normalizeConfig(config);
  const encrypted = encryptPassword(normalized.password);
  const stored: StoredSharedDiskConfig = {
    url: normalized.url,
    username: normalized.username,
    password: encrypted.password,
    encrypted: encrypted.encrypted,
    basePath: normalized.basePath,
    defaultDirectory: normalized.defaultDirectory,
    persistent: normalized.persistent
  };

  await ensureDir(path.dirname(configPath()));
  await fs.writeFile(configPath(), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return normalized;
}

export async function connectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult> {
  const normalized = normalizeConfig(config);
  if (!normalized.username) throw new Error("共享盘账号不能为空");
  if (!normalized.password) throw new Error("共享盘密码不能为空");

  const host = parseHostFromUrl(normalized.url);
  const shareRoot = buildShareRoot(normalized);
  const baseUncPath = buildUncPath(normalized);
  const defaultDirectory = normalized.defaultDirectory || baseUncPath;

  await runCommand("cmdkey", [`/add:${host}`, `/user:${normalized.username}`, `/pass:${normalized.password}`]);
  await runCommand("net", ["use", shareRoot, "/delete", "/y"], true);
  await runCommand("net", ["use", shareRoot, normalized.password, `/user:${normalized.username}`, normalized.persistent ? "/persistent:yes" : "/persistent:no"]);
  await saveSharedDiskConfig(normalized);

  return {
    shareRoot,
    baseUncPath,
    defaultDirectory,
    message: "共享盘已连接"
  };
}

export async function disconnectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult> {
  const normalized = normalizeConfig(config);
  const shareRoot = buildShareRoot(normalized);
  await runCommand("net", ["use", shareRoot, "/delete", "/y"], true);
  return {
    shareRoot,
    baseUncPath: buildUncPath(normalized),
    defaultDirectory: normalized.defaultDirectory || buildUncPath(normalized),
    message: "共享盘连接已断开"
  };
}

export async function openSharedDiskDirectory(targetPath: string) {
  const normalized = targetPath.trim();
  if (!normalized) {
    throw new Error("默认目录不能为空");
  }
  const error = await shell.openPath(normalized);
  if (error) {
    throw new Error(error);
  }
  return normalized;
}

