import { contextBridge, ipcRenderer } from "electron";
import type {
  DevToolboxApi,
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

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const api: DevToolboxApi = {
  selectFiles: (filters?: DialogFileFilter[], multiSelections = true) =>
    ipcRenderer.invoke("dialog:select-files", filters ? toPlain(filters) : undefined, multiSelections),
  selectOutputDir: () => ipcRenderer.invoke("dialog:select-output-dir"),
  convertFavicon: (options: FaviconOptions) => ipcRenderer.invoke("convert:favicon", toPlain(options)),
  convertWebp: (options: WebpOptions) => ipcRenderer.invoke("convert:webp", toPlain(options)),
  compressImages: (options: ImageCompressOptions) => ipcRenderer.invoke("convert:image-compress", toPlain(options)),
  resizeImages: (options: ImageResizeOptions) => ipcRenderer.invoke("convert:image-resize", toPlain(options)),
  convertFontWoff2: (options: FontWoff2Options) => ipcRenderer.invoke("convert:font-woff2", toPlain(options)),
  convertVideoBackground: (options: VideoBackgroundOptions) =>
    ipcRenderer.invoke("convert:video-background", toPlain(options)),
  convertVideoAnimation: (options: VideoAnimationOptions) => ipcRenderer.invoke("convert:video-animation", toPlain(options)),
  removeVideoAudio: (options: VideoMuteOptions) => ipcRenderer.invoke("convert:video-mute", toPlain(options)),
  exportMarkdown: (options: MarkdownExportOptions) => ipcRenderer.invoke("convert:markdown-export", toPlain(options)),
  renameFiles: (options: RenameOptions) => ipcRenderer.invoke("files:rename", toPlain(options)),
  imageToBase64: (inputPath: string) => ipcRenderer.invoke("base64:image-to-base64", inputPath),
  base64ToImage: (data: string, outputDir: string, fileName: string) =>
    ipcRenderer.invoke("base64:base64-to-image", data, outputDir, fileName),
  listHistory: (limit?: number) => ipcRenderer.invoke("history:list", limit),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  revealPath: (filePath: string) => ipcRenderer.invoke("shell:reveal-path", filePath)
};

contextBridge.exposeInMainWorld("devToolbox", api);
