import fs from "node:fs/promises";
import path from "node:path";
import type { ConversionRecord, OpenDirectoryResult } from "../../../shared/types";

// Resolve only a persisted record ID. This action never grants generic file access.
export async function openHistoryOutput(
  id: unknown,
  findRecord: (id: string) => Promise<ConversionRecord | undefined>,
  openFolder: (directory: string) => Promise<string>
): Promise<OpenDirectoryResult> {
  const unavailable = (message: string): OpenDirectoryResult => ({ status: "missing", path: "", message });
  if (typeof id !== "string" || !id.trim() || id.length > 256 || id.includes("\0")) {
    return unavailable("历史记录标识无效，请刷新后重试。");
  }
  try {
    const record = await findRecord(id);
    if (!record) return unavailable("该历史记录已不存在，请刷新列表。");
    const output = record.outputPath;
    if (!output || output.includes("\0") || output.length > 32_768 || !path.isAbsolute(output)) {
      return unavailable("该记录没有可打开的本地输出位置。");
    }
    const resolved = await fs.realpath(output);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory() && !stat.isFile()) return unavailable("该输出位置不是普通文件或文件夹。");
    const directory = stat.isDirectory() ? resolved : path.dirname(resolved);
    if (!(await fs.stat(directory)).isDirectory()) return unavailable("输出目录已失效，请确认文件位置。");
    const error = await openFolder(directory);
    if (error) return unavailable("无法打开输出目录，请检查系统权限或网络连接。");
    return { status: "opened", path: directory };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return unavailable("输出文件或目录已移动、删除，或所在磁盘未连接。");
    if (code === "EACCES" || code === "EPERM") return unavailable("系统拒绝访问该输出目录，请检查文件夹权限。");
    return unavailable("暂时无法访问历史输出位置，请检查磁盘或网络连接后重试。");
  }
}
