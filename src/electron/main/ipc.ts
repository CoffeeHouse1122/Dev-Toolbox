import { app, dialog, shell } from "electron";
import { z } from "zod";
import { createHistoryService } from "./services/history.service";
import { openHistoryOutput } from "./services/history-output.service";
import { checkOutputDirectory } from "./services/output-directory.service";
import { applyWatermark, compressImages, createFaviconPackage, convertImages, cropImage, resizeImages } from "./services/image.service";
import { processSvgFiles } from "./services/svg.service";
import { generatePwaIconPackages } from "./services/pwa-icon.service";
import { convertFontsToWoff2 } from "./services/font.service";
import { subsetFont } from "./services/font-tools.service";
import { compressVideos, convertVideoAnimation, createVideoBackgroundPack, getMediaInfo, removeVideoAudio } from "./services/video.service";
import { compressAudio, convertAudio } from "./services/audio.service";
import { minifyCode } from "./services/code-minify.service";
import { convertSequenceAnimation } from "./services/sequence.service";
import { base64ToImage, exportMarkdown, imageToBase64, renameFiles } from "./services/utility.service";
import { generateQrCode } from "./services/qr.service";
import { getIpInfo, lookupDomainIp } from "./services/network.service";
import { scanCertificates } from "./services/certificate.service";
import { generateAssetManifest } from "./services/asset-manifest.service";
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
import { readDecodedTextFile } from "./services/text-encoding";
import {
  assertAuthorizedPath,
  assertSharedDiskTarget,
  authorizeDroppedPaths,
  authorizeUserSelectedPaths,
  getSharedDiskBaseRoot,
  getSharedDiskShareRoot,
  handleTrustedIpc,
  isAuthorizedPath,
  onTrustedIpc,
  validateExternalUrl
} from "./utils/ipc-security";
import {
  connectSharedDisk,
  disconnectSharedDisk,
  forgetSharedDiskCredentials,
  loadSharedDiskConfig,
  openSharedDiskDirectory,
  openExistingSharedDiskDirectory,
  saveSharedDiskConfig
} from "./services/shared-disk.service";
import type {
  OpenDirectoryResult,
  DialogFileFilter,
  AssetManifestOptions,
  AudioCompressOptions,
  AudioConvertOptions,
  CertificateScanOptions,
  FaviconOptions,
  SvgToolboxOptions,
  PwaIconPackageOptions,
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
  CodeMinifyOptions,
  VideoBackgroundOptions,
  VideoAnimationOptions,
  VideoCompressOptions,
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

const svgToolboxSchema = z.object({
  inputPaths: z.array(z.string().min(1).regex(/\.svg$/i, "只支持 SVG 文件")).min(1).max(100),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["svg", "png", "webp"]),
  precision: z.number().int().min(0).max(6),
  removeDimensions: z.boolean(),
  cleanupIds: z.boolean(),
  width: z.number().int().min(1).max(8_192).optional(),
  height: z.number().int().min(1).max(8_192).optional(),
  quality: z.number().int().min(1).max(100).optional()
}).strict();

const pwaIconPackageSchema = z.object({
  inputPaths: z.array(z.string().min(1).regex(/\.(?:png|jpe?g|webp|svg)$/i, "不支持的图片格式")).min(1).max(100),
  outputDir: z.string().min(1),
  appName: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(24),
  themeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  maskablePadding: z.number().min(0.1).max(0.4)
}).strict();

const localPathSchema = z.string().min(1).max(32_768);
const outputDirectoryPathSchema = localPathSchema.refine(value => path.isAbsolute(value) && !value.includes("\0"), "输出目录必须是有效的绝对路径。");
const dialogFiltersSchema = z.array(z.object({
  name: z.string().min(1).max(100),
  extensions: z.array(z.string().regex(/^(?:\*|[a-z0-9][a-z0-9+_-]{0,31})$/i)).min(1).max(100)
}).strict()).max(50).optional();

