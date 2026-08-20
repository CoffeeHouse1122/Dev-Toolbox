import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import type { ConversionItemResult, ConversionResult, PwaIconPackageOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { assertSafeSvg } from "./svg.service";
import {
  commitTemporaryFile,
  ensureDir,
  removeTemporaryFile,
  resolveSafeChildPath,
  safeBaseName,
  sanitizeFileComponent,
  temporaryOutputPath,
  uniqueId
} from "./file-utils";

const MAX_BATCH_ITEMS = 100;
const MAX_RASTER_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_SVG_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 100 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MASKABLE_PADDING = 0.2;
const MIN_MASKABLE_PADDING = 0.1;
const MAX_MASKABLE_PADDING = 0.4;

const ICON_FILES = [
  "pwa-192x192.png",
  "pwa-512x512.png",
  "maskable-192x192.png",
  "maskable-512x512.png",
  "apple-touch-icon.png",
  "favicon-32x32.png"
] as const;
const TEXT_FILES = ["site.webmanifest", "head-snippet.html"] as const;
const PACKAGE_FILES = [...ICON_FILES, ...TEXT_FILES] as const;

interface NormalizedOptions extends PwaIconPackageOptions {
  appName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  maskablePadding: number;
}

interface PackagePaths {
  packageName: string;
  outputDir: string;
  zipPath: string;
}

function truncateUnicode(value: string, maxCharacters: number) {
  return Array.from(value).slice(0, maxCharacters).join("");
}

function normalizeLabel(value: string, field: string, maxCharacters: number) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new Error(`${field} cannot be empty.`);
  return truncateUnicode(normalized, maxCharacters);
}

function normalizeHexColor(value: string, field: string) {
  if (typeof value !== "string") throw new Error(`${field} must be a color.`);
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  throw new Error(`${field} must use #RRGGBB format.`);
}

function normalizeOptions(options: PwaIconPackageOptions): NormalizedOptions {
  if (!options || !Array.isArray(options.inputPaths) || options.inputPaths.length === 0) {
    throw new Error("Select at least one source image.");
  }
  if (options.inputPaths.length > MAX_BATCH_ITEMS) {
    throw new Error(`A single PWA icon task supports at most ${MAX_BATCH_ITEMS} source images.`);
  }
  if (typeof options.outputDir !== "string" || !path.isAbsolute(options.outputDir)) {
    throw new Error("Select an absolute output directory.");
  }
  if (options.inputPaths.some((inputPath) => typeof inputPath !== "string" || !path.isAbsolute(inputPath))) {
    throw new Error("Every source image must use an absolute path.");
  }

  const maskablePadding = options.maskablePadding ?? DEFAULT_MASKABLE_PADDING;
  if (
    !Number.isFinite(maskablePadding) ||
    maskablePadding < MIN_MASKABLE_PADDING ||
    maskablePadding > MAX_MASKABLE_PADDING
  ) {
    throw new Error(
      `Maskable padding must be between ${MIN_MASKABLE_PADDING} and ${MAX_MASKABLE_PADDING}.`
    );
  }

  return {
    ...options,
    appName: normalizeLabel(options.appName, "App name", 80),
    shortName: normalizeLabel(options.shortName, "Short name", 24),
    themeColor: normalizeHexColor(options.themeColor, "Theme color"),
    backgroundColor: normalizeHexColor(options.backgroundColor, "Background color"),
    maskablePadding
  };
}

type SupportedRasterFormat = "png" | "jpeg" | "webp";

function detectRasterFormat(bytes: Buffer): SupportedRasterFormat | null {
  if (bytes.length < 12) return null;
  const ascii = bytes.subarray(0, 12).toString("ascii");
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  return null;
}

