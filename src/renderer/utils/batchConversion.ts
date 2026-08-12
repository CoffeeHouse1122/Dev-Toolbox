import type { ConversionItemResult, ConversionResult } from "../../shared/types";

function inputName(inputPath: string) {
  return inputPath.split(/[\\/]/).pop() || inputPath;
}

export function batchChildOutputDir(root: string, inputPath: string, index: number, total: number) {
  if (total === 1) return root;
  const separator = root.includes("\\") ? "\\" : "/";
  const stem = inputName(inputPath)
    .replace(/\.[^.]+$/, "")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || "item";
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  return `${normalizedRoot || separator}${normalizedRoot ? separator : ""}${stem}-${index + 1}`;
}

export async function runConversionBatch(
  inputPaths: string[],
  outputPath: string,
  execute: (inputPath: string, index: number) => Promise<ConversionResult>
): Promise<ConversionResult> {
  const id = `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const files: string[] = [];
  const logs: string[] = [];
  const items: ConversionItemResult[] = [];

  for (const [index, inputPath] of inputPaths.entries()) {
    try {
      const result = await execute(inputPath, index);
      files.push(...result.files);
      logs.push(...result.logs.map((log) => `[${inputName(inputPath)}] ${log}`));
      const succeeded = result.status === "success";
      items.push({
        inputPath,
        outputPath: result.files[0] || result.outputPath || undefined,
        status: succeeded ? "success" : "error",
        errorMessage: succeeded ? undefined : result.errorMessage || "处理失败"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[${inputName(inputPath)}] ${message}`);
      items.push({ inputPath, status: "error", errorMessage: message });
    }
  }

  const failed = items.filter((item) => item.status === "error").length;
  const status = failed === 0 ? "success" : failed === items.length ? "error" : "partial";
  return {
    id,
    status,
    files,
    outputPath,
    logs,
    items,
    errorMessage: failed ? `${failed} / ${items.length} 个文件处理失败。` : undefined
  };
}
