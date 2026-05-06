import fs from "node:fs/promises";
import path from "node:path";
import { Font } from "fonteditor-core";
import type { ConversionResult, FontSubsetOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

type FontInputType = "ttf" | "otf" | "woff" | "woff2";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const output = new Uint8Array(buffer.byteLength);
  output.set(buffer);
  return output.buffer;
}

async function readFontBuffer(inputPath: string) {
  const ext = path.extname(inputPath).toLowerCase();
  const buffer = await fs.readFile(inputPath);

  if (ext === ".woff2") {
    const wawoff2 = (await import("wawoff2")) as {
      decompress(input: Uint8Array): Promise<Uint8Array>;
    };
    return { buffer: Buffer.from(await wawoff2.decompress(buffer)), type: "ttf" as FontInputType };
  }

  if (ext === ".otf") return { buffer, type: "otf" as FontInputType };
  if (ext === ".woff") return { buffer, type: "woff" as FontInputType };
  return { buffer, type: "ttf" as FontInputType };
}

function textToCodePoints(text: string) {
  const points = new Set<number>();
  for (const char of text) {
    const point = char.codePointAt(0);
    if (point !== undefined && point > 31) {
      points.add(point);
    }
  }
  return [...points].sort((a, b) => a - b);
}

async function compressToWoff2(buffer: Buffer) {
  const wawoff2 = (await import("wawoff2")) as {
    compress(input: Uint8Array): Promise<Uint8Array>;
  };
  return Buffer.from(await wawoff2.compress(buffer));
}

export async function subsetFont(options: FontSubsetOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("font-subset");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "font-subset",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options: { ...options, text: `${options.text.slice(0, 80)}${options.text.length > 80 ? "..." : ""}` }
  });

  try {
    await ensureDir(options.outputDir);
    const codePoints = textToCodePoints(options.text);
    if (codePoints.length === 0) {
      throw new Error("请输入需要保留的字符。");
    }

    const source = await readFontBuffer(options.inputPath);
    const font = Font.create(toArrayBuffer(source.buffer), {
      type: source.type,
      subset: codePoints,
      hinting: false,
      kerning: true,
      compound2simple: false
    });
    const ttfBuffer = Buffer.from(font.write({ type: "ttf", toBuffer: true, hinting: false, kerning: true }));
    const base = `${safeBaseName(options.inputPath)}-subset`;
    const output = path.join(options.outputDir, `${base}.${options.outputFormat}`);
    const outputBuffer = options.outputFormat === "woff2" ? await compressToWoff2(ttfBuffer) : ttfBuffer;
    await fs.writeFile(output, outputBuffer);
    files.push(output);

    if (options.generateCss) {
      const family = options.fontFamily?.trim() || base;
      const cssPath = path.join(options.outputDir, `${base}.css`);
      await writeTextFile(
        cssPath,
        `@font-face {
  font-family: "${family}";
  src: url("./${path.basename(output)}") format("${options.outputFormat}");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
`
      );
      files.push(cssPath);
    }

    logs.push(`Kept ${codePoints.length} unique character(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