async function readSafeImage(inputPath: string) {
  const extension = path.extname(inputPath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extension)) {
    throw new Error("Only PNG, JPEG, WebP, and SVG source images are supported.");
  }
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error("The selected source is not a file.");
  if (stat.size === 0) throw new Error("The selected source image is empty.");
  if (stat.size > MAX_RASTER_INPUT_BYTES) {
    throw new Error("The source image exceeds the 64 MiB input safety limit.");
  }

  const bytes = await fs.readFile(inputPath);
  if (extension === ".svg") {
    if (bytes.length > MAX_SVG_INPUT_BYTES) {
      throw new Error("SVG input exceeds the 5 MiB input safety limit.");
    }
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Unsupported image format or invalid UTF-8 SVG input.");
    }
    assertSafeSvg(source);
  } else {
    const expectedFormat: SupportedRasterFormat = extension === ".png" ? "png" : extension === ".webp" ? "webp" : "jpeg";
    if (detectRasterFormat(bytes) !== expectedFormat) {
      throw new Error("The source image content does not match its file extension.");
    }
  }

  const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, page: 0, pages: 1 }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;
  if (!width || !height) throw new Error("The source image has no usable dimensions.");
  if (width > 32_768 || height > 32_768 || width * height > MAX_INPUT_PIXELS) {
    throw new Error("The source image exceeds the 100-megapixel safety limit.");
  }
  return bytes;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function manifestContent(options: NormalizedOptions) {
  return `${JSON.stringify(
    {
      name: options.appName,
      short_name: options.shortName,
      start_url: ".",
      display: "standalone",
      theme_color: options.themeColor,
      background_color: options.backgroundColor,
      icons: [
        { src: "./pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "./pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "./maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "./maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
      ]
    },
    null,
    2
  )}\n`;
}

function htmlSnippet(options: NormalizedOptions) {
  return `<link rel="manifest" href="./site.webmanifest">
<meta name="theme-color" content="${htmlEscape(options.themeColor)}">
<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png">
`;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function uniquePackagePaths(outputRoot: string, inputPath: string): Promise<PackagePaths> {
  const base = sanitizeFileComponent(`${safeBaseName(inputPath)}-pwa-icons`, "pwa-icons", 170);
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const packageName = suffix === 1 ? base : `${base}-${suffix}`;
    const outputDir = resolveSafeChildPath(outputRoot, packageName);
    const zipPath = resolveSafeChildPath(outputRoot, `${packageName}.zip`);
    const [directoryExists, archiveExists] = await Promise.all([pathExists(outputDir), pathExists(zipPath)]);
    if (!directoryExists && !archiveExists) return { packageName, outputDir, zipPath };
  }
  throw new Error("Unable to allocate a unique PWA icon package name.");
}

function imagePipeline(input: Buffer) {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, page: 0, pages: 1 }).rotate();
}

