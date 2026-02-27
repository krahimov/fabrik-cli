import { Command } from "commander";
import { createRequire } from "node:module";
import { runInit } from "./commands/init.js";
import { runGen } from "./commands/gen.js";
import { runRun } from "./commands/run.js";
import { runDiff } from "./commands/diff.js";

const require = createRequire(import.meta.url);
const packageVersion =
  process.env.FABRIK_CLI_VERSION ??
  (require("../package.json") as { version?: string }).version ??
  "0.0.0";

const program = new Command();

program
  .name("fabrik")
  .description("Agent evaluation harness — pytest for AI agents")
  .version(packageVersion);

program
  .command("init")
  .description("Initialize a new Fabrik project")
  .action(async () => {
    await runInit();
  });

program
  .command("gen")
  .description("Discover an agent and generate test files")
  .option("--repo <url>", "Git repo URL to clone and explore")
  .option("--dir <path>", "Local directory to explore")
  .option("--agent <url>", "HTTP endpoint to probe")
  .option("--assistant <id>", "OpenAI Assistant ID")
  .option("--refresh", "Force re-discovery even if cached profile exists")
  .option("--refresh-probes", "Re-run HTTP probes only, keep repo data")
  .option("--description <text>", "Optional hint about what the agent does")
  .option("--system-prompt <file>", "Path to agent system prompt file")
  .option("--count <n>", "Number of test files to generate", "10")
  .option(
    "--categories <list>",
    "Specific categories: happy,edge,adversarial,guardrail,multi-turn,tool-use"
  )
  .option("--output <dir>", "Output directory", "tests/generated")
  .action(async (options) => {
    await runGen({
      repo: options.repo,
      dir: options.dir,
      agent: options.agent,
      assistant: options.assistant,
      refresh: options.refresh,
      refreshProbes: options.refreshProbes,
      description: options.description,
      systemPrompt: options.systemPrompt,
      count: parseInt(options.count, 10),
      categories: options.categories,
      output: options.output,
    });
  });

program
  .command("run")
  .description("Run all discovered tests")
  .option("--test <pattern>", "Filter by test name/file")
  .option("--tag <tag>", "Filter by tag")
  .option("--parallel <n>", "Concurrent scenario runs")
  .option("--timeout <ms>", "Override default timeout")
  .option("--format <type>", "Output format: terminal, json, html", "terminal")
  .option("--output <file>", "Write report to file")
  .option("--save", "Save results to trace store (.fabrik/traces.db)")
  .option("--label <label>", "Version label for saved results")
  .action(async (options) => {
    await runRun({
      test: options.test,
      tag: options.tag,
      parallel: options.parallel ? parseInt(options.parallel, 10) : undefined,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      format: options.format,
      output: options.output,
      save: options.save,
      version: options.label,
    });
  });

program
  .command("diff")
  .description("Compare test results between two versions")
  .requiredOption("--before <version>", "Base version to compare from")
  .requiredOption("--after <version>", "Target version to compare to")
  .option("--threshold <n>", "Score delta threshold for regression detection", "0.05")
  .option("--json", "Output diff as JSON")
  .action(async (options) => {
    await runDiff({
      before: options.before,
      after: options.after,
      threshold: options.threshold ? parseFloat(options.threshold) : undefined,
      json: options.json,
    });
  });

program.parse();
