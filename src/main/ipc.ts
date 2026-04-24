import { dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import { createHistoryService } from "./services/history.service";
import { compressImages, createFaviconPackage, convertImages, cropImage, resizeImages } from "./services/image.service";
import { convertFontsToWoff2 } from "./services/font.service";
import { subsetFont } from "./services/font-tools.service";
import { convertVideoAnimation, createVideoBackgroundPack, removeVideoAudio } from "./services/video.service";
import { convertAudio } from "./services/audio.service";
import { convertSequenceAnimation } from "./services/sequence.service";
import { base64ToImage, exportMarkdown, imageToBase64, renameFiles } from "./services/utility.service";
import { generateQrCode } from "./services/qr.service";
import { getIpInfo } from "./services/network.service";
import { generateAssetManifest } from "./services/asset-manifest.service";
import { generateSprite } from "./services/sprite.service";
import { generateSeoFiles } from "./services/seo-files.service";
import { generateImagePlaceholders } from "./services/placeholder.service";
import { generateOgImage } from "./services/og-image.service";
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
  DialogFileFilter,
  AssetManifestOptions,
  AudioConvertOptions,
  FaviconOptions,
  FontSubsetOptions,
  FontWoff2Options,
  ImageCompressOptions,
  ImageCropOptions,
  ImagePlaceholderOptions,
  ImageResizeOptions,
  MarkdownExportOptions,
  OgImageOptions,
  QrCodeOptions,
  RenameOptions,
  SeoFilesOptions,
  SequenceAnimationOptions,
  SharedDiskConfig,
  SpriteOptions,
  VideoBackgroundOptions,
  VideoAnimationOptions,
  VideoMuteOptions,
  WebpOptions
} from "../shared/types";

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
  keepMetadata: z.boolean()
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

const audioConvertSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  outputFormat: z.enum(["mp3", "wav", "aac", "ogg", "flac", "m4a"]),
  bitrate: z.string().optional(),
  sampleRate: z.number().int().positive().optional()
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

const sharedDiskSchema = z.object({
  url: z.string().min(1),
  username: z.string(),
  password: z.string(),
  basePath: z.string().min(1),
  defaultDirectory: z.string(),
  persistent: z.boolean()
});

export function registerIpc() {
  const history = createHistoryService();

  ipcMain.handle(
    "dialog:select-files",
    async (_event, filters?: DialogFileFilter[], multiSelections = true): Promise<string[]> => {
      const result = await dialog.showOpenDialog({
        properties: multiSelections ? ["openFile", "multiSelections"] : ["openFile"],
        filters
      });

      return result.canceled ? [] : result.filePaths;
    }
  );

  ipcMain.handle("dialog:select-output-dir", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

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

  ipcMain.handle("convert:audio", async (_event, raw: AudioConvertOptions) => {
    const options = audioConvertSchema.parse(raw);
    return convertAudio(options, history);
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

  ipcMain.handle("shared-disk:open", async (_event, targetPath: string) => {
    return openSharedDiskDirectory(targetPath);
  });

  ipcMain.handle("history:list", async (_event, limit?: number) => {
    return history.list(limit);
  });

  ipcMain.handle("history:clear", async () => {
    await history.clear();
  });

  ipcMain.handle("shell:reveal-path", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
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
