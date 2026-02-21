import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runGen } from "./commands/gen.js";
import { runRun } from "./commands/run.js";

const program = new Command();

program
  .name("fabrik")
  .description("Agent evaluation harness — pytest for AI agents")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a new Fabrik project")
  .action(async () => {
    await runInit();
  });

program
  .command("gen")
  .description("Generate test files from an agent description")
  .option("--agent <url>", "Agent endpoint URL")
  .requiredOption("--description <text>", "What the agent does")
  .option("--system-prompt <file>", "Path to agent system prompt file")
  .option("--count <n>", "Number of test files to generate", "10")
  .option(
    "--categories <list>",
    "Specific categories: happy,edge,adversarial,guardrail,multi-turn,tool-use"
  )
  .option("--output <dir>", "Output directory", "tests/generated")
  .action(async (options) => {
    await runGen({
      agent: options.agent,
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
  .action(async (options) => {
    await runRun({
      test: options.test,
      tag: options.tag,
      parallel: options.parallel ? parseInt(options.parallel, 10) : undefined,
      timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
      format: options.format,
      output: options.output,
    });
  });

program.parse();
