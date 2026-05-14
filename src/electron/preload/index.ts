import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  DevToolboxApi,
  DialogFileFilter,
  AppSettings,
  AssetManifestOptions,
  AudioConvertOptions,
  CertificateScanOptions,
  CaptureProxyStartOptions,
  ClipboardEntry,
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
  SharedDiskConfig,
  SpriteOptions,
  VideoBackgroundOptions,
  VideoAnimationOptions,
  VideoMuteOptions,
  SequenceAnimationOptions,
  ThemeTitleBarPayload,
  ToolConfigKey,
  WebpOptions,
  UpdateStatus
} from "../../shared/types";

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
  cropImage: (options: ImageCropOptions) => ipcRenderer.invoke("convert:image-crop", toPlain(options)),
  applyWatermark: (options: WatermarkOptions) => ipcRenderer.invoke("convert:watermark", toPlain(options)),
  generateSprite: (options: SpriteOptions) => ipcRenderer.invoke("assets:sprite", toPlain(options)),
  generateImagePlaceholders: (options: ImagePlaceholderOptions) =>
    ipcRenderer.invoke("assets:image-placeholder", toPlain(options)),
  convertFontWoff2: (options: FontWoff2Options) => ipcRenderer.invoke("convert:font-woff2", toPlain(options)),
  subsetFont: (options: FontSubsetOptions) => ipcRenderer.invoke("convert:font-subset", toPlain(options)),
  convertVideoBackground: (options: VideoBackgroundOptions) =>
    ipcRenderer.invoke("convert:video-background", toPlain(options)),
  convertSequenceAnimation: (options: SequenceAnimationOptions) =>
    ipcRenderer.invoke("convert:sequence-animation", toPlain(options)),
  convertVideoAnimation: (options: VideoAnimationOptions) => ipcRenderer.invoke("convert:video-animation", toPlain(options)),
  removeVideoAudio: (options: VideoMuteOptions) => ipcRenderer.invoke("convert:video-mute", toPlain(options)),
  convertAudio: (options: AudioConvertOptions) => ipcRenderer.invoke("convert:audio", toPlain(options)),
  exportMarkdown: (options: MarkdownExportOptions) => ipcRenderer.invoke("convert:markdown-export", toPlain(options)),
  renameFiles: (options: RenameOptions) => ipcRenderer.invoke("files:rename", toPlain(options)),
  generateQrCode: (options: QrCodeOptions) => ipcRenderer.invoke("qr:generate", toPlain(options)),
  getIpInfo: () => ipcRenderer.invoke("network:ip-info"),
  lookupDomainIp: (domain: string) => ipcRenderer.invoke("network:domain-ip", domain),
  scanCertificates: (options: CertificateScanOptions) => ipcRenderer.invoke("network:certificate-scan", toPlain(options)),
  startCaptureProxy: (options: CaptureProxyStartOptions) => ipcRenderer.invoke("capture-proxy:start", toPlain(options)),
  stopCaptureProxy: () => ipcRenderer.invoke("capture-proxy:stop"),
  getCaptureProxyStatus: () => ipcRenderer.invoke("capture-proxy:status"),
  listCaptureProxyRecords: () => ipcRenderer.invoke("capture-proxy:list"),
  clearCaptureProxyRecords: () => ipcRenderer.invoke("capture-proxy:clear"),
  testCaptureProxy: () => ipcRenderer.invoke("capture-proxy:test"),
  generateAssetManifest: (options: AssetManifestOptions) => ipcRenderer.invoke("assets:manifest", toPlain(options)),
  generateSeoFiles: (options: SeoFilesOptions) => ipcRenderer.invoke("seo:files", toPlain(options)),
  generateOgImage: (options: OgImageOptions) => ipcRenderer.invoke("seo:og-image", toPlain(options)),
  getDroppedFilePaths: (files: unknown[]) =>
    files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean),
  loadSharedDiskConfig: () => ipcRenderer.invoke("shared-disk:load"),
  saveSharedDiskConfig: (config: SharedDiskConfig) => ipcRenderer.invoke("shared-disk:save", toPlain(config)),
  connectSharedDisk: (config: SharedDiskConfig) => ipcRenderer.invoke("shared-disk:connect", toPlain(config)),
  disconnectSharedDisk: (config: SharedDiskConfig) => ipcRenderer.invoke("shared-disk:disconnect", toPlain(config)),
  getSharedDiskStatus: (config: SharedDiskConfig) => ipcRenderer.invoke("shared-disk:status", toPlain(config)),
  openSharedDiskDirectory: (targetPath: string) => ipcRenderer.invoke("shared-disk:open", targetPath),
  imageToBase64: (inputPath: string) => ipcRenderer.invoke("base64:image-to-base64", inputPath),
  base64ToImage: (data: string, outputDir: string, fileName: string) =>
    ipcRenderer.invoke("base64:base64-to-image", data, outputDir, fileName),
  listHistory: (limit?: number) => ipcRenderer.invoke("history:list", limit),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  revealPath: (filePath: string) => ipcRenderer.invoke("shell:reveal-path", filePath),
  openExternal: (url: string) => ipcRenderer.invoke("shell:open-external", url),
  readTextFile: (filePath: string) => ipcRenderer.invoke("file:read-text", filePath),
  writeTextFile: (outputDir: string, fileName: string, content: string) =>
    ipcRenderer.invoke("file:write-text", outputDir, fileName, content),
  startClipboardWatcher: () => ipcRenderer.invoke("clipboard:start"),
  stopClipboardWatcher: () => ipcRenderer.invoke("clipboard:stop"),
  listClipboard: () => ipcRenderer.invoke("clipboard:list"),
  clearClipboardHistory: () => ipcRenderer.invoke("clipboard:clear"),
  removeClipboardEntry: (id: string) => ipcRenderer.invoke("clipboard:remove", id),
  pinClipboardEntry: (id: string, pinned: boolean) => ipcRenderer.invoke("clipboard:pin", id, pinned),
  writeClipboardEntry: (id: string) => ipcRenderer.invoke("clipboard:write", id),
  onClipboardUpdate: (handler: (entries: ClipboardEntry[]) => void) => {
    const listener = (_event: unknown, entries: ClipboardEntry[]) => handler(entries);
    ipcRenderer.on("clipboard:update", listener);
    return () => ipcRenderer.off("clipboard:update", listener);
  },
  loadAppSettings: () => ipcRenderer.invoke("settings:load"),
  saveAppSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", toPlain(settings)),
  getAppDiagnostics: () => ipcRenderer.invoke("diagnostics:get"),
  loadToolConfig: (key: ToolConfigKey) => ipcRenderer.invoke("config:load", key),
  saveToolConfig: (key: ToolConfigKey, value: unknown) => ipcRenderer.invoke("config:save", key, toPlain(value)),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  getCurrentVersion: () => ipcRenderer.invoke("update:current-version"),
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => handler(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.off("update:status", listener);
  },
  setThemeBackground: (payload: ThemeTitleBarPayload) => ipcRenderer.send("theme:background", toPlain(payload)),
  getAlwaysOnTop: () => ipcRenderer.invoke("window:get-always-on-top"),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("window:set-always-on-top", enabled),
  loadStickyNotes: () => ipcRenderer.invoke("notes:load"),
  setStickyNotesDirectory: (directory: string) => ipcRenderer.invoke("notes:set-directory", directory),
  createStickyNote: (content?: string) => ipcRenderer.invoke("notes:create", content),
  saveStickyNote: (id: string, content: string) => ipcRenderer.invoke("notes:save", { id, content }),
  setStickyNotePinned: (id: string, pinned: boolean) => ipcRenderer.invoke("notes:pin", { id, pinned }),
  deleteStickyNote: (id: string) => ipcRenderer.invoke("notes:delete", id),
  exportStickyNotes: (outputDir: string, ids?: string[]) => ipcRenderer.invoke("notes:export", { outputDir, ids })
};

contextBridge.exposeInMainWorld("devToolbox", api);
