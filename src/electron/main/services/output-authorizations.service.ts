import { app, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-file";
import { identifyOutputDirectory, type OutputDirectoryIdentity } from "../utils/output-directory-identity";
import { setOutputDirectoryGrants } from "../utils/ipc-security";
import type { OutputAuthorizationsState } from "../../../shared/types";

const absolutePath = z.string().min(1).max(32_768).refine(value => path.isAbsolute(value) && !value.includes("\0"));
const storeSchema = z.object({
  purpose: z.literal("dev-toolbox-output-authorizations"), version: z.literal(1),
  directories: z.array(z.object({ selectedPath: absolutePath, canonicalPath: absolutePath,
    device: z.string().regex(/^\d+$/), inode: z.string().regex(/^[1-9]\d*$/), birthTime: z.string().regex(/^-?\d+$/)
  }).strict()).max(128)
}).strict();

type SecureStorage = Pick<typeof safeStorage, "isEncryptionAvailable" | "encryptString" | "decryptString">;
const maxStoreBytes = 1024 * 1024;

export function createOutputAuthorizations(
  storePath: string,
  secure: SecureStorage,
  apply: (grants: OutputDirectoryIdentity[]) => void
) {
  let remembered: OutputDirectoryIdentity[] = [];
  let sessionOnly: OutputDirectoryIdentity[] = [];
  let warning = "";
  let queue = Promise.resolve();
  const publish = () => apply([...remembered, ...sessionOnly]);
  const state = (): OutputAuthorizationsState => ({ rememberedCount: remembered.length, sessionCount: sessionOnly.length, warning });
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };
  const write = async (directories: OutputDirectoryIdentity[]) => {
    if (!secure.isEncryptionAvailable()) throw new Error("Secure storage unavailable.");
    const encrypted = secure.encryptString(JSON.stringify({ purpose: "dev-toolbox-output-authorizations", version: 1, directories }));
    if (encrypted.length > maxStoreBytes) throw new Error("Too many output directories.");
    // Never restore a backup: it could resurrect a revoked grant.
    await writeFileAtomic(storePath, encrypted, { backup: false });
  };
  return {
    initialize: () => serial(async () => {
      remembered = []; sessionOnly = []; warning = ""; publish();
      try {
        const stat = await fs.stat(storePath);
        if (stat.size > maxStoreBytes || !secure.isEncryptionAvailable()) throw new Error("Unavailable grant store.");
        const encrypted = await fs.readFile(storePath);
        if (encrypted.length > maxStoreBytes) throw new Error("Oversized grant store.");
        remembered = storeSchema.parse(JSON.parse(secure.decryptString(encrypted))).directories;
        // Directory identity is checked lazily at use, including after each restart.
        publish();
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") warning = "已记住的目录授权无法验证，请重新选择目录；未恢复任何旧授权。";
      }
      return state();
    }),
    // Not exposed over IPC: the native chooser is the only caller that adds grants.
    rememberSelection: (selectedPath: string) => serial(async () => {
      const identity = identifyOutputDirectory(selectedPath);
      const next = remembered.filter(item => item.canonicalPath !== identity.canonicalPath);
      sessionOnly = sessionOnly.filter(item => item.canonicalPath !== identity.canonicalPath);
      try {
        if (identity.inode === "0") throw new Error("Stable directory identity is unavailable.");
        if (next.length >= 128) throw new Error("Grant limit reached.");
        next.push(identity);
        await write(next);
        remembered = next; warning = "";
      } catch {
        sessionOnly.push(identity);
        warning = "目录仅在本次运行中授权：无法安全保存授权记录，下次启动需重新确认。";
      }
      publish();
      return state();
    }),
    clear: () => serial(async () => {
      // Delete only this app-owned ledger. Failure must not report successful revocation.
      await fs.rm(storePath, { force: true });
      remembered = []; sessionOnly = []; warning = ""; publish();
      return state();
    }),
    getState: () => serial(async () => state())
  };
}

let instance: ReturnType<typeof createOutputAuthorizations>;
export function outputAuthorizations() {
  if (!instance) instance = createOutputAuthorizations(path.join(app.getPath("userData"), "security", "output-directories.enc"), {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
    encryptString: value => safeStorage.encryptString(value),
    decryptString: value => safeStorage.decryptString(value)
  }, setOutputDirectoryGrants);
  return instance;
}
