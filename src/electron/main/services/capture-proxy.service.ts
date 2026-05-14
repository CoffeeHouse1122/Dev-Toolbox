import { app } from "electron";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import fs from "node:fs/promises";
import http, { type IncomingHttpHeaders } from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { Proxy, type IContext } from "http-mitm-proxy";
import type { CaptureProxyRecord, CaptureProxyStartOptions, CaptureProxyStatus } from "../../../shared/types";

type HeaderBag = IncomingHttpHeaders | Record<string, string | string[] | number | undefined>;

type CaptureState = {
  chunks: Buffer[];
  capturedBytes: number;
  totalBytes: number;
};

let proxyServer: Proxy | null = null;
let currentOptions: CaptureProxyStartOptions = {
  host: "127.0.0.1",
  port: 8899,
  captureBodies: true,
  maxBodySize: 262144,
  enableHttps: true
};
let startedAt: number | null = null;
let lastError = "";

const records: CaptureProxyRecord[] = [];
const requestCaptures = new Map<string, CaptureState>();
const responseCaptures = new Map<string, CaptureState>();
const maxRecords = 500;

function recordId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function captureCaDir() {
  try {
    if (app?.getPath) return path.join(app.getPath("userData"), "data", "capture-proxy-ca");
  } catch {
    // Allows lightweight service tests outside Electron.
  }
  return path.join(process.cwd(), ".capture-proxy-ca");
}

function caCertPath() {
  return path.join(captureCaDir(), "certs", "ca.pem");
}

function caPrivateKeyPath() {
  return path.join(captureCaDir(), "keys", "ca.private.key");
}

function publicKeyDerFromCertificate(certificatePem: string) {
  return new X509Certificate(certificatePem).publicKey.export({ format: "der", type: "spki" }) as Buffer;
}

function publicKeyDerFromPrivateKey(privateKeyPem: string) {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "der", type: "spki" }) as Buffer;
}

async function caKeyPairMatches() {
  const readOptional = async (filePath: string) => {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  try {
    const [certificatePem, privateKeyPem] = await Promise.all([readOptional(caCertPath()), readOptional(caPrivateKeyPath())]);
    if (!certificatePem && !privateKeyPem) return true;
    if (!certificatePem || !privateKeyPem) return false;
    return publicKeyDerFromCertificate(certificatePem).equals(publicKeyDerFromPrivateKey(privateKeyPem));
  } catch {
    return false;
  }
}

async function removeDirectoryChildren(directory: string, keepNames: Set<string>) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (keepNames.has(entry.name)) return;
      await fs.rm(path.join(directory, entry.name), { recursive: true, force: true });
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function prepareCertificateCache() {
  const root = captureCaDir();
  if (!(await caKeyPairMatches())) {
    await fs.rm(root, { recursive: true, force: true });
    return;
  }

  await Promise.all([
    removeDirectoryChildren(path.join(root, "certs"), new Set(["ca.pem"])),
    removeDirectoryChildren(path.join(root, "keys"), new Set(["ca.private.key", "ca.public.key"]))
  ]);
}

function normalizeHeaderValue(value: string | string[] | number | undefined) {
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "number") return String(value);
  return value ?? "";
}

function normalizeHeaders(headers: HeaderBag) {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    output[key] = ["authorization", "proxy-authorization", "cookie", "set-cookie"].includes(lower)
      ? "[masked]"
      : normalizeHeaderValue(value);
  }
  return output;
}

function isTextLike(headers: HeaderBag) {
  const type = normalizeHeaderValue(headers?.["content-type"]).toLowerCase();
  return !type || type.startsWith("text/") || /json|javascript|xml|graphql|form-urlencoded/.test(type);
}

function decodeBody(buffer: Buffer, headers: HeaderBag) {
  const encoding = normalizeHeaderValue(headers?.["content-encoding"]).toLowerCase();
  try {
    if (encoding.includes("br")) return zlib.brotliDecompressSync(buffer);
    if (encoding.includes("gzip")) return zlib.gunzipSync(buffer);
    if (encoding.includes("deflate")) return zlib.inflateSync(buffer);
  } catch {
    return buffer;
  }
  return buffer;
}

function looksMostlyText(value: string) {
  if (!value) return true;
  const sample = value.slice(0, 1024);
  const controlCount = Array.from(sample).filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  }).length;
  return controlCount / sample.length < 0.08;
}

function createCaptureState(): CaptureState {
  return { chunks: [], capturedBytes: 0, totalBytes: 0 };
}

