import type { AgentResponse } from "../adapter/interface.js";
import type { LLMProvider } from "../llm/provider.js";
import type { AssertionCollector } from "./collector.js";
import {
  SENTIMENT_SYSTEM_PROMPT,
  LLM_JUDGE_SYSTEM_PROMPT,
  GUARDRAIL_SYSTEM_PROMPT,
  FACTUALITY_SYSTEM_PROMPT,
} from "./prompts.js";

export function createLlmAssertions(collector: AssertionCollector, llmProvider?: LLMProvider) {
  function requireProvider(): LLMProvider {
    if (!llmProvider) {
      throw new Error(
        "LLM assertions require an LLM provider. Configure one in fabrik.config.ts under llm.provider."
      );
    }
    return llmProvider;
  }

  async function callJudge(
    systemPrompt: string,
    userPrompt: string
  ): Promise<Record<string, unknown>> {
    const provider = requireProvider();
    const response = await provider.generate({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
    });

    try {
      // Try to parse the response text as JSON, stripping markdown fences if present
      let text = response.text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      return JSON.parse(text);
    } catch {
      return { error: "Failed to parse LLM judge response", raw: response.text };
    }
  }

  return {
    async sentiment(response: AgentResponse, expected: string): Promise<void> {
      const start = performance.now();
      try {
        const result = await callJudge(
          SENTIMENT_SYSTEM_PROMPT,
          `Agent response: "${response.text}"\n\nExpected sentiment: ${expected}`
        );

        const passed = result.matches === true || (result.score as number) >= 3;
        collector.record({
          type: "sentiment",
          passed,
          expected,
          actual: `score ${result.score}/5`,
          reasoning: result.reasoning as string,
          latencyMs: performance.now() - start,
        });
      } catch (e) {
        collector.record({
          type: "sentiment",
          passed: false,
          expected,
          error: e instanceof Error ? e.message : String(e),
          latencyMs: performance.now() - start,
        });
      }
    },

    async llmJudge(
      response: AgentResponse,
      opts: { criteria: string; threshold: number; scale?: number }
    ): Promise<void> {
      const scale = opts.scale ?? 5;
      const start = performance.now();
      try {
        const result = await callJudge(
          LLM_JUDGE_SYSTEM_PROMPT,
          `Agent response: "${response.text}"\n\nCriteria: ${opts.criteria}\nScale: 1-${scale}`
        );

        const score = result.score as number;
        const passed = score >= opts.threshold;
        collector.record({
          type: "llmJudge",
          passed,
          expected: `>= ${opts.threshold}/${scale}`,
          actual: `${score}/${scale}`,
          reasoning: result.reasoning as string,
          latencyMs: performance.now() - start,
        });
      } catch (e) {
        collector.record({
          type: "llmJudge",
          passed: false,
          expected: `>= ${opts.threshold}/${scale}`,
          error: e instanceof Error ? e.message : String(e),
          latencyMs: performance.now() - start,
        });
      }
    },

    async guardrail(
      response: AgentResponse,
      opts: { mustNot?: string[]; must?: string[] }
    ): Promise<void> {
      const start = performance.now();
      try {
        const rules: string[] = [];
        if (opts.must) rules.push(`MUST contain themes/ideas: ${opts.must.join(", ")}`);
        if (opts.mustNot)
          rules.push(`MUST NOT contain themes/ideas: ${opts.mustNot.join(", ")}`);

        const result = await callJudge(
          GUARDRAIL_SYSTEM_PROMPT,
          `Agent response: "${response.text}"\n\nRules:\n${rules.join("\n")}`
        );

        const passed = result.passed === true;
        collector.record({
          type: "guardrail",
          passed,
          expected: rules.join("; "),
          actual: passed
            ? "(all rules followed)"
            : `violations: ${(result.violations as string[])?.join(", ")}`,
          reasoning: result.reasoning as string,
          latencyMs: performance.now() - start,
        });
      } catch (e) {
        collector.record({
          type: "guardrail",
          passed: false,
          expected: JSON.stringify(opts),
          error: e instanceof Error ? e.message : String(e),
          latencyMs: performance.now() - start,
        });
      }
    },

    async factuality(
      response: AgentResponse,
      opts: { groundTruth: string; context?: string }
    ): Promise<void> {
      const start = performance.now();
      try {
        let prompt = `Agent response: "${response.text}"\n\nGround truth: ${opts.groundTruth}`;
        if (opts.context) prompt += `\nContext: ${opts.context}`;

        const result = await callJudge(FACTUALITY_SYSTEM_PROMPT, prompt);

        const passed = result.factual === true || (result.score as number) >= 3;
        collector.record({
          type: "factuality",
          passed,
          expected: opts.groundTruth.slice(0, 200),
          actual: `score ${result.score}/5`,
          reasoning: result.reasoning as string,
          latencyMs: performance.now() - start,
        });
      } catch (e) {
        collector.record({
          type: "factuality",
          passed: false,
          expected: opts.groundTruth.slice(0, 200),
          error: e instanceof Error ? e.message : String(e),
          latencyMs: performance.now() - start,
        });
      }
    },

    async custom(
      name: string,
      fn: (response: AgentResponse) => boolean | Promise<boolean>,
      response: AgentResponse
    ): Promise<void> {
      const start = performance.now();
      try {
        const passed = await fn(response);
        collector.record({
          type: `custom:${name}`,
          passed,
          latencyMs: performance.now() - start,
        });
      } catch (e) {
        collector.record({
          type: `custom:${name}`,
          passed: false,
          error: e instanceof Error ? e.message : String(e),
          latencyMs: performance.now() - start,
        });
      }
    },
  };
}
