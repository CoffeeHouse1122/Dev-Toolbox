import { spawn } from "node:child_process";
import type { SharedDiskConfig, SharedDiskStatus } from "../../../shared/types";

function parseHostFromUrl(url: string) {
  if (!url.trim()) return "";
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

function buildShareRoot(config: Pick<SharedDiskConfig, "url" | "basePath">) {
  const host = parseHostFromUrl(config.url);
  const [shareName] = splitSegments(config.basePath);
  if (!host || !shareName) return "";
  return `\\\\${host}\\${shareName}`;
}

function runNetUse(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("net", ["use"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

export async function getSharedDiskStatus(config: SharedDiskConfig): Promise<SharedDiskStatus> {
  const shareRoot = buildShareRoot(config);
  if (!shareRoot) {
    return { connected: false, shareRoot: "", message: "未配置共享路径" };
  }
  const output = await runNetUse();
  const lines = output.split(/\r?\n/);
  const target = shareRoot.toLowerCase();
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes(target)) {
      // Status word is typically "OK", "已连接", "Disconnected", "Unavailable" etc.
      const isOk = /\bok\b|已连接|connected/i.test(line) && !/disconnected|unavailable|断开|无法用/i.test(line);
      return {
        connected: isOk,
        shareRoot,
        message: isOk ? "已连接" : "已记录但未连接（可能需要重新登录）"
      };
    }
  }
  return { connected: false, shareRoot, message: "未连接" };
}
