import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { Font } from "fonteditor-core";
import { getRendererIndexPath } from "../utils/app-paths";

const FONT_FAMILY = "DevToolbox CJK";
const MAX_SUBSET_CODE_POINTS = 4096;
let sourceFontPromise: Promise<Buffer> | null = null;
const subsetCache = new Map<string, Promise<string>>();

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const output = new Uint8Array(buffer.byteLength);
  output.set(buffer);
  return output.buffer;
}

async function findBundledFont() {
  const directCandidates = [
    path.join(process.cwd(), "src", "renderer", "assets", "NotoSansSC-Regular.woff2"),
    path.join(app.getAppPath(), "src", "renderer", "assets", "NotoSansSC-Regular.woff2"),
    path.join(process.resourcesPath, "fonts", "NotoSansSC-Regular.woff2"),
    path.join(path.dirname(getRendererIndexPath()), "assets", "NotoSansSC-Regular.woff2")
  ];
  for (const candidate of directCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next development/production location.
    }
  }

  const rendererDir = path.dirname(getRendererIndexPath());
  const pending = [rendererDir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (/^NotoSansSC-Regular(?:-[\w-]+)?\.woff2$/i.test(entry.name)) return candidate;
    }
  }
  throw new Error("未找到内置中文字体资源");
}

async function loadSourceTtf() {
  if (!sourceFontPromise) {
    sourceFontPromise = (async () => {
      const woff2 = await fs.readFile(await findBundledFont());
      const wawoff2 = (await import("wawoff2")) as {
        decompress(input: Uint8Array): Promise<Uint8Array>;
      };
      return Buffer.from(await wawoff2.decompress(woff2));
    })();
  }
  return sourceFontPromise;
}

function collectCodePoints(text: string) {
  const points = new Set<number>([0x20, 0x2d, 0x2e]);
  for (const character of text.normalize("NFC")) {
    const point = character.codePointAt(0);
    if (point !== undefined) points.add(point);
    if (points.size >= MAX_SUBSET_CODE_POINTS) break;
  }
  return [...points].sort((left, right) => left - right);
}

async function createSubsetDataUrl(codePoints: number[]) {
  const source = await loadSourceTtf();
  const font = Font.create(toArrayBuffer(source), {
    type: "ttf",
    subset: codePoints,
    hinting: false,
    kerning: true,
    compound2simple: false
  });
  const subset = Buffer.from(font.write({ type: "ttf", toBuffer: true, hinting: false, kerning: true }));
  return `data:font/ttf;base64,${subset.toString("base64")}`;
}

/** Return SVG/HTML CSS with only the glyphs needed for the current render. */
export async function embeddedCjkFontStyle(text: string) {
  const codePoints = collectCodePoints(text);
  const cacheKey = codePoints.join(",");
  let dataUrl = subsetCache.get(cacheKey);
  if (!dataUrl) {
    dataUrl = createSubsetDataUrl(codePoints);
    subsetCache.set(cacheKey, dataUrl);
    if (subsetCache.size > 32) subsetCache.delete(subsetCache.keys().next().value ?? "");
  }
  return `<style>@font-face{font-family:'${FONT_FAMILY}';src:url('${await dataUrl}') format('truetype');font-weight:100 900;font-style:normal}text{font-family:'${FONT_FAMILY}',sans-serif}</style>`;
}

export const embeddedCjkFontFamily = FONT_FAMILY;
