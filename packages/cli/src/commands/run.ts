import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import {
  ScenarioRunner,
  HttpAdapter,
  loadTestFiles,
  printTerminalReport,
  generateJsonReport,
  generateHtmlReport,
  SqliteTraceStore,
  readAgentProfile,
  ChatGPTProvider,
  OpenAIProvider,
  AnthropicProvider,
  type AgentAdapter,
  type AgentConfig,
  type LLMProvider,
} from "@fabriklabs/core";
import { loadConfig } from "../config.js";

export interface RunOptions {
  test?: string;
  tag?: string;
  parallel?: number;
  timeout?: number;
  format?: string;
  output?: string;
  save?: boolean;
  version?: string;
}

export async function runRun(options: RunOptions): Promise<void> {
  console.log();
  console.log(chalk.bold("  Fabrik — Running tests"));
  console.log(chalk.dim("  " + "─".repeat(40)));
  console.log();

  const config = await loadConfig();

  // Create agent adapter
  const adapter = createAdapter(config.agent);
  const agentConfig = buildAgentConfig(config.agent);
  await adapter.connect(agentConfig);

  // Create LLM provider (optional, needed for LLM assertions)
  let llmProvider: LLMProvider | undefined;
  try {
    llmProvider = createLlmProvider(config.llm);
  } catch {
    console.log(chalk.yellow("  Warning: No LLM provider configured. LLM assertions will fail."));
    console.log();
  }

  // Load agent profile if available (for grounded LLM judge assertions)
  const agentProfile = await readAgentProfile(process.cwd()) ?? undefined;
  if (agentProfile) {
    const age = Date.now() - new Date(agentProfile.discoveredAt).getTime();
    const days = Math.floor(age / (1000 * 60 * 60 * 24));
    if (days > 7) {
      console.log(chalk.yellow(`  Warning: Agent profile is ${days} days old. Run \`fabrik gen --refresh\` to update.`));
      console.log();
    }
  }

  // Discover tests
  const testsDir = resolve(config.tests ?? "./tests");
  console.log(chalk.dim(`  Loading tests from ${testsDir}...`));

  const scenarios = await loadTestFiles(testsDir, options.test);

  if (scenarios.length === 0) {
    console.log(chalk.yellow("  No test files found."));
    console.log(chalk.dim("  Run `fabrik gen --agent <url>` to generate tests."));
    console.log();
    await adapter.disconnect();
    return;
  }

  // Filter by tag
  let filtered = scenarios;
  if (options.tag) {
    filtered = scenarios.filter((s) => s.tags?.includes(options.tag!));
  }

  console.log(chalk.dim(`  Found ${filtered.length} scenarios`));
  console.log();

  // Run scenarios
  const runner = new ScenarioRunner(adapter, llmProvider, {
    timeout: options.timeout ?? config.eval?.defaultTimeout ?? 30000,
    agentProfile,
    retries: config.eval?.retries,
    parallelism: options.parallel ?? config.eval?.parallelism,
  });

  const results = await runner.runAll(filtered);

  // Report
  printTerminalReport(results);

  // Save to trace store if --save
  if (options.save) {
    const dbPath = resolve(config.store?.path ?? ".fabrik/traces.db");
    const version =
      options.version ?? `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    const store = new SqliteTraceStore(dbPath);
    const meta = store.saveRun(version, results);
    store.close();

    console.log(chalk.dim(`  Saved as version "${version}" (${meta.id.slice(0, 8)})`));
    console.log();
  }

  // Write report file if --output
  if (options.output) {
    const outputPath = resolve(options.output);
    if (options.format === "json") {
      await writeFile(outputPath, generateJsonReport(results, { version: options.version }), "utf-8");
      console.log(chalk.dim(`  JSON report → ${outputPath}`));
    } else if (options.format === "html") {
      await writeFile(outputPath, generateHtmlReport(results, { version: options.version }), "utf-8");
      console.log(chalk.dim(`  HTML report → ${outputPath}`));
    }
    console.log();
  }

  await adapter.disconnect();
}

function createAdapter(agentConfig: { type: string }): AgentAdapter {
  switch (agentConfig.type) {
    case "http":
      return new HttpAdapter();
    default:
      throw new Error(`Agent type "${agentConfig.type}" is not yet supported. Use "http" for now.`);
  }
}

function buildAgentConfig(agent: {
  type: string;
  url?: string;
  headers?: Record<string, string>;
  requestFormat?: "messages" | "legacy";
  bodyTemplate?: (msg: string, ctx?: { conversationId: string; turns: { role: string; message: string }[] }) => unknown;
  responseParser?: (data: unknown) => string;
  streaming?: boolean;
}): AgentConfig {
  if (agent.type === "http") {
    if (!agent.url) throw new Error("agent.url is required for HTTP agents");
    return {
      type: "http",
      url: agent.url,
      headers: agent.headers,
      requestFormat: agent.requestFormat,
      bodyTemplate: agent.bodyTemplate,
      responseParser: agent.responseParser,
      streaming: agent.streaming,
    };
  }
  throw new Error(`Unsupported agent type: ${agent.type}`);
}

function createLlmProvider(llmConfig?: {
  provider: string;
  model?: string;
  auth?: string;
  apiKey?: string;
  accessToken?: string;
  authPath?: string;
  baseURL?: string;
}): LLMProvider {
  if (!llmConfig) throw new Error("No LLM config");

  const provider = llmConfig.provider ?? "chatgpt";

  if (provider === "chatgpt") {
    return new ChatGPTProvider({
      model: llmConfig.model,
      accessToken: llmConfig.accessToken,
      authPath: llmConfig.authPath,
    });
  }

  if (provider === "anthropic") {
    const apiKey = llmConfig.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Anthropic API key required");
    return new AnthropicProvider({ apiKey, model: llmConfig.model });
  }

  if (provider === "openai") {
    const apiKey = llmConfig.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key required");
    return new OpenAIProvider({
      apiKey,
      model: llmConfig.model,
      baseURL: llmConfig.baseURL,
    });
  }

  throw new Error(`Unknown LLM provider: "${provider}". Use "chatgpt", "openai", or "anthropic".`);
}
