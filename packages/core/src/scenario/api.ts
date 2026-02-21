import type { Persona, PersonaHandle, Scenario, ScenarioFn } from "./types.js";

export function scenario(name: string, fn: ScenarioFn): Scenario {
  return { name, fn };
}

export function persona(opts: Persona): PersonaHandle {
  return {
    ...opts,
    says(message: string): string {
      return message;
    },
  };
}
