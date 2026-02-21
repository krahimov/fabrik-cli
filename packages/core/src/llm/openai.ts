import type { LLMProvider, LLMResponse } from "./provider.js";
import type { ZodType } from "zod";

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "gpt-4o";
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
  }

  async generate(params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    outputSchema?: ZodType;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
    };

    if (params.maxTokens) {
      body.max_tokens = params.maxTokens;
    }

    if (params.outputSchema) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const text = data.choices[0]?.message?.content ?? "";
    const usage = data.usage;

    let parsed: unknown;
    if (params.outputSchema) {
      try {
        const json = JSON.parse(text);
        const result = params.outputSchema.safeParse(json);
        parsed = result.success ? result.data : json;
      } catch {
        // If parsing fails, leave parsed undefined
      }
    }

    return {
      text,
      parsed,
      tokenUsage: {
        input: usage?.prompt_tokens ?? 0,
        output: usage?.completion_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
      },
    };
  }
}