function appendCapture(state: CaptureState, chunk: Buffer, maxBytes: number) {
  state.totalBytes += chunk.length;
  if (state.capturedBytes >= maxBytes) return;
  const remaining = maxBytes - state.capturedBytes;
  const captured = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
  state.chunks.push(captured);
  state.capturedBytes += captured.length;
}

function capturePreview(state: CaptureState, headers: HeaderBag, enabled: boolean) {
  if (!enabled || !state.chunks.length) return "";
  if (!isTextLike(headers)) return `[binary body, ${state.totalBytes} bytes]`;
  const decoded = decodeBody(Buffer.concat(state.chunks), headers);
  const text = decoded.toString("utf8");
  if (!looksMostlyText(text)) return `[binary body, ${state.totalBytes} bytes]`;
  const suffix = state.totalBytes > state.capturedBytes ? `\n\n[truncated at ${state.capturedBytes} bytes]` : "";
  return `${text}${suffix}`;
}

function pushRecord(record: CaptureProxyRecord) {
  records.unshift(record);
  if (records.length > maxRecords) records.length = maxRecords;
}

function getRecord(ctx: IContext) {
  return records.find((record) => record.id === ctx.tags?.captureRecordId) ?? null;
}

function requestUrl(ctx: IContext) {
  const upstream = ctx.proxyToServerRequestOptions;
  const upstreamHost = upstream?.host;
  if (upstreamHost) {
    const protocol = ctx.isSSL ? "https" : "http";
    const upstreamPort = upstream.port ? String(upstream.port) : "";
    const defaultPort = protocol === "https" ? "443" : "80";
    const host = String(upstreamHost).includes(":") || !upstreamPort || upstreamPort === defaultPort
      ? String(upstreamHost)
      : `${String(upstreamHost)}:${upstreamPort}`;
    const pathName = String(upstream.path || ctx.clientToProxyRequest.url || "/");
    return `${protocol}://${host}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
  }

  const request = ctx.clientToProxyRequest;
  const rawUrl = request.url || "/";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const host = normalizeHeaderValue(request.headers.host) || ctx.proxyToServerRequestOptions?.host || "localhost";
  return `${ctx.isSSL ? "https" : "http"}://${host}${rawUrl}`;
}

function requestPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function requestHost(url: string, fallback = "") {
  try {
    return new URL(url).host;
  } catch {
    return fallback;
  }
}

function applyTargetHostHeader(ctx: IContext, url: string) {
  const host = requestHost(url);
  if (!host) return;
  ctx.clientToProxyRequest.headers.host = host;
  if (ctx.proxyToServerRequestOptions?.headers) {
    ctx.proxyToServerRequestOptions.headers.host = host;
  }
}

function cleanForwardHeaders(ctx: IContext) {
  const headers = ctx.proxyToServerRequestOptions?.headers;
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    if (/^(proxy-|connection$|keep-alive$|te$|trailer$|transfer-encoding$|upgrade$)/i.test(key)) {
      delete headers[key];
    }
  }
  headers["accept-encoding"] = "identity";
  headers.connection = "close";
}

function shouldIgnoreError(error: Error | null | undefined) {
  const message = error?.message || "";
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ECONNRESET" || message.includes("ECONNRESET") || message.includes("socket hang up");
}

function status(): CaptureProxyStatus {
  return {
    running: Boolean(proxyServer),
    host: currentOptions.host,
    port: currentOptions.port,
    startedAt,
    recordCount: records.length,
    caCertPath: caCertPath(),
    errorMessage: lastError || undefined
  };
}

