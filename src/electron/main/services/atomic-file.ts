import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function temporaryPath(targetPath: string, suffix = "tmp") {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.${suffix}`
  );
}

/**
 * Write in the destination directory, flush the temporary file, then rename it
 * into place. The previous complete value is retained as `<file>.bak`.
 */
export async function writeFileAtomic(
  targetPath: string,
  data: string | Uint8Array,
  options: { backup?: boolean } = {}
): Promise<void> {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = temporaryPath(targetPath);
  const backupPath = `${targetPath}.bak`;
  const backupTempPath = temporaryPath(backupPath, "bak");
  let handle: fsp.FileHandle | null = null;

  try {
    handle = await fsp.open(tempPath, "wx");
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;

    if (options.backup !== false) {
      try {
        await fsp.copyFile(targetPath, backupTempPath);
        await fsp.rm(backupPath, { force: true });
        await fsp.rename(backupTempPath, backupPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else {
      await fsp.rm(backupPath, { force: true });
    }

    await fsp.rename(tempPath, targetPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await Promise.all([
      fsp.rm(tempPath, { force: true }).catch(() => undefined),
      fsp.rm(backupTempPath, { force: true }).catch(() => undefined)
    ]);
  }
}

export async function readJsonWithBackup<T>(targetPath: string): Promise<T> {
  let lastError: unknown;
  for (const candidate of [targetPath, `${targetPath}.bak`]) {
    try {
      return JSON.parse(await fsp.readFile(candidate, "utf8")) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function writeFileAtomicSync(targetPath: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = temporaryPath(targetPath);
  const backupPath = `${targetPath}.bak`;
  const backupTempPath = temporaryPath(backupPath, "bak");
  let descriptor: number | null = null;

  try {
    descriptor = fs.openSync(tempPath, "wx");
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;

    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupTempPath);
      fs.rmSync(backupPath, { force: true });
      fs.renameSync(backupTempPath, backupPath);
    }
    fs.renameSync(tempPath, targetPath);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(tempPath, { force: true });
    fs.rmSync(backupTempPath, { force: true });
  }
}
