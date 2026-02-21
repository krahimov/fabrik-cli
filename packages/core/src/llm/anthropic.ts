import type { LLMProvider, LLMResponse } from "./provider.js";
import type { ZodType } from "zod";

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "claude-sonnet-4-6";
  }

  async generate(params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    outputSchema?: ZodType;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    // Separate system message from the rest
    const systemMessage = params.messages.find((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as {
      content: { type: string; text: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    const usage = data.usage;

    let parsed: unknown;
    if (params.outputSchema) {
      try {
        // Strip markdown fences if present
        let jsonText = text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }
        const json = JSON.parse(jsonText);
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
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        total: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      },
    };
  }
}
