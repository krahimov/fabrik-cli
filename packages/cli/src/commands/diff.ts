import { resolve } from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  SqliteTraceStore,
  checkRegressions,
  type DiffReport,
  type ScenarioDiff,
  type DiffStatus,
} from "@fabrik/core";
import { loadConfig } from "../config.js";

export interface DiffOptions {
  before: string;
  after: string;
  threshold?: number;
  json?: boolean;
}

export async function runDiff(options: DiffOptions): Promise<void> {
  console.log();
  console.log(chalk.bold("  Fabrik — Diff"));
  console.log(chalk.dim("  " + "─".repeat(40)));
  console.log();

  const config = await loadConfig();
  const dbPath = resolve(config.store?.path ?? ".fabrik/traces.db");
  const store = new SqliteTraceStore(dbPath);

  try {
    const beforeVersion = resolveVersion(store, options.before);
    const afterVersion = resolveVersion(store, options.after);

    const result = checkRegressions(store, beforeVersion, afterVersion, {
      regressionThreshold: options.threshold ?? config.diff?.regressionThreshold ?? 0.05,
    });

    if (options.json) {
      console.log(JSON.stringify(result.diff, null, 2));
    } else {
      printDiffTable(result.diff);
    }

    process.exitCode = result.exitCode;
  } finally {
    store.close();
  }
}

function resolveVersion(store: SqliteTraceStore, version: string): string {
  if (version === "latest") {
    const versions = store.listVersions();
    if (versions.length === 0) throw new Error("No runs stored yet.");
    return versions[0];
  }
  if (version === "previous") {
    const versions = store.listVersions();
    if (versions.length < 2) throw new Error("Need at least 2 stored runs to use 'previous'.");
    return versions[1];
  }
  return version;
}

function printDiffTable(diff: DiffReport): void {
  console.log(chalk.bold(`  Comparing: ${diff.beforeVersion} → ${diff.afterVersion}`));
  console.log();

  const table = new Table({
    head: [
      chalk.bold("Scenario"),
      chalk.bold(diff.beforeVersion),
      chalk.bold(diff.afterVersion),
      chalk.bold("Delta"),
      chalk.bold("Status"),
    ],
    style: { head: [], border: [] },
  });

  for (const s of diff.scenarios) {
    table.push(formatDiffRow(s));
  }

  console.log(table.toString());
  console.log();

  const parts = [
    `${diff.summary.total} scenarios`,
    diff.summary.stable > 0 ? chalk.dim(`${diff.summary.stable} stable`) : null,
    diff.summary.improvements > 0 ? chalk.green(`${diff.summary.improvements} improved`) : null,
    diff.summary.regressions > 0 ? chalk.red(`${diff.summary.regressions} regressed`) : null,
    diff.summary.added > 0 ? chalk.yellow(`${diff.summary.added} added`) : null,
    diff.summary.removed > 0 ? chalk.yellow(`${diff.summary.removed} removed`) : null,
  ]
    .filter(Boolean)
    .join(chalk.dim(" · "));

  console.log(`  ${parts}`);

  if (diff.hasRegressions) {
    console.log();
    console.log(chalk.red.bold(`  ⚠ ${diff.summary.regressions} regression(s) detected`));
  }
  console.log();
}

function formatDiffRow(s: ScenarioDiff): string[] {
  const name = truncate(s.scenario, 32);

  const beforeCol = s.before
    ? `${s.before.passed ? chalk.green("PASS") : chalk.red("FAIL")} ${Math.round(s.before.score * 100)}%`
    : chalk.dim("—");

  const afterCol = s.after
    ? `${s.after.passed ? chalk.green("PASS") : chalk.red("FAIL")} ${Math.round(s.after.score * 100)}%`
    : chalk.dim("—");

  const deltaCol =
    s.scoreDelta !== undefined
      ? formatDelta(s.scoreDelta)
      : s.status === "added"
        ? chalk.yellow("new")
        : chalk.yellow("removed");

  const statusCol = formatStatus(s.status);

  return [name, beforeCol, afterCol, deltaCol, statusCol];
}

function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  if (pct === 0) return chalk.dim("—");
  if (pct > 0) return chalk.green(`+${pct}%`);
  return chalk.red(`${pct}%`);
}

function formatStatus(status: DiffStatus): string {
  switch (status) {
    case "regression":
      return chalk.red.bold("REGRESSED");
    case "improvement":
      return chalk.green("improved");
    case "stable":
      return chalk.dim("stable");
    case "added":
      return chalk.yellow("added");
    case "removed":
      return chalk.yellow("removed");
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
