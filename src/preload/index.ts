import { contextBridge, ipcRenderer } from "electron";
import type {
  DevToolboxApi,
  DialogFileFilter,
  FaviconOptions,
  FontWoff2Options,
  VideoBackgroundOptions,
  WebpOptions
} from "../shared/types";

const api: DevToolboxApi = {
  selectFiles: (filters?: DialogFileFilter[], multiSelections = true) =>
    ipcRenderer.invoke("dialog:select-files", filters, multiSelections),
  selectOutputDir: () => ipcRenderer.invoke("dialog:select-output-dir"),
  convertFavicon: (options: FaviconOptions) => ipcRenderer.invoke("convert:favicon", options),
  convertWebp: (options: WebpOptions) => ipcRenderer.invoke("convert:webp", options),
  convertFontWoff2: (options: FontWoff2Options) => ipcRenderer.invoke("convert:font-woff2", options),
  convertVideoBackground: (options: VideoBackgroundOptions) =>
    ipcRenderer.invoke("convert:video-background", options),
  listHistory: (limit?: number) => ipcRenderer.invoke("history:list", limit),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  revealPath: (filePath: string) => ipcRenderer.invoke("shell:reveal-path", filePath)
};

contextBridge.exposeInMainWorld("devToolbox", api);

