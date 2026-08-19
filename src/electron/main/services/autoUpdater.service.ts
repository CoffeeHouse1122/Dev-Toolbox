/**
 * Lightweight static-file updater.
 *
 * HTTP and unauthenticated feeds are intentionally supported for personal
 * deployments. `size` and `sha256` are optional manifest fields: when present
 * they are verified; when absent the platform package header is still checked.
 */
import { app, BrowserWindow, net } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const TAG = "[auto-updater]";
const MANIFEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_INSTALLER_BYTES = 2 * 1024 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;
let pendingUpdate: PendingUpdate | null = null;
let downloadInProgress = false;

export type InstallerLaunchState = {
  preparedInstallerPath: string | null;
  installInProgress: boolean;
};

const installerLaunchState: InstallerLaunchState = {
  preparedInstallerPath: null,
  installInProgress: false
};

type EnvMap = Record<string, string>;

export type ManifestDownload = {
  url: string;
  label?: string;
  primary?: boolean;
  platform?: string;
  arch?: string;
  size?: number;
  sha256?: string;
};

export type PendingUpdate = {
  version: string;
  downloadUrl: string;
  size?: number;
  sha256?: string;
};

function isPackaged() {
  return !Boolean(process.env.VITE_DEV_SERVER_URL) && !process.defaultApp;
}

function getCurrentVersion() {
  if (app.isPackaged) return app.getVersion();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "..", "package.json"), "utf8"));
    return String(pkg.version || "").trim();
  } catch {
    return app.getVersion();
  }
}

function compareVersions(a: string, b: string) {
  const toParts = (value: string) =>
    String(value)
      .replace(/^v/i, "")
      .split(/[+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = toParts(a);
  const right = toParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return 1;
    if ((left[index] || 0) < (right[index] || 0)) return -1;
  }
  return 0;
}

function readEnvFile(filePath: string): EnvMap {
  try {
    if (!fs.existsSync(filePath)) return {};
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce<EnvMap>((result, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return result;
      const separator = line.indexOf("=");
      if (separator <= 0) return result;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) result[key] = value;
      return result;
    }, {});
  } catch {
    return {};
  }
}

function getLocalEnvValue(key: string) {
  const candidates = app.isPackaged
    ? [path.resolve(path.dirname(process.execPath), ".env")]
    : [path.resolve(process.cwd(), ".env"), path.resolve(app.getAppPath(), ".env")];
  for (const filePath of candidates) {
    const value = readEnvFile(filePath)[key];
    if (value) return value;
  }
  return "";
}

function getPackagedManifestUrl() {
  try {
    const configPath = path.join(app.getAppPath(), "dist", "electron", "update-config.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as { manifestUrl?: unknown };
    return typeof parsed.manifestUrl === "string" ? parsed.manifestUrl : "";
  } catch {
    return "";
  }
}

export function normalizeUpdateManifestUrl(rawValue: unknown) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const parsed = new URL(value);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
    throw new Error("Update manifest URL must use HTTP(S) without embedded credentials.");
  }
  if (parsed.hostname.endsWith(".invalid") || parsed.hostname === "xxx.com" || parsed.hostname === "www.xxx.com") {
    throw new Error("Update manifest URL still uses a placeholder hostname.");
  }
  return parsed.toString();
}

function getUpdateManifestUrl() {
  return normalizeUpdateManifestUrl(
    process.env.AUTOUPDATE_FEED_URL ||
      process.env.DESKTOP_APP_UPDATE_URL ||
      getLocalEnvValue("AUTOUPDATE_FEED_URL") ||
      getLocalEnvValue("DESKTOP_APP_UPDATE_URL") ||
      getPackagedManifestUrl() ||
      ""
  );
}

function ensureUpdateDir() {
  const directory = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function installerFileName(downloadUrl: string) {
  let fileName = "";
  try {
    fileName = decodeURIComponent(path.basename(new URL(downloadUrl).pathname));
  } catch {
    // Fallback below.
  }
  fileName = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "");
  if (fileName) return fileName;
  const extension = process.platform === "win32" ? ".exe" : process.platform === "darwin" ? ".dmg" : ".AppImage";
  return `dev-toolbox-${Date.now()}${extension}`;
}

