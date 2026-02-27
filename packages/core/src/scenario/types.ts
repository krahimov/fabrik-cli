import type { AgentResponse } from "../adapter/interface.js";
import type { AgentProfile } from "../discovery/agent-profile.js";
import type { FabrikAssert } from "../assert/api.js";

export interface Persona {
  role: string;
  name?: string;
  tone?: string;
  backstory?: string;
  context?: Record<string, unknown>;
  says(message: string): PersonaMessage;
}

export interface PersonaMessage {
  persona: Persona;
  message: string;
}

/** @deprecated Use Persona instead — PersonaHandle is kept for backward compatibility */
export type PersonaHandle = Persona;

export interface Turn {
  role: "persona" | "agent";
  message: string;
}

export interface TurnRecord {
  role: "persona" | "agent";
  message: string;
  timestamp: number;
  latencyMs?: number;
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
}

export interface AgentHandle {
  send(message: string | PersonaMessage): Promise<AgentResponse>;
}

export interface ScenarioContext {
  agent: AgentHandle;
  assert: FabrikAssert;
  profile?: AgentProfile;
  scores: Map<string, number>;
  score(name: string, value: number): void;
}

export type ScenarioFn = (ctx: ScenarioContext) => Promise<void>;

export interface Scenario {
  name: string;
  tags?: string[];
  fn: ScenarioFn;
  filePath?: string;
}

export interface AssertionResult {
  type: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  reasoning?: string;
  latencyMs?: number;
  error?: string;
}

export interface RunResult {
  scenario: string;
  passed: boolean;
  score: number;
  assertions: AssertionResult[];
  turns: TurnRecord[];
  duration: number;
  error?: string;
}
