import type { AgentResponse } from "../adapter/interface.js";
import type { LLMProvider } from "../llm/provider.js";
import type { AgentProfile } from "../discovery/agent-profile.js";
import type { ZodType } from "zod";
import { AssertionCollector } from "./collector.js";
import { createLocalAssertions } from "./local.js";
import { createLlmAssertions } from "./llm-judge.js";

export interface FabrikAssert {
  // Local assertions (instant, no LLM)
  contains(response: AgentResponse, text: string): void;
  notContains(response: AgentResponse, text: string): void;
  matches(response: AgentResponse, pattern: RegExp): void;
  jsonSchema(response: AgentResponse, schema: ZodType): void;
  latency(response: AgentResponse, opts: { max: number }): void;
  tokenUsage(response: AgentResponse, opts: { max: number }): void;
  toolCalled(response: AgentResponse, toolName: string): void;
  toolNotCalled(response: AgentResponse, toolName: string): void;

  // LLM assertions (calls configured LLM provider)
  sentiment(response: AgentResponse, expected: string): Promise<void>;
  llmJudge(
    response: AgentResponse,
    opts: { criteria: string; threshold: number; scale?: number }
  ): Promise<void>;
  guardrail(
    response: AgentResponse,
    opts: { mustNot?: string[]; must?: string[] }
  ): Promise<void>;
  factuality(
    response: AgentResponse,
    opts: { groundTruth: string; context?: string }
  ): Promise<void>;

  // Custom
  custom(
    name: string,
    fn: (response: AgentResponse) => boolean | Promise<boolean>,
    response: AgentResponse
  ): Promise<void>;
}

export function createAssertProxy(
  collector: AssertionCollector,
  llmProvider?: LLMProvider,
  agentProfile?: AgentProfile
): FabrikAssert {
  const local = createLocalAssertions(collector);
  const llm = createLlmAssertions(collector, llmProvider, agentProfile);

  return {
    ...local,
    ...llm,
  };
}

// Global assert instance — gets bound to a collector at runtime by the scenario runner
let _globalCollector: AssertionCollector | null = null;
let _globalLlmProvider: LLMProvider | undefined;
let _globalAgentProfile: AgentProfile | undefined;
let _pendingPromises: Promise<void>[] = [];

export function _bindGlobalAssert(collector: AssertionCollector, llmProvider?: LLMProvider, agentProfile?: AgentProfile): void {
  _globalCollector = collector;
  _globalLlmProvider = llmProvider;
  _globalAgentProfile = agentProfile;
  _pendingPromises = [];
}

export function _unbindGlobalAssert(): void {
  _globalCollector = null;
  _globalLlmProvider = undefined;
  _globalAgentProfile = undefined;
  _pendingPromises = [];
}

/** Await all pending async assertions (sentiment, llmJudge, guardrail, etc.) */
export async function _drainPendingAssertions(): Promise<void> {
  await Promise.allSettled(_pendingPromises);
  _pendingPromises = [];
}

function trackAsync(promise: Promise<void>): Promise<void> {
  _pendingPromises.push(promise);
  return promise;
}

function getProxy(): FabrikAssert {
  if (!_globalCollector) {
    throw new Error("assert.* can only be used inside a scenario() function");
  }
  return createAssertProxy(_globalCollector, _globalLlmProvider, _globalAgentProfile);
}

export const assert: FabrikAssert = {
  // Local assertions — synchronous, no tracking needed
  contains: (...args) => getProxy().contains(...args),
  notContains: (...args) => getProxy().notContains(...args),
  matches: (...args) => getProxy().matches(...args),
  jsonSchema: (...args) => getProxy().jsonSchema(...args),
  latency: (...args) => getProxy().latency(...args),
  tokenUsage: (...args) => getProxy().tokenUsage(...args),
  toolCalled: (...args) => getProxy().toolCalled(...args),
  toolNotCalled: (...args) => getProxy().toolNotCalled(...args),

  // Async assertions — track promises so runner can drain them
  sentiment: (...args) => trackAsync(getProxy().sentiment(...args)),
  llmJudge: (...args) => trackAsync(getProxy().llmJudge(...args)),
  guardrail: (...args) => trackAsync(getProxy().guardrail(...args)),
  factuality: (...args) => trackAsync(getProxy().factuality(...args)),
  custom: (...args) => trackAsync(getProxy().custom(...args)),
};
