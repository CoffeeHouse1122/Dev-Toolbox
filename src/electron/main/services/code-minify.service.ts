import fs from "node:fs/promises";
import path from "node:path";
import { transformAsync } from "@babel/core";
import autoprefixer from "autoprefixer";
import CleanCSS from "clean-css";
import postcss from "postcss";
import type { CodeMinifyOptions, ConversionItemResult, ConversionResult } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, uniqueOutputPath, writeTextFile } from "./file-utils";
import { readDecodedTextFile } from "./text-encoding";

const legacyBrowsers = ["last 2 versions", "iOS >= 7", "Android > 4.1", "Firefox > 20"];

function browsersForTarget(target: CodeMinifyOptions["target"]) {
  return target === "legacy" ? legacyBrowsers : ["defaults"];
}

function outputName(inputPath: string) {
  const ext = path.extname(inputPath).toLowerCase();
  return `${safeBaseName(inputPath)}.min${ext}`;
}

type TransformOutput = {
  code: string;
  map: string;
  sourceEncoding: string;
};

async function transformCss(inputPath: string, outputName: string, mapName: string, options: CodeMinifyOptions): Promise<TransformOutput> {
  const decoded = await readDecodedTextFile(inputPath);
  const sourceName = path.basename(inputPath);
  const prefixed = await postcss([autoprefixer({ overrideBrowserslist: browsersForTarget(options.target) })]).process(decoded.text, {
    from: sourceName,
    to: outputName,
    map: { inline: false, annotation: false, sourcesContent: true }
  });
  const minified = new CleanCSS({
    level: 2,
    format: options.beautify ? "beautify" : undefined,
    sourceMap: true,
    returnPromise: false
  }).minify({
    [sourceName]: {
      styles: prefixed.css,
      sourceMap: prefixed.map?.toString()
    }
  });
  if (minified.errors.length) throw new Error(minified.errors.join("\n"));
  return {
    code: `${minified.styles}\n/*# sourceMappingURL=${mapName} */\n`,
    map: minified.sourceMap?.toString() ?? "",
    sourceEncoding: decoded.encoding
  };
}

function stripSourceMapDirectives(source: string) {
  return source
    .replace(/^\s*\/\/[#@]\s*sourceMappingURL=.*$/gm, "")
    .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g, "");
}

async function transformJs(inputPath: string, outputName: string, mapName: string, options: CodeMinifyOptions): Promise<TransformOutput> {
  const decoded = await readDecodedTextFile(inputPath);
  const sourceName = path.basename(inputPath);
  // Do not let an input sourceMappingURL make Babel read arbitrary adjacent
  // files. A fresh source map is generated below from the selected file only.
  const transformed = await transformAsync(stripSourceMapDirectives(decoded.text), {
    filename: inputPath,
    babelrc: false,
    configFile: false,
    comments: false,
    sourceMaps: true,
    sourceFileName: sourceName,
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
  const code = transformed?.code ?? decoded.text;
  const { minify } = await import("terser");
  const minified = await minify({ [sourceName]: code }, {
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
    sourceMap: {
      content: transformed?.map ? JSON.stringify(transformed.map) : undefined,
      filename: outputName,
      url: mapName
    },
    toplevel: !options.beautify
  });
  if (!minified.code) throw new Error("JS 压缩没有生成输出内容。");
  return {
    code: `${minified.code}\n`,
    map: typeof minified.map === "string" ? minified.map : JSON.stringify(minified.map ?? {}),
    sourceEncoding: decoded.encoding
  };
}

export async function minifyCode(options: CodeMinifyOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("code-minify");
  const logs: string[] = [];
  const files: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let output = "";
      let mapOutput = "";
      let wroteOutput = false;
      let wroteMap = false;
      try {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext !== ".css" && ext !== ".js" && ext !== ".mjs") {
          throw new Error(`不支持的文件类型：${path.basename(inputPath)}`);
        }
        output = await uniqueOutputPath(options.outputDir, outputName(inputPath));
        mapOutput = await uniqueOutputPath(options.outputDir, `${path.basename(output)}.map`);
        const transformed =
          ext === ".css"
            ? await transformCss(inputPath, path.basename(output), path.basename(mapOutput), options)
            : await transformJs(inputPath, path.basename(output), path.basename(mapOutput), options);
        await writeTextFile(output, transformed.code);
        wroteOutput = true;
        await writeTextFile(mapOutput, transformed.map);
        wroteMap = true;
        files.push(output, mapOutput);

        const [sourceStat, outputStat] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
        logs.push(`${path.basename(inputPath)} [${transformed.sourceEncoding}]: ${sourceStat.size} bytes -> ${outputStat.size} bytes + source map`);
        items.push({ inputPath, outputPath: output, status: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await Promise.all(
          [wroteOutput ? output : "", wroteMap ? mapOutput : ""]
            .filter(Boolean)
            .map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined))
        );
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`${path.basename(inputPath)}: ${message}`);
      }
    }

    const failed = items.filter((item) => item.status === "error");
    const status = failed.length === 0 ? "success" : files.length > 0 ? "partial" : "error";
    const errorMessage = failed.length ? `${failed.length}/${items.length} 个文件处理失败` : undefined;
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, items, errorMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, items, errorMessage: message };
  }
}
