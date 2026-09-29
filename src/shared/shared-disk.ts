export function parseSharedPath(value: string) {
  const input = value.trim().replace(/\//g, "\\");
  if (!input.startsWith("\\\\") || input.length > 2048 || /[\x00-\x1f]/.test(input)) {
    throw new Error("请输入 UNC 共享路径，例如 \\\\server\\share");
  }
  const parts = input.slice(2).replace(/\\+$/, "").split("\\");
  const [host, ...segments] = parts;
  if (!host || !/^[a-z0-9][a-z0-9._-]*$/i.test(host) || !segments.length ||
      segments.some((part) => !part || part === "." || part === ".." || /[<>:"|?*]/.test(part) || /[. ]$/.test(part))) {
    throw new Error("共享路径必须包含服务器和共享名，且不能包含端口、上级目录或无效字符");
  }
  return { host, shareRoot: `\\\\${host}\\${segments[0]}`, baseRoot: `\\\\${host}\\${segments.join("\\")}` };
}

export function sharedDirectory(sharePath: string, directory: string) {
  const root = parseSharedPath(sharePath).baseRoot;
  const target = directory.trim() ? parseSharedPath(directory).baseRoot : root;
  if (target.toLowerCase() !== root.toLowerCase() && !target.toLowerCase().startsWith(`${root.toLowerCase()}\\`)) {
    throw new Error("默认目录必须位于配置的共享路径内");
  }
  return target;
}
