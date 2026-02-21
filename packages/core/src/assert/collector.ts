import type { AssertionResult } from "./types.js";

export class AssertionCollector {
  private results: AssertionResult[] = [];

  record(result: AssertionResult): void {
    this.results.push(result);
  }

  getResults(): AssertionResult[] {
    return [...this.results];
  }

  clear(): void {
    this.results = [];
  }
}
