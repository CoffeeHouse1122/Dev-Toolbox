import { app } from "electron";
import fs from "node:fs";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import path from "node:path";
import type { ConversionRecord, TaskStatus, ToolType } from "../../../shared/types";
import { ensureDir } from "./file-utils";

export interface HistoryService {
  startTask(args: {
    id: string;
    toolType: ToolType;
    sourcePath: string;
    outputPath: string;
    options: unknown;
  }): Promise<void>;
  finishTask(id: string, status: TaskStatus, errorMessage?: string): Promise<void>;
  list(limit?: number): Promise<ConversionRecord[]>;
  clear(): Promise<void>;
}

export function createHistoryService(): HistoryService {
  const userData = app.getPath("userData");
  const dbDir = path.join(userData, "data");
  const dbPath = path.join(dbDir, "dev-toolbox.sqlite");
  let dbPromise: Promise<Database> | null = null;

  function unpackedPath(filePath: string) {
    return filePath.replace("app.asar", "app.asar.unpacked");
  }

  async function openDb() {
    if (!dbPromise) {
      dbPromise = initSqlJs({
        locateFile: (file) => unpackedPath(path.join(path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm")), file))
      }).then(async (SQL: SqlJsStatic) => {
        await ensureDir(dbDir);
        const existing = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
        const db = existing ? new SQL.Database(existing) : new SQL.Database();
        db.run(`
          create table if not exists conversion_tasks (
            id text primary key,
            tool_type text not null,
            source_path text not null,
            output_path text not null,
            status text not null,
            options_json text not null,
            error_message text,
            created_at text not null,
            finished_at text
          );
        `);
        persist(db);
        return db;
      });
    }

    return dbPromise;
  }

  function persist(db: Database) {
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }

  return {
    async startTask(args) {
      const db = await openDb();
      db.run(
        `
          insert into conversion_tasks (
            id, tool_type, source_path, output_path, status, options_json, error_message, created_at, finished_at
          ) values (?, ?, ?, ?, ?, ?, null, ?, null);
        `,
        [
          args.id,
          args.toolType,
          args.sourcePath,
          args.outputPath,
          "success",
          JSON.stringify(args.options),
          new Date().toISOString()
        ]
      );
      persist(db);
    },
    async finishTask(id, status, errorMessage) {
      const db = await openDb();
      db.run(
        `
          update conversion_tasks
          set status = ?,
              error_message = ?,
              finished_at = ?
          where id = ?;
        `,
        [
          status,
          errorMessage ?? null,
          new Date().toISOString(),
          id
        ]
      );
      persist(db);
    },
    async list(limit = 80) {
      const db = await openDb();
      const result = db.exec(
        `
          select
            id,
            tool_type as toolType,
            source_path as sourcePath,
            output_path as outputPath,
            status,
            options_json as optionsJson,
            error_message as errorMessage,
            created_at as createdAt,
            finished_at as finishedAt
          from conversion_tasks
          order by created_at desc
          limit ?;
        `,
        [limit]
      )[0];

      if (!result) {
        return [];
      }

      return result.values.map((row) => {
        const record = Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
        return record as unknown as ConversionRecord;
      });
    },
    async clear() {
      const db = await openDb();
      db.run("delete from conversion_tasks");
      persist(db);
    }
  };
}
