import type { Scenario, RunResult, TurnRecord, AgentHandle, PersonaMessage } from "./scenario/types.js";
import type { AgentAdapter, AgentResponse, ConversationContext } from "./adapter/interface.js";
import type { LLMProvider } from "./llm/provider.js";
import type { AgentProfile } from "./discovery/agent-profile.js";
import { AssertionCollector } from "./assert/collector.js";
import { _bindGlobalAssert, _unbindGlobalAssert, _drainPendingAssertions } from "./assert/api.js";
import { calculateScore } from "./assert/scorer.js";

export interface RunnerOptions {
  timeout?: number;
  agentProfile?: AgentProfile;
}

export class ScenarioRunner {
  private adapter: AgentAdapter;
  private llmProvider?: LLMProvider;
  private options: RunnerOptions;

  constructor(adapter: AgentAdapter, llmProvider?: LLMProvider, options?: RunnerOptions) {
    this.adapter = adapter;
    this.llmProvider = llmProvider;
    this.options = options ?? {};
  }

  async run(scenario: Scenario): Promise<RunResult> {
    const collector = new AssertionCollector();
    const turns: TurnRecord[] = [];
    const conversationId = `fabrik-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const context: ConversationContext = {
      conversationId,
      turns: [],
    };

    const agentHandle: AgentHandle = {
      send: async (message: string | PersonaMessage): Promise<AgentResponse> => {
        const text = typeof message === "string" ? message : message.message;

        turns.push({
          role: "persona",
          message: text,
          timestamp: Date.now(),
        });

        context.turns.push({ role: "user", message: text });

        const response = await this.adapter.send(text, context);

        turns.push({
          role: "agent",
          message: response.text,
          timestamp: Date.now(),
          latencyMs: response.latencyMs,
        });

        context.turns.push({ role: "assistant", message: response.text });

        return response;
      },
    };

    const scores = new Map<string, number>();

    // Bind global assert so `import { assert } from "@fabrik/core"` works
    _bindGlobalAssert(collector, this.llmProvider, this.options.agentProfile);

    const start = performance.now();
    let error: string | undefined;

    try {
      const timeoutMs = this.options.timeout ?? 30000;
      await Promise.race([
        scenario.fn({
          agent: agentHandle,
          profile: this.options.agentProfile,
          scores,
          score: (name: string, value: number) => scores.set(name, value),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Scenario timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      // Wait for all async assertions (sentiment, llmJudge, guardrail, etc.)
      // to finish before collecting results
      await _drainPendingAssertions();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      _unbindGlobalAssert();
    }

    const duration = performance.now() - start;
    const assertions = collector.getResults();
    const passed = !error && assertions.every((a) => a.passed);
    const score = calculateScore(assertions);

    return {
      scenario: scenario.name,
      passed,
      score,
      assertions,
      turns,
      duration,
      error,
    };
  }

  async runAll(scenarios: Scenario[]): Promise<RunResult[]> {
    const results: RunResult[] = [];
    for (const scenario of scenarios) {
      await this.adapter.reset();
      const result = await this.run(scenario);
      results.push(result);
    }
    return results;
  }
}
