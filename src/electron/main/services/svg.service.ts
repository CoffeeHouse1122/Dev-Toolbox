import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ConversionItemResult, ConversionResult, SvgToolboxOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import {
  commitTemporaryFile,
  ensureDir,
  removeTemporaryFile,
  safeBaseName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath
} from "./file-utils";

const MAX_SVG_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_BATCH_ITEMS = 100;
const MAX_RASTER_EDGE = 8192;
const MAX_RASTER_PIXELS = 32 * 1024 * 1024;
const DEFAULT_WEBP_QUALITY = 85;
const DEFAULT_PRECISION = 2;
const SVG_BASE_DENSITY = 72;
const MAX_SVG_DENSITY = 2400;

const forbiddenMarkup: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /<!DOCTYPE\b/i, message: "SVG document type declarations are not allowed." },
  { pattern: /<!ENTITY\b/i, message: "SVG entity declarations are not allowed." },
  { pattern: /<\?xml-stylesheet\b/i, message: "External XML stylesheets are not allowed." },
  { pattern: /<\s*(?:[A-Za-z_][\w.-]*:)?script\b/i, message: "SVG scripts are not allowed." },
  { pattern: /<\s*(?:[A-Za-z_][\w.-]*:)?foreignObject\b/i, message: "SVG foreignObject content is not allowed." },
  { pattern: /<\s*(?:[A-Za-z_][\w.-]*:)?(?:iframe|object|embed)\b/i, message: "Embedded active content is not allowed." },
  { pattern: /(?:^|[\s<])(?:[A-Za-z_][\w.-]*:)?on[A-Za-z0-9_.:-]+\s*=/i, message: "SVG event handler attributes are not allowed." },
  { pattern: /\b(?:javascript|vbscript)\s*:/i, message: "Executable SVG links are not allowed." },
  { pattern: /\b(?:expression|-moz-binding)\s*[:(]/i, message: "Executable SVG styles are not allowed." },
  { pattern: /@import\b/i, message: "External SVG stylesheet imports are not allowed." },
  {
    pattern: /\battributeName\s*=\s*(?:"(?:xlink:)?href"|'(?:xlink:)?href')/i,
    message: "Animated SVG link targets are not allowed."
  }
];

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function isAllowedEmbeddedReference(rawValue: string) {
  const value = decodeXmlAttribute(rawValue).trim();
  if (!value) return true;
  if (/^#[^\s"'<>]+$/u.test(value)) return true;
  return /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/iu.test(value);
}

/**
 * Reject active content and references that could access the network or local
 * files when Sharp/librsvg parses a user-selected SVG.
 */
export function assertSafeSvg(source: string) {
  if (!/<\s*(?:[A-Za-z_][\w.-]*:)?svg(?:\s|>)/i.test(source)) {
    throw new Error("The selected file does not contain an SVG root element.");
  }

  for (const rule of forbiddenMarkup) {
    if (rule.pattern.test(source)) throw new Error(rule.message);
  }

  const uriAttribute = /\b(?:xlink:href|href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of source.matchAll(uriAttribute)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isAllowedEmbeddedReference(value)) {
      throw new Error("External SVG references are not allowed.");
    }
  }

  const cssUrl = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  for (const match of source.matchAll(cssUrl)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isAllowedEmbeddedReference(value)) {
      throw new Error("External SVG style references are not allowed.");
    }
  }

  // CSS escapes can disguise url(), @import, or an executable scheme. SVGs
  // using them are rejected conservatively instead of attempting a CSS parser.
  const styleContent = source.match(/<\s*(?:[A-Za-z_][\w.-]*:)?style\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[A-Za-z_][\w.-]*:)?style\s*>/gi) ?? [];
  const styleAttributes = source.match(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi) ?? [];
  if ([...styleContent, ...styleAttributes].some((value) => value.includes("\\"))) {
    throw new Error("Escaped SVG styles are not allowed.");
  }
}

function assertIntegerInRange(value: number | undefined, name: string, min: number, max: number) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function normalizeOptions(options: SvgToolboxOptions) {
  if (!options || !Array.isArray(options.inputPaths) || options.inputPaths.length === 0) {
    throw new Error("Select at least one SVG file.");
  }
  if (options.inputPaths.length > MAX_BATCH_ITEMS) {
    throw new Error(`A single SVG task supports at most ${MAX_BATCH_ITEMS} files.`);
  }
  if (!options.outputDir || typeof options.outputDir !== "string") {
    throw new Error("Select an output directory.");
  }
  if (options.outputFormat !== "svg" && options.outputFormat !== "png" && options.outputFormat !== "webp") {
    throw new Error("Unsupported SVG output format.");
  }

  const precision = options.precision ?? DEFAULT_PRECISION;
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;
  assertIntegerInRange(precision, "Precision", 0, 6);
  assertIntegerInRange(quality, "Quality", 1, 100);
  assertIntegerInRange(options.width, "Raster width", 1, MAX_RASTER_EDGE);
  assertIntegerInRange(options.height, "Raster height", 1, MAX_RASTER_EDGE);

  return {
    ...options,
    precision,
    quality,
    cleanupIds: options.cleanupIds !== false,
    removeDimensions: options.removeDimensions === true
  };
}

