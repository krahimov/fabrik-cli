import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  generateTests,
  discoverAgent,
  readAgentProfile,
  writeAgentProfile,
  HttpAdapter,
  ChatGPTProvider,
  OpenAIProvider,
  AnthropicProvider,
  type LLMProvider,
  type AgentProfile,
  type AgentSource,
  type FileReader,
} from "@fabrik/core";
import { loadConfig } from "../config.js";
import { LocalSandbox } from "../sandbox/local.js";

export interface GenOptions {
  repo?: string;
  dir?: string;
  agent?: string;
  assistant?: string;
  refresh?: boolean;
  refreshProbes?: boolean;
  description?: string;
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

  // Load config (optional for gen)
  let config;
  try {
    config = await loadConfig();
  } catch {
    // Config is optional for gen
  }

  // Resolve LLM provider
  const llmProvider = createLlmProvider(config?.llm);

  const outputDir = resolve(options.output ?? "tests/generated");
  const categories = options.categories?.split(",").map((c) => c.trim());
  const cwd = process.cwd();

  // Step 1: Check for cached profile
  let profile: AgentProfile | null = null;

  if (!options.refresh) {
    profile = await readAgentProfile(cwd);
    if (profile) {
      const age = Date.now() - new Date(profile.discoveredAt).getTime();
      const days = Math.floor(age / (1000 * 60 * 60 * 24));
      if (days > 7) {
        console.log(chalk.yellow(`  Warning: Agent profile is ${days} days old. Use --refresh to update.`));
        console.log();
      } else {
        console.log(chalk.dim(`  Using cached agent profile (${days}d old). Use --refresh to re-discover.`));
        console.log();
      }
    }
  }

  // Step 2: Discover if no cached profile
  if (!profile || options.refresh) {
    const source = resolveSource(options, config);

    console.log(chalk.dim(`  Discovery source: ${describeSource(source)}`));
    console.log();

    if (source.type === "http") {
      // HTTP probe-based discovery
      const adapter = new HttpAdapter();
      await adapter.connect({ type: "http", url: source.url });

      profile = await discoverAgent({
        source,
        llm: llmProvider,
        adapter,
        agentConfig: { type: "http", url: source.url },
        description: options.description,
        onProgress: (msg) => console.log(chalk.dim(`  ${msg}`)),
      });

      await adapter.disconnect();
    } else if (source.type === "local-dir") {
      // Local directory discovery
      const sandbox = new LocalSandbox(source.path);
      const handle = await sandbox.create();

      const fileReader: FileReader = {
        readFile: (path: string) => handle.readFile(path),
        exec: async (cmd: string) => {
          const result = await handle.exec(cmd);
          return result.stdout;
        },
      };

      profile = await discoverAgent({
        source,
        llm: llmProvider,
        fileReader,
        description: options.description,
        onProgress: (msg) => console.log(chalk.dim(`  ${msg}`)),
      });

      await sandbox.destroy(handle);
    } else if (source.type === "repo") {
      // Repo-based discovery — for now, clone locally
      console.log(chalk.dim("  Cloning repository..."));
      const sandbox = new LocalSandbox();
      const handle = await sandbox.create();

      const tmpDir = `/tmp/fabrik-discovery-${Date.now()}`;
      await handle.exec(`git clone --depth 1 ${source.url} ${tmpDir}`);

      const fileReader: FileReader = {
        readFile: (path: string) => handle.readFile(path),
        exec: async (cmd: string) => {
          const result = await handle.exec(cmd);
          return result.stdout;
        },
      };

      profile = await discoverAgent({
        source: { type: "local-dir", path: tmpDir },
        llm: llmProvider,
        fileReader,
        description: options.description,
        onProgress: (msg) => console.log(chalk.dim(`  ${msg}`)),
      });

      // Clean up
      await handle.exec(`rm -rf ${tmpDir}`);
      await sandbox.destroy(handle);

      // Fix the source back to repo
      profile.source = source;
    } else {
      // Fallback: minimal profile from description
      profile = {
        discoveredAt: new Date().toISOString(),
        source,
        confidence: 0.2,
        name: "Agent",
        description: options.description ?? "AI agent",
        domain: "unknown",
        tools: [],
        knownConstraints: [],
        expectedTone: "professional",
        supportedLanguages: ["en"],
        evidence: [],
      };
    }

    // Cache the profile
    await writeAgentProfile(cwd, profile);
    console.log(chalk.dim(`  Profile cached at .fabrik/agent-profile.json`));
    console.log();
  }

  // Step 3: Print profile summary
  console.log(chalk.bold(`  Agent: ${profile.name}`));
  console.log(chalk.dim(`  Domain: ${profile.domain} | Confidence: ${Math.round(profile.confidence * 100)}%`));
  if (profile.tools.length > 0) {
    console.log(chalk.dim(`  Tools: ${profile.tools.map((t) => t.name).join(", ")}`));
  }
  if (profile.knownConstraints.length > 0) {
    console.log(chalk.dim(`  Constraints: ${profile.knownConstraints.length} found`));
  }
  console.log();

  // Step 4: Generate tests from profile
  const files = await generateTests(profile, llmProvider, {
    count: options.count,
    categories,
    outputDir,
    onProgress: (msg) => console.log(chalk.dim(`  ${msg}`)),
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

function resolveSource(
  options: GenOptions,
  config?: { agent?: { type: string; url?: string; assistantId?: string } }
): AgentSource {
  if (options.repo) return { type: "repo", url: options.repo };
  if (options.dir) return { type: "local-dir", path: resolve(options.dir) };
  if (options.agent) return { type: "http", url: options.agent };
  if (options.assistant) return { type: "openai-assistant", assistantId: options.assistant };

  // Fall back to config
  if (config?.agent?.url) return { type: "http", url: config.agent.url };
  if (config?.agent?.assistantId)
    return { type: "openai-assistant", assistantId: config.agent.assistantId };

  throw new Error(
    "No agent source specified. Use --repo, --dir, --agent, or --assistant, or configure in fabrik.config.ts"
  );
}

function describeSource(source: AgentSource): string {
  switch (source.type) {
    case "repo":
      return `repo ${source.url}`;
    case "local-dir":
      return `directory ${source.path}`;
    case "http":
      return `HTTP endpoint ${source.url}`;
    case "openai-assistant":
      return `OpenAI Assistant ${source.assistantId}`;
  }
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
    return new AnthropicProvider({ apiKey, model: llmConfig?.model });
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
