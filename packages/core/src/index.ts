// Scenario API
export { scenario, persona } from "./scenario/api.js";
export type {
  Persona,
  PersonaHandle,
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

// Runner
export { ScenarioRunner } from "./runner.js";
export type { RunnerOptions } from "./runner.js";

// Code Loader
export { loadTestFiles } from "./scenario/code-loader.js";

// Reporter
export { printTerminalReport } from "./report/terminal.js";

// Generator
export { TestGenerator } from "./generate/generator.js";
export type { GenerateOptions, GeneratedFile } from "./generate/generator.js";
