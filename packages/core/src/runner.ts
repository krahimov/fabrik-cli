import type { Scenario, RunResult, TurnRecord, AgentHandle, PersonaMessage } from "./scenario/types.js";
import type { AgentAdapter, AgentResponse, ConversationContext } from "./adapter/interface.js";
import type { LLMProvider } from "./llm/provider.js";
import type { AgentProfile } from "./discovery/agent-profile.js";
import { AssertionCollector } from "./assert/collector.js";
import { _bindGlobalAssert, _unbindGlobalAssert, _drainPendingAssertions, createAssertProxy } from "./assert/api.js";
import { calculateScore } from "./assert/scorer.js";

export interface RunnerOptions {
  timeout?: number;
  agentProfile?: AgentProfile;
  retries?: number;
  parallelism?: number;
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
          toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        });

        context.turns.push({ role: "assistant", message: response.text });

        return response;
      },
    };

    const scores = new Map<string, number>();

    // Create a bound assert proxy for this scenario's collector
    const boundAssert = createAssertProxy(collector, this.llmProvider, this.options.agentProfile);
    const pendingBoundAssertions: Promise<void>[] = [];

    const trackBoundAssertion = (promise: Promise<void>): Promise<void> => {
      pendingBoundAssertions.push(promise);
      return promise;
    };

    // Track async assertions on ctx.assert so un-awaited calls are still collected.
    const assertWithTracking: typeof boundAssert = {
      ...boundAssert,
      sentiment: (response, expected) =>
        trackBoundAssertion(boundAssert.sentiment(response, expected)),
      llmJudge: (response, opts) => trackBoundAssertion(boundAssert.llmJudge(response, opts)),
      guardrail: (response, opts) => trackBoundAssertion(boundAssert.guardrail(response, opts)),
      factuality: (response, opts) => trackBoundAssertion(boundAssert.factuality(response, opts)),
      custom: (name, fn, response) =>
        trackBoundAssertion(boundAssert.custom(name, fn, response)),
    };

    // Also bind global assert for backward compat (works when same module instance)
    _bindGlobalAssert(collector, this.llmProvider, this.options.agentProfile);

    const start = performance.now();
    let error: string | undefined;

    try {
      const timeoutMs = this.options.timeout ?? 30000;
      await Promise.race([
        scenario.fn({
          agent: agentHandle,
          assert: assertWithTracking,
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
      await Promise.allSettled(pendingBoundAssertions);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      _unbindGlobalAssert();
    }

    const duration = performance.now() - start;
    const assertions = collector.getResults();
    // Don't vacuously pass: 0 assertions with no error means the test didn't actually evaluate anything
    const passed = !error && assertions.length > 0 && assertions.every((a) => a.passed);
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

  private async runWithRetry(scenario: Scenario): Promise<RunResult> {
    const maxAttempts = (this.options.retries ?? 0) + 1;
    let lastResult!: RunResult;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.adapter.reset();
      lastResult = await this.run(scenario);
      if (lastResult.passed || attempt === maxAttempts) return lastResult;
    }

    return lastResult;
  }

  async runAll(scenarios: Scenario[]): Promise<RunResult[]> {
    const parallelism = this.options.parallelism ?? 1;

    if (parallelism <= 1) {
      const results: RunResult[] = [];
      for (const scenario of scenarios) {
        results.push(await this.runWithRetry(scenario));
      }
      return results;
    }

    // Run in batches of `parallelism`
    const results: RunResult[] = [];
    for (let i = 0; i < scenarios.length; i += parallelism) {
      const batch = scenarios.slice(i, i + parallelism);
      const batchResults = await Promise.all(
        batch.map((s) => this.runWithRetry(s))
      );
      results.push(...batchResults);
    }
    return results;
  }
}