function normalizePlatform(value = "") {
  const normalized = value.trim().toLowerCase();
  if (["win", "win32", "windows"].includes(normalized)) return "win32";
  if (["mac", "macos", "darwin", "osx"].includes(normalized)) return "darwin";
  return normalized;
}

function normalizeArch(value = "") {
  const normalized = value.trim().toLowerCase();
  if (["amd64", "x86_64"].includes(normalized)) return "x64";
  if (["aarch64"].includes(normalized)) return "arm64";
  return normalized;
}

export function selectUpdateDownload(
  downloads: ManifestDownload[],
  targetPlatform = process.platform,
  targetArch = process.arch
): ManifestDownload {
  if (!downloads.length) throw new Error("更新清单缺少下载地址");

  const platform = normalizePlatform(targetPlatform);
  const arch = normalizeArch(targetArch);
  const tagged = downloads.some((item) => item.platform || item.arch);
  const matches = downloads.filter((item) => {
    const itemPlatform = normalizePlatform(item.platform);
    const itemArch = normalizeArch(item.arch);
    return (!itemPlatform || itemPlatform === platform || itemPlatform === "any") &&
      (!itemArch || itemArch === arch || ["any", "universal"].includes(itemArch));
  });
  if (tagged && !matches.length) throw new Error(`没有适用于 ${platform}/${arch} 的更新安装包`);
  const candidates = matches.length ? matches : downloads;
  return candidates.find((item) => item.primary) || candidates[0];
}

function selectDownload(manifest: Record<string, unknown>): ManifestDownload {
  const downloads = Array.isArray(manifest.downloads) ? manifest.downloads.filter((item): item is ManifestDownload => {
    return Boolean(item && typeof item === "object" && typeof (item as ManifestDownload).url === "string");
  }) : [];
  if (!downloads.length && typeof manifest.downloadUrl === "string") downloads.push({ url: manifest.downloadUrl });
  return selectUpdateDownload(downloads);
}

export function resolveUpdateDownloadUrl(manifestUrl: string, downloadUrl: string) {
  return new URL(downloadUrl, manifestUrl).toString();
}

export function isValidUpdateSha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}

export async function readManifestStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let fullyRead = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        fullyRead = true;
        break;
      }
      if (!value?.byteLength) continue;
      if (value.byteLength > MAX_MANIFEST_BYTES - totalBytes) throw new Error("更新清单超过 1 MiB 限制");
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    if (!fullyRead) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export function createManifestFetchRequest(manifestUrl: string, cacheBust = Date.now()) {
  const requestUrl = new URL(manifestUrl);
  requestUrl.searchParams.set("_dev_toolbox_update_check", String(cacheBust));
  return {
    url: requestUrl.toString(),
    init: {
      method: "GET",
      cache: "no-store" as const,
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache"
      }
    }
  };
}

export function createPendingUpdateSnapshot(update: PendingUpdate): Readonly<PendingUpdate> {
  return Object.freeze({ ...update });
}

/** Claim one prepared installer before any asynchronous launch work begins. */
export function claimInstallerLaunch(state: InstallerLaunchState) {
  if (state.installInProgress || !state.preparedInstallerPath) return null;
  const installerPath = state.preparedInstallerPath;
  state.installInProgress = true;
  state.preparedInstallerPath = null;
  return installerPath;
}

/** Restore a failed launch so the verified installer can be retried. */
export function restoreInstallerLaunch(state: InstallerLaunchState, installerPath: string) {
  state.installInProgress = false;
  if (!state.preparedInstallerPath) state.preparedInstallerPath = installerPath;
}

async function fetchManifest() {
  const manifestUrl = getUpdateManifestUrl();
  if (!manifestUrl) throw new Error("未配置更新清单地址，请设置 AUTOUPDATE_FEED_URL 或 DESKTOP_APP_UPDATE_URL");
  const request = createManifestFetchRequest(manifestUrl);
  const response = await net.fetch(request.url, {
    ...request.init,
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`更新清单加载失败 (${response.status})`);
  if (!response.body) throw new Error("更新清单响应为空");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_MANIFEST_BYTES) {
    await response.body.cancel().catch(() => undefined);
    throw new Error("更新清单超过 1 MiB 限制");
  }
  const source = await readManifestStream(response.body);
  const manifest = JSON.parse(source) as Record<string, unknown>;
  return { manifest, manifestUrl };
}

