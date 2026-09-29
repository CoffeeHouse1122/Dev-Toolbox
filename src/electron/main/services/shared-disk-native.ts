import { spawn } from "node:child_process";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { SharedDiskSession } from "../../../shared/types";

export interface SharedNativeRequest {
  action: "status" | "connect" | "disconnect";
  shareRoot: string;
  username?: string;
  password?: string;
}
export interface SharedNativeResult { code: number; status?: number; username?: string; sessions?: SharedDiskSession[]; discoveryUnavailable?: boolean }

// The command is constant. User input is JSON on stdin, never script interpolation or argv.
const script = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ToolboxShare {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Resource {
    public uint scope, type, displayType, usage;
    public string localName, remoteName, comment, provider;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct UseInfo {
    public string local, remote, password;
    public uint status, assignmentType, refCount, useCount;
    public string username, domain;
  }
  [DllImport("mpr.dll", CharSet=CharSet.Unicode)]
  public static extern uint WNetAddConnection2W(ref Resource resource, string password, string username, uint flags);
  [DllImport("mpr.dll", CharSet=CharSet.Unicode)]
  public static extern uint WNetCancelConnection2W(string name, uint flags, [MarshalAs(UnmanagedType.Bool)] bool force);
  [DllImport("Netapi32.dll", CharSet=CharSet.Unicode)]
  public static extern uint NetUseGetInfo(string server, string name, uint level, out IntPtr buffer);
  [DllImport("Netapi32.dll")]
  public static extern uint NetApiBufferFree(IntPtr buffer);
}
'@
  $result = @{ code = 0 }
  switch ($request.action) {
    'status' {
      $buffer = [IntPtr]::Zero
      try {
        $result.code = [ToolboxShare]::NetUseGetInfo($null, $request.shareRoot, 2, [ref]$buffer)
        if ($result.code -eq 0) {
          $info = [Runtime.InteropServices.Marshal]::PtrToStructure($buffer, [type][ToolboxShare+UseInfo])
          $result.status = $info.status
          $result.username = if ($info.domain) { $info.domain + '\' + $info.username } else { $info.username }
        }
      } finally { if ($buffer -ne [IntPtr]::Zero) { [void][ToolboxShare]::NetApiBufferFree($buffer) } }
      # Explorer's implicit SMB sessions are not always returned by NetUseGetInfo.
      try {
        $server = $request.shareRoot.TrimStart('\').Split('\')[0]
        $result.sessions = @(Get-SmbConnection -ErrorAction Stop | Where-Object { $_.ServerName -ieq $server } | Select-Object -First 32 | ForEach-Object {
          @{ shareRoot = '\\' + $_.ServerName + '\' + $_.ShareName; username = [string]$(if ($_.Credential) { $_.Credential } else { $_.UserName }); openFiles = [int]$_.NumOpens }
        })
        $existing = $result.sessions | Where-Object { $_.shareRoot -ieq $request.shareRoot } | Select-Object -First 1
        if ($existing) { $result.code = 0; $result.status = 0; $result.username = $existing.username }
      } catch { $result.discoveryUnavailable = $true }
    }
    'connect' {
      $resource = New-Object ToolboxShare+Resource
      $resource.type = 1
      $resource.remoteName = $request.shareRoot
      $username = $null
      $password = $null
      if ($request.username) { $username = [string]$request.username; $password = [string]$request.password }
      $result.code = [ToolboxShare]::WNetAddConnection2W([ref]$resource, $password, $username, 4)
      $password = $null
      $request = $null
    }
    'disconnect' { $result.code = [ToolboxShare]::WNetCancelConnection2W($request.shareRoot, 0, $false) }
    default { throw 'Invalid operation' }
  }
  [Console]::WriteLine(($result | ConvertTo-Json -Depth 4 -Compress))
} catch {
  # Never serialize exceptions: they may contain the input credentials.
  [Console]::WriteLine('{"code":-1}')
  exit 1
}
`;

export function runSharedDiskNative(request: SharedNativeRequest, timeoutMs = 12_000): Promise<SharedNativeResult> {
  if (process.platform !== "win32") return Promise.reject(new Error("共享连接仅支持 Windows"));
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    const decoder = new StringDecoder("utf8");
    let settled = false;
    const finish = (error?: Error, result?: SharedNativeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("共享操作超时，结果可能尚未确定；请刷新状态后重试"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      output += decoder.write(chunk);
      if (output.length > 65_536) { child.kill(); finish(new Error("共享接口返回异常")); }
    });
    child.stderr.resume();
    child.on("error", () => finish(new Error("无法启动 Windows 共享接口，请检查系统 PowerShell 是否可用")));
    child.stdin.on("error", () => finish(new Error("无法向 Windows 共享接口发送请求")));
    child.on("close", (code) => {
      if (code !== 0) return finish(new Error("Windows 共享接口执行失败，请检查系统策略"));
      try {
        const result = JSON.parse((output + decoder.end()).trim()) as SharedNativeResult;
        if (!Number.isInteger(result.code) || (result.status !== undefined && !Number.isInteger(result.status))) throw new Error();
        if (result.sessions !== undefined && (!Array.isArray(result.sessions) || result.sessions.length > 32 || result.sessions.some(item =>
          typeof item.shareRoot !== "string" || typeof item.username !== "string" || !Number.isInteger(item.openFiles) || item.openFiles < 0))) throw new Error();
        finish(undefined, result);
      } catch { finish(new Error("Windows 共享接口返回无效结果")); }
    });
    child.stdin.end(JSON.stringify(request), "utf8");
  });
}

export function sharedDiskError(code: number) {
  const messages: Record<number, string> = {
    5: "没有访问共享目录的权限", 53: "无法访问服务器，请检查网络、VPN 和服务器名称",
    67: "共享名不存在，请检查共享路径", 86: "账号或密码不正确", 1326: "身份验证失败，请检查账号、域和密码",
    1219: "Windows 账号冲突（1219）：此服务器已有共享会话。可使用现有连接打开；如需换账号，请关闭相关文件并手动断开该服务器的旧连接。应用不会自动清理其他连接",
    2401: "共享中仍有打开的文件，请关闭后再断开", 2404: "共享资源仍被使用，请关闭相关程序后再断开",
    1231: "网络不可达，请检查网络或 VPN", 1232: "无法连接服务器", 1203: "无法识别共享网络路径"
  };
  return messages[code] || `Windows 共享操作失败（错误码 ${code}）`;
}
