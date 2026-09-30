import fs from "node:fs";
import path from "node:path";

export interface OutputDirectoryIdentity {
  selectedPath: string;
  canonicalPath: string;
  device: string;
  inode: string;
  birthTime: string;
}

function normalize(value: string) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

export function identifyOutputDirectory(selectedPath: string): OutputDirectoryIdentity {
  if (!path.isAbsolute(selectedPath) || selectedPath.includes("\0")) throw new Error("Invalid output directory.");
  const canonicalPath = normalize(fs.realpathSync.native(selectedPath));
  const stat = fs.statSync(canonicalPath, { bigint: true });
  if (!stat.isDirectory()) throw new Error("Directory identity is unavailable.");
  return { selectedPath: path.resolve(selectedPath), canonicalPath, device: String(stat.dev), inode: String(stat.ino), birthTime: String(stat.birthtimeNs) };
}

export function matchesOutputDirectory(expected: OutputDirectoryIdentity) {
  try {
    const actual = identifyOutputDirectory(expected.selectedPath);
    return actual.canonicalPath === expected.canonicalPath && actual.device === expected.device &&
      actual.inode === expected.inode && actual.birthTime === expected.birthTime;
  } catch { return false; }
}