function parsePendingUpdate(manifest: Record<string, unknown>, manifestUrl: string, latestVersion: string): PendingUpdate {
  const download = selectDownload(manifest);
  let downloadUrl: string;
  try {
    // Resolves both absolute URLs and ./release/... relative to the manifest.
    downloadUrl = resolveUpdateDownloadUrl(manifestUrl, download.url);
  } catch {
    throw new Error("更新清单中的下载地址无效");
  }
  const size = Number(download.size || 0);
  if (size && (!Number.isSafeInteger(size) || size < 1 || size > MAX_INSTALLER_BYTES)) throw new Error("更新清单中的安装包大小无效");
  const sha256 = String(download.sha256 || "").trim().toLowerCase();
  if (sha256 && !isValidUpdateSha256(sha256)) throw new Error("更新清单中的 sha256 无效");
  return { version: latestVersion, downloadUrl, size: size || undefined, sha256: sha256 || undefined };
}

async function writeChunk(handle: fsp.FileHandle, chunk: Uint8Array) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset, null);
    if (!bytesWritten) throw new Error("写入更新安装包失败");
    offset += bytesWritten;
  }
}

async function writeResponseToFile(update: PendingUpdate, destinationPath: string) {
  const partPath = `${destinationPath}.part`;
  await fsp.rm(partPath, { force: true });
  const response = await net.fetch(update.downloadUrl, {
    method: "GET",
    headers: { Accept: "application/octet-stream,application/x-msdownload,*/*" },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  });
  if (!response.ok || !response.body) throw new Error(`下载失败 (${response.status})`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_INSTALLER_BYTES) throw new Error("安装包超过 2 GiB 限制");
  if (update.size && contentLength && update.size !== contentLength) throw new Error("服务器返回的安装包大小与清单不一致");

  const reader = response.body.getReader();
  const hash = crypto.createHash("sha256");
  let output: fsp.FileHandle | null = await fsp.open(partPath, "w");
  let downloaded = 0;
  let lastPercent = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      downloaded += value.length;
      if (downloaded > MAX_INSTALLER_BYTES) throw new Error("安装包超过 2 GiB 限制");
      hash.update(value);
      await writeChunk(output, value);
      const total = update.size || contentLength;
      const percent = total ? Math.min(99, Math.floor((downloaded / total) * 100)) : -1;
      if (percent !== lastPercent) {
        lastPercent = percent;
        mainWindow?.webContents.send("update:status", { status: "downloading", percent: percent >= 0 ? percent : undefined });
      }
    }
    await output.sync();
    await output.close();
    output = null;

    if (!downloaded) throw new Error("下载到的安装包为空");
    if (contentLength && downloaded !== contentLength) throw new Error("安装包下载不完整");
    if (update.size && downloaded !== update.size) throw new Error("安装包大小与清单不一致");
    const digest = hash.digest("hex");
    if (update.sha256 && digest !== update.sha256) throw new Error("安装包 SHA-256 与清单不一致");

    if (process.platform === "win32") {
      const handle = await fsp.open(partPath, "r");
      try {
        const header = Buffer.alloc(2);
        const { bytesRead } = await handle.read(header, 0, 2, 0);
        if (bytesRead !== 2 || header[0] !== 0x4d || header[1] !== 0x5a) throw new Error("下载内容不是有效的 Windows 安装包");
      } finally {
        await handle.close();
      }
    }

    await fsp.rm(destinationPath, { force: true });
    await fsp.rename(partPath, destinationPath);
  } catch (error) {
    await output?.close().catch(() => undefined);
    await reader.cancel().catch(() => undefined);
    await fsp.rm(partPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;
  if (!isPackaged()) {
    console.log(`${TAG} Dev mode: auto-update skipped`);
    return;
  }
  setTimeout(() => void checkForUpdates(), 3_000);
}

export async function checkForUpdates() {
  if (!isPackaged()) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "开发模式不执行更新检查，请使用打包后的版本验证更新流程" });
    return;
  }
  if (downloadInProgress) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装包正在下载，暂不能检查更新" });
    return;
  }
  if (installerLaunchState.installInProgress) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装程序正在启动，请勿重复操作" });
    return;
  }
  pendingUpdate = null;
  installerLaunchState.preparedInstallerPath = null;
  mainWindow?.webContents.send("update:status", { status: "checking" });
  try {
    const { manifest, manifestUrl } = await fetchManifest();
    const latestVersion = String(manifest.latestVersion || manifest.version || "").trim();
    if (!latestVersion) throw new Error("更新清单缺少 latestVersion 字段");
    if (compareVersions(getCurrentVersion(), latestVersion) >= 0) {
      mainWindow?.webContents.send("update:status", { status: "not-available" });
      return;
    }
    pendingUpdate = parsePendingUpdate(manifest, manifestUrl, latestVersion);
    mainWindow?.webContents.send("update:status", { status: "available", version: latestVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} Update check failed: ${message}`);
    mainWindow?.webContents.send("update:status", { status: "error", message });
  }
}

export async function downloadUpdate() {
  if (!isPackaged()) return;
  if (installerLaunchState.installInProgress) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装程序正在启动，请勿重复操作" });
    return;
  }
  if (downloadInProgress) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装包正在下载" });
    return;
  }
  const update = pendingUpdate ? createPendingUpdateSnapshot(pendingUpdate) : null;
  if (!update) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "未找到可用的下载地址，请先检查更新" });
    return;
  }

  downloadInProgress = true;
  try {
    const destinationPath = path.join(ensureUpdateDir(), installerFileName(update.downloadUrl));
    mainWindow?.webContents.send("update:status", { status: "downloading", percent: 0 });
    await writeResponseToFile(update, destinationPath);
    installerLaunchState.preparedInstallerPath = destinationPath;
    mainWindow?.webContents.send("update:status", { status: "downloaded", percent: 100, version: update.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} Download failed: ${message}`);
    installerLaunchState.preparedInstallerPath = null;
    mainWindow?.webContents.send("update:status", { status: "error", message });
  } finally {
    downloadInProgress = false;
  }
}

