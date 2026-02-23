import type { RunResult } from "../scenario/types.js";

export interface JsonReport {
  fabrikVersion: string;
  createdAt: string;
  version?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgScore: number;
    totalDuration: number;
  };
  results: RunResult[];
}

export function generateJsonReport(
  results: RunResult[],
  options?: { version?: string }
): string {
  const passed = results.filter((r) => r.passed).length;
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const report: JsonReport = {
    fabrikVersion: "0.1.0",
    createdAt: new Date().toISOString(),
    version: options?.version,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      avgScore: Math.round(avgScore * 1000) / 1000,
      totalDuration: Math.round(totalDuration),
    },
    results,
  };

  return JSON.stringify(report, null, 2);
}