function assertToolPaths(options: {
  inputPath?: string;
  inputPaths?: string[];
  outputDir?: string;
  sourceDir?: string;
  patternPath?: string;
}) {
  if ((options.inputPaths?.length ?? 0) > 10_000) throw new Error("一次最多处理 10000 个输入路径");
  if (options.inputPath) assertAuthorizedPath(options.inputPath);
  for (const inputPath of options.inputPaths ?? []) assertAuthorizedPath(inputPath);
  if (options.outputDir) assertAuthorizedPath(options.outputDir);
  if (options.sourceDir) assertAuthorizedPath(options.sourceDir);
  if (options.patternPath) assertAuthorizedPath(options.patternPath);
}

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
  const checked = await checkOutputDirectory(normalizedPath);
  if (checked.status !== "ready") return { status: checked.status, message: checked.message, path: normalizedPath };
  if (!acquireLocalOpenLock()) {
    return { status: "blocked", path: normalizedPath, message: "本地文件夹正在打开，请稍后再试。" };
  }
  try {
    const errorMessage = await shell.openPath(normalizedPath);
    if (!errorMessage) return { status: "opened", path: normalizedPath };
    releaseLocalOpenLock();
    return { status: "unavailable", path: normalizedPath, message: "无法打开输出目录，请检查系统权限或网络连接。" };
  } catch {
    releaseLocalOpenLock();
    return { status: "unavailable", path: normalizedPath, message: "无法打开输出目录，请稍后重试。" };
  }
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
  replaceTo: z.string().optional(),
  dryRun: z.boolean().optional()
});

