import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const DEFAULT_MAX_COMPONENT_LENGTH = 180;

function truncateComponent(value: string, maxLength: number) {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maxLength) break;
    result += character;
  }
  return result;
}

/**
 * Sanitize one file-system component while preserving Unicode. The result is
 * NFC-normalized and safe on Windows as well as macOS/Linux.
 */
export function sanitizeFileComponent(value: string, fallback = "untitled", maxLength = DEFAULT_MAX_COMPONENT_LENGTH) {
  let result = value
    .normalize("NFC")
    .replace(INVALID_FILE_NAME_CHARACTERS, "-")
    .replace(/[. ]+$/g, "")
    .trim();

  result = truncateComponent(result, Math.max(1, maxLength)).replace(/[. ]+$/g, "");
  if (!result || result === "." || result === "..") result = fallback;
  if (WINDOWS_RESERVED_NAME.test(result)) result = `_${result}`;
  return result;
}

export function sanitizeFileName(fileName: string, fallback = "untitled") {
  const original = path.basename(fileName).normalize("NFC").replace(/[. ]+$/g, "");
  const extension = path.extname(original);
  const rawBase = path.basename(original, extension);
  const safeExtension = extension
    ? `.${sanitizeFileComponent(extension.slice(1), "file", 32)}`
    : "";
  const availableBaseLength = Math.max(1, 240 - safeExtension.length);
  return `${sanitizeFileComponent(rawBase, fallback, availableBaseLength)}${safeExtension}`;
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function safeBaseName(filePath: string) {
  return sanitizeFileComponent(path.basename(filePath, path.extname(filePath)));
}

export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  const tempPath = temporaryOutputPath(filePath);
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(tempPath, "wx");
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await replaceWithTemporaryFile(tempPath, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await removeTemporaryFile(tempPath);
  }
}

export function pathKey(filePath: string) {
  // Treat case-only and Unicode normalization differences as collisions. This
  // is deliberately conservative so a plan is portable to Windows/macOS.
  return path.resolve(filePath).normalize("NFC").toLocaleLowerCase("en-US");
}

export function isSamePath(left: string, right: string) {
  return pathKey(left) === pathKey(right);
}

export function resolveSafeChildPath(dir: string, fileName: string) {
  if (!fileName || path.isAbsolute(fileName) || path.basename(fileName) !== fileName) {
    throw new Error("File name must be a single relative file name.");
  }
  const root = path.resolve(dir);
  const output = path.resolve(root, sanitizeFileName(fileName));
  const relative = path.relative(root, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output file must stay inside the selected directory.");
  }
  return output;
}

export async function uniqueOutputPath(dir: string, fileName: string) {
  const safeName = sanitizeFileName(fileName);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension);
  let candidate = resolveSafeChildPath(dir, safeName);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${baseName}-${suffix}${extension}`);
      suffix += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
}

export function temporaryOutputPath(finalPath: string) {
  const extension = path.extname(finalPath);
  const baseName = sanitizeFileComponent(path.basename(finalPath, extension), "output", 120);
  return path.join(path.dirname(finalPath), `.${baseName}.part-${randomUUID()}${extension}`);
}

/** Commit a completed temporary file without ever replacing an existing file. */
export async function commitTemporaryFile(tempPath: string, finalPath: string) {
  await ensureDir(path.dirname(finalPath));
  let committed = false;
  try {
    await fs.link(tempPath, finalPath);
    committed = true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw error;
    // Some network/removable file systems do not support hard links. EXCL still
    // guarantees that an existing destination can never be overwritten.
    await fs.copyFile(tempPath, finalPath, fsConstants.COPYFILE_EXCL);
    committed = true;
  }
  if (committed) await fs.unlink(tempPath).catch(() => undefined);
  return finalPath;
}

/** Replace a fixed-name generated artifact only after its temporary file is complete. */
export async function replaceWithTemporaryFile(tempPath: string, finalPath: string) {
  await ensureDir(path.dirname(finalPath));
  try {
    await fs.rename(tempPath, finalPath);
    return finalPath;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM") throw error;
  }

  // Windows/network file systems may not replace an existing destination via
  // rename. Move the old complete artifact aside and restore it if commit fails.
  const backupPath = temporaryOutputPath(finalPath);
  await fs.rename(finalPath, backupPath);
  try {
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    await fs.rename(backupPath, finalPath).catch(() => undefined);
    throw error;
  }
  await fs.rm(backupPath, { force: true }).catch(() => undefined);
  return finalPath;
}

export async function removeTemporaryFile(tempPath: string) {
  await fs.rm(tempPath, { force: true }).catch(() => undefined);
}

export async function writeFileExclusive(dir: string, fileName: string, data: string | NodeJS.ArrayBufferView) {
  await ensureDir(dir);
  let candidate = await uniqueOutputPath(dir, fileName);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fs.writeFile(candidate, data, { flag: "wx" });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      candidate = await uniqueOutputPath(dir, path.basename(candidate));
    }
  }
  throw new Error("Unable to reserve a unique output file name.");
}

export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const count = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));

  await Promise.all(
    Array.from({ length: count }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}
