import type { ZodType } from "zod";

export interface LLMProvider {
  generate(params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    outputSchema?: ZodType;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  text: string;
  parsed?: unknown;
  tokenUsage: { input: number; output: number; total: number };
}