async function writeRegularIcon(input: Buffer, size: number, outputPath: string) {
  await imagePipeline(input)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function writeMaskableIcon(
  input: Buffer,
  size: number,
  outputPath: string,
  padding: number,
  backgroundColor: string
) {
  const innerSize = Math.max(1, Math.round(size * (1 - padding * 2)));
  const foreground = await imagePipeline(input)
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: backgroundColor }
  })
    .composite([{ input: foreground, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function writeOpaqueIcon(input: Buffer, size: number, outputPath: string, backgroundColor: string) {
  await imagePipeline(input)
    .resize(size, size, { fit: "contain", background: backgroundColor })
    .flatten({ background: backgroundColor })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function generateStagedPackage(input: Buffer, stageDir: string, options: NormalizedOptions) {
  await ensureDir(stageDir);
  await Promise.all([
    writeRegularIcon(input, 192, path.join(stageDir, "pwa-192x192.png")),
    writeRegularIcon(input, 512, path.join(stageDir, "pwa-512x512.png")),
    writeMaskableIcon(
      input,
      192,
      path.join(stageDir, "maskable-192x192.png"),
      options.maskablePadding,
      options.backgroundColor
    ),
    writeMaskableIcon(
      input,
      512,
      path.join(stageDir, "maskable-512x512.png"),
      options.maskablePadding,
      options.backgroundColor
    ),
    writeOpaqueIcon(input, 180, path.join(stageDir, "apple-touch-icon.png"), options.backgroundColor),
    writeRegularIcon(input, 32, path.join(stageDir, "favicon-32x32.png")),
    fs.writeFile(path.join(stageDir, "site.webmanifest"), manifestContent(options), { flag: "wx" }),
    fs.writeFile(path.join(stageDir, "head-snippet.html"), htmlSnippet(options), { flag: "wx" })
  ]);

  const stats = await Promise.all(PACKAGE_FILES.map((fileName) => fs.stat(path.join(stageDir, fileName))));
  const totalBytes = stats.reduce((total, stat) => total + stat.size, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("Generated package exceeds the 32 MiB safety limit.");
}

async function createZip(stageDir: string, packageName: string) {
  const zip = new JSZip();
  const folder = zip.folder(packageName);
  if (!folder) throw new Error("Unable to create the PWA icon archive.");
  for (const fileName of PACKAGE_FILES) {
    folder.file(fileName, await fs.readFile(path.join(stageDir, fileName)));
  }
  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS"
  });
  if (archive.length > MAX_PACKAGE_BYTES) throw new Error("Generated ZIP exceeds the 32 MiB safety limit.");
  return archive;
}

async function writeTemporaryArchive(temporaryPath: string, archive: Buffer) {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(temporaryPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY);
    await handle.writeFile(archive);
    await handle.sync();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function generateOnePackage(inputPath: string, outputRoot: string, options: NormalizedOptions) {
  const paths = await uniquePackagePaths(outputRoot, inputPath);
  const stageDir = resolveSafeChildPath(outputRoot, `.${paths.packageName}.part-${uniqueId("pwa")}`);
  const temporaryZip = temporaryOutputPath(paths.zipPath);
  let directoryCommitted = false;
  let zipCommitted = false;

  try {
    const input = await readSafeImage(inputPath);
    await generateStagedPackage(input, stageDir, options);
    const archive = await createZip(stageDir, paths.packageName);
    await writeTemporaryArchive(temporaryZip, archive);

    await fs.rename(stageDir, paths.outputDir);
    directoryCommitted = true;
    await commitTemporaryFile(temporaryZip, paths.zipPath);
    zipCommitted = true;

    return {
      ...paths,
      files: [...PACKAGE_FILES.map((fileName) => path.join(paths.outputDir, fileName)), paths.zipPath]
    };
  } catch (error) {
    if (directoryCommitted && !zipCommitted) {
      await fs.rm(paths.outputDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
    }
    if (zipCommitted) await fs.rm(paths.zipPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await Promise.all([
      fs.rm(stageDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined),
      removeTemporaryFile(temporaryZip)
    ]);
  }
}

export async function generatePwaIconPackages(
  rawOptions: PwaIconPackageOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("pwa-icons");
  const logs: string[] = [];
  const files: string[] = [];
  const items: ConversionItemResult[] = [];
  let outputPath = rawOptions?.outputDir ?? "";

  await history.startTask({
    id,
    toolType: "pwa-icons",
    sourcePath: Array.isArray(rawOptions?.inputPaths) ? rawOptions.inputPaths.join(";") : "",
    outputPath,
    options: rawOptions
  });

  try {
    const options = normalizeOptions(rawOptions);
    outputPath = options.outputDir;
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      try {
        const result = await generateOnePackage(inputPath, options.outputDir, options);
        files.push(...result.files);
        items.push({ inputPath, outputPath: result.zipPath, status: "success" });
        logs.push(`Created ${result.packageName} and ${path.basename(result.zipPath)}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${path.basename(inputPath)}: ${message}`);
      }
    }

    const failedCount = items.filter((item) => item.status === "error").length;
    const succeededCount = items.length - failedCount;
    const status = failedCount ? (succeededCount ? "partial" : "error") : "success";
    const errorMessage = failedCount ? `${failedCount} of ${items.length} PWA icon package(s) failed.` : undefined;
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath, logs, errorMessage: message, items };
  }
}
