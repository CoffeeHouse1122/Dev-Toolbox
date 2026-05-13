/**
 * 自动更新服务 — 基于 release-manifest.json 的轻量方案
 *
 * 原理（参照 client-video-audit）：
 * 1. 从 Nginx 静态服务器拉取 release-manifest.json
 * 2. 比对 latestVersion 与当前版本号
 * 3. 有新版本时下载 installer .exe（支持进度回调）
 * 4. 下载完成后 spawn 安装程序并退出
 *
 * 无需 electron-updater、无需 latest.yml、无需后端服务。
 */
import { app, BrowserWindow, net } from "electron";
import fs from "node:fs";
import path from "node:path";

const TAG = "[auto-updater]";
const FETCH_TIMEOUT_MS = 15000;

let mainWindow: BrowserWindow | null = null;
let preparedInstallerPath: string | null = null;
let pendingDownloadUrl: string = "";

type EnvMap = Record<string, string>;

// ---- 工具函数 ----

function isPackaged(): boolean {
  return !Boolean(process.env.VITE_DEV_SERVER_URL) && !process.defaultApp;
}

function getCurrentVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "..", "package.json"), "utf8"));
    return String(pkg.version || "").trim();
  } catch {
    return app.getVersion();
  }
}

/**
 * 版本号归一化后按数字逐段比较，返回 -1 / 0 / 1
 */
function compareVersions(a: string, b: string): number {
  const toParts = (v: string) =>
    String(v)
      .replace(/^v/i, "")
      .split(/[+-]/)[0]
      .split(".")
      .map((s) => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const partsA = toParts(a);
  const partsB = toParts(b);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const pA = partsA[i] || 0;
    const pB = partsB[i] || 0;
    if (pA > pB) return 1;
    if (pA < pB) return -1;
  }
  return 0;
}