async function readSvgInput(inputPath: string) {
  if (path.extname(inputPath).toLowerCase() !== ".svg") {
    throw new Error("Only .svg files are supported.");
  }
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error("The selected SVG path is not a file.");
  if (stat.size === 0) throw new Error("The selected SVG file is empty.");
  if (stat.size > MAX_SVG_INPUT_BYTES) {
    throw new Error("The SVG exceeds the 5 MiB input safety limit.");
  }

  const bytes = await fs.readFile(inputPath);
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The SVG must use valid UTF-8 encoding.");
  }
  assertSafeSvg(source);
  return source;
}

async function optimizeSvg(source: string, inputPath: string, options: ReturnType<typeof normalizeOptions>) {
  // SVGO is ESM-only, while Electron main is compiled as CommonJS. Keeping the
  // dynamic import here avoids changing the module format of the whole process.
  const { optimize } = await import("svgo");
  const result = optimize(source, {
    path: inputPath,
    multipass: true,
    floatPrecision: options.precision,
    plugins: [
      {
        name: "preset-default",
        params: {
          floatPrecision: options.precision,
          overrides: { cleanupIds: options.cleanupIds ? {} : false }
        }
      },
      ...(options.removeDimensions && options.outputFormat === "svg" ? (["removeDimensions"] as const) : [])
    ]
  });
  assertSafeSvg(result.data);
  return result.data;
}

function checkedRasterDimensions(
  sourceWidth: number,
  sourceHeight: number,
  requestedWidth: number | undefined,
  requestedHeight: number | undefined
) {
  let width: number;
  let height: number;
  if (requestedWidth === undefined && requestedHeight === undefined) {
    width = sourceWidth;
    height = sourceHeight;
  } else if (requestedWidth === undefined) {
    height = requestedHeight!;
    width = Math.max(1, Math.round(sourceWidth * (height / sourceHeight)));
  } else if (requestedHeight === undefined) {
    width = requestedWidth;
    height = Math.max(1, Math.round(sourceHeight * (width / sourceWidth)));
  } else {
    width = requestedWidth;
    height = requestedHeight;
  }

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("Unable to determine safe SVG raster dimensions.");
  }
  if (width > MAX_RASTER_EDGE || height > MAX_RASTER_EDGE || width * height > MAX_RASTER_PIXELS) {
    throw new Error(`Raster output is limited to ${MAX_RASTER_EDGE}px per edge and ${MAX_RASTER_PIXELS} total pixels.`);
  }
  return { width, height };
}

async function renderRaster(
  svg: string,
  outputPath: string,
  options: ReturnType<typeof normalizeOptions>
) {
  const svgBytes = Buffer.from(svg, "utf8");
  const metadata = await sharp(svgBytes, {
    density: SVG_BASE_DENSITY,
    failOn: "error",
    limitInputPixels: MAX_RASTER_PIXELS
  }).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (!sourceWidth || !sourceHeight) throw new Error("Unable to determine SVG dimensions for raster output.");

  const target = checkedRasterDimensions(sourceWidth, sourceHeight, options.width, options.height);
  const scale = options.width !== undefined && options.height !== undefined
    ? Math.min(target.width / sourceWidth, target.height / sourceHeight)
    : Math.max(target.width / sourceWidth, target.height / sourceHeight);
  const density = Math.min(MAX_SVG_DENSITY, Math.max(SVG_BASE_DENSITY, Math.ceil(SVG_BASE_DENSITY * scale)));

  let pipeline = sharp(svgBytes, {
    density,
    failOn: "error",
    limitInputPixels: MAX_RASTER_PIXELS
  }).resize({
    width: target.width,
    height: target.height,
    fit: options.width !== undefined && options.height !== undefined ? "contain" : "inside",
    withoutEnlargement: false,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  });

  pipeline = options.outputFormat === "png"
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.webp({ quality: options.quality, effort: 6, smartSubsample: true });
  await pipeline.toFile(outputPath);
}

/** Optimize a batch of SVGs and optionally rasterize each result. */
export async function processSvgFiles(rawOptions: SvgToolboxOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("svg-toolbox");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];
  let options: ReturnType<typeof normalizeOptions>;

  try {
    options = normalizeOptions(rawOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { id, status: "error", files, outputPath: rawOptions?.outputDir ?? "", logs, errorMessage: message, items };
  }

  await history.startTask({
    id,
    toolType: "svg-toolbox",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      let tempOutput = "";
      try {
        const source = await readSvgInput(inputPath);
        const optimized = await optimizeSvg(source, inputPath, options);
        const output = await uniqueOutputPath(
          options.outputDir,
          `${safeBaseName(inputPath)}-optimized.${options.outputFormat}`
        );
        tempOutput = temporaryOutputPath(output);

        if (options.outputFormat === "svg") {
          await fs.writeFile(tempOutput, `${optimized.trim()}\n`, { encoding: "utf8", flag: "wx" });
        } else {
          await renderRaster(optimized, tempOutput, options);
        }
        await commitTemporaryFile(tempOutput, output);
        tempOutput = "";

        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        logs.push(`Processed ${path.basename(inputPath)} as ${path.basename(output)}.`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} SVG file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message, items };
  }
}
