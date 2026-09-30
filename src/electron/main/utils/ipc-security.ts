import { parseSharedPath } from "../../../shared/shared-disk";
import { ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { domainToASCII, fileURLToPath } from "node:url";
import { z } from "zod";
import { getRendererIndexPath } from "./app-paths";
import { matchesOutputDirectory, type OutputDirectoryIdentity } from "./output-directory-identity";
import { isUpdateBlockingTask, updateTaskGate } from "../services/update-task-gate";

type IpcResult<T> = T | Promise<T>;

function normalizeFilePath(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

const exactPathGrants = new Set<string>();
const directoryPathGrants = new Set<string>();
let outputDirectoryGrants: OutputDirectoryIdentity[] = [];
let userDataRoot = "";

function requireAbsolutePath(rawPath: string) {
  if (typeof rawPath !== "string" || rawPath.length < 1 || rawPath.length > 32_768 || rawPath.includes("\0")) {
    throw new Error("Invalid local path.");
  }
  if (!path.isAbsolute(rawPath)) throw new Error("Local paths must be absolute.");
  return path.resolve(rawPath);
}

function canonicalizePath(rawPath: string) {
  const resolved = requireAbsolutePath(rawPath);
  let current = resolved;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const existing = fs.realpathSync.native(current);
      return normalizeFilePath(path.join(existing, ...missingSegments));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw new Error("Unable to verify the local path.");
      const parent = path.dirname(current);
      if (parent === current) return normalizeFilePath(resolved);
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isWithinPath(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function initializePathAuthorization(userDataPath: string) {
  userDataRoot = canonicalizePath(userDataPath);
  exactPathGrants.clear();
  directoryPathGrants.clear();
  outputDirectoryGrants = [];
}

// Only the main-process chooser/verified encrypted store may populate these grants.
export function setOutputDirectoryGrants(grants: OutputDirectoryIdentity[]) {
  outputDirectoryGrants = grants.map(grant => ({ ...grant }));
}

export function authorizeUserSelectedPaths(rawPaths: string[], recursive = false) {
  if (!Array.isArray(rawPaths) || rawPaths.length > 10_000) throw new Error("Invalid number of path grants.");
  const canonicalPaths = rawPaths.map(canonicalizePath);
  for (const canonicalPath of canonicalPaths) {
    (recursive ? directoryPathGrants : exactPathGrants).add(canonicalPath);
  }
}

export function authorizeDroppedPaths(rawPaths: string[]) {
  if (!Array.isArray(rawPaths) || rawPaths.length > 2_048) throw new Error("Invalid number of dropped paths.");
  const grants = rawPaths.map((rawPath) => {
    const resolved = requireAbsolutePath(rawPath);
    const stat = fs.statSync(resolved);
    return { canonicalPath: canonicalizePath(resolved), recursive: stat.isDirectory() };
  });
  for (const grant of grants) {
    (grant.recursive ? directoryPathGrants : exactPathGrants).add(grant.canonicalPath);
  }
}

export function authorizeExistingPath(rawPath: string) {
  const resolved = requireAbsolutePath(rawPath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("Only existing files may be authorized from history.");
  const canonicalPath = canonicalizePath(resolved);
  exactPathGrants.add(canonicalPath);
}

type SharedDiskBoundaryConfig = { sharePath: string };

export function getSharedDiskShareRoot(config: SharedDiskBoundaryConfig) {
  return parseSharedPath(config.sharePath).shareRoot;
}

export function getSharedDiskBaseRoot(config: SharedDiskBoundaryConfig) {
  return parseSharedPath(config.sharePath).baseRoot;
}

export function assertSharedDiskTarget(config: SharedDiskBoundaryConfig, rawTargetPath: string) {
  if (typeof rawTargetPath !== "string" || rawTargetPath.length < 1 || rawTargetPath.length > 32_768 || rawTargetPath.includes("\0")) {
    throw new Error("Invalid shared-disk path.");
  }
  const candidate = path.win32.normalize(rawTargetPath);
  if (!candidate.startsWith("\\\\")) throw new Error("Shared-disk paths must use UNC format.");
  const baseRoot = getSharedDiskBaseRoot(config);
  const relative = path.win32.relative(baseRoot.toLowerCase(), candidate.toLowerCase());
  if (relative === ".." || relative.startsWith("..\\") || path.win32.isAbsolute(relative)) {
    throw new Error("Shared-disk path is outside the configured base path.");
  }
}

export function isAuthorizedPath(rawPath: string) {
  try {
    const candidate = canonicalizePath(rawPath);
    // Private authorization metadata is never available through generic file APIs.
    if (userDataRoot && (isWithinPath(candidate, path.join(userDataRoot, "security")) ||
      isWithinPath(normalizeFilePath(rawPath), path.join(userDataRoot, "security")))) return false;
    if (userDataRoot && isWithinPath(candidate, userDataRoot)) return true;
    if (exactPathGrants.has(candidate)) return true;
    for (const directory of directoryPathGrants) {
      if (isWithinPath(candidate, directory)) return true;
    }
    for (const grant of outputDirectoryGrants) {
      if (isWithinPath(candidate, grant.canonicalPath) && matchesOutputDirectory(grant)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function assertAuthorizedPath(rawPath: string) {
  if (!isAuthorizedPath(rawPath)) throw new Error("The path was not user-authorized and is outside the application data directory.");
}

function isValidHostname(hostname: string) {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isIP(unwrapped)) return true;
  const ascii = domainToASCII(hostname).replace(/\.$/, "");
  if (!ascii || ascii.length > 253) return false;
  return ascii.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

export function validateExternalUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || rawUrl.length < 1 || rawUrl.length > 8_192) throw new Error("Invalid external URL.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid external URL.");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "http:" || protocol === "https:") {
    if (parsed.username || parsed.password) throw new Error("External URLs must not contain credentials.");
    if (!isValidHostname(parsed.hostname)) throw new Error("External URLs require a valid hostname.");
    return parsed.toString();
  }
  if (protocol === "mailto:") {
    let recipients: string[];
    try {
      const decodedMailUrl = decodeURIComponent(`${parsed.pathname}${parsed.search}`);
      if (/[\r\n\0]/.test(decodedMailUrl)) throw new Error("Mail URL contains control characters.");
      recipients = decodeURIComponent(parsed.pathname).split(",").filter(Boolean);
    } catch {
      throw new Error("Invalid mail URL.");
    }
    if (!recipients.length || recipients.some((recipient) => {
      const at = recipient.lastIndexOf("@");
      return at <= 0 || /[\s<>;]/.test(recipient) || !isValidHostname(recipient.slice(at + 1));
    })) {
      throw new Error("Mail URLs require a recipient with a valid domain.");
    }
    return parsed.toString();
  }
  throw new Error("Only HTTP, HTTPS, and mail URLs may be opened externally.");
}

const windowActionReadySchema = z.object({
  requestId: z.string().regex(/^\d{10,20}-[a-f0-9]{1,32}$/i),
  ok: z.boolean(),
  error: z.string().max(2_000).optional()
}).strict();

const titleBarThemeSchema = z.object({
  accentColor: z.string().regex(/^#[a-f0-9]{6}$/i),
  surfaceColor: z.string().regex(/^#[a-f0-9]{6}$/i),
  textColor: z.string().regex(/^#[a-f0-9]{6}$/i)
}).strict();

export function parseWindowActionReadyPayload(value: unknown) {
  return windowActionReadySchema.safeParse(value);
}

export function parseTitleBarThemePayload(value: unknown) {
  return titleBarThemeSchema.safeParse(value);
}

export function parseBooleanPayload(value: unknown) {
  return z.boolean().parse(value);
}

export function parseUuidPayload(value: unknown) {
  return z.string().uuid().parse(value);
}

export function isAllowedRendererPermission(permission: string) {
  return permission === "clipboard-read" || permission === "clipboard-sanitized-write";
}

export function isTrustedRendererUrl(rawUrl: string) {
  try {
    const actual = new URL(rawUrl);
    const developmentUrl = process.env.VITE_DEV_SERVER_URL;
    if (developmentUrl) {
      const expected = new URL(developmentUrl);
      return actual.protocol === expected.protocol && actual.origin === expected.origin;
    }
    if (actual.protocol !== "file:") return false;
    return normalizeFilePath(fileURLToPath(actual)) === normalizeFilePath(getRendererIndexPath());
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(event: IpcMainEvent | IpcMainInvokeEvent) {
  const senderFrame = event.senderFrame;
  if (senderFrame?.parent) throw new Error("IPC is restricted to the top-level renderer frame.");
  const senderUrl = senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl)) throw new Error("IPC sender is not a trusted renderer.");
}

export function handleTrustedIpc<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => IpcResult<Result>
) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    if (isUpdateBlockingTask(channel)) return updateTaskGate.run(() => listener(event, ...(args as Args)));
    return listener(event, ...(args as Args));
  });
}

export function onTrustedIpc<Args extends unknown[]>(
  channel: string,
  listener: (event: IpcMainEvent, ...args: Args) => void
) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedIpcSender(event);
      listener(event, ...(args as Args));
    } catch (error) {
      console.warn(`[ipc-security] Rejected ${channel}:`, error instanceof Error ? error.message : String(error));
      event.returnValue = false;
    }
  });
}
