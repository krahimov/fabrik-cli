import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

const DEFAULT_CONFIG = `import { defineConfig } from "@fabrik/cli";

export default defineConfig({
  agent: {
    type: "http",
    url: "http://localhost:3000/api/chat",
  },
  tests: "./tests",
  llm: {
    provider: "chatgpt",
    model: "gpt-5.3-codex",
    // Uses your ChatGPT session token from ~/.codex/auth.json
    // Run \`codex login\` to authenticate
  },
});
`;

export async function runInit(): Promise<void> {
  const cwd = process.cwd();

  console.log();
  console.log(chalk.bold("  Fabrik — Initializing project"));
  console.log(chalk.dim("  " + "─".repeat(40)));
  console.log();

  // Create fabrik.config.ts
  const configPath = join(cwd, "fabrik.config.ts");
  if (existsSync(configPath)) {
    console.log(chalk.yellow("  fabrik.config.ts already exists, skipping"));
  } else {
    await writeFile(configPath, DEFAULT_CONFIG, "utf-8");
    console.log(chalk.green("  Created fabrik.config.ts"));
  }

  // Create tests directory
  const testsDir = join(cwd, "tests");
  if (existsSync(testsDir)) {
    console.log(chalk.yellow("  tests/ directory already exists, skipping"));
  } else {
    await mkdir(testsDir, { recursive: true });
    console.log(chalk.green("  Created tests/ directory"));
  }

  // Create tests/generated directory
  const generatedDir = join(cwd, "tests", "generated");
  if (!existsSync(generatedDir)) {
    await mkdir(generatedDir, { recursive: true });
    console.log(chalk.green("  Created tests/generated/ directory"));
  }

  // Create .fabrik directory
  const fabrikDir = join(cwd, ".fabrik");
  if (!existsSync(fabrikDir)) {
    await mkdir(fabrikDir, { recursive: true });
    console.log(chalk.green("  Created .fabrik/ directory"));
  }

  console.log();
  console.log(chalk.bold("  Next steps:"));
  console.log(chalk.dim("  1. Edit fabrik.config.ts with your agent URL"));
  console.log(chalk.dim("  2. Run `codex login` to authenticate with ChatGPT"));
  console.log(
    chalk.dim(
      '  3. Run: fabrik gen --description "describe your agent"'
    )
  );
  console.log(chalk.dim("  4. Run: fabrik run"));
  console.log();
}
