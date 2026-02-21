export interface AssertionResult {
  type: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  reasoning?: string;
  latencyMs?: number;
  error?: string;
}
