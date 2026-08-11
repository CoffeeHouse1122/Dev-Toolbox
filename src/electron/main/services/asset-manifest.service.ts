import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AssetManifestOptions, ConversionResult } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, mapWithConcurrency, pathKey, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

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

async function walkFiles(dir: string, excluded: Set<string>): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (excluded.has(pathKey(fullPath))) continue;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath, excluded)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function sha256(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
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
    const base = safeBaseName(options.baseName || "asset-manifest") || "asset-manifest";
    const output = path.join(options.outputDir, `${base}.json`);
    const excluded = new Set([pathKey(output), pathKey(`${output}.bak`)]);
    const sourceFiles = (await walkFiles(options.sourceDir, excluded)).sort((left, right) =>
      path.relative(options.sourceDir, left).normalize("NFC").localeCompare(path.relative(options.sourceDir, right).normalize("NFC"), "en")
    );
    const assets = await mapWithConcurrency(
      sourceFiles,
      4,
      async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = path.relative(options.sourceDir, filePath).normalize("NFC").replace(/\\/g, "/");
        return {
          path: relativePath,
          size: stat.size,
          ext: path.extname(filePath).toLowerCase(),
          mime: mimeByExt[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
          modifiedAt: stat.mtime.toISOString(),
          hash: options.includeHash ? await sha256(filePath) : undefined
        };
      }
    );
    const totalSize = assets.reduce((sum, item) => sum + item.size, 0);

    await writeTextFile(
      output,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sourceDir: ".",
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
