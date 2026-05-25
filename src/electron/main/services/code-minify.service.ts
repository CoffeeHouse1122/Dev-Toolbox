import fs from "node:fs/promises";
import path from "node:path";
import { transformAsync } from "@babel/core";
import autoprefixer from "autoprefixer";
import CleanCSS from "clean-css";
import postcss from "postcss";
import type { CodeMinifyOptions, ConversionResult } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, uniqueOutputPath, writeTextFile } from "./file-utils";

const legacyBrowsers = ["last 2 versions", "iOS >= 7", "Android > 4.1", "Firefox > 20"];

function browsersForTarget(target: CodeMinifyOptions["target"]) {
  return target === "legacy" ? legacyBrowsers : ["defaults"];
}

function outputName(inputPath: string) {
  const ext = path.extname(inputPath).toLowerCase();
  return `${safeBaseName(inputPath)}.min${ext}`;
}

async function transformCss(inputPath: string, options: CodeMinifyOptions) {
  const source = await fs.readFile(inputPath, "utf8");
  const prefixed = await postcss([autoprefixer({ overrideBrowserslist: browsersForTarget(options.target) })]).process(source, {
    from: inputPath,
    map: false
  });
  const minified = new CleanCSS({
    level: 2,
    format: options.beautify ? "beautify" : undefined,
    returnPromise: false
  }).minify(prefixed.css);
  if (minified.errors.length) throw new Error(minified.errors.join("\n"));
  return `${minified.styles}\n`;
}

async function transformJs(inputPath: string, options: CodeMinifyOptions) {
  const source = await fs.readFile(inputPath, "utf8");
  const transformed = await transformAsync(source, {
    filename: inputPath,
    babelrc: false,
    configFile: false,
    comments: false,
    presets: [
      [
        "@babel/preset-env",
        {
          bugfixes: true,
          modules: false,
          targets: options.target === "legacy" ? legacyBrowsers : "defaults",
          useBuiltIns: false
        }
      ]
    ]
  });
  const code = transformed?.code ?? source;
  const { minify } = await import("terser");
  const minified = await minify(code, {
    compress: {
      drop_console: options.removeConsole,
      passes: 2
    },
    ecma: options.target === "legacy" ? 5 : 2020,
    mangle: options.beautify ? false : { toplevel: true },
    format: {
      beautify: options.beautify,
      comments: false
    },
    toplevel: !options.beautify
  });
  if (!minified.code) throw new Error("JS 压缩没有生成输出内容。");
  return `${minified.code}\n`;
}

export async function minifyCode(options: CodeMinifyOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("code-minify");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "code-minify",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const ext = path.extname(inputPath).toLowerCase();
      if (ext !== ".css" && ext !== ".js" && ext !== ".mjs") {
        throw new Error(`不支持的文件类型：${path.basename(inputPath)}`);
      }
      const output = await uniqueOutputPath(options.outputDir, outputName(inputPath));
      const content = ext === ".css" ? await transformCss(inputPath, options) : await transformJs(inputPath, options);
      await writeTextFile(output, content);
      files.push(output);

      const [sourceStat, outputStat] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
      logs.push(`${path.basename(inputPath)}: ${sourceStat.size} bytes -> ${outputStat.size} bytes`);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}