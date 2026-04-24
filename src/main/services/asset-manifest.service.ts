import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AssetManifestOptions, ConversionResult } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

const mimeByExt: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function sha256(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function generateAssetManifest(
  options: AssetManifestOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("asset-manifest");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "asset-manifest",
    sourcePath: options.sourceDir,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const sourceFiles = await walkFiles(options.sourceDir);
    const assets = await Promise.all(
      sourceFiles.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = path.relative(options.sourceDir, filePath).replace(/\\/g, "/");
        return {
          path: relativePath,
          size: stat.size,
          ext: path.extname(filePath).toLowerCase(),
          mime: mimeByExt[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
          modifiedAt: stat.mtime.toISOString(),
          hash: options.includeHash ? await sha256(filePath) : undefined
        };
      })
    );
    const totalSize = assets.reduce((sum, item) => sum + item.size, 0);
    const base = safeBaseName(options.baseName || "asset-manifest") || "asset-manifest";
    const output = path.join(options.outputDir, `${base}.json`);

    await writeTextFile(
      output,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sourceDir: options.sourceDir,
          count: assets.length,
          totalSize,
          assets
        },
        null,
        2
      )}\n`
    );

    files.push(output);
    logs.push(`Indexed ${assets.length} file(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
