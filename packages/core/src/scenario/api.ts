import type { Persona, PersonaMessage, Scenario, ScenarioFn } from "./types.js";

export function scenario(name: string, fn: ScenarioFn): Scenario {
  return { name, fn };
}

export function persona(opts: Omit<Persona, "says">): Persona {
  const p: Persona = {
    ...opts,
    says(message: string): PersonaMessage {
      return { persona: p, message };
    },
  };
  return p;
}
