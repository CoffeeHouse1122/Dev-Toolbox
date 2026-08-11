import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import type {
  ConversionItemResult,
  ConversionResult,
  FaviconOptions,
  ImageCompressOptions,
  ImageCropOptions,
  ImageResizeOptions,
  WatermarkOptions,
  WebpOptions
} from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { embeddedCjkFontFamily, embeddedCjkFontStyle } from "./embedded-font";
import {
  commitTemporaryFile,
  ensureDir,
  removeTemporaryFile,
  safeBaseName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath,
  writeFileExclusive
} from "./file-utils";

const MAX_IMAGE_INPUT_BYTES = 256 * 1024 * 1024;

export async function createFaviconPackage(
  options: FaviconOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("favicon");
  const logs: string[] = [];
  const files: string[] = [];
  let tempDir = "";
  let generationComplete = false;

  await history.startTask({
    id,
    toolType: "favicon",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    tempDir = path.join(options.outputDir, `.favicon-temp-${id}`);
    await ensureDir(tempDir);
    const inputBuffer = await readImageInput(options.inputPath);

    const sizes = [...new Set(options.sizes)].sort((a, b) => a - b);
    const pngFiles: Array<{ size: number; filePath: string }> = [];
    const publishedPng = new Map<number, string>();

    for (const size of sizes) {
      const output = path.join(tempDir, `favicon-${size}.png`);
      await sharp(inputBuffer)
        .resize(size, size, { fit: "cover", position: "center" })
        .png({ compressionLevel: 9 })
        .toFile(output);
      pngFiles.push({ size, filePath: output });

      if (options.includePng || (options.includeManifest && size >= 128)) {
        const publicPng = await writeFileExclusive(options.outputDir, `favicon-${size}x${size}.png`, await fs.readFile(output));
        publishedPng.set(size, path.basename(publicPng));
        files.push(publicPng);
      }
    }

    const icoEntries = pngFiles.filter((item) => item.size <= 256);
    if (!icoEntries.length) {
      const fallbackOutput = path.join(tempDir, "favicon-256.png");
      await sharp(inputBuffer)
        .resize(256, 256, { fit: "cover", position: "center" })
        .png({ compressionLevel: 9 })
        .toFile(fallbackOutput);
      icoEntries.push({ size: 256, filePath: fallbackOutput });
    }
    const icoBuffer = await pngToIco(icoEntries.map((item) => item.filePath));
    const icoPath = await writeFileExclusive(options.outputDir, "favicon.ico", icoBuffer);
    files.unshift(icoPath);
    logs.push(`Created favicon.ico with ${icoEntries.length} embedded size(s), capped at 256px for ICO compatibility.`);

    if (options.includeManifest) {
      const manifestPath = path.join(options.outputDir, "site.webmanifest");
      const icons = sizes
        .filter((size) => publishedPng.has(size))
        .map((size) => ({
          src: `/${publishedPng.get(size)}`,
          sizes: `${size}x${size}`,
          type: "image/png"
        }));

      const manifestOutput = await writeFileExclusive(
        options.outputDir,
        path.basename(manifestPath),
        `${JSON.stringify({ name: "App", short_name: "App", icons, theme_color: "#ffffff", background_color: "#ffffff", display: "standalone" }, null, 2)}\n`
      );
      files.push(manifestOutput);
    }

    try {
      await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      logs.push(`Skipped temp cleanup: ${cleanupMessage}`);
    }
    generationComplete = true;
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    if (!generationComplete) await Promise.all(files.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function convertImages(options: WebpOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("webp");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const inputBuffer = await readImageInput(inputPath);
        const base = safeBaseName(inputPath);
        const extension = options.outputFormat === "jpeg" ? "jpg" : options.outputFormat;
        const output = await uniqueOutputPath(options.outputDir, `${base}.${extension}`);
        tempOutput = temporaryOutputPath(output);

        let pipeline = sharp(inputBuffer).rotate();
        if (options.maxWidth || options.maxHeight) {
          pipeline = pipeline.resize({
            width: options.maxWidth,
            height: options.maxHeight,
            fit: "inside",
            withoutEnlargement: true
          });
        }
        if (options.keepMetadata) pipeline = pipeline.withMetadata();

        if (options.outputFormat === "webp") {
          pipeline = pipeline.webp({ quality: options.quality, lossless: options.lossless });
        } else if (options.outputFormat === "png") {
          pipeline = pipeline.png({ compressionLevel: 9 });
        } else if (options.outputFormat === "jpeg") {
          pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
        } else {
          pipeline = pipeline.avif({ quality: options.quality, lossless: options.lossless });
        }

        await pipeline.toFile(tempOutput);
        await commitTemporaryFile(tempOutput, output);
        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        logs.push(`Converted ${path.basename(inputPath)} to ${path.basename(output)}.`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} image(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

function outputExtension(format: string) {
  return format === "jpeg" ? "jpg" : format;
}

type RasterFormat = "png" | "jpeg" | "webp" | "avif" | "tiff";

const rasterFormats = new Set(["png", "jpg", "jpeg", "webp", "avif", "tif", "tiff"]);

async function readImageInput(inputPath: string) {
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error(`Not a file: ${path.basename(inputPath)}`);
  if (stat.size > MAX_IMAGE_INPUT_BYTES) throw new Error(`${path.basename(inputPath)} exceeds the 256 MiB image safety limit.`);
  return fs.readFile(inputPath);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeRasterFormat(format: string | undefined): RasterFormat | null {
  const clean = (format ?? "").toLowerCase().replace(/^\./, "");
  if (clean === "jpg") return "jpeg";
  if (clean === "tif") return "tiff";
  if (clean === "png" || clean === "jpeg" || clean === "webp" || clean === "avif" || clean === "tiff") return clean;
  return null;
}

function imageExtension(format: RasterFormat) {
  return format === "jpeg" ? "jpg" : format;
}

function isPdf(inputPath: string) {
  return path.extname(inputPath).toLowerCase() === ".pdf";
}

function isRasterImage(inputPath: string) {
  return rasterFormats.has(path.extname(inputPath).toLowerCase().replace(/^\./, ""));
}

function lineMeasure(line: string, fontSize: number) {
  return Array.from(line).reduce((width, char) => width + (/^[\x00-\x7f]$/.test(char) ? fontSize * 0.58 : fontSize), 0);
}

async function patternToDataUri(patternPath: string | undefined, size: number) {
  if (!patternPath) return "";
  const patternBuffer = await readImageInput(patternPath);
  const buffer = await sharp(patternBuffer)
    .resize({ width: Math.round(size), height: Math.round(size), fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function renderWatermarkSvg(width: number, height: number, options: WatermarkOptions, patternDataUri: string, fontStyle: string) {
  const opacity = clampNumber(options.opacity, 1, 100) / 100;
  const fontSize = clampNumber(options.scale, 12, 160);
  const imageSize = patternDataUri ? Math.round(fontSize * 1.72) : 0;
  const lineHeight = Math.round(fontSize * 1.28);
  const lines = options.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasText = lines.length > 0;
  const textWidth = hasText ? Math.max(...lines.map((line) => lineMeasure(line, fontSize))) : 0;
  const textHeight = hasText ? lineHeight * lines.length : 0;
  const gutter = patternDataUri && hasText ? Math.round(fontSize * 0.36) : 0;
  const blockWidth = Math.max(1, imageSize + gutter + textWidth);
  const blockHeight = Math.max(1, imageSize, textHeight);
  const rotation = clampNumber(options.rotation, -90, 90);
  const margin = clampNumber(options.margin, 0, Math.max(width, height));

  function mark(x = 0, y = 0) {
    const image = patternDataUri
      ? `<image href="${patternDataUri}" x="${x}" y="${y + (blockHeight - imageSize) / 2}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet" />`
      : "";
    const textX = x + imageSize + gutter;
    const textY = y + (blockHeight - textHeight) / 2 + fontSize;
    const text = hasText
      ? `<text x="${textX}" y="${textY}" fill="#0d1117" font-family="${embeddedCjkFontFamily}, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="0">${lines
          .map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`)
          .join("")}</text>`
      : "";
    return `${image}${text}`;
  }

  function placedMark(x: number, y: number) {
    const centerX = x + blockWidth / 2;
    const centerY = y + blockHeight / 2;
    return `<g opacity="${opacity}" transform="translate(${centerX} ${centerY}) rotate(${rotation}) translate(${-blockWidth / 2} ${-blockHeight / 2})">${mark()}</g>`;
  }

  let content = "";
  if (options.position === "tile") {
    const cell = Math.max(clampNumber(options.gap, 80, 720), blockWidth + fontSize * 2.2, blockHeight + fontSize * 2.2);
    for (let y = -cell; y < height + cell; y += cell) {
      for (let x = -cell; x < width + cell; x += cell) {
        content += placedMark(x + (cell - blockWidth) / 2, y + (cell - blockHeight) / 2);
      }
    }
  } else {
    const positionMap = {
      center: [(width - blockWidth) / 2, (height - blockHeight) / 2],
      "top-left": [margin, margin],
      "top-right": [width - blockWidth - margin, margin],
      "bottom-left": [margin, height - blockHeight - margin],
      "bottom-right": [width - blockWidth - margin, height - blockHeight - margin]
    } satisfies Record<Exclude<WatermarkOptions["position"], "tile">, [number, number]>;
    const [x, y] = positionMap[options.position];
    content = placedMark(clampNumber(x, 0, Math.max(0, width - blockWidth)), clampNumber(y, 0, Math.max(0, height - blockHeight)));
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fontStyle}${content}</svg>`);
}

async function watermarkOverlay(width: number, height: number, options: WatermarkOptions, patternDataUri: string) {
  const fontStyle = await embeddedCjkFontStyle(options.text);
  const svg = renderWatermarkSvg(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), options, patternDataUri, fontStyle);
  return sharp(svg).png().toBuffer();
}

function formatImageOutput(pipeline: sharp.Sharp, format: RasterFormat, quality: number) {
  if (format === "png") return pipeline.png({ compressionLevel: 9 });
  if (format === "jpeg") return pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
  if (format === "webp") return pipeline.webp({ quality, effort: 6, smartSubsample: true });
  if (format === "avif") return pipeline.avif({ quality, effort: 6 });
  return pipeline.tiff({ quality, compression: "lzw" });
}

async function writeByInputFormat(inputPath: string, inputBuffer: Buffer, outputPath: string, quality: number, keepMetadata = false) {
  const metadata = await sharp(inputBuffer).metadata();
  const format = normalizeRasterFormat(path.extname(inputPath)) ?? normalizeRasterFormat(metadata.format) ?? "webp";
  let pipeline = sharp(inputBuffer).rotate();

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
  } else if (format === "jpeg") {
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
    pipeline = pipeline.tiff({ quality, compression: "lzw" });
  }

  await pipeline.toFile(outputPath);
}

export async function compressImages(options: ImageCompressOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("image-compress");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const inputBuffer = await readImageInput(inputPath);
        const metadata = await sharp(inputBuffer).metadata();
        const detectedFormat = normalizeRasterFormat(path.extname(inputPath)) ?? normalizeRasterFormat(metadata.format) ?? "webp";
        const ext = imageExtension(detectedFormat);
        const fileName = options.keepOriginalName
          ? `${safeBaseName(inputPath)}.${ext}`
          : `${safeBaseName(inputPath)}-compressed.${ext}`;
        const output = await uniqueOutputPath(options.outputDir, fileName);
        tempOutput = temporaryOutputPath(output);
        await writeByInputFormat(inputPath, inputBuffer, tempOutput, options.quality, options.keepMetadata);
        await commitTemporaryFile(tempOutput, output);
        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        const [src, dst] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
        const ratio = src.size > 0 ? Math.round(((src.size - dst.size) / src.size) * 100) : 0;
        logs.push(`${path.basename(inputPath)}: ${(src.size / 1024).toFixed(1)} KB -> ${(dst.size / 1024).toFixed(1)} KB (-${ratio}%)`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} image(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
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
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const inputBuffer = await readImageInput(inputPath);
        const metadata = await sharp(inputBuffer).metadata();
        const detectedFormat = normalizeRasterFormat(path.extname(inputPath)) ?? normalizeRasterFormat(metadata.format) ?? "png";
        const ext = imageExtension(detectedFormat);
        const baseWidth = metadata.width ?? options.width;
        const baseHeight = metadata.height ?? options.height;
        const width = options.mode === "scale" && baseWidth ? Math.max(1, Math.round(baseWidth * ((options.scale ?? 100) / 100))) : options.width;
        const height = options.mode === "scale" && baseHeight ? Math.max(1, Math.round(baseHeight * ((options.scale ?? 100) / 100))) : options.height;
        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-resized.${ext}`);
        tempOutput = temporaryOutputPath(output);

        await sharp(inputBuffer)
          .rotate()
          .resize({ width, height, fit: "inside", withoutEnlargement: false })
          .toFile(tempOutput);
        await commitTemporaryFile(tempOutput, output);

        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        logs.push(`Resized ${path.basename(inputPath)}.`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} image(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
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
    const inputBuffer = await readImageInput(options.inputPath);
    const metadata = await sharp(inputBuffer).metadata();
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
    const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(options.inputPath)}-cropped.${ext}`);
    const tempOutput = temporaryOutputPath(output);

    let pipeline = sharp(inputBuffer).extract({ left, top, width, height });
    if (options.outputFormat === "webp") {
      pipeline = pipeline.webp({ quality: options.quality });
    } else if (options.outputFormat === "png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (options.outputFormat === "jpeg") {
      pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
    } else {
      pipeline = pipeline.avif({ quality: options.quality });
    }

    try {
      await pipeline.toFile(tempOutput);
      await commitTemporaryFile(tempOutput, output);
    } catch (error) {
      await removeTemporaryFile(tempOutput);
      throw error;
    }
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

export async function applyWatermark(options: WatermarkOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("watermark");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

  await history.startTask({
    id,
    toolType: "watermark",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    if (!options.text.trim() && !options.patternPath) {
      throw new Error("请填写水印文案，或选择一个图案文件。");
    }

    await ensureDir(options.outputDir);
    const patternDataUri = await patternToDataUri(options.patternPath, clampNumber(options.scale, 12, 160) * 2);

    for (const inputPath of options.inputPaths) {
      let tempOutput = "";
      try {
        if (isPdf(inputPath)) {
          const pdf = await PDFDocument.load(await fs.readFile(inputPath));
          const pages = pdf.getPages();

          for (const page of pages) {
            const { width, height } = page.getSize();
            const overlay = await watermarkOverlay(width, height, options, patternDataUri);
            const watermarkImage = await pdf.embedPng(overlay);
            page.drawImage(watermarkImage, { x: 0, y: 0, width, height });
          }

          const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-watermarked.pdf`);
          tempOutput = temporaryOutputPath(output);
          await fs.writeFile(tempOutput, await pdf.save(), { flag: "wx" });
          await commitTemporaryFile(tempOutput, output);
          files.push(output);
          items.push({ inputPath, outputPath: output, status: "success" });
          logs.push(`Watermarked ${path.basename(inputPath)} (${pages.length} page${pages.length > 1 ? "s" : ""}).`);
          continue;
        }

        if (!isRasterImage(inputPath)) throw new Error(`Unsupported file format: ${path.extname(inputPath) || "unknown"}`);

        const inputBuffer = await readImageInput(inputPath);
        const sourceBuffer = await sharp(inputBuffer).rotate().toBuffer();
        const metadata = await sharp(sourceBuffer).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        if (!width || !height) throw new Error("Unable to read image dimensions.");

        const detectedFormat = normalizeRasterFormat(path.extname(inputPath)) ?? normalizeRasterFormat(metadata.format);
        const targetFormat = options.outputFormat === "same" ? detectedFormat : normalizeRasterFormat(options.outputFormat);
        if (!targetFormat) throw new Error("Unable to determine output format.");

        const overlay = await watermarkOverlay(width, height, options, patternDataUri);
        let pipeline = sharp(sourceBuffer).composite([{ input: overlay, left: 0, top: 0 }]);
        if (options.keepMetadata) pipeline = pipeline.withMetadata();

        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-watermarked.${imageExtension(targetFormat)}`);
        tempOutput = temporaryOutputPath(output);
        await formatImageOutput(pipeline, targetFormat, options.quality).toFile(tempOutput);
        await commitTemporaryFile(tempOutput, output);
        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        logs.push(`Watermarked ${path.basename(inputPath)} (${width}x${height}).`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
