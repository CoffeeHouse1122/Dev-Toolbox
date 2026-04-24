import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import type {
  ConversionResult,
  FaviconOptions,
  ImageCompressOptions,
  ImageCropOptions,
  ImageResizeOptions,
  WebpOptions
} from "../../shared/types";
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

function outputExtension(format: string) {
  return format === "jpeg" ? "jpg" : format;
}

async function writeByInputFormat(inputPath: string, outputPath: string, quality: number, keepMetadata = false) {
  const metadata = await sharp(inputPath).metadata();
  const format = metadata.format ?? path.extname(inputPath).slice(1).toLowerCase();
  let pipeline = sharp(inputPath, { limitInputPixels: false }).rotate();

  if (keepMetadata) {
    pipeline = pipeline.withMetadata();
  }

  if (format === "png") {
    // TinyPNG-style: palette quantisation via libimagequant + max compression.
    // Sharp maps `quality` to libimagequant's target quality and switches to
    // 8-bit palette PNG, which typically reduces 24/32-bit PNGs by 50–80%.
    pipeline = pipeline.png({
      compressionLevel: 9,
      palette: true,
      quality,
      effort: 10,
      // Allow more colors for high quality, fewer for low quality.
      colors: Math.max(8, Math.min(256, Math.round((quality / 100) * 256))),
      dither: 1
    });
  } else if (format === "jpg" || format === "jpeg") {
    pipeline = pipeline.jpeg({
      quality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: quality >= 90 ? "4:4:4" : "4:2:0",
      trellisQuantisation: true,
      overshootDeringing: true,
      optimiseScans: true
    });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality, effort: 6, smartSubsample: true });
  } else if (format === "avif") {
    pipeline = pipeline.avif({ quality, effort: 6 });
  } else {
    pipeline = pipeline.webp({ quality, effort: 6 });
  }

  await pipeline.toFile(outputPath);
}

export async function compressImages(options: ImageCompressOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("image-compress");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "image-compress",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const metadata = await sharp(inputPath).metadata();
      const detectedFormat = metadata.format ?? (path.extname(inputPath).slice(1).toLowerCase() || "webp");
      const ext = outputExtension(detectedFormat);
      const output = path.join(options.outputDir, `${safeBaseName(inputPath)}-compressed.${ext}`);
      await writeByInputFormat(inputPath, output, options.quality, options.keepMetadata);
      files.push(output);
      try {
        const [src, dst] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
        const ratio = src.size > 0 ? Math.round(((src.size - dst.size) / src.size) * 100) : 0;
        logs.push(
          `${path.basename(inputPath)}: ${(src.size / 1024).toFixed(1)} KB → ${(dst.size / 1024).toFixed(1)} KB (-${ratio}%)`
        );
      } catch {
        logs.push(`Compressed ${path.basename(inputPath)}.`);
      }
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function resizeImages(options: ImageResizeOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("image-resize");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "image-resize",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const metadata = await sharp(inputPath).metadata();
      const detectedFormat = metadata.format ?? (path.extname(inputPath).slice(1).toLowerCase() || "png");
      const ext = outputExtension(detectedFormat);
      const baseWidth = metadata.width ?? options.width;
      const baseHeight = metadata.height ?? options.height;
      const width = options.mode === "scale" && baseWidth ? Math.max(1, Math.round(baseWidth * ((options.scale ?? 100) / 100))) : options.width;
      const height = options.mode === "scale" && baseHeight ? Math.max(1, Math.round(baseHeight * ((options.scale ?? 100) / 100))) : options.height;
      const output = path.join(options.outputDir, `${safeBaseName(inputPath)}-resized.${ext}`);

      await sharp(inputPath, { limitInputPixels: false })
        .rotate()
        .resize({ width, height, fit: "inside", withoutEnlargement: false })
        .toFile(output);

      files.push(output);
      logs.push(`Resized ${path.basename(inputPath)}.`);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function cropImage(options: ImageCropOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("image-crop");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "image-crop",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const metadata = await sharp(options.inputPath, { limitInputPixels: false }).metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;
    if (!imageWidth || !imageHeight) {
      throw new Error("无法读取图片尺寸。");
    }

    const left = Math.max(0, Math.min(imageWidth - 1, Math.round(options.x)));
    const top = Math.max(0, Math.min(imageHeight - 1, Math.round(options.y)));
    const width = Math.max(1, Math.min(imageWidth - left, Math.round(options.width)));
    const height = Math.max(1, Math.min(imageHeight - top, Math.round(options.height)));
    const ext = outputExtension(options.outputFormat);
    const output = path.join(options.outputDir, `${safeBaseName(options.inputPath)}-cropped.${ext}`);

    let pipeline = sharp(options.inputPath, { limitInputPixels: false }).extract({ left, top, width, height });
    if (options.outputFormat === "webp") {
      pipeline = pipeline.webp({ quality: options.quality });
    } else if (options.outputFormat === "png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (options.outputFormat === "jpeg") {
      pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
    } else {
      pipeline = pipeline.avif({ quality: options.quality });
    }

    await pipeline.toFile(output);
    files.push(output);
    logs.push(`Cropped ${path.basename(options.inputPath)} to ${width}x${height}.`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
