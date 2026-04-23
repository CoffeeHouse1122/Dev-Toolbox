import { contextBridge, ipcRenderer } from "electron";
import type {
  DevToolboxApi,
  DialogFileFilter,
  FaviconOptions,
  FontWoff2Options,
  VideoBackgroundOptions,
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
  convertFontWoff2: (options: FontWoff2Options) => ipcRenderer.invoke("convert:font-woff2", toPlain(options)),
  convertVideoBackground: (options: VideoBackgroundOptions) =>
    ipcRenderer.invoke("convert:video-background", toPlain(options)),
  listHistory: (limit?: number) => ipcRenderer.invoke("history:list", limit),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  revealPath: (filePath: string) => ipcRenderer.invoke("shell:reveal-path", filePath)
};

contextBridge.exposeInMainWorld("devToolbox", api);