export function installUpdate() {
  if (installerLaunchState.installInProgress) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装程序正在启动，请勿重复操作" });
    return;
  }

  const candidatePath = installerLaunchState.preparedInstallerPath;
  if (!candidatePath || !fs.existsSync(candidatePath)) {
    installerLaunchState.preparedInstallerPath = null;
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装包不存在，请重新下载" });
    return;
  }

  // JavaScript runs this claim synchronously, so a second IPC call cannot
  // observe the installer as available before the first spawn event arrives.
  const installerPath = claimInstallerLaunch(installerLaunchState);
  if (!installerPath) {
    mainWindow?.webContents.send("update:status", { status: "error", message: "更新安装程序正在启动，请勿重复操作" });
    return;
  }

  let child;
  try {
    if (process.platform === "darwin") {
      child = spawn("open", [installerPath], { detached: true, stdio: "ignore" });
    } else {
      if (process.platform === "linux") fs.chmodSync(installerPath, 0o755);
      child = spawn(installerPath, [], { detached: true, stdio: "ignore" });
    }
  } catch (error) {
    restoreInstallerLaunch(installerLaunchState, installerPath);
    const message = error instanceof Error ? error.message : String(error);
    mainWindow?.webContents.send("update:status", { status: "error", message: `无法启动安装包：${message}` });
    return;
  }

  let launchSettled = false;
  child.once("error", (error) => {
    if (launchSettled) return;
    launchSettled = true;
    restoreInstallerLaunch(installerLaunchState, installerPath);
    mainWindow?.webContents.send("update:status", { status: "error", message: `无法启动安装包：${error.message}` });
  });
  child.once("spawn", () => {
    if (launchSettled) return;
    launchSettled = true;
    child.unref();
    setTimeout(() => app.quit(), 500);
  });
}
