import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function safeBaseName(filePath: string) {
  return path.basename(filePath, path.extname(filePath)).replace(/[^\w.-]+/g, "-");
}

export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function uniqueOutputPath(dir: string, fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(dir, fileName);
  let suffix = 2;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${baseName}-${suffix}${extension}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

