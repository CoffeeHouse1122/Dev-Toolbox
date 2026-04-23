import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import type { ConversionResult, FaviconOptions, WebpOptions } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

export async function createFaviconPackage(
  options: FaviconOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("favicon");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "favicon",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const tempDir = path.join(options.outputDir, `.favicon-temp-${id}`);
    await ensureDir(tempDir);

    const sizes = [...new Set(options.sizes)].sort((a, b) => a - b);
    const pngFiles: string[] = [];

    for (const size of sizes) {
      const output = path.join(tempDir, `favicon-${size}.png`);
      await sharp(options.inputPath)
        .resize(size, size, { fit: "cover", position: "center" })
        .png({ compressionLevel: 9 })
        .toFile(output);
      pngFiles.push(output);

      if (options.includePng) {
        const publicPng = path.join(options.outputDir, `favicon-${size}x${size}.png`);
        await fs.copyFile(output, publicPng);
        files.push(publicPng);
      }
    }

    const icoBuffer = await pngToIco(pngFiles);
    const icoPath = path.join(options.outputDir, "favicon.ico");
    await fs.writeFile(icoPath, icoBuffer);
    files.unshift(icoPath);
    logs.push(`Created favicon.ico with ${sizes.length} embedded sizes.`);

    if (options.includeManifest) {
      const manifestPath = path.join(options.outputDir, "site.webmanifest");
      const icons = sizes
        .filter((size) => size >= 128)
        .map((size) => ({
          src: `/favicon-${size}x${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png"
        }));

      await writeTextFile(
        manifestPath,
        `${JSON.stringify({ name: "App", short_name: "App", icons, theme_color: "#ffffff", background_color: "#ffffff", display: "standalone" }, null, 2)}\n`
      );
      files.push(manifestPath);
    }

    try {
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      logs.push(`Skipped temp cleanup: ${cleanupMessage}`);
    }
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function convertImages(options: WebpOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("webp");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "webp",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const base = safeBaseName(inputPath);
      const extension = options.outputFormat === "jpeg" ? "jpg" : options.outputFormat;
      const output = path.join(options.outputDir, `${base}.${extension}`);

      let pipeline = sharp(inputPath, { limitInputPixels: false }).rotate();
      if (options.maxWidth || options.maxHeight) {
        pipeline = pipeline.resize({
          width: options.maxWidth,
          height: options.maxHeight,
          fit: "inside",
          withoutEnlargement: true
        });
      }
      if (options.keepMetadata) {
        pipeline = pipeline.withMetadata();
      }

      if (options.outputFormat === "webp") {
        pipeline = pipeline.webp({ quality: options.quality, lossless: options.lossless });
      } else if (options.outputFormat === "png") {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (options.outputFormat === "jpeg") {
        pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
      } else {
        pipeline = pipeline.avif({ quality: options.quality, lossless: options.lossless });
      }

      await pipeline.toFile(output);
      files.push(output);
      logs.push(`Converted ${path.basename(inputPath)} to ${path.basename(output)}.`);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
