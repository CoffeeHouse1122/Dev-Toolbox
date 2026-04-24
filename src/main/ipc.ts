import { dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import { createHistoryService } from "./services/history.service";
import { compressImages, createFaviconPackage, convertImages, resizeImages } from "./services/image.service";
import { convertFontsToWoff2 } from "./services/font.service";
import { convertVideoAnimation, createVideoBackgroundPack, removeVideoAudio } from "./services/video.service";
import { base64ToImage, exportMarkdown, imageToBase64, renameFiles } from "./services/utility.service";
import type {
  DialogFileFilter,
  FaviconOptions,
  FontWoff2Options,
  ImageCompressOptions,
  ImageResizeOptions,
  MarkdownExportOptions,
  RenameOptions,
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

const fontSchema = z.object({
  inputPaths: z.array(z.string().min(1)).min(1),
  outputDir: z.string().min(1),
  generateCss: z.boolean(),
  fontFamily: z.string().optional()
});

const videoSchema = z.object({
  inputPath: z.string().min(1),
  outputDir: z.string().min(1),
  mode: z.enum(["background-pack", "mp4", "webm", "hls"]),
  width: z.number().int().positive().optional(),
  crf: z.number().int().min(12).max(40),
  makePoster: z.boolean()
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

  ipcMain.handle("convert:font-woff2", async (_event, raw: FontWoff2Options) => {
    const options = fontSchema.parse(raw);
    return convertFontsToWoff2(options, history);
  });

  ipcMain.handle("convert:video-background", async (_event, raw: VideoBackgroundOptions) => {
    const options = videoSchema.parse(raw);
    return createVideoBackgroundPack(options, history);
  });

  ipcMain.handle("convert:video-animation", async (_event, raw: VideoAnimationOptions) => {
    const options = videoAnimationSchema.parse(raw);
    return convertVideoAnimation(options, history);
  });

  ipcMain.handle("convert:video-mute", async (_event, raw: VideoMuteOptions) => {
    const options = videoMuteSchema.parse(raw);
    return removeVideoAudio(options, history);
  });

  ipcMain.handle("convert:markdown-export", async (_event, raw: MarkdownExportOptions) => {
    const options = markdownExportSchema.parse(raw);
    return exportMarkdown(options, history);
  });

  ipcMain.handle("files:rename", async (_event, raw: RenameOptions) => {
    const options = renameSchema.parse(raw);
    return renameFiles(options, history);
  });

  ipcMain.handle("base64:image-to-base64", async (_event, inputPath: string) => {
    return imageToBase64(inputPath);
  });

  ipcMain.handle("base64:base64-to-image", async (_event, data: string, outputDir: string, fileName: string) => {
    return base64ToImage(data, outputDir, fileName);
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
}
