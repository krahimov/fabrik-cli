// Scenario API
export { scenario, persona } from "./scenario/api.js";
export type {
  Persona,
  PersonaHandle,
  PersonaMessage,
  Turn,
  TurnRecord,
  Scenario,
  ScenarioFn,
  ScenarioContext,
  AgentHandle,
  RunResult,
} from "./scenario/types.js";

// Assertion API
export { assert } from "./assert/api.js";
export type { FabrikAssert } from "./assert/api.js";
export type { AssertionResult } from "./assert/types.js";

// Agent Adapter
export { AgentResponse } from "./adapter/interface.js";
export type {
  AgentAdapter,
  AgentConfig,
  ConversationContext,
  ToolCall,
  TokenUsage,
} from "./adapter/interface.js";
export { HttpAdapter } from "./adapter/http.js";

// LLM Provider
export type { LLMProvider, LLMResponse } from "./llm/provider.js";
export { OpenAIProvider } from "./llm/openai.js";
export type { OpenAIProviderConfig } from "./llm/openai.js";
export { AnthropicProvider } from "./llm/anthropic.js";
export type { AnthropicProviderConfig } from "./llm/anthropic.js";
export { ChatGPTProvider } from "./llm/chatgpt.js";
export type { ChatGPTProviderConfig } from "./llm/chatgpt.js";

// Discovery
export { readAgentProfile, writeAgentProfile } from "./discovery/agent-profile.js";
export type {
  AgentProfile,
  DiscoveredTool,
  RelevantFile,
  DiscoveryEvidence,
  AgentSource,
  EndpointInfo,
} from "./discovery/agent-profile.js";
export { discoverAgent } from "./discovery/explorer.js";
export type { ExplorerOptions, FileReader } from "./discovery/explorer.js";
export { rankFiles } from "./discovery/file-ranker.js";
export { extractFromFile } from "./discovery/extractors.js";
export { probeEndpoint } from "./discovery/http-prober.js";

// Runner
export { ScenarioRunner } from "./runner.js";
export type { RunnerOptions } from "./runner.js";

// Code Loader
export { loadTestFiles } from "./scenario/code-loader.js";
export { validateScenario } from "./scenario/validator.js";
export type { ValidationResult } from "./scenario/validator.js";

// Reporter
export { printTerminalReport } from "./report/terminal.js";
export { generateJsonReport } from "./report/json.js";
export type { JsonReport } from "./report/json.js";
export { generateHtmlReport } from "./report/html.js";

// Store
export type { TraceStore, RunMeta, StoredRun } from "./store/trace.js";
export { SqliteTraceStore } from "./store/sqlite.js";

// Diff
export { diffResults } from "./diff/engine.js";
export type { DiffReport, ScenarioDiff, DiffStatus, DiffSummary, DiffOptions } from "./diff/engine.js";
export { checkRegressions } from "./diff/regression.js";
export type { RegressionCheckResult } from "./diff/regression.js";

// Generator
export { TestGenerator, generateTests } from "./generate/generator.js";
export type { GenerateOptions, GeneratedFile, TestPlan, TestPlanCategory, TestPlanScenario, GeneratedTest } from "./generate/generator.js";
export { planTests } from "./generate/planner.js";
export { writeTestFile } from "./generate/writer.js";
