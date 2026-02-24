import type { LLMProvider } from "../llm/provider.js";
import type { AgentProfile } from "../discovery/agent-profile.js";
import { TEST_PLAN_SYSTEM_PROMPT } from "./prompts.js";

export interface TestPlanScenario {
  name: string;
  slug: string;
  description: string;
  persona: { role: string; tone: string; backstory: string };
  turns: { says: string }[];
  intent: string;
  successCriteria: string;
  failureIndicators: string;
}

export interface TestPlanCategory {
  name: string;
  slug: string;
  description: string;
  scenarios: TestPlanScenario[];
}

export interface TestPlan {
  categories: TestPlanCategory[];
}

export async function planTests(
  profile: AgentProfile,
  llm: LLMProvider,
  opts?: { count?: number; categories?: string[] }
): Promise<TestPlan> {
  const parts = [`Agent Profile:\n${JSON.stringify(buildPlannerContext(profile), null, 2)}`];
  parts.push("\nGenerate a comprehensive test plan based on this agent's actual capabilities, tools, constraints, and domain.");

  const response = await llm.generate({
    messages: [
      { role: "system", content: TEST_PLAN_SYSTEM_PROMPT },
      { role: "user", content: parts.join("\n") },
    ],
    temperature: 0.7,
  });

  let text = response.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let plan: TestPlan;
  try {
    plan = JSON.parse(text) as TestPlan;
  } catch (e) {
    throw new Error(
      `Failed to parse test plan: ${e instanceof Error ? e.message : String(e)}\n\nRaw:\n${text.slice(0, 500)}`
    );
  }

  // Filter categories if specified
  if (opts?.categories?.length) {
    plan.categories = plan.categories.filter((c) =>
      opts.categories!.some(
        (f) => c.slug.includes(f) || c.name.toLowerCase().includes(f.toLowerCase())
      )
    );
  }

  // Limit total scenarios
  const max = opts?.count ?? 10;
  const flat: { category: TestPlanCategory; scenario: TestPlanScenario }[] = [];
  for (const cat of plan.categories) {
    for (const sc of cat.scenarios) {
      flat.push({ category: cat, scenario: sc });
    }
  }

  if (flat.length > max) {
    const kept = new Set(flat.slice(0, max));
    for (const cat of plan.categories) {
      cat.scenarios = cat.scenarios.filter((sc) =>
        kept.has(flat.find((f) => f.scenario === sc)!)
      );
    }
    plan.categories = plan.categories.filter((c) => c.scenarios.length > 0);
  }

  return plan;
}

function buildPlannerContext(profile: AgentProfile): Record<string, unknown> {
  return {
    name: profile.name,
    description: profile.description,
    domain: profile.domain,
    tools: profile.tools.map((t) => ({ name: t.name, description: t.description })),
    systemPrompt: profile.systemPrompt?.slice(0, 2000),
    knownConstraints: profile.knownConstraints,
    expectedTone: profile.expectedTone,
    endpoint: profile.endpoint?.url,
  };
}
