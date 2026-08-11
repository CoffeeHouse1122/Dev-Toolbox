import fs from "node:fs/promises";
import iconv from "iconv-lite";

export const supportedTextEncodings = ["utf8", "utf16le", "utf16be", "gb18030", "big5", "shift_jis", "latin1"] as const;
export type SupportedTextEncoding = (typeof supportedTextEncodings)[number];
export type TextEncodingPreference = SupportedTextEncoding | "auto";

export type DecodedText = {
  text: string;
  encoding: SupportedTextEncoding;
  hadBom: boolean;
};

const encodingAliases: Record<string, SupportedTextEncoding> = {
  "utf-8": "utf8",
  utf8: "utf8",
  "utf-16le": "utf16le",
  utf16le: "utf16le",
  "utf-16be": "utf16be",
  utf16be: "utf16be",
  gbk: "gb18030",
  gb2312: "gb18030",
  gb18030: "gb18030",
  big5: "big5",
  "shift-jis": "shift_jis",
  shift_jis: "shift_jis",
  sjis: "shift_jis",
  "iso-8859-1": "latin1",
  latin1: "latin1"
};

export function normalizeTextEncoding(value: string): SupportedTextEncoding {
  const normalized = encodingAliases[value.trim().toLowerCase()];
  if (!normalized) throw new Error(`不支持的文本编码：${value}`);
  return normalized;
}

function hasPrefix(buffer: Buffer, prefix: readonly number[]) {
  return prefix.every((value, index) => buffer[index] === value);
}

function decodeUtf8Strict(buffer: Buffer) {
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

function looksLikeBomlessUtf16(buffer: Buffer): "utf16le" | "utf16be" | null {
  if (buffer.length < 4 || buffer.length % 2 !== 0) return null;
  const sampleLength = Math.min(buffer.length, 4096);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }
  const pairs = sampleLength / 2;
  if (oddNulls / pairs > 0.25 && evenNulls / pairs < 0.05) return "utf16le";
  if (evenNulls / pairs > 0.25 && oddNulls / pairs < 0.05) return "utf16be";
  return null;
}

export function decodeTextBuffer(buffer: Buffer, preference: TextEncodingPreference = "auto"): DecodedText {
  if (preference !== "auto") {
    const encoding = normalizeTextEncoding(preference);
    const hadBom =
      (encoding === "utf8" && hasPrefix(buffer, [0xef, 0xbb, 0xbf])) ||
      (encoding === "utf16le" && hasPrefix(buffer, [0xff, 0xfe])) ||
      (encoding === "utf16be" && hasPrefix(buffer, [0xfe, 0xff]));
    const text = iconv.decode(buffer, encoding).replace(/^\uFEFF/, "");
    return { text, encoding, hadBom };
  }

  if (hasPrefix(buffer, [0xef, 0xbb, 0xbf])) {
    return { text: decodeUtf8Strict(buffer.subarray(3)), encoding: "utf8", hadBom: true };
  }
  if (hasPrefix(buffer, [0xff, 0xfe])) {
    return { text: iconv.decode(buffer.subarray(2), "utf16le"), encoding: "utf16le", hadBom: true };
  }
  if (hasPrefix(buffer, [0xfe, 0xff])) {
    return { text: iconv.decode(buffer.subarray(2), "utf16be"), encoding: "utf16be", hadBom: true };
  }

  const utf16 = looksLikeBomlessUtf16(buffer);
  if (utf16) return { text: iconv.decode(buffer, utf16), encoding: utf16, hadBom: false };

  try {
    return { text: decodeUtf8Strict(buffer), encoding: "utf8", hadBom: false };
  } catch {
    throw new Error("文件不是可无损解析的 UTF-8/UTF-16 文本。请先在编码工具中明确选择 GB18030、Big5 或 Shift-JIS，已取消写入以保护源码。");
  }
}

export async function readDecodedTextFile(filePath: string, preference: TextEncodingPreference = "auto") {
  return decodeTextBuffer(await fs.readFile(filePath), preference);
}

export function encodeTextBuffer(text: string, encoding: SupportedTextEncoding, withBom = false) {
  const normalized = normalizeTextEncoding(encoding);
  const encoded = iconv.encode(text, normalized);
  if (!withBom) return encoded;
  if (normalized === "utf8") return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]);
  if (normalized === "utf16le") return Buffer.concat([Buffer.from([0xff, 0xfe]), encoded]);
  if (normalized === "utf16be") return Buffer.concat([Buffer.from([0xfe, 0xff]), encoded]);
  return encoded;
}