function readEnvFile(filePath: string): EnvMap {
  try {
    if (!fs.existsSync(filePath)) return {};

    const source = fs.readFileSync(filePath, "utf8");
    return source.split(/\r?\n/).reduce<EnvMap>((acc, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return acc;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) return acc;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");

      if (key) acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function getLocalEnvValue(key: string): string {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(app.getAppPath(), ".env"),
    path.resolve(path.dirname(process.execPath), ".env")
  ];

  for (const filePath of candidates) {
    const value = readEnvFile(filePath)[key];
    if (value) return value;
  }

  return "";
}

function getUpdateManifestUrl(): string {
  const rawUrl =
    process.env.AUTOUPDATE_FEED_URL ||
    process.env.DESKTOP_APP_UPDATE_URL ||
    getLocalEnvValue("AUTOUPDATE_FEED_URL") ||
    getLocalEnvValue("DESKTOP_APP_UPDATE_URL") ||
    "";

  return String(rawUrl).trim();
}

function ensureUpdateDir(): string {
  const dir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveInstallerPath(downloadUrl: string): string {
  const dir = ensureUpdateDir();
  try {
    const filename = path.basename(new URL(downloadUrl).pathname) || `dev-toolbox-${Date.now()}.exe`;
    return path.join(dir, filename);
  } catch {
    return path.join(dir, `dev-toolbox-${Date.now()}.exe`);
  }
}

function extractVersionFromUrl(url: string): string {
  try {
    const match = decodeURIComponent(new URL(url).pathname).match(/(\d+\.\d+\.\d+)/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

// ---- HTTP 请求 ----

async function fetchManifest(): Promise<any> {
  const url = getUpdateManifestUrl();
  if (!url) throw new Error("未配置更新清单地址，请设置 AUTOUPDATE_FEED_URL 或 DESKTOP_APP_UPDATE_URL");

  const response = await net.fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`更新清单加载失败 (${response.status})`);
  }
  return response.json();
}

async function downloadInstaller(downloadUrl: string, destPath: string): Promise<void> {
  const response = await net.fetch(downloadUrl, {
    method: "GET",
    headers: { Accept: "application/octet-stream,application/x-msdownload,*/*" }
  });

  if (!response.ok || !response.body) {
    throw new Error(`下载失败 (${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0") || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  let lastPercent = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      downloaded += value.length;
      const percent = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : -1;
      if (percent !== lastPercent) {
        lastPercent = percent;
        mainWindow?.webContents.send("update:status", {
          status: "downloading",
          percent: percent > 0 ? Math.min(percent, 99) : undefined
        });
      }
    }
  }

  // 写入文件
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(destPath, buffer);

  // 校验：至少 2 字节，MZ 头
  if (buffer.length < 2 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    fs.unlinkSync(destPath);
    throw new Error("下载内容不是有效的 Windows 安装包");
  }
}

// ---- 公开 API ----

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;

  if (!isPackaged()) {
    console.log(`${TAG} Dev mode: auto-update skipped`);
    return;
  }

  // 启动 3 秒后静默检查一次
  setTimeout(() => {
    checkForUpdates();
  }, 3000);
}

export async function checkForUpdates(): Promise<void> {
  if (!isPackaged()) {
    mainWindow?.webContents.send("update:status", {
      status: "error",
      message: "开发模式不执行更新检查，请使用打包后的版本验证更新流程"
    });
    return;
  }

  const currentVersion = getCurrentVersion();
  pendingDownloadUrl = "";
  preparedInstallerPath = null;
  mainWindow?.webContents.send("update:status", { status: "checking" });

  try {
    const manifest = await fetchManifest();
    const latestVersion = String(
      manifest.latestVersion || manifest.version || ""
    ).trim();

    if (!latestVersion) {
      throw new Error("更新清单缺少 latestVersion 字段");
    }

    if (compareVersions(currentVersion, latestVersion) < 0) {
      // 从清单解析下载地址
      const downloads = Array.isArray(manifest.downloads) ? manifest.downloads : [];
      const preferredDownload = downloads.find((d: any) => d.primary) || downloads[0] || null;
      let downloadUrl = preferredDownload?.url || manifest.downloadUrl || "";

      if (!downloadUrl) {
        throw new Error("更新清单缺少下载地址") ;
      }

      // 修正版本号：如果 URL 里的版本号与 latestVersion 不一致，尝试替换
      const urlVersion = extractVersionFromUrl(downloadUrl);
      if (urlVersion && urlVersion !== latestVersion) {
        downloadUrl = downloadUrl.replace(urlVersion, latestVersion);
      }

      mainWindow?.webContents.send("update:status", {
        status: "available",
        version: latestVersion
      });

      // 缓存下载地址供后续使用
      pendingDownloadUrl = downloadUrl;
    } else {
      mainWindow?.webContents.send("update:status", { status: "not-available" });
    }
  } catch (err: any) {
    console.error(`${TAG} Update check failed: ${err.message}`);
    pendingDownloadUrl = "";
    mainWindow?.webContents.send("update:status", {
      status: "error",
      message: err.message
    });
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!isPackaged()) return;

  const downloadUrl = pendingDownloadUrl;
  if (!downloadUrl) {
    mainWindow?.webContents.send("update:status", {
      status: "error",
      message: "未找到可用的下载地址，请先检查更新"
    });
    return;
  }

  const destPath = resolveInstallerPath(downloadUrl);

  try {
    mainWindow?.webContents.send("update:status", { status: "downloading", percent: 0 });
    await downloadInstaller(downloadUrl, destPath);
    preparedInstallerPath = destPath;

    mainWindow?.webContents.send("update:status", {
      status: "downloaded",
      percent: 100
    });
  } catch (err: any) {
    console.error(`${TAG} Download failed: ${err.message}`);
    preparedInstallerPath = null;
    mainWindow?.webContents.send("update:status", {
      status: "error",
      message: err.message
    });
  }
}

export function installUpdate(): void {
  if (!preparedInstallerPath || !fs.existsSync(preparedInstallerPath)) {
    mainWindow?.webContents.send("update:status", {
      status: "error",
      message: "更新安装包不存在，请重新下载"
    });
    return;
  }

  const { spawn } = require("child_process");
  const child = spawn(preparedInstallerPath, [], {
    detached: true,
    stdio: "ignore"
  });

  preparedInstallerPath = null;
  child.unref();
  setTimeout(() => app.quit(), 500);
}
