import chalk from "chalk";
import Table from "cli-table3";
import type { RunResult } from "../scenario/types.js";

export function printTerminalReport(results: RunResult[]): void {
  console.log();
  console.log(chalk.bold("  Fabrik — Test Results"));
  console.log(chalk.dim("  " + "─".repeat(50)));
  console.log();

  const table = new Table({
    head: [
      chalk.bold("Scenario"),
      chalk.bold("Result"),
      chalk.bold("Score"),
      chalk.bold("Assertions"),
      chalk.bold("Duration"),
    ],
    style: { head: [], border: [] },
    colWidths: [35, 10, 10, 14, 12],
  });

  for (const result of results) {
    const status = result.passed
      ? chalk.green("PASS")
      : chalk.red("FAIL");

    const score = result.passed
      ? chalk.green(`${Math.round(result.score * 100)}%`)
      : chalk.red(`${Math.round(result.score * 100)}%`);

    const passedCount = result.assertions.filter((a) => a.passed).length;
    const totalCount = result.assertions.length;
    const assertionText =
      passedCount === totalCount
        ? chalk.green(`${passedCount}/${totalCount}`)
        : chalk.yellow(`${passedCount}/${totalCount}`);

    const duration = formatDuration(result.duration);

    table.push([
      truncate(result.scenario, 33),
      status,
      score,
      assertionText,
      duration,
    ]);
  }

  console.log(table.toString());
  console.log();

  // Print failed assertion details
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log(chalk.red.bold("  Failures:"));
    console.log();

    for (const result of failed) {
      console.log(chalk.red(`  ✗ ${result.scenario}`));

      if (result.error) {
        console.log(chalk.dim(`    Error: ${result.error}`));
      }

      for (const a of result.assertions.filter((a) => !a.passed)) {
        console.log(chalk.dim(`    [${a.type}] expected: ${a.expected}, got: ${a.actual}`));
        if (a.reasoning) {
          console.log(chalk.dim(`      reason: ${a.reasoning}`));
        }
        if (a.error) {
          console.log(chalk.dim(`      error: ${a.error}`));
        }
      }
      console.log();
    }
  }

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failedCount = total - passed;

  const summary = [
    chalk.bold(`  ${total} scenarios`),
    chalk.green(`${passed} passed`),
    failedCount > 0 ? chalk.red(`${failedCount} failed`) : null,
  ]
    .filter(Boolean)
    .join(chalk.dim(" · "));

  console.log(summary);

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(chalk.dim(`  Completed in ${formatDuration(totalDuration)}`));
  console.log();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