function registerHandlers(proxy: Proxy) {
  proxy.onError((ctx, error) => {
    if (shouldIgnoreError(error)) return;
    const message = error?.message || "抓包代理请求失败";
    lastError = message;
    if (!ctx) return;
    const record = getRecord(ctx);
    if (!record) return;
    record.status = "error";
    record.durationMs = Date.now() - record.startedAt;
    record.errorMessage = message;
  });

  proxy.onRequest((ctx, callback) => {
    ctx.clientToProxyRequest.headers["accept-encoding"] = "identity";
    const url = requestUrl(ctx);
    applyTargetHostHeader(ctx, url);
    cleanForwardHeaders(ctx);
    const record: CaptureProxyRecord = {
      id: recordId(),
      startedAt: Date.now(),
      method: ctx.clientToProxyRequest.method || "GET",
      url,
      host: requestHost(url, normalizeHeaderValue(ctx.clientToProxyRequest.headers.host)),
      path: requestPath(url),
      protocol: ctx.isSSL ? "https" : "http",
      status: "pending",
      statusCode: null,
      durationMs: null,
      requestHeaders: normalizeHeaders(ctx.proxyToServerRequestOptions?.headers || ctx.clientToProxyRequest.headers),
      responseHeaders: {},
      requestBody: "",
      responseBody: "",
      requestSize: 0,
      responseSize: 0
    };
    if (!ctx.tags) {
      ctx.tags = { id: 0, uri: "", failedUpstreamCalls: 0, retryProxyRequest: false };
    }
    ctx.tags.captureRecordId = record.id;
    requestCaptures.set(ctx.uuid, createCaptureState());
    responseCaptures.set(ctx.uuid, createCaptureState());
    pushRecord(record);
    callback();
  });

  proxy.onRequestData((ctx, chunk, callback) => {
    const state = requestCaptures.get(ctx.uuid);
    if (state) appendCapture(state, chunk, currentOptions.maxBodySize);
    callback(null, chunk);
  });

  proxy.onRequestEnd((ctx, callback) => {
    const record = getRecord(ctx);
    const state = requestCaptures.get(ctx.uuid);
    if (record && state) {
      record.requestSize = state.totalBytes;
      record.requestBody = capturePreview(state, ctx.clientToProxyRequest.headers, currentOptions.captureBodies);
    }
    callback();
  });

  proxy.onResponse((ctx, callback) => {
    const record = getRecord(ctx);
    if (record && ctx.serverToProxyResponse) {
      record.statusCode = ctx.serverToProxyResponse.statusCode ?? null;
      record.responseHeaders = normalizeHeaders(ctx.serverToProxyResponse.headers);
    }
    callback();
  });

  proxy.onResponseData((ctx, chunk, callback) => {
    const state = responseCaptures.get(ctx.uuid);
    if (state) appendCapture(state, chunk, currentOptions.maxBodySize);
    callback(null, chunk);
  });

  proxy.onResponseEnd((ctx, callback) => {
    const record = getRecord(ctx);
    const state = responseCaptures.get(ctx.uuid);
    if (record && state) {
      record.status = "success";
      record.durationMs = Date.now() - record.startedAt;
      record.responseSize = state.totalBytes;
      record.responseBody = capturePreview(state, ctx.serverToProxyResponse?.headers || {}, currentOptions.captureBodies);
    }
    requestCaptures.delete(ctx.uuid);
    responseCaptures.delete(ctx.uuid);
    callback();
  });
}

export async function startCaptureProxy(options: CaptureProxyStartOptions): Promise<CaptureProxyStatus> {
  if (proxyServer) await stopCaptureProxy();
  await prepareCertificateCache();
  currentOptions = options;
  lastError = "";

  const proxy = new Proxy();
  registerHandlers(proxy);
  proxyServer = proxy;

  await new Promise<void>((resolve, reject) => {
    proxy.listen(
      {
        port: options.port,
        host: options.host,
        sslCaDir: captureCaDir(),
        forceSNI: options.enableHttps,
        forceChunkedRequest: false
      },
      (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      }
    );
  });

  startedAt = Date.now();
  return status();
}

export async function stopCaptureProxy(): Promise<CaptureProxyStatus> {
  if (!proxyServer) return status();
  const proxy = proxyServer;
  proxyServer = null;
  requestCaptures.clear();
  responseCaptures.clear();
  proxy.close();
  startedAt = null;
  return status();
}

export function getCaptureProxyStatus(): CaptureProxyStatus {
  return status();
}

export function listCaptureProxyRecords(): CaptureProxyRecord[] {
  return records.map((record) => ({ ...record }));
}

export function clearCaptureProxyRecords(): CaptureProxyRecord[] {
  records.length = 0;
  return [];
}

export async function testCaptureProxy(): Promise<CaptureProxyRecord> {
  if (!proxyServer) throw new Error("请先启动抓包代理");

  const target = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: true, method: request.method, url: request.url }));
  });

  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const targetAddress = target.address();
  const targetPort = typeof targetAddress === "object" && targetAddress ? targetAddress.port : 0;
  const proxyHost = currentOptions.host === "0.0.0.0" ? "127.0.0.1" : currentOptions.host;
  const targetUrl = `http://127.0.0.1:${targetPort}/dev-toolbox-capture-self-test`;

  try {
    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        {
          host: proxyHost,
          port: currentOptions.port,
          method: "GET",
          path: targetUrl,
          timeout: 5000
        },
        (response) => {
          response.resume();
          response.on("end", resolve);
        }
      );
      request.on("timeout", () => {
        request.destroy(new Error("抓包代理自检超时"));
      });
      request.on("error", reject);
      request.end();
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    const record = records.find((item) => item.url === targetUrl);
    if (!record) throw new Error("自检请求已发送，但请求列表未生成记录");
    return { ...record };
  } finally {
    target.close();
  }
}