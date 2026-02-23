import type { RunResult } from "../scenario/types.js";

export interface RunMeta {
  id: string;
  version: string;
  createdAt: string;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  totalDuration: number;
}

export interface StoredRun {
  meta: RunMeta;
  results: RunResult[];
}

export interface TraceStore {
  saveRun(version: string, results: RunResult[], meta?: Record<string, unknown>): RunMeta;
  loadRun(runId: string): StoredRun | null;
  loadByVersion(version: string): StoredRun | null;
  listRuns(limit?: number): RunMeta[];
  listVersions(): string[];
  deleteRun(runId: string): void;
  close(): void;
}
