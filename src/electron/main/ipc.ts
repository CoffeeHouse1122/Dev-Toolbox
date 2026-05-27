import { app, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import { createHistoryService } from "./services/history.service";
import { applyWatermark, compressImages, createFaviconPackage, convertImages, cropImage, resizeImages } from "./services/image.service";
import { convertFontsToWoff2 } from "./services/font.service";
import { subsetFont } from "./services/font-tools.service";
import { analyzeVideoLoop, compressVideos, convertVideoAnimation, createVideoBackgroundPack, getMediaInfo, removeVideoAudio } from "./services/video.service";
import { compressAudio, convertAudio } from "./services/audio.service";
import { minifyCode } from "./services/code-minify.service";
import { convertSequenceAnimation } from "./services/sequence.service";
import { base64ToImage, exportMarkdown, imageToBase64, renameFiles } from "./services/utility.service";
import { generateQrCode } from "./services/qr.service";
import { getIpInfo, lookupDomainIp } from "./services/network.service";
import { scanCertificates } from "./services/certificate.service";
import {
  clearCaptureProxyRecords,
  getCaptureProxyStatus,
  listCaptureProxyRecords,
  startCaptureProxy,
  stopCaptureProxy,
  testCaptureProxy
} from "./services/capture-proxy.service";
import { generateAssetManifest } from "./services/asset-manifest.service";
import { generateSprite } from "./services/sprite.service";
import { generateSeoFiles } from "./services/seo-files.service";
import { generateImagePlaceholders } from "./services/placeholder.service";
import { generateOgImage } from "./services/og-image.service";
import { registerClipboardIpc } from "./services/clipboard-history.service";
import { getSharedDiskStatus } from "./services/shared-disk-status.service";
import { loadAppSettings, saveAppSettings } from "./services/settings.service";
import { getAppDiagnostics } from "./services/diagnostics.service";
import { loadToolConfig, saveToolConfig } from "./services/json-config.service";
import {
  archiveStickyNote,
  applyStickyNotePreset,
  createStickyNote,
  deleteStickyNote,
  emptyStickyNotesTrash,
  exportStickyNotes,
  importStickyNotes,
  loadStickyNotes,
  restoreStickyNote,
  saveStickyNote,
  saveStickyNotesPreferences,
  setStickyNotePinned,
  setStickyNotesDirectory
} from "./services/sticky-notes.service";
import type { AppSettings } from "../../shared/types";
import {
  ensureDir,
  safeBaseName,
  writeTextFile as writePlainTextFile
} from "./services/file-utils";
import fs from "node:fs/promises";
import path from "node:path";
import {
  connectSharedDisk,
  disconnectSharedDisk,
  loadSharedDiskConfig,
  openSharedDiskDirectory,
  saveSharedDiskConfig
} from "./services/shared-disk.service";
import type {
  OpenDirectoryResult,
  DialogFileFilter,
  AssetManifestOptions,
  AudioCompressOptions,
  AudioConvertOptions,
  CertificateScanOptions,
  CaptureProxyStartOptions,
  FaviconOptions,
  FontSubsetOptions,
  FontWoff2Options,
  ImageCompressOptions,
  ImageCropOptions,
  ImagePlaceholderOptions,
  ImageResizeOptions,
  WatermarkOptions,
  MarkdownExportOptions,
  OgImageOptions,
  QrCodeOptions,
  RenameOptions,
  SeoFilesOptions,
  SequenceAnimationOptions,
  SharedDiskConfig,
  StickyNoteExportOptions,
  StickyNoteStyle,
  StickyNotesPreferences,
  SpriteOptions,
  CodeMinifyOptions,
  VideoBackgroundOptions,
  VideoAnimationOptions,
  VideoCompressOptions,
  VideoLoopAnalyzeOptions,
  VideoMuteOptions,
  WebpOptions
} from "../../shared/types";

const faviconSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  sizes: z.array(z.number().int().min(16).max(512)).min(1),
  includePng: z.boolean(),
  includeManifest: z.boolean()
});

const webpSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["webp", "png", "jpeg", "avif"]),
  quality: z.number().int().min(1).max(100),
  lossless: z.boolean(),
  keepMetadata: z.boolean(),
  maxWidth: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional()
});

const imageCompressSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  quality: z.number().int().min(1).max(100),
  keepMetadata: z.boolean(),
  keepOriginalName: z.boolean()
});

const imageResizeSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  mode: z.enum(["size", "scale"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  scale: z.number().positive().optional()
});

const imageCropSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  outputFormat: z.enum(["webp", "png", "jpeg", "avif"]),
  quality: z.number().int().min(1).max(100)
});

const LOCAL_OPEN_LOCK_MS = 4000;
let localOpenLocked = false;
let localOpenReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let releaseOnWindowFocus: (() => void) | null = null;

function releaseLocalOpenLock() {
  localOpenLocked = false;
  if (localOpenReleaseTimer) {
    clearTimeout(localOpenReleaseTimer);
    localOpenReleaseTimer = null;
  }
  if (releaseOnWindowFocus) {
    app.off("browser-window-focus", releaseOnWindowFocus);
    releaseOnWindowFocus = null;
  }
}

function acquireLocalOpenLock(autoRelease = true) {
  if (localOpenLocked) return false;
  localOpenLocked = true;
  if (autoRelease) {
    releaseOnWindowFocus = () => {
      releaseLocalOpenLock();
    };
    app.once("browser-window-focus", releaseOnWindowFocus);
    localOpenReleaseTimer = setTimeout(() => {
      releaseLocalOpenLock();
    }, LOCAL_OPEN_LOCK_MS);
  }
  return true;
}

async function runWithLocalOpenLock<T>(fallback: T, action: () => Promise<T>) {
  if (!acquireLocalOpenLock(false)) return fallback;
  try {
    return await action();
  } finally {
    releaseLocalOpenLock();
  }
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function openDirectory(targetPath: string): Promise<OpenDirectoryResult> {
  const normalizedPath = path.normalize(targetPath);
  if (!(await pathExists(normalizedPath))) {
    return { status: "missing", path: normalizedPath, message: "目标文件夹不存在。" };
  }
  if (!acquireLocalOpenLock()) {
    return { status: "blocked", path: normalizedPath, message: "本地文件夹正在打开，请稍后再试。" };
  }
  const errorMessage = await shell.openPath(normalizedPath);
  if (errorMessage) {
    releaseLocalOpenLock();
    return { status: "missing", path: normalizedPath, message: errorMessage };
  }
  return { status: "opened", path: normalizedPath };
}

const watermarkSchema = z
  .object({
    inputPaths: z.array(z.string().min(1)).min(1),
    outputDir: z.string().min(1),
    text: z.string(),
    patternPath: z.string().min(1).optional(),
    position: z.enum(["tile", "bottom-right", "center", "top-left", "top-right", "bottom-left"]),
    outputFormat: z.enum(["same", "webp", "png", "jpeg", "avif"]),
    opacity: z.number().int().min(1).max(100),
    rotation: z.number().int().min(-90).max(90),
    scale: z.number().int().min(12).max(160),
    gap: z.number().int().min(80).max(720),
    margin: z.number().int().min(0).max(512),
    quality: z.number().int().min(1).max(100),
    keepMetadata: z.boolean()
  })
  .refine((value) => value.text.trim().length > 0 || Boolean(value.patternPath), {
    message: "请填写水印文案，或选择一个图案文件。",
    path: ["text"]
  });

const fontSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  generateCss: z.boolean(),
  fontFamily: z.string().optional()
});

const fontSubsetSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  text: z.string().min(1),
  outputFormat: z.enum(["ttf", "woff2"]),
  fontFamily: z.string().optional(),
  generateCss: z.boolean()
});

const videoSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  mode: z.enum(["background-pack", "mp4", "webm", "hls"]),
  width: z.number().int().positive().optional(),
  crf: z.number().int().min(12).max(40),
  makePoster: z.boolean()
});

const sequenceAnimationSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["gif", "apng", "webp"]),
  fps: z.number().int().min(1).max(60),
  width: z.number().int().positive().optional(),
  loop: z.boolean()
});

const videoAnimationSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["gif", "webp"]),
  width: z.number().int().positive().optional(),
  fps: z.number().int().min(1).max(60),
  startSeconds: z.number().min(0).optional(),
  durationSeconds: z.number().positive().optional()
});

const videoMuteSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1)
});

const videoCompressSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  crf: z.number().int().min(12).max(36),
  width: z.number().int().positive().optional(),
  preset: z.enum(["slow", "medium", "fast"]),
  keepAudio: z.boolean(),
  audioBitrate: z.string().optional()
});

const videoLoopAnalyzeSchema = z.object({
  inputPath: z.string().min(1),
  edgeSeconds: z.number().min(0.02).max(2)
});

const audioConvertSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["mp3", "wav", "aac", "ogg", "flac", "m4a"]),
  bitrate: z.string().optional(),
  sampleRate: z.number().int().positive().optional()
});

const audioCompressSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["mp3", "aac", "ogg", "m4a"]),
  bitrate: z.string().min(2),
  sampleRate: z.number().int().positive().optional()
});

const codeMinifySchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  removeConsole: z.boolean(),
  beautify: z.boolean(),
  target: z.enum(["defaults", "legacy"])
});

const markdownExportSchema = z.object({
  markdown: z.string(),
  outputDir: z.string().min(1),
  baseName: z.string().min(1),
  formats: z.array(z.enum(["html", "png", "pdf"])).min(1)
});

const renameSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  pattern: z.string().min(1),
  start: z.number().int().min(0),
  replaceFrom: z.string().optional(),
  replaceTo: z.string().optional()
});

const qrCodeSchema = z.object({
  text: z.string().min(1),
  outputDir: z.string().min(1),
  fileName: z.string().min(1),
  format: z.enum(["png", "svg"]),
  size: z.number().int().min(128).max(2048),
  margin: z.number().int().min(0).max(12),
  darkColor: z.string().min(4),
  lightColor: z.string().min(4)
});

const assetManifestSchema = z.object({
  sourceDir: z.string().min(1),
  outputDir: z.string().min(1),
  baseName: z.string().min(1),
  includeHash: z.boolean()
});

const spriteSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  spriteName: z.string().min(1),
  classPrefix: z.string().min(1),
  columns: z.number().int().min(1).max(24),
  padding: z.number().int().min(0).max(256)
});

const seoFilesSchema = z.object({
  outputDir: z.string().min(1),
  siteUrl: z.string().min(1),
  disallow: z.string(),
  pages: z.string(),
  changefreq: z.string().min(1),
  priority: z.string().min(1),
  includeRobots: z.boolean(),
  includeSitemap: z.boolean()
});

const imagePlaceholderSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  tinyWidth: z.number().int().min(8).max(128),
  componentX: z.number().int().min(1).max(9),
  componentY: z.number().int().min(1).max(9)
});

const ogImageSchema = z.object({
  outputDir: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  siteName: z.string(),
  width: z.number().int().min(320).max(2400),
  height: z.number().int().min(240).max(1600),
  backgroundColor: z.string().min(4),
  accentColor: z.string().min(4),
  textColor: z.string().min(4)
});

const certificateScanSchema = z.object({
  domains: z.array(z.string().min(1)).min(1).max(200),
  timeoutMs: z.number().int().min(1000).max(30000).optional()
});

const captureProxyStartSchema = z.object({
  host: z.string().ip({ version: "v4" }),
  port: z.number().int().min(1024).max(65535),
  captureBodies: z.boolean(),
  maxBodySize: z.number().int().min(1024).max(2 * 1024 * 1024),
  enableHttps: z.boolean()
});

const appSettingsSchema = z.object({
  closeBehavior: z.enum(["minimize-to-tray", "exit"]),
  autoLaunch: z.boolean()
});

const toolConfigKeySchema = z.enum(["navigation", "capture-proxy", "output-picker"]);

const sharedDiskSchema = z.object({
  url: z.string().min(1),
  username: z.string(),
  password: z.string(),
  basePath: z.string().min(1),
  defaultDirectory: z.string(),
  persistent: z.boolean()
});

const stickyNoteSaveSchema = z.object({
  id: z.string().min(1),
  content: z.string()
});

const stickyNoteStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().min(10).max(48),
  lineHeight: z.number().min(1).max(2.4),
  padding: z.number().min(8).max(64),
  color: z.string().optional(),
  backgroundColor: z.string().optional()
});

const stickyNoteExportSchema = z.object({
  outputDir: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(),
  format: z.enum(["json", "txt", "zip"]).default("txt"),
  includeArchived: z.boolean().optional(),
  includeTrash: z.boolean().optional()
});

export function registerIpc() {
  const history = createHistoryService();
  registerClipboardIpc();

  ipcMain.handle(
    "dialog:select-files",
    async (_event, filters?: DialogFileFilter[], multiSelections = true): Promise<string[]> => {
      return runWithLocalOpenLock([], async () => {
        const result = await dialog.showOpenDialog({
          properties: multiSelections ? ["openFile", "multiSelections"] : ["openFile"],
          filters
        });

        return result.canceled ? [] : result.filePaths;
      });
    }
  );

  ipcMain.handle("dialog:select-output-dir", async (_event, defaultPath?: string): Promise<string | null> => {
    return runWithLocalOpenLock(null, async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        defaultPath: defaultPath || undefined
      });

      return result.canceled ? null : result.filePaths[0] ?? null;
    });
  });

  ipcMain.handle("file:path-exists", async (_event, targetPath: string) => pathExists(z.string().min(1).parse(targetPath)));

  ipcMain.handle("convert:favicon", async (_event, raw: FaviconOptions) => {
    const options = faviconSchema.parse(raw);
    return createFaviconPackage(options, history);
  });

  ipcMain.handle("convert:webp", async (_event, raw: WebpOptions) => {
    const options = webpSchema.parse(raw);
    return convertImages(options, history);
  });

  ipcMain.handle("convert:image-compress", async (_event, raw: ImageCompressOptions) => {
    const options = imageCompressSchema.parse(raw);
    return compressImages(options, history);
  });

  ipcMain.handle("convert:image-resize", async (_event, raw: ImageResizeOptions) => {
    const options = imageResizeSchema.parse(raw);
    return resizeImages(options, history);
  });

  ipcMain.handle("convert:image-crop", async (_event, raw: ImageCropOptions) => {
    const options = imageCropSchema.parse(raw);
    return cropImage(options, history);
  });

  ipcMain.handle("convert:watermark", async (_event, raw: WatermarkOptions) => {
    const options = watermarkSchema.parse(raw);
    return applyWatermark(options, history);
  });

  ipcMain.handle("convert:font-woff2", async (_event, raw: FontWoff2Options) => {
    const options = fontSchema.parse(raw);
    return convertFontsToWoff2(options, history);
  });

  ipcMain.handle("convert:font-subset", async (_event, raw: FontSubsetOptions) => {
    const options = fontSubsetSchema.parse(raw);
    return subsetFont(options, history);
  });

  ipcMain.handle("convert:video-background", async (_event, raw: VideoBackgroundOptions) => {
    const options = videoSchema.parse(raw);
    return createVideoBackgroundPack(options, history);
  });

  ipcMain.handle("convert:sequence-animation", async (_event, raw: SequenceAnimationOptions) => {
    const options = sequenceAnimationSchema.parse(raw);
    return convertSequenceAnimation(options, history);
  });

  ipcMain.handle("convert:video-animation", async (_event, raw: VideoAnimationOptions) => {
    const options = videoAnimationSchema.parse(raw);
    return convertVideoAnimation(options, history);
  });

  ipcMain.handle("convert:video-mute", async (_event, raw: VideoMuteOptions) => {
    const options = videoMuteSchema.parse(raw);
    return removeVideoAudio(options, history);
  });

  ipcMain.handle("convert:video-compress", async (_event, raw: VideoCompressOptions) => {
    const options = videoCompressSchema.parse(raw);
    return compressVideos(options, history);
  });

  ipcMain.handle("media:video-loop", async (_event, raw: VideoLoopAnalyzeOptions) => {
    const options = videoLoopAnalyzeSchema.parse(raw);
    return analyzeVideoLoop(options, history);
  });

  ipcMain.handle("media:info", async (_event, inputPath: string) => {
    return getMediaInfo(z.string().min(1).parse(inputPath));
  });

  ipcMain.handle("convert:audio", async (_event, raw: AudioConvertOptions) => {
    const options = audioConvertSchema.parse(raw);
    return convertAudio(options, history);
  });

  ipcMain.handle("convert:audio-compress", async (_event, raw: AudioCompressOptions) => {
    const options = audioCompressSchema.parse(raw);
    return compressAudio(options, history);
  });

  ipcMain.handle("convert:code-minify", async (_event, raw: CodeMinifyOptions) => {
    const options = codeMinifySchema.parse(raw);
    return minifyCode(options, history);
  });

  ipcMain.handle("convert:markdown-export", async (_event, raw: MarkdownExportOptions) => {
    const options = markdownExportSchema.parse(raw);
    return exportMarkdown(options, history);
  });

  ipcMain.handle("files:rename", async (_event, raw: RenameOptions) => {
    const options = renameSchema.parse(raw);
    return renameFiles(options, history);
  });

  ipcMain.handle("qr:generate", async (_event, raw: QrCodeOptions) => {
    const options = qrCodeSchema.parse(raw);
    return generateQrCode(options, history);
  });

  ipcMain.handle("network:ip-info", async () => {
    return getIpInfo();
  });

  ipcMain.handle("network:domain-ip", async (_event, domain: string) => {
    return lookupDomainIp(z.string().min(1).parse(domain));
  });

  ipcMain.handle("network:certificate-scan", async (_event, raw: CertificateScanOptions) => {
    const options = certificateScanSchema.parse(raw);
    return scanCertificates(options);
  });

  ipcMain.handle("capture-proxy:start", async (_event, raw: CaptureProxyStartOptions) => {
    const options = captureProxyStartSchema.parse(raw);
    return startCaptureProxy(options);
  });

  ipcMain.handle("capture-proxy:stop", async () => stopCaptureProxy());
  ipcMain.handle("capture-proxy:status", async () => getCaptureProxyStatus());
  ipcMain.handle("capture-proxy:list", async () => listCaptureProxyRecords());
  ipcMain.handle("capture-proxy:clear", async () => clearCaptureProxyRecords());
  ipcMain.handle("capture-proxy:test", async () => testCaptureProxy());

  ipcMain.handle("assets:manifest", async (_event, raw: AssetManifestOptions) => {
    const options = assetManifestSchema.parse(raw);
    return generateAssetManifest(options, history);
  });

  ipcMain.handle("assets:sprite", async (_event, raw: SpriteOptions) => {
    const options = spriteSchema.parse(raw);
    return generateSprite(options, history);
  });

  ipcMain.handle("assets:image-placeholder", async (_event, raw: ImagePlaceholderOptions) => {
    const options = imagePlaceholderSchema.parse(raw);
    return generateImagePlaceholders(options, history);
  });

  ipcMain.handle("seo:files", async (_event, raw: SeoFilesOptions) => {
    const options = seoFilesSchema.parse(raw);
    return generateSeoFiles(options, history);
  });

  ipcMain.handle("seo:og-image", async (_event, raw: OgImageOptions) => {
    const options = ogImageSchema.parse(raw);
    return generateOgImage(options, history);
  });

  ipcMain.handle("base64:image-to-base64", async (_event, inputPath: string) => {
    return imageToBase64(inputPath);
  });

  ipcMain.handle("base64:base64-to-image", async (_event, data: string, outputDir: string, fileName: string) => {
    return base64ToImage(data, outputDir, fileName);
  });

  ipcMain.handle("shared-disk:load", async () => {
    return loadSharedDiskConfig();
  });

  ipcMain.handle("shared-disk:save", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    return saveSharedDiskConfig(options);
  });

  ipcMain.handle("shared-disk:connect", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    return connectSharedDisk(options);
  });

  ipcMain.handle("shared-disk:disconnect", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    return disconnectSharedDisk(options);
  });

  ipcMain.handle("shared-disk:status", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    return getSharedDiskStatus(options);
  });

  ipcMain.handle("shared-disk:open", async (_event, targetPath: string) => {
    return openSharedDiskDirectory(targetPath);
  });

  ipcMain.handle("settings:load", async () => loadAppSettings());
  ipcMain.handle("settings:save", async (_event, raw: AppSettings) => saveAppSettings(appSettingsSchema.parse(raw)));
  ipcMain.handle("diagnostics:get", async () => getAppDiagnostics());
  ipcMain.handle("config:load", async (_event, key: string) => loadToolConfig(toolConfigKeySchema.parse(key)));
  ipcMain.handle("config:save", async (_event, key: string, value: unknown) => saveToolConfig(toolConfigKeySchema.parse(key), value));

  ipcMain.handle("notes:load", async () => loadStickyNotes());

  ipcMain.handle("notes:set-directory", async (_event, directory: string) => {
    return setStickyNotesDirectory(z.string().min(1).parse(directory));
  });

  ipcMain.handle("notes:create", async (_event, content?: string) => createStickyNote(content));

  ipcMain.handle("notes:save", async (_event, raw: { id: string; content: string }) => {
    const payload = stickyNoteSaveSchema.parse(raw);
    return saveStickyNote(payload.id, payload.content);
  });

  ipcMain.handle("notes:pin", async (_event, raw: { id: string; pinned: boolean }) => {
    const payload = z.object({ id: z.string().min(1), pinned: z.boolean() }).parse(raw);
    return setStickyNotePinned(payload.id, payload.pinned);
  });

  ipcMain.handle("notes:archive", async (_event, raw: { id: string; archived: boolean }) => {
    const payload = z.object({ id: z.string().min(1), archived: z.boolean() }).parse(raw);
    return archiveStickyNote(payload.id, payload.archived);
  });

  ipcMain.handle("notes:delete", async (_event, id: string) => {
    await deleteStickyNote(z.string().min(1).parse(id));
  });

  ipcMain.handle("notes:restore", async (_event, id: string) => {
    return restoreStickyNote(z.string().min(1).parse(id));
  });

  ipcMain.handle("notes:empty-trash", async () => {
    return emptyStickyNotesTrash();
  });

  ipcMain.handle("notes:preferences", async (_event, raw: StickyNotesPreferences) => {
    return saveStickyNotesPreferences(stickyNoteStyleSchema.parse(raw));
  });

  ipcMain.handle("notes:apply-preset", async (_event, raw: { id: string | null; scope: "current" | "all"; style: StickyNoteStyle }) => {
    const payload = z.object({ id: z.string().min(1).nullable(), scope: z.enum(["current", "all"]), style: stickyNoteStyleSchema }).parse(raw);
    return applyStickyNotePreset(payload.id, payload.scope, payload.style);
  });

  ipcMain.handle("notes:import", async (_event, inputPaths: string[]) => {
    return importStickyNotes(z.array(z.string().min(1)).min(1).parse(inputPaths));
  });

  ipcMain.handle("notes:export", async (_event, raw: StickyNoteExportOptions | string) => {
    const payload = typeof raw === "string" ? { outputDir: raw, format: "txt" as const } : stickyNoteExportSchema.parse(raw);
    return exportStickyNotes(payload);
  });

  ipcMain.handle("history:list", async (_event, limit?: number) => {
    return history.list(limit);
  });

  ipcMain.handle("history:clear", async () => {
    await history.clear();
  });

  ipcMain.handle("shell:reveal-path", async (_event, filePath: string) => {
    const normalizedPath = path.normalize(filePath);
    if (!(await pathExists(normalizedPath))) return;
    if (!acquireLocalOpenLock()) return;
    shell.showItemInFolder(normalizedPath);
  });

  ipcMain.handle("shell:open-directory", async (_event, targetPath: string) => {
    return openDirectory(z.string().min(1).parse(targetPath));
  });

  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("file:read-text", async (_event, filePath: string) => {
    return fs.readFile(filePath, "utf8");
  });

  ipcMain.handle("file:write-text", async (_event, outputDir: string, fileName: string, content: string) => {
    await ensureDir(outputDir);
    const output = path.join(outputDir, safeBaseName(fileName) || "dev-toolbox-config.json");
    await writePlainTextFile(output, content);
    return output;
  });
}
