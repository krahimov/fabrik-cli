import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LLMProvider } from "../llm/provider.js";
import type { AgentProfile } from "../discovery/agent-profile.js";
import { planTests, type TestPlan, type TestPlanCategory, type TestPlanScenario } from "./planner.js";
import { writeTestFile, type GeneratedTest } from "./writer.js";
import { TEST_PLAN_SYSTEM_PROMPT, SCENARIO_CODE_SYSTEM_PROMPT } from "./prompts.js";
import { wrapGeneratedTest, generateFileName } from "./templates.js";

export interface GenerateOptions {
  description?: string;
  agentUrl?: string;
  systemPrompt?: string;
  count?: number;
  categories?: string[];
  outputDir: string;
}

export interface GeneratedFile {
  path: string;
  category: string;
  scenarioName: string;
}

/**
 * Profile-based test generation — the primary flow.
 * Takes an AgentProfile and generates grounded test files.
 */
export async function generateTests(
  profile: AgentProfile,
  llm: LLMProvider,
  opts: { count?: number; categories?: string[]; outputDir: string; onProgress?: (msg: string) => void }
): Promise<GeneratedFile[]> {
  const log = opts.onProgress ?? (() => {});

  // Step 1: Plan tests based on profile
  log("Planning test scenarios...");
  const plan = await planTests(profile, llm, {
    count: opts.count,
    categories: opts.categories,
  });

  // Step 2: Flatten scenarios
  const allScenarios: { category: TestPlanCategory; scenario: TestPlanScenario }[] = [];
  for (const cat of plan.categories) {
    for (const sc of cat.scenarios) {
      allScenarios.push({ category: cat, scenario: sc });
    }
  }

  log(`Generating ${allScenarios.length} test files...`);
  await mkdir(opts.outputDir, { recursive: true });
  const files: GeneratedFile[] = [];

  // Step 3: Generate code for each scenario
  for (let i = 0; i < allScenarios.length; i++) {
    const { category, scenario } = allScenarios[i];
    log(`  Writing ${i + 1}/${allScenarios.length}: ${scenario.name}`);

    const test = await writeTestFile(profile, category, scenario, llm);
    const filePath = join(opts.outputDir, test.fileName);
    await writeFile(filePath, test.code, "utf-8");

    files.push({
      path: filePath,
      category: test.category,
      scenarioName: test.scenarioName,
    });
  }

  log(`Generated ${files.length} test files.`);
  return files;
}

/**
 * Legacy TestGenerator class — backward-compatible wrapper.
 * Constructs a minimal AgentProfile from a description string,
 * then delegates to the profile-based generation pipeline.
 */
export class TestGenerator {
  private llmProvider: LLMProvider;

  constructor(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
  }

  async generate(options: GenerateOptions): Promise<GeneratedFile[]> {
    // Build a minimal profile from the description
    const profile = descriptionToProfile(
      options.description ?? "AI agent",
      options.agentUrl,
      options.systemPrompt
    );

    return generateTests(profile, this.llmProvider, {
      count: options.count,
      categories: options.categories,
      outputDir: options.outputDir,
    });
  }
}

/** Convert a description string into a minimal AgentProfile for backward compatibility */
function descriptionToProfile(
  description: string,
  agentUrl?: string,
  systemPrompt?: string
): AgentProfile {
  return {
    discoveredAt: new Date().toISOString(),
    source: agentUrl ? { type: "http", url: agentUrl } : { type: "http", url: "unknown" },
    confidence: 0.3,
    name: "Agent",
    description,
    domain: "unknown",
    tools: [],
    systemPrompt,
    knownConstraints: [],
    expectedTone: "professional",
    supportedLanguages: ["en"],
    endpoint: agentUrl ? { url: agentUrl } : undefined,
    evidence: [],
  };
}

export type { TestPlan, TestPlanCategory, TestPlanScenario } from "./planner.js";
export type { GeneratedTest } from "./writer.js";
