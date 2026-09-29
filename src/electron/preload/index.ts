import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  DevToolboxApi,
  DialogFileFilter,
  AppSettings,
  AssetManifestOptions,
  AudioCompressOptions,
  AudioConvertOptions,
  CertificateScanOptions,
  ClipboardEntry,
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
  MediaInfo,
  OgImageOptions,
  QrCodeOptions,
  RenameOptions,
  SeoFilesOptions,
  SharedDiskConfig,
  StickyNoteExportOptions,
  StickyNoteStyle,
  StickyNotesPreferences,
  VideoBackgroundOptions,
  VideoAnimationOptions,
  VideoMuteOptions,
  SequenceAnimationOptions,
  ThemeTitleBarPayload,
  WindowFrameState,
  ToolConfigKey,
  CodeMinifyOptions,
  VideoCompressOptions,
  WebpOptions,
  UpdateStatus,
  TextFileEncoding
} from "../../shared/types";

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const beforeWindowActionHandlers = new Set<() => void | Promise<void>>();

ipcRenderer.on("window:before-action", async (_event, payload: { requestId?: string }) => {
  const requestId = String(payload?.requestId || "");
  if (!requestId) return;
  try {
    await Promise.all(Array.from(beforeWindowActionHandlers, (handler) => Promise.resolve().then(handler)));
    ipcRenderer.send("window:action-ready", { requestId, ok: true });
  } catch (error) {
    ipcRenderer.send("window:action-ready", {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

const api: DevToolboxApi = {
  selectFiles: (filters?: DialogFileFilter[], multiSelections = true) =>
    ipcRenderer.invoke("dialog:select-files", filters ? toPlain(filters) : undefined, multiSelections),
  selectOutputDir: (defaultPath?: string) => ipcRenderer.invoke("dialog:select-output-dir", defaultPath),
  pathExists: (targetPath: string) => ipcRenderer.invoke("file:path-exists", targetPath),
  openDirectory: (targetPath: string) => ipcRenderer.invoke("shell:open-directory", targetPath),
  convertFavicon: (options: FaviconOptions) => ipcRenderer.invoke("convert:favicon", toPlain(options)),
  processSvgFiles: (options: SvgToolboxOptions) => ipcRenderer.invoke("convert:svg-toolbox", toPlain(options)),
  generatePwaIconPackages: (options: PwaIconPackageOptions) => ipcRenderer.invoke("convert:pwa-icons", toPlain(options)),
  convertWebp: (options: WebpOptions) => ipcRenderer.invoke("convert:webp", toPlain(options)),
  compressImages: (options: ImageCompressOptions) => ipcRenderer.invoke("convert:image-compress", toPlain(options)),
  resizeImages: (options: ImageResizeOptions) => ipcRenderer.invoke("convert:image-resize", toPlain(options)),
  cropImage: (options: ImageCropOptions) => ipcRenderer.invoke("convert:image-crop", toPlain(options)),
  applyWatermark: (options: WatermarkOptions) => ipcRenderer.invoke("convert:watermark", toPlain(options)),
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
  compressVideos: (options: VideoCompressOptions) => ipcRenderer.invoke("convert:video-compress", toPlain(options)),
  getMediaInfo: (inputPath: string): Promise<MediaInfo> => ipcRenderer.invoke("media:info", inputPath),
  convertAudio: (options: AudioConvertOptions) => ipcRenderer.invoke("convert:audio", toPlain(options)),
  compressAudio: (options: AudioCompressOptions) => ipcRenderer.invoke("convert:audio-compress", toPlain(options)),
  minifyCode: (options: CodeMinifyOptions) => ipcRenderer.invoke("convert:code-minify", toPlain(options)),
  exportMarkdown: (options: MarkdownExportOptions) => ipcRenderer.invoke("convert:markdown-export", toPlain(options)),
  renameFiles: (options: RenameOptions) => ipcRenderer.invoke("files:rename", toPlain(options)),
  generateQrCode: (options: QrCodeOptions) => ipcRenderer.invoke("qr:generate", toPlain(options)),
  getIpInfo: () => ipcRenderer.invoke("network:ip-info"),
  lookupDomainIp: (domain: string) => ipcRenderer.invoke("network:domain-ip", domain),
  scanCertificates: (options: CertificateScanOptions) => ipcRenderer.invoke("network:certificate-scan", toPlain(options)),
  generateAssetManifest: (options: AssetManifestOptions) => ipcRenderer.invoke("assets:manifest", toPlain(options)),
  generateSeoFiles: (options: SeoFilesOptions) => ipcRenderer.invoke("seo:files", toPlain(options)),
  generateOgImage: (options: OgImageOptions) => ipcRenderer.invoke("seo:og-image", toPlain(options)),
  getDroppedFilePaths: (files: unknown[]) => {
    const paths = files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean);
    return ipcRenderer.sendSync("paths:authorize-dropped", paths) === true ? paths : [];
  },
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
  readTextFile: (filePath: string, encoding: TextFileEncoding = "auto") => ipcRenderer.invoke("file:read-text", filePath, encoding),
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
  getUpdateState: () => ipcRenderer.invoke("update:state"),
  onUpdateStatus: (handler: (status: UpdateStatus) => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => handler(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.off("update:status", listener);
  },
  setThemeBackground: (payload: ThemeTitleBarPayload) => ipcRenderer.send("theme:background", toPlain(payload)),
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  reloadWindow: () => ipcRenderer.invoke("window:reload"),
  onBeforeWindowAction: (handler: () => void | Promise<void>) => {
    beforeWindowActionHandlers.add(handler);
    return () => beforeWindowActionHandlers.delete(handler);
  },
  onWindowStateChange: (handler: (state: WindowFrameState) => void) => {
    const listener = (_event: unknown, state: WindowFrameState) => handler(state);
    ipcRenderer.on("window:state-changed", listener);
    return () => ipcRenderer.off("window:state-changed", listener);
  },
  getAlwaysOnTop: () => ipcRenderer.invoke("window:get-always-on-top"),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("window:set-always-on-top", enabled),
  loadStickyNotes: () => ipcRenderer.invoke("notes:load"),
  setStickyNotesDirectory: (directory: string) => ipcRenderer.invoke("notes:set-directory", directory),
  createStickyNote: (content?: string) => ipcRenderer.invoke("notes:create", content),
  saveStickyNote: (id: string, content: string) => ipcRenderer.invoke("notes:save", { id, content }),
  setStickyNotePinned: (id: string, pinned: boolean) => ipcRenderer.invoke("notes:pin", { id, pinned }),
  archiveStickyNote: (id: string, archived: boolean) => ipcRenderer.invoke("notes:archive", { id, archived }),
  deleteStickyNote: (id: string) => ipcRenderer.invoke("notes:delete", id),
  restoreStickyNote: (id: string) => ipcRenderer.invoke("notes:restore", id),
  emptyStickyNotesTrash: () => ipcRenderer.invoke("notes:empty-trash"),
  saveStickyNotesPreferences: (preferences: StickyNotesPreferences) => ipcRenderer.invoke("notes:preferences", toPlain(preferences)),
  applyStickyNotePreset: (id: string | null, scope: "current" | "all", style: StickyNoteStyle) =>
    ipcRenderer.invoke("notes:apply-preset", { id, scope, style: toPlain(style) }),
  importStickyNotes: (inputPaths: string[]) => ipcRenderer.invoke("notes:import", toPlain(inputPaths)),
  exportStickyNotes: (outputDirOrOptions: string | StickyNoteExportOptions, ids?: string[]) =>
    ipcRenderer.invoke("notes:export", typeof outputDirOrOptions === "string" ? { outputDir: outputDirOrOptions, ids, format: "txt" } : toPlain(outputDirOrOptions))
};

contextBridge.exposeInMainWorld("devToolbox", api);
