import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  TestGenerator,
  ChatGPTProvider,
  OpenAIProvider,
  AnthropicProvider,
  type LLMProvider,
} from "@fabrik/core";
import { loadConfig } from "../config.js";

export interface GenOptions {
  agent?: string;
  description: string;
  systemPrompt?: string;
  count?: number;
  categories?: string;
  output?: string;
}

export async function runGen(options: GenOptions): Promise<void> {
  console.log();
  console.log(chalk.bold("  Fabrik — Generating tests"));
  console.log(chalk.dim("  " + "─".repeat(40)));
  console.log();

  // Load config (optional for gen, can work without it)
  let config;
  try {
    config = await loadConfig();
  } catch {
    // Config is optional for gen
  }

  // Resolve LLM provider
  const llmProvider = createLlmProvider(config?.llm);

  // Read system prompt file if provided
  let systemPromptContent: string | undefined;
  if (options.systemPrompt) {
    systemPromptContent = await readFile(resolve(options.systemPrompt), "utf-8");
  }

  const outputDir = resolve(options.output ?? "tests/generated");
  const categories = options.categories?.split(",").map((c) => c.trim());

  console.log(chalk.dim(`  Agent: ${options.agent ?? config?.agent?.url ?? "from config"}`));
  console.log(chalk.dim(`  Output: ${outputDir}`));
  console.log(chalk.dim(`  Count: ${options.count ?? 10}`));
  if (categories) {
    console.log(chalk.dim(`  Categories: ${categories.join(", ")}`));
  }
  console.log();

  const generator = new TestGenerator(llmProvider);

  console.log(chalk.dim("  Generating test plan..."));

  const files = await generator.generate({
    agentUrl: options.agent ?? config?.agent?.url,
    description: options.description,
    systemPrompt: systemPromptContent,
    count: options.count,
    categories,
    outputDir,
  });

  console.log();
  console.log(chalk.green.bold(`  Generated ${files.length} test files:`));
  console.log();

  for (const file of files) {
    console.log(chalk.green(`  + ${file.path}`));
    console.log(chalk.dim(`    ${file.category} → ${file.scenarioName}`));
  }

  console.log();
  console.log(chalk.bold("  Run them with: fabrik run"));
  console.log();
}

function createLlmProvider(llmConfig?: {
  provider: string;
  model?: string;
  apiKey?: string;
  accessToken?: string;
  authPath?: string;
  baseURL?: string;
}): LLMProvider {
  const provider = llmConfig?.provider ?? "chatgpt";

  if (provider === "chatgpt") {
    return new ChatGPTProvider({
      model: llmConfig?.model,
      accessToken: llmConfig?.accessToken,
      authPath: llmConfig?.authPath,
    });
  }

  if (provider === "anthropic") {
    const apiKey = llmConfig?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Anthropic API key required. Set ANTHROPIC_API_KEY or configure in fabrik.config.ts"
      );
    }
    return new AnthropicProvider({
      apiKey,
      model: llmConfig?.model,
    });
  }

  if (provider === "openai") {
    const apiKey = llmConfig?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key required. Set OPENAI_API_KEY or configure in fabrik.config.ts"
      );
    }
    return new OpenAIProvider({
      apiKey,
      model: llmConfig?.model,
      baseURL: llmConfig?.baseURL,
    });
  }

  throw new Error(`Unknown LLM provider: "${provider}". Use "chatgpt", "openai", or "anthropic".`);
}
