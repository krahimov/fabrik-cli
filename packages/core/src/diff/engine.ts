import type { RunResult } from "../scenario/types.js";

export type DiffStatus = "regression" | "improvement" | "stable" | "added" | "removed";

export interface ScenarioDiff {
  scenario: string;
  status: DiffStatus;
  before?: { passed: boolean; score: number };
  after?: { passed: boolean; score: number };
  scoreDelta?: number;
  passFlipped?: boolean;
}

export interface DiffSummary {
  total: number;
  regressions: number;
  improvements: number;
  stable: number;
  added: number;
  removed: number;
}

export interface DiffReport {
  beforeVersion: string;
  afterVersion: string;
  scenarios: ScenarioDiff[];
  summary: DiffSummary;
  hasRegressions: boolean;
}

export interface DiffOptions {
  regressionThreshold?: number;
}

export function diffResults(
  beforeVersion: string,
  beforeResults: RunResult[],
  afterVersion: string,
  afterResults: RunResult[],
  options?: DiffOptions
): DiffReport {
  const threshold = options?.regressionThreshold ?? 0.05;

  const beforeMap = new Map<string, RunResult>();
  for (const r of beforeResults) beforeMap.set(r.scenario, r);

  const afterMap = new Map<string, RunResult>();
  for (const r of afterResults) afterMap.set(r.scenario, r);

  const allScenarios = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const scenarios: ScenarioDiff[] = [];

  for (const name of allScenarios) {
    const before = beforeMap.get(name);
    const after = afterMap.get(name);

    if (before && after) {
      const scoreDelta = after.score - before.score;
      const passFlipped = before.passed !== after.passed;

      let status: DiffStatus;
      if (!after.passed && before.passed) {
        status = "regression";
      } else if (after.passed && !before.passed) {
        status = "improvement";
      } else if (scoreDelta < -threshold) {
        status = "regression";
      } else if (scoreDelta > threshold) {
        status = "improvement";
      } else {
        status = "stable";
      }

      scenarios.push({
        scenario: name,
        status,
        before: { passed: before.passed, score: before.score },
        after: { passed: after.passed, score: after.score },
        scoreDelta,
        passFlipped,
      });
    } else if (after && !before) {
      scenarios.push({
        scenario: name,
        status: "added",
        after: { passed: after.passed, score: after.score },
      });
    } else if (before && !after) {
      scenarios.push({
        scenario: name,
        status: "removed",
        before: { passed: before.passed, score: before.score },
      });
    }
  }

  const statusOrder: Record<DiffStatus, number> = {
    regression: 0,
    improvement: 1,
    stable: 2,
    added: 3,
    removed: 4,
  };
  scenarios.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  const summary: DiffSummary = {
    total: scenarios.length,
    regressions: scenarios.filter((s) => s.status === "regression").length,
    improvements: scenarios.filter((s) => s.status === "improvement").length,
    stable: scenarios.filter((s) => s.status === "stable").length,
    added: scenarios.filter((s) => s.status === "added").length,
    removed: scenarios.filter((s) => s.status === "removed").length,
  };

  return {
    beforeVersion,
    afterVersion,
    scenarios,
    summary,
    hasRegressions: summary.regressions > 0,
  };
}
