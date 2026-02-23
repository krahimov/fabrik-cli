import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { RunResult } from "../scenario/types.js";
import type { TraceStore, RunMeta, StoredRun } from "./trace.js";

export class SqliteTraceStore implements TraceStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id         TEXT PRIMARY KEY,
        version    TEXT NOT NULL,
        created_at TEXT NOT NULL,
        meta       TEXT
      );
      CREATE TABLE IF NOT EXISTS results (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        scenario   TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        score      REAL NOT NULL,
        data       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_results_run_id ON results(run_id);
      CREATE INDEX IF NOT EXISTS idx_results_scenario ON results(scenario);
      CREATE INDEX IF NOT EXISTS idx_runs_version ON runs(version);
    `);
  }

  saveRun(version: string, results: RunResult[], extraMeta?: Record<string, unknown>): RunMeta {
    const runId = randomUUID();
    const now = new Date().toISOString();
    const passedCount = results.filter((r) => r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const insertRun = this.db.prepare(
      "INSERT INTO runs (id, version, created_at, meta) VALUES (?, ?, ?, ?)"
    );
    const insertResult = this.db.prepare(
      "INSERT INTO results (id, run_id, scenario, passed, score, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    const transaction = this.db.transaction(() => {
      insertRun.run(runId, version, now, extraMeta ? JSON.stringify(extraMeta) : null);
      for (const result of results) {
        insertResult.run(
          randomUUID(),
          runId,
          result.scenario,
          result.passed ? 1 : 0,
          result.score,
          JSON.stringify(result),
          now
        );
      }
    });
    transaction();

    return {
      id: runId,
      version,
      createdAt: now,
      scenarioCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      totalDuration,
    };
  }

  loadRun(runId: string): StoredRun | null {
    const run = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as { id: string; version: string; created_at: string } | undefined;

    if (!run) return null;

    const rows = this.db
      .prepare("SELECT data FROM results WHERE run_id = ? ORDER BY scenario")
      .all(runId) as { data: string }[];

    const results: RunResult[] = rows.map((r) => JSON.parse(r.data));

    return {
      meta: this.buildMeta(run, results),
      results,
    };
  }

  loadByVersion(version: string): StoredRun | null {
    const run = this.db
      .prepare("SELECT * FROM runs WHERE version = ? ORDER BY created_at DESC LIMIT 1")
      .get(version) as { id: string; version: string; created_at: string } | undefined;

    if (!run) return null;
    return this.loadRun(run.id);
  }

  listRuns(limit = 50): RunMeta[] {
    const runs = this.db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as { id: string; version: string; created_at: string }[];

    return runs.map((run) => {
      const stats = this.db
        .prepare(
          "SELECT COUNT(*) as total, SUM(passed) as passed, SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed FROM results WHERE run_id = ?"
        )
        .get(run.id) as { total: number; passed: number; failed: number };

      const durRow = this.db
        .prepare("SELECT SUM(json_extract(data, '$.duration')) as dur FROM results WHERE run_id = ?")
        .get(run.id) as { dur: number | null };

      return {
        id: run.id,
        version: run.version,
        createdAt: run.created_at,
        scenarioCount: stats.total,
        passedCount: stats.passed ?? 0,
        failedCount: stats.failed ?? 0,
        totalDuration: durRow.dur ?? 0,
      };
    });
  }

  listVersions(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT version FROM runs ORDER BY created_at DESC")
      .all() as { version: string }[];
    return rows.map((r) => r.version);
  }

  deleteRun(runId: string): void {
    this.db.prepare("DELETE FROM results WHERE run_id = ?").run(runId);
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
  }

  close(): void {
    this.db.close();
  }

  private buildMeta(
    run: { id: string; version: string; created_at: string },
    results: RunResult[]
  ): RunMeta {
    return {
      id: run.id,
      version: run.version,
      createdAt: run.created_at,
      scenarioCount: results.length,
      passedCount: results.filter((r) => r.passed).length,
      failedCount: results.filter((r) => !r.passed).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    };
  }
}
