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

  // Post-process: strip banned assertion methods that the model insists on generating
  code = sanitizeBannedAssertions(code);
  // Ensure async assertion calls are awaited to avoid dropped assertion results.
  code = enforceAwaitOnAsyncAssertions(code);

  return {
    fileName: generateFileName(category.slug, scenario.slug),
    category: category.name,
    scenarioName: scenario.name,
    code: wrapGeneratedTest(code),
  };
}

/**
 * Strips banned assertion calls from generated code.
 * The model stubbornly generates toolCalled, toolNotCalled, guardrail, sentiment,
 * and factuality despite prompts banning them. These rigid assertions cause false
 * positives. The llmJudge assertions the model ALSO generates are the good ones.
 */
function sanitizeBannedAssertions(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line starts a banned assertion call
    if (isBannedAssertionLine(trimmed)) {
      // Skip this line and any continuation lines (multi-line calls)
      i = skipMultiLineCall(lines, i);
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

function enforceAwaitOnAsyncAssertions(code: string): string {
  return code.replace(
    /^([ \t]*)(?!await\b)(assert\.(?:llmJudge|custom|sentiment|guardrail|factuality)\s*\()/gm,
    "$1await $2"
  );
}

const BANNED_PATTERNS = [
  /^\s*assert\.toolCalled\s*\(/,
  /^\s*assert\.toolNotCalled\s*\(/,
  /^\s*assert\.guardrail\s*\(/,
  /^\s*assert\.sentiment\s*\(/,
  /^\s*assert\.factuality\s*\(/,
  /^\s*assert\.custom\s*\(/,
];

function isBannedAssertionLine(trimmed: string): boolean {
  return BANNED_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Skip a multi-line function call that starts at lineIdx.
 * Counts parentheses to find the end of the call.
 * Returns the index of the next line AFTER the call.
 */
function skipMultiLineCall(lines: string[], lineIdx: number): number {
  let depth = 0;
  let i = lineIdx;

  while (i < lines.length) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }
    i++;
    // Once all parens are closed, we're done
    if (depth <= 0) break;
  }

  // Also skip a trailing semicolon-only line or empty line
  while (i < lines.length && lines[i].trim() === "") {
    i++;
  }

  return i;
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
    parts.push(`- System prompt: ${profile.systemPrompt}`);
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
  parts.push(`\nTest Intent: ${scenario.intent}`);
  parts.push(`\nSuccess Criteria: ${scenario.successCriteria}`);
  parts.push(`\nFailure Indicators: ${scenario.failureIndicators}`);

  parts.push(`\nREMINDER: Use ONLY assert.llmJudge(), assert.custom(), and assert.contains/notContains. No other assert methods exist. Always await async assertions (await assert.llmJudge(...), await assert.custom(...)). Write rich llmJudge criteria that explain the test intent and accept all valid behaviors. Use assert.custom() for programmatic checks with conditional logic.`);

  return parts.join("\n");
}
