import { net } from "electron";
import type { HttpRequestInput, HttpRequestOutput } from "../../../shared/types";

const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_FIELDS = 200;
const blockedHeaders = new Set(["host", "content-length", "connection", "transfer-encoding"]);

function normalizeUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("HTTP 测试器仅支持 http 和 https URL");
  }
  if (url.username || url.password) throw new Error("请使用 Authorization 请求头，不要在 URL 中包含账号密码");
  return url.toString();
}

function normalizeHeaders(input: Record<string, string>, multipart: boolean) {
  const headers = new Headers();
  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = rawName.trim();
    const value = rawValue.trim();
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) throw new Error("请求头不能包含换行符");
    if (blockedHeaders.has(name.toLowerCase())) continue;
    if (multipart && name.toLowerCase() === "content-type") continue;
    headers.set(name, value);
  }
  return headers;
}

function isTextualContentType(contentType: string) {
  return (
    contentType.startsWith("text/") ||
    /(?:json|xml|javascript|yaml|toml|x-www-form-urlencoded|svg)/i.test(contentType)
  );
}

async function readLimitedBody(response: Response) {
  if (!response.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    const remaining = MAX_RESPONSE_BYTES - total;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel("response limit reached").catch(() => undefined);
      break;
    }
    chunks.push(chunk.subarray(0, remaining));
    total += Math.min(chunk.length, remaining);
    if (chunk.length > remaining) {
      truncated = true;
      await reader.cancel("response limit reached").catch(() => undefined);
      break;
    }
  }
  return { buffer: Buffer.concat(chunks, total), truncated };
}

export async function sendHttpRequest(input: HttpRequestInput): Promise<HttpRequestOutput> {
  const url = normalizeUrl(input.url);
  const method = input.method.trim().toUpperCase();
  if (!allowedMethods.has(method)) throw new Error(`不支持的 HTTP 方法：${method}`);

  const timeoutMs = Math.max(100, Math.min(60_000, Math.floor(input.timeoutMs)));
  const multipartFields = input.multipartFields?.filter((field) => field.name.trim()) ?? [];
  if (multipartFields.length > MAX_MULTIPART_FIELDS) throw new Error(`multipart 字段不能超过 ${MAX_MULTIPART_FIELDS} 个`);
  const headers = normalizeHeaders(input.headers, multipartFields.length > 0);
  let body: BodyInit | undefined;

  if (method !== "GET" && method !== "HEAD") {
    if (multipartFields.length > 0) {
      const form = new FormData();
      let totalBytes = 0;
      for (const field of multipartFields) {
        totalBytes += Buffer.byteLength(field.name, "utf8") + Buffer.byteLength(field.value, "utf8");
        if (totalBytes > MAX_REQUEST_BODY_BYTES) throw new Error(`multipart 请求体不能超过 ${MAX_REQUEST_BODY_BYTES / 1024 / 1024} MiB`);
        form.append(field.name, field.value);
      }
      body = form;
    } else if (input.body) {
      if (Buffer.byteLength(input.body, "utf8") > MAX_REQUEST_BODY_BYTES) {
        throw new Error(`请求体不能超过 ${MAX_REQUEST_BODY_BYTES / 1024 / 1024} MiB`);
      }
      body = input.body;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`请求超过 ${timeoutMs}ms`)), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await net.fetch(url, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: controller.signal
    });
    const { buffer, truncated } = await readLimitedBody(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const textual = isTextualContentType(contentType);
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: textual ? new TextDecoder("utf-8").decode(buffer) : buffer.toString("base64"),
      elapsedMs: Math.round(performance.now() - startedAt),
      bodyEncoding: textual ? "text" : "base64",
      truncated
    };
  } finally {
    clearTimeout(timer);
  }
}
