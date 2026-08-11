import { app } from "electron";
import fs from "node:fs";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import path from "node:path";
import type { ConversionRecord, TaskStatus, ToolType } from "../../../shared/types";
import { ensureDir } from "./file-utils";
import { writeFileAtomic } from "./atomic-file";

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
  let mutationQueue: Promise<void> = Promise.resolve();

  function unpackedPath(filePath: string) {
    return filePath.replace("app.asar", "app.asar.unpacked");
  }

  async function openDb() {
    if (!dbPromise) {
      dbPromise = initSqlJs({
        locateFile: (file) => unpackedPath(path.join(path.dirname(require.resolve("sql.js/dist/sql-wasm.wasm")), file))
      }).then(async (SQL: SqlJsStatic) => {
        await ensureDir(dbDir);
        let db: Database;
        if (!fs.existsSync(dbPath)) {
          db = new SQL.Database();
        } else {
          try {
            db = new SQL.Database(fs.readFileSync(dbPath));
          } catch (primaryError) {
            const backupPath = `${dbPath}.bak`;
            if (!fs.existsSync(backupPath)) throw primaryError;
            db = new SQL.Database(fs.readFileSync(backupPath));
            fs.renameSync(dbPath, `${dbPath}.corrupt-${Date.now()}`);
          }
        }
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
        const interruptedAt = new Date().toISOString();
        db.run(
          `update conversion_tasks
           set status = 'interrupted', error_message = coalesce(error_message, '应用在任务完成前退出'), finished_at = ?
           where status = 'running';`,
          [interruptedAt]
        );
        await persist(db);
        return db;
      });
    }

    return dbPromise;
  }

  async function persist(db: Database) {
    await writeFileAtomic(dbPath, Buffer.from(db.export()));
  }

  function mutate(operation: (db: Database) => Promise<void> | void) {
    const task = mutationQueue.then(async () => {
      const db = await openDb();
      await operation(db);
      await persist(db);
    });
    mutationQueue = task.catch(() => undefined);
    return task;
  }

  return {
    async startTask(args) {
      await mutate((db) => { db.run(
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
          "running",
          JSON.stringify(args.options),
          new Date().toISOString()
        ]
      ); });
    },
    async finishTask(id, status, errorMessage) {
      await mutate((db) => { db.run(
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
      ); });
    },
    async list(limit = 80) {
      await mutationQueue;
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
      await mutate((db) => { db.run("delete from conversion_tasks"); });
    }
  };
}
