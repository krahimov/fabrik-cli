import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LLMProvider } from "../llm/provider.js";
import { TEST_PLAN_SYSTEM_PROMPT, SCENARIO_CODE_SYSTEM_PROMPT } from "./prompts.js";
import { wrapGeneratedTest, generateFileName } from "./templates.js";

export interface GenerateOptions {
  agentUrl?: string;
  description: string;
  systemPrompt?: string;
  count?: number;
  categories?: string[];
  outputDir: string;
}

interface TestPlanScenario {
  name: string;
  slug: string;
  description: string;
  persona: { role: string; tone: string; backstory: string };
  turns: { says: string }[];
  assertions: { type: string; config: Record<string, unknown> }[];
}

interface TestPlanCategory {
  name: string;
  slug: string;
  description: string;
  scenarios: TestPlanScenario[];
}

interface TestPlan {
  categories: TestPlanCategory[];
}

export interface GeneratedFile {
  path: string;
  category: string;
  scenarioName: string;
}

export class TestGenerator {
  private llmProvider: LLMProvider;

  constructor(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
  }

  async generate(options: GenerateOptions): Promise<GeneratedFile[]> {
    // Step 1: Generate test plan
    const plan = await this.generateTestPlan(options);

    // Step 2: Filter categories if specified
    let categories = plan.categories;
    if (options.categories && options.categories.length > 0) {
      categories = categories.filter((c) =>
        options.categories!.some(
          (filter) =>
            c.slug.includes(filter) || c.name.toLowerCase().includes(filter.toLowerCase())
        )
      );
    }

    // Step 3: Limit total scenarios if count specified
    const maxCount = options.count ?? 10;
    const allScenarios: { category: TestPlanCategory; scenario: TestPlanScenario }[] = [];
    for (const category of categories) {
      for (const scenario of category.scenarios) {
        allScenarios.push({ category, scenario });
      }
    }
    const limited = allScenarios.slice(0, maxCount);

    // Step 4: Generate code for each scenario
    await mkdir(options.outputDir, { recursive: true });
    const generatedFiles: GeneratedFile[] = [];

    for (const { category, scenario } of limited) {
      const code = await this.generateScenarioCode(scenario, options);
      const fileName = generateFileName(category.slug, scenario.slug);
      const filePath = join(options.outputDir, fileName);

      const wrappedCode = wrapGeneratedTest(code);
      await writeFile(filePath, wrappedCode, "utf-8");

      generatedFiles.push({
        path: filePath,
        category: category.name,
        scenarioName: scenario.name,
      });
    }

    return generatedFiles;
  }

  private async generateTestPlan(options: GenerateOptions): Promise<TestPlan> {
    let userPrompt = `Agent description: ${options.description}`;
    if (options.agentUrl) {
      userPrompt += `\nAgent endpoint: ${options.agentUrl}`;
    }
    if (options.systemPrompt) {
      userPrompt += `\nAgent system prompt:\n${options.systemPrompt}`;
    }

    const response = await this.llmProvider.generate({
      messages: [
        { role: "system", content: TEST_PLAN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    try {
      let text = response.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      return JSON.parse(text) as TestPlan;
    } catch (e) {
      throw new Error(
        `Failed to parse test plan from LLM response: ${e instanceof Error ? e.message : String(e)}\n\nRaw response:\n${response.text.slice(0, 500)}`
      );
    }
  }

  private async generateScenarioCode(
    scenario: TestPlanScenario,
    options: GenerateOptions
  ): Promise<string> {
    const userPrompt = `Generate a test file for this scenario:

Name: ${scenario.name}
Description: ${scenario.description}
Agent description: ${options.description}

Persona:
- Role: ${scenario.persona.role}
- Tone: ${scenario.persona.tone}
- Backstory: ${scenario.persona.backstory}

Conversation turns:
${scenario.turns.map((t, i) => `${i + 1}. User says: "${t.says}"`).join("\n")}

Assertions to include:
${scenario.assertions.map((a) => `- ${a.type}: ${JSON.stringify(a.config)}`).join("\n")}`;

    const response = await this.llmProvider.generate({
      messages: [
        { role: "system", content: SCENARIO_CODE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    let code = response.text.trim();
    // Strip markdown fences if present
    if (code.startsWith("```")) {
      code = code.replace(/^```(?:typescript|ts)?\n?/, "").replace(/\n?```$/, "");
    }
    return code;
  }
}
