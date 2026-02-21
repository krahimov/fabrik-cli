import type { Scenario } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateScenario(obj: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!obj || typeof obj !== "object") {
    return { valid: false, errors: ["Scenario must be an object"], warnings };
  }

  const scenario = obj as Record<string, unknown>;

  if (typeof scenario.name !== "string" || scenario.name.trim() === "") {
    errors.push("Scenario must have a non-empty 'name' string");
  }

  if (typeof scenario.fn !== "function") {
    errors.push("Scenario must have a 'fn' function");
  }

  if (scenario.tags !== undefined) {
    if (!Array.isArray(scenario.tags)) {
      errors.push("'tags' must be an array of strings");
    } else if (!scenario.tags.every((t: unknown) => typeof t === "string")) {
      warnings.push("Some tags are not strings — they will be ignored");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
