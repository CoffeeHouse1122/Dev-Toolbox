import { app, safeStorage, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { SharedDiskConfig, SharedDiskConnectResult } from "../../../shared/types";
import { parseSharedPath, sharedDirectory } from "../../../shared/shared-disk";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { runSharedDiskNative, sharedDiskError } from "./shared-disk-native";

interface StoredConfig {
  version: 2;
  sharePath: string;
  authMode: "windows" | "account";
  username: string;
  defaultDirectory: string;
  rememberCredentials: boolean;
  passwordCiphertext: string;
  migrationNotice?: string;
}

const storedSchema = z.object({
  version: z.literal(2), sharePath: z.string().max(2048), authMode: z.enum(["windows", "account"]),
  username: z.string().max(512), defaultDirectory: z.string().max(32768), rememberCredentials: z.boolean(),
  passwordCiphertext: z.string().max(32768), migrationNotice: z.string().optional()
});

let modifying = false;
async function exclusively<T>(run: () => Promise<T>) {
  if (modifying) throw new Error("另一个共享操作正在进行，请稍后重试");
  modifying = true;
  try { return await run(); } finally { modifying = false; }
}
function configPath() { return path.join(app.getPath("userData"), "data", "shared-disk.json"); }
function emptyStored(): StoredConfig {
  return { version: 2, sharePath: "", authMode: "windows", username: "", defaultDirectory: "", rememberCredentials: false, passwordCiphertext: "" };
}
async function writeStored(value: StoredConfig) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await writeFileAtomic(configPath(), JSON.stringify(value, null, 2) + "\n", { backup: false });
  // This exact application-owned backup may contain legacy plaintext credentials.
  await fs.rm(configPath() + ".bak", { force: true });
}
async function readStored(): Promise<StoredConfig> {
  let value: Record<string, unknown>;
  try { value = await readJsonWithBackup<Record<string, unknown>>(configPath()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const present = await Promise.all([configPath(), configPath() + ".bak"].map((file) => fs.stat(file).then(() => true, (cause: NodeJS.ErrnoException) => {
        if (cause.code === "ENOENT") return false;
        throw new Error("共享配置文件无法访问");
      })));
      if (!present.some(Boolean)) return emptyStored();
    }
    throw new Error("共享配置无法读取，请检查本机配置文件；未覆盖原数据");
  }
  if (!value || typeof value !== "object") throw new Error("共享配置格式无效，未覆盖原数据");
  if (value.version === 2) {
    const checked = storedSchema.safeParse(value);
    if (!checked.success) throw new Error("共享配置格式无效，未覆盖原数据");
    return checked.data;
  }
  // Migrate the old HTTP-shaped input to SMB without exposing the old password to renderer.
  const result = emptyStored();
  try {
    const oldAddress = String(value.url || "").trim();
    const host = /^https?:\/\//i.test(oldAddress) ? new URL(oldAddress).hostname : oldAddress;
    const segments = String(value.basePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (host && segments.length) result.sharePath = parseSharedPath("\\\\" + host + "\\" + segments.join("\\")).baseRoot;
    result.username = String(value.username || "").trim();
    result.authMode = result.username ? "account" : "windows";
    if (result.sharePath && value.defaultDirectory) result.defaultDirectory = sharedDirectory(result.sharePath, String(value.defaultDirectory));
    if (result.authMode === "account" && value.encrypted === true && typeof value.password === "string") {
      result.passwordCiphertext = value.password;
      result.rememberCredentials = Boolean(value.password);
    }
    result.migrationNotice = "旧配置已转换为 SMB 路径；原 HTTP 协议、端口及持久连接选项不再使用。旧 Windows 凭据未被更改。";
    if (value.password && value.encrypted !== true) result.migrationNotice += "旧明文密码已移除，请重新输入。";
  } catch {
    // Keep invalid legacy data untouched rather than erasing an unknown configuration.
    return { ...emptyStored(), migrationNotice: "旧共享配置无法自动转换，请重新填写 UNC 路径；原配置尚未覆盖。" };
  }
  await writeStored(result);
  return result;
}
function publicConfig(stored: StoredConfig): SharedDiskConfig {
  return {
    sharePath: stored.sharePath, authMode: stored.authMode, username: stored.username,
    defaultDirectory: stored.defaultDirectory, rememberCredentials: stored.rememberCredentials,
    password: "", hasSavedPassword: Boolean(stored.passwordCiphertext), migrationNotice: stored.migrationNotice
  };
}
export async function loadSharedDiskConfig(): Promise<SharedDiskConfig> {
  return exclusively(async () => publicConfig(await readStored()));
}
function normalize(config: SharedDiskConfig) {
  const sharePath = parseSharedPath(config.sharePath).baseRoot;
  const defaultDirectory = config.defaultDirectory.trim() ? sharedDirectory(sharePath, config.defaultDirectory) : "";
  if (config.authMode !== "windows" && config.authMode !== "account") throw new Error("无效的登录方式");
  const username = config.authMode === "account" ? config.username.trim() : "";
  if (config.authMode === "account" && !username) throw new Error("请输入登录账号");
  return { ...config, sharePath, username, defaultDirectory, rememberCredentials: config.authMode === "account" && config.rememberCredentials };
}
function sameIdentity(a: StoredConfig, b: SharedDiskConfig) {
  return a.authMode === "account" && b.authMode === "account" &&
    a.username.toLowerCase() === b.username.toLowerCase() &&
    Boolean(a.sharePath) && parseSharedPath(a.sharePath).shareRoot.toLowerCase() === parseSharedPath(b.sharePath).shareRoot.toLowerCase();
}
async function save(config: SharedDiskConfig) {
  const normalized = normalize(config);
  const previous = await readStored();
  let passwordCiphertext = "";
  if (normalized.rememberCredentials) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，请取消“记住凭据”后重试；不会明文保存密码");
    if (normalized.password) passwordCiphertext = safeStorage.encryptString(normalized.password).toString("base64");
    else if (sameIdentity(previous, normalized)) passwordCiphertext = previous.passwordCiphertext;
    if (!passwordCiphertext) throw new Error("请输入要保存的密码");
  }
  const stored: StoredConfig = {
    version: 2, sharePath: normalized.sharePath, authMode: normalized.authMode,
    username: normalized.username, defaultDirectory: normalized.defaultDirectory,
    rememberCredentials: normalized.rememberCredentials, passwordCiphertext
  };
  await writeStored(stored);
  return publicConfig(stored);
}
export async function saveSharedDiskConfig(config: SharedDiskConfig) {
  return exclusively(() => save(config));
}
export async function forgetSharedDiskCredentials() {
  return exclusively(async () => {
    const stored = await readStored();
    stored.passwordCiphertext = "";
    stored.rememberCredentials = false;
    await writeStored(stored);
    return publicConfig(stored);
  });
}
export async function connectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult> {
  return exclusively(async () => {
    const normalized = normalize(config);
    const { shareRoot, baseRoot } = parseSharedPath(normalized.sharePath);
    let password = normalized.password;
    if (normalized.authMode === "account" && !password) {
      const stored = await readStored();
      if (sameIdentity(stored, normalized) && stored.passwordCiphertext && safeStorage.isEncryptionAvailable()) {
        try { password = safeStorage.decryptString(Buffer.from(stored.passwordCiphertext, "base64")); }
        catch { throw new Error("已保存密码无法解密，请重新输入"); }
      }
      if (!password) throw new Error("请输入密码，或改用当前 Windows 身份");
    }
    // Never delete an existing connection or overwrite Windows Credential Manager.
    const result = await runSharedDiskNative({
      action: "connect", shareRoot,
      ...(normalized.authMode === "account" ? { username: normalized.username, password } : {})
    });
    if (result.code !== 0) throw new Error(sharedDiskError(result.code));
    let message = "共享已连接";
    try { await save({ ...normalized, password }); }
    catch { message += "，但配置或凭据保存失败，请检查安全存储后重新保存"; }
    password = "";
    return { shareRoot, baseUncPath: baseRoot, defaultDirectory: sharedDirectory(normalized.sharePath, normalized.defaultDirectory), message };
  });
}
export async function disconnectSharedDisk(config: { sharePath: string }): Promise<SharedDiskConnectResult> {
  return exclusively(async () => {
    const { shareRoot, baseRoot } = parseSharedPath(config.sharePath);
    const result = await runSharedDiskNative({ action: "disconnect", shareRoot });
    if (result.code !== 0 && result.code !== 2250) throw new Error(sharedDiskError(result.code));
    return { shareRoot, baseUncPath: baseRoot, defaultDirectory: baseRoot, message: result.code === 2250 ? "该共享当前没有连接" : "共享已断开，保存的凭据未删除" };
  });
}
export async function openSharedDiskDirectory(targetPath: string) {
  if (process.platform !== "win32") throw new Error("共享连接仅支持 Windows");
  const error = await shell.openPath(targetPath);
  if (error) throw new Error("无法打开共享目录，请检查连接状态及目录权限");
  return targetPath;
}
