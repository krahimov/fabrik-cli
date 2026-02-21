export interface Persona {
  role: string;
  name?: string;
  tone?: string;
  backstory?: string;
  context?: Record<string, unknown>;
}

export interface PersonaHandle {
  role: string;
  name?: string;
  tone?: string;
  backstory?: string;
  context?: Record<string, unknown>;
  says(message: string): string;
}

export interface Turn {
  role: "persona" | "agent";
  message: string;
}

export interface TurnRecord {
  role: "persona" | "agent";
  message: string;
  timestamp: number;
  latencyMs?: number;
}

export interface AgentHandle {
  send(message: string): Promise<import("../adapter/interface.js").AgentResponse>;
}

export interface ScenarioContext {
  agent: AgentHandle;
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
