import type { LLMProvider } from "../llm/provider.js";
import type { AgentProfile } from "../discovery/agent-profile.js";
import type { TestPlanCategory, TestPlanScenario } from "./planner.js";
import { SCENARIO_CODE_SYSTEM_PROMPT } from "./prompts.js";
import { wrapGeneratedTest, generateFileName } from "./templates.js";

export interface GeneratedTest {
  fileName: string;
  category: string;
  scenarioName: string;
  code: string;
}

export async function writeTestFile(
  profile: AgentProfile,
  category: TestPlanCategory,
  scenario: TestPlanScenario,
  llm: LLMProvider
): Promise<GeneratedTest> {
  const userPrompt = buildWriterContext(profile, category, scenario);

  const response = await llm.generate({
    messages: [
      { role: "system", content: SCENARIO_CODE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });

  let code = response.text.trim();
  if (code.startsWith("```")) {
    code = code.replace(/^```(?:typescript|ts)?\n?/, "").replace(/\n?```$/, "");
  }

  return {
    fileName: generateFileName(category.slug, scenario.slug),
    category: category.name,
    scenarioName: scenario.name,
    code: wrapGeneratedTest(code),
  };
}

function buildWriterContext(
  profile: AgentProfile,
  category: TestPlanCategory,
  scenario: TestPlanScenario
): string {
  const parts = [
    `Generate a test file for this scenario:`,
    `\nAgent Profile:`,
    `- Name: ${profile.name}`,
    `- Description: ${profile.description}`,
    `- Domain: ${profile.domain}`,
  ];

  if (profile.tools.length > 0) {
    parts.push(`- Tools: ${profile.tools.map((t) => `${t.name} (${t.description})`).join(", ")}`);
  }
  if (profile.knownConstraints.length > 0) {
    parts.push(`- Constraints: ${profile.knownConstraints.join("; ")}`);
  }
  if (profile.expectedTone) {
    parts.push(`- Expected tone: ${profile.expectedTone}`);
  }
  if (profile.systemPrompt) {
    parts.push(`- System prompt (excerpt): ${profile.systemPrompt.slice(0, 500)}`);
  }

  parts.push(`\nTest Category: ${category.name} — ${category.description}`);
  parts.push(`\nScenario: ${scenario.name}`);
  parts.push(`Description: ${scenario.description}`);
  parts.push(`\nPersona:`);
  parts.push(`- Role: ${scenario.persona.role}`);
  parts.push(`- Tone: ${scenario.persona.tone}`);
  parts.push(`- Backstory: ${scenario.persona.backstory}`);
  parts.push(`\nConversation turns:`);
  scenario.turns.forEach((t, i) => {
    parts.push(`${i + 1}. User says: "${t.says}"`);
  });
  parts.push(`\nAssertions to include:`);
  scenario.assertions.forEach((a) => {
    parts.push(`- ${a.type}: ${JSON.stringify(a.config)}`);
  });

  parts.push(`\nIMPORTANT: Use REAL tool names from the agent profile in assert.toolCalled(). Use REAL constraints from the profile in assert.guardrail(). Reference actual business logic, not generic placeholder text.`);

  return parts.join("\n");
}
