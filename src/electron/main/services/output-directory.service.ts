import fs from "node:fs/promises";
import type { OutputDirectoryCheck } from "../../../shared/types";
import { isAuthorizedPath } from "../utils/ipc-security";

// Do not probe arbitrary paths or turn saved renderer configuration into grants.
export async function checkOutputDirectory(
  targetPath: string,
  authorized = isAuthorizedPath,
  stat = fs.stat
): Promise<OutputDirectoryCheck> {
  if (!authorized(targetPath)) return {
    status: "needs-authorization",
    message: "此输出目录尚未在本次启动中授权，请在目录选择窗口中确认后使用。"
  };
  try {
    if (!(await stat(targetPath)).isDirectory()) return { status: "unavailable", message: "该位置不是文件夹，请重新选择输出目录。" };
    return { status: "ready" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing", message: "输出目录不存在或所在磁盘未连接，请检查后重新选择。" };
    return { status: "unavailable", message: "暂时无法访问输出目录，请检查系统权限、磁盘或网络连接。" };
  }
}
