import type { AssertionResult } from "./types.js";

export function calculateScore(results: AssertionResult[]): number {
  if (results.length === 0) return 1;

  const passed = results.filter((r) => r.passed).length;
  return passed / results.length;
}