const base64ImageSchema = z.object({
  data: z.string().min(1).max(70 * 1024 * 1024),
  outputDir: z.string().min(1).max(32_768),
  fileName: z.string().max(255)
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

const appSettingsSchema = z.object({
  closeBehavior: z.enum(["minimize-to-tray", "exit"]),
  autoLaunch: z.boolean()
});

const toolConfigKeySchema = z.enum(["navigation", "output-picker"]);

const sharedDiskSchema = z.object({
  sharePath: z.string().min(1).max(2_048),
  authMode: z.enum(["windows", "account"]),
  username: z.string().max(512).refine((value) => !value.includes("\0")),
  password: z.string().max(4096).refine((value) => !value.includes("\0")),
  defaultDirectory: z.string().max(32_768),
  rememberCredentials: z.boolean()
});
const sharedDiskTargetSchema = z.object({ sharePath: z.string().min(1).max(2_048) }).strict();

function assertSharedDiskConfig(config: SharedDiskConfig) {
  getSharedDiskShareRoot(config);
  getSharedDiskBaseRoot(config);
  if (config.defaultDirectory) assertSharedDiskTarget(config, config.defaultDirectory);
}

const stickyNoteSaveSchema = z.object({
  id: z.string().min(1).max(200),
  content: z.string().max(8 * 1024 * 1024)
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

  onTrustedIpc("paths:authorize-dropped", (event, raw: unknown) => {
    const paths = z.array(localPathSchema).max(2_048).parse(raw);
    authorizeDroppedPaths(paths);
    event.returnValue = true;
  });

  handleTrustedIpc(
    "dialog:select-files",
    async (_event, rawFilters?: DialogFileFilter[], rawMultiSelections: unknown = true): Promise<string[]> => {
      const filters = dialogFiltersSchema.parse(rawFilters);
      const multiSelections = z.boolean().parse(rawMultiSelections);
      return runWithLocalOpenLock([], async () => {
        const result = await dialog.showOpenDialog({
          properties: multiSelections ? ["openFile", "multiSelections"] : ["openFile"],
          filters
        });

        if (result.canceled) return [];
        authorizeUserSelectedPaths(result.filePaths);
        return result.filePaths;
      });
    }
  );

  handleTrustedIpc("dialog:select-output-dir", async (_event, rawDefaultPath?: unknown): Promise<string | null> => {
    const defaultPath = rawDefaultPath === undefined ? undefined : outputDirectoryPathSchema.parse(rawDefaultPath);
    return runWithLocalOpenLock(null, async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        // This only positions the user-controlled chooser; grants follow confirmation.
        defaultPath
      });

      if (result.canceled || !result.filePaths[0]) return null;
      authorizeUserSelectedPaths([result.filePaths[0]], true);
      return result.filePaths[0];
    });
  });

  handleTrustedIpc("file:path-exists", async (_event, targetPath: unknown) => {
    const selectedPath = localPathSchema.parse(targetPath);
    return isAuthorizedPath(selectedPath) && pathExists(selectedPath);
  });

  handleTrustedIpc("file:check-output-directory", async (_event, targetPath: unknown) =>
    checkOutputDirectory(outputDirectoryPathSchema.parse(targetPath))
  );

  handleTrustedIpc("convert:favicon", async (_event, raw: FaviconOptions) => {
    const options = faviconSchema.parse(raw);
    assertToolPaths(options);
    return createFaviconPackage(options, history);
  });

  handleTrustedIpc("convert:svg-toolbox", async (_event, raw: SvgToolboxOptions) => {
    const options = svgToolboxSchema.parse(raw);
    assertToolPaths(options);
    return processSvgFiles(options, history);
  });

  handleTrustedIpc("convert:pwa-icons", async (_event, raw: PwaIconPackageOptions) => {
    const options = pwaIconPackageSchema.parse(raw);
    assertToolPaths(options);
    return generatePwaIconPackages(options, history);
  });

  handleTrustedIpc("convert:webp", async (_event, raw: WebpOptions) => {
    const options = webpSchema.parse(raw);
    assertToolPaths(options);
    return convertImages(options, history);
  });

  handleTrustedIpc("convert:image-compress", async (_event, raw: ImageCompressOptions) => {
    const options = imageCompressSchema.parse(raw);
    assertToolPaths(options);
    return compressImages(options, history);
  });

  handleTrustedIpc("convert:image-resize", async (_event, raw: ImageResizeOptions) => {
    const options = imageResizeSchema.parse(raw);
    assertToolPaths(options);
    return resizeImages(options, history);
  });

  handleTrustedIpc("convert:image-crop", async (_event, raw: ImageCropOptions) => {
    const options = imageCropSchema.parse(raw);
    assertToolPaths(options);
    return cropImage(options, history);
  });

  handleTrustedIpc("convert:watermark", async (_event, raw: WatermarkOptions) => {
    const options = watermarkSchema.parse(raw);
    assertToolPaths(options);
    return applyWatermark(options, history);
  });

  handleTrustedIpc("convert:font-woff2", async (_event, raw: FontWoff2Options) => {
    const options = fontSchema.parse(raw);
    assertToolPaths(options);
    return convertFontsToWoff2(options, history);
  });

  handleTrustedIpc("convert:font-subset", async (_event, raw: FontSubsetOptions) => {
    const options = fontSubsetSchema.parse(raw);
    assertToolPaths(options);
    return subsetFont(options, history);
  });

  handleTrustedIpc("convert:video-background", async (_event, raw: VideoBackgroundOptions) => {
    const options = videoSchema.parse(raw);
    assertToolPaths(options);
    return createVideoBackgroundPack(options, history);
  });

  handleTrustedIpc("convert:sequence-animation", async (_event, raw: SequenceAnimationOptions) => {
    const options = sequenceAnimationSchema.parse(raw);
    assertToolPaths(options);
    return convertSequenceAnimation(options, history);
  });

  handleTrustedIpc("convert:video-animation", async (_event, raw: VideoAnimationOptions) => {
    const options = videoAnimationSchema.parse(raw);
    assertToolPaths(options);
    return convertVideoAnimation(options, history);
  });

  handleTrustedIpc("convert:video-mute", async (_event, raw: VideoMuteOptions) => {
    const options = videoMuteSchema.parse(raw);
    assertToolPaths(options);
    return removeVideoAudio(options, history);
  });

  handleTrustedIpc("convert:video-compress", async (_event, raw: VideoCompressOptions) => {
    const options = videoCompressSchema.parse(raw);
    assertToolPaths(options);
    return compressVideos(options, history);
  });

  handleTrustedIpc("media:info", async (_event, inputPath: string) => {
    const selectedPath = localPathSchema.parse(inputPath);
    assertAuthorizedPath(selectedPath);
    return getMediaInfo(selectedPath);
  });

  handleTrustedIpc("convert:audio", async (_event, raw: AudioConvertOptions) => {
    const options = audioConvertSchema.parse(raw);
    assertToolPaths(options);
    return convertAudio(options, history);
  });

  handleTrustedIpc("convert:audio-compress", async (_event, raw: AudioCompressOptions) => {
    const options = audioCompressSchema.parse(raw);
    assertToolPaths(options);
    return compressAudio(options, history);
  });

  handleTrustedIpc("convert:code-minify", async (_event, raw: CodeMinifyOptions) => {
    const options = codeMinifySchema.parse(raw);
    assertToolPaths(options);
    return minifyCode(options, history);
  });

  handleTrustedIpc("convert:markdown-export", async (_event, raw: MarkdownExportOptions) => {
    const options = markdownExportSchema.parse(raw);
    assertToolPaths(options);
    return exportMarkdown(options, history);
  });

  handleTrustedIpc("files:rename", async (_event, raw: RenameOptions) => {
    const options = renameSchema.parse(raw);
    assertToolPaths(options);
    return renameFiles(options, history);
  });

  handleTrustedIpc("qr:generate", async (_event, raw: QrCodeOptions) => {
    const options = qrCodeSchema.parse(raw);
    assertToolPaths(options);
    return generateQrCode(options, history);
  });

  handleTrustedIpc("network:ip-info", async () => {
    return getIpInfo();
  });

  handleTrustedIpc("network:domain-ip", async (_event, domain: string) => {
    return lookupDomainIp(z.string().min(1).parse(domain));
  });

  handleTrustedIpc("network:certificate-scan", async (_event, raw: CertificateScanOptions) => {
    const options = certificateScanSchema.parse(raw);
    return scanCertificates(options);
  });

  handleTrustedIpc("assets:manifest", async (_event, raw: AssetManifestOptions) => {
    const options = assetManifestSchema.parse(raw);
    assertToolPaths(options);
    return generateAssetManifest(options, history);
  });

  handleTrustedIpc("assets:image-placeholder", async (_event, raw: ImagePlaceholderOptions) => {
    const options = imagePlaceholderSchema.parse(raw);
    assertToolPaths(options);
    return generateImagePlaceholders(options, history);
  });

  handleTrustedIpc("seo:files", async (_event, raw: SeoFilesOptions) => {
    const options = seoFilesSchema.parse(raw);
    assertToolPaths(options);
    return generateSeoFiles(options, history);
  });

  handleTrustedIpc("seo:og-image", async (_event, raw: OgImageOptions) => {
    const options = ogImageSchema.parse(raw);
    assertToolPaths(options);
    return generateOgImage(options, history);
  });

  handleTrustedIpc("base64:image-to-base64", async (_event, inputPath: string) => {
    const selectedPath = localPathSchema.parse(inputPath);
    assertAuthorizedPath(selectedPath);
    return imageToBase64(selectedPath);
  });

  handleTrustedIpc("base64:base64-to-image", async (_event, data: string, outputDir: string, fileName: string) => {
    const options = base64ImageSchema.parse({ data, outputDir, fileName });
    assertToolPaths(options);
    return base64ToImage(options.data, options.outputDir, options.fileName);
  });

  handleTrustedIpc("shared-disk:load", async () => {
    return loadSharedDiskConfig();
  });

  handleTrustedIpc("shared-disk:save", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    assertSharedDiskConfig(options);
    return saveSharedDiskConfig(options);
  });

  handleTrustedIpc("shared-disk:connect", async (_event, raw: SharedDiskConfig) => {
    const options = sharedDiskSchema.parse(raw);
    assertSharedDiskConfig(options);
    return connectSharedDisk(options);
  });

  handleTrustedIpc("shared-disk:forget", async () => forgetSharedDiskCredentials());

  handleTrustedIpc("shared-disk:disconnect", async (_event, raw: unknown) => {
    const options = sharedDiskTargetSchema.parse(raw);
    getSharedDiskShareRoot(options);
    return disconnectSharedDisk(options);
  });

  handleTrustedIpc("shared-disk:status", async (_event, raw: unknown) => {
    const options = sharedDiskTargetSchema.parse(raw);
    getSharedDiskShareRoot(options);
    return getSharedDiskStatus(options);
  });

  handleTrustedIpc("shared-disk:open", async (_event, targetPath: string) => {
    const config = sharedDiskSchema.parse(await loadSharedDiskConfig());
    const selectedPath = localPathSchema.parse(targetPath);
    assertSharedDiskTarget(config, selectedPath);
    return openSharedDiskDirectory(selectedPath);
  });

  handleTrustedIpc("shared-disk:open-existing", async (_event, raw: unknown) => {
    const config = sharedDiskTargetSchema.extend({ defaultDirectory: z.string().max(32_768) }).parse(raw);
    return openExistingSharedDiskDirectory(config);
  });

  handleTrustedIpc("settings:load", async () => loadAppSettings());
  handleTrustedIpc("settings:save", async (_event, raw: AppSettings) => saveAppSettings(appSettingsSchema.parse(raw)));
  handleTrustedIpc("diagnostics:get", async () => getAppDiagnostics());
  handleTrustedIpc("config:load", async (_event, key: string) => loadToolConfig(toolConfigKeySchema.parse(key)));
  handleTrustedIpc("config:save", async (_event, key: string, value: unknown) => saveToolConfig(toolConfigKeySchema.parse(key), value));

  handleTrustedIpc("notes:load", async () => {
    const state = await loadStickyNotes();
    authorizeUserSelectedPaths([state.directory], true);
    return state;
  });

  handleTrustedIpc("notes:set-directory", async (_event, directory: string) => {
    const selectedPath = localPathSchema.parse(directory);
    assertAuthorizedPath(selectedPath);
    return setStickyNotesDirectory(selectedPath);
  });

  handleTrustedIpc("notes:create", async (_event, content?: string) => createStickyNote(z.string().max(8 * 1024 * 1024).optional().parse(content)));

  handleTrustedIpc("notes:save", async (_event, raw: { id: string; content: string }) => {
    const payload = stickyNoteSaveSchema.parse(raw);
    return saveStickyNote(payload.id, payload.content);
  });

  handleTrustedIpc("notes:pin", async (_event, raw: { id: string; pinned: boolean }) => {
    const payload = z.object({ id: z.string().min(1), pinned: z.boolean() }).parse(raw);
    return setStickyNotePinned(payload.id, payload.pinned);
  });

  handleTrustedIpc("notes:archive", async (_event, raw: { id: string; archived: boolean }) => {
    const payload = z.object({ id: z.string().min(1), archived: z.boolean() }).parse(raw);
    return archiveStickyNote(payload.id, payload.archived);
  });

  handleTrustedIpc("notes:delete", async (_event, id: string) => {
    await deleteStickyNote(z.string().min(1).parse(id));
  });

  handleTrustedIpc("notes:restore", async (_event, id: string) => {
    return restoreStickyNote(z.string().min(1).parse(id));
  });

  handleTrustedIpc("notes:empty-trash", async () => {
    return emptyStickyNotesTrash();
  });

  handleTrustedIpc("notes:preferences", async (_event, raw: StickyNotesPreferences) => {
    return saveStickyNotesPreferences(stickyNoteStyleSchema.parse(raw));
  });

  handleTrustedIpc("notes:apply-preset", async (_event, raw: { id: string | null; scope: "current" | "all"; style: StickyNoteStyle }) => {
    const payload = z.object({ id: z.string().min(1).nullable(), scope: z.enum(["current", "all"]), style: stickyNoteStyleSchema }).parse(raw);
    return applyStickyNotePreset(payload.id, payload.scope, payload.style);
  });

  handleTrustedIpc("notes:import", async (_event, inputPaths: string[]) => {
    const selectedPaths = z.array(localPathSchema).min(1).max(100).parse(inputPaths);
    for (const selectedPath of selectedPaths) assertAuthorizedPath(selectedPath);
    return importStickyNotes(selectedPaths);
  });

  handleTrustedIpc("notes:export", async (_event, raw: StickyNoteExportOptions | string) => {
    const payload = typeof raw === "string" ? { outputDir: raw, format: "txt" as const } : stickyNoteExportSchema.parse(raw);
    assertAuthorizedPath(localPathSchema.parse(payload.outputDir));
    return exportStickyNotes(payload);
  });

  handleTrustedIpc("history:list", async (_event, limit?: number) => {
    const selectedLimit = z.number().int().min(1).max(1_000).optional().parse(limit);
    return history.list(selectedLimit);
  });

  handleTrustedIpc("history:open-output", async (_event, id: unknown) =>
    runWithLocalOpenLock<OpenDirectoryResult>(
      { status: "blocked", path: "", message: "正在打开文件夹，请稍后再试。" },
      () => openHistoryOutput(id, recordId => history.get(recordId), directory => shell.openPath(directory))
    )
  );

  handleTrustedIpc("history:clear", async () => {
    await history.clear();
  });

  handleTrustedIpc("shell:reveal-path", async (_event, filePath: string) => {
    const normalizedPath = path.normalize(localPathSchema.parse(filePath));
    assertAuthorizedPath(normalizedPath);
    if (!(await pathExists(normalizedPath))) return;
    if (!acquireLocalOpenLock()) return;
    shell.showItemInFolder(normalizedPath);
  });

  handleTrustedIpc("shell:open-directory", async (_event, targetPath: string) => {
    return openDirectory(localPathSchema.parse(targetPath));
  });

  handleTrustedIpc("shell:open-external", async (_event, url: unknown) => {
    const normalizedUrl = validateExternalUrl(url);
    await shell.openExternal(normalizedUrl);
  });

  handleTrustedIpc("file:read-text", async (_event, filePath: string, encoding = "auto") => {
    const normalizedPath = path.normalize(localPathSchema.parse(filePath));
    assertAuthorizedPath(normalizedPath);
    const selectedEncoding = z.enum(["auto", "utf8", "utf16le", "utf16be", "gb18030", "big5", "shift_jis", "latin1"]).parse(encoding);
    const stat = await fs.stat(normalizedPath);
    if (!stat.isFile()) throw new Error("选择的路径不是文件");
    if (stat.size > 20 * 1024 * 1024) throw new Error("文本文件不能超过 20 MiB");
    return (await readDecodedTextFile(normalizedPath, selectedEncoding)).text;
  });

  handleTrustedIpc("file:write-text", async (_event, outputDir: string, fileName: string, content: string) => {
    const payload = z.object({
      outputDir: localPathSchema,
      fileName: z.string().min(1).max(255),
      content: z.string().max(8 * 1024 * 1024)
    }).strict().parse({ outputDir, fileName, content });
    assertAuthorizedPath(payload.outputDir);
    await ensureDir(payload.outputDir);
    const extension = path.extname(payload.fileName).replace(/[^.\w-]/g, "") || ".txt";
    const output = path.join(payload.outputDir, `${safeBaseName(payload.fileName) || "dev-toolbox-config"}${extension}`);
    await writePlainTextFile(output, payload.content);
    return output;
  });
}
