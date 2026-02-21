import type { AgentResponse } from "../adapter/interface.js";
import type { AssertionCollector } from "./collector.js";
import type { ZodType } from "zod";

export function createLocalAssertions(collector: AssertionCollector) {
  return {
    contains(response: AgentResponse, text: string): void {
      const passed = response.text.toLowerCase().includes(text.toLowerCase());
      collector.record({
        type: "contains",
        passed,
        expected: text,
        actual: passed ? text : response.text.slice(0, 200),
      });
    },

    notContains(response: AgentResponse, text: string): void {
      const passed = !response.text.toLowerCase().includes(text.toLowerCase());
      collector.record({
        type: "notContains",
        passed,
        expected: `not "${text}"`,
        actual: passed ? "(not found)" : text,
      });
    },

    matches(response: AgentResponse, pattern: RegExp): void {
      const passed = pattern.test(response.text);
      collector.record({
        type: "matches",
        passed,
        expected: pattern.toString(),
        actual: response.text.slice(0, 200),
      });
    },

    jsonSchema(response: AgentResponse, schema: ZodType): void {
      try {
        const parsed = JSON.parse(response.text);
        const result = schema.safeParse(parsed);
        collector.record({
          type: "jsonSchema",
          passed: result.success,
          expected: "valid schema",
          actual: result.success ? "valid" : result.error.message,
        });
      } catch (e) {
        collector.record({
          type: "jsonSchema",
          passed: false,
          expected: "valid JSON",
          actual: response.text.slice(0, 200),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    latency(response: AgentResponse, opts: { max: number }): void {
      const passed = response.latencyMs <= opts.max;
      collector.record({
        type: "latency",
        passed,
        expected: `<= ${opts.max}ms`,
        actual: `${Math.round(response.latencyMs)}ms`,
      });
    },

    tokenUsage(response: AgentResponse, opts: { max: number }): void {
      const total = response.tokenUsage?.total ?? 0;
      const passed = total <= opts.max;
      collector.record({
        type: "tokenUsage",
        passed,
        expected: `<= ${opts.max} tokens`,
        actual: `${total} tokens`,
      });
    },

    toolCalled(response: AgentResponse, toolName: string): void {
      const passed = response.toolCalls.some((tc) => tc.name === toolName);
      collector.record({
        type: "toolCalled",
        passed,
        expected: toolName,
        actual: response.toolCalls.map((tc) => tc.name).join(", ") || "(no tools called)",
      });
    },

    toolNotCalled(response: AgentResponse, toolName: string): void {
      const passed = !response.toolCalls.some((tc) => tc.name === toolName);
      collector.record({
        type: "toolNotCalled",
        passed,
        expected: `not ${toolName}`,
        actual: response.toolCalls.map((tc) => tc.name).join(", ") || "(no tools called)",
      });
    },
  };
}
