import { dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import { createHistoryService } from "./services/history.service";
import { createFaviconPackage, convertImages } from "./services/image.service";
import { convertFontsToWoff2 } from "./services/font.service";
import { createVideoBackgroundPack } from "./services/video.service";
import type {
  DialogFileFilter,
  FaviconOptions,
  FontWoff2Options,
  VideoBackgroundOptions,
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

  ipcMain.handle("convert:font-woff2", async (_event, raw: FontWoff2Options) => {
    const options = fontSchema.parse(raw);
    return convertFontsToWoff2(options, history);
  });

  ipcMain.handle("convert:video-background", async (_event, raw: VideoBackgroundOptions) => {
    const options = videoSchema.parse(raw);
    return createVideoBackgroundPack(options, history);
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
