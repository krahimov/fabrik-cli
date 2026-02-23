import type { TraceStore } from "../store/trace.js";
import { diffResults, type DiffReport, type DiffOptions } from "./engine.js";

export interface RegressionCheckResult {
  diff: DiffReport;
  hasRegressions: boolean;
  regressionSummary: string;
  exitCode: number;
}

export function checkRegressions(
  store: TraceStore,
  beforeVersion: string,
  afterVersion: string,
  options?: DiffOptions
): RegressionCheckResult {
  const before = store.loadByVersion(beforeVersion);
  if (!before) {
    throw new Error(`Version "${beforeVersion}" not found in trace store.`);
  }

  const after = store.loadByVersion(afterVersion);
  if (!after) {
    throw new Error(`Version "${afterVersion}" not found in trace store.`);
  }

  const diff = diffResults(
    beforeVersion,
    before.results,
    afterVersion,
    after.results,
    options
  );

  const regressionSummary = diff.hasRegressions
    ? `${diff.summary.regressions} regression(s) detected comparing ${beforeVersion} to ${afterVersion}`
    : `No regressions comparing ${beforeVersion} to ${afterVersion}`;

  return {
    diff,
    hasRegressions: diff.hasRegressions,
    regressionSummary,
    exitCode: diff.hasRegressions ? 1 : 0,
  };
}
