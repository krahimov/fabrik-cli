import {
  AgentAdapter,
  AgentConfig,
  AgentResponse,
  ConversationContext,
} from "./interface.js";

type HttpConfig = Extract<AgentConfig, { type: "http" }>;

export class HttpAdapter implements AgentAdapter {
  private config!: HttpConfig;

  async connect(config: AgentConfig): Promise<void> {
    if (config.type !== "http") {
      throw new Error(`HttpAdapter requires config type "http", got "${config.type}"`);
    }
    this.config = config;
  }

  async send(message: string, context?: ConversationContext): Promise<AgentResponse> {
    const { url, headers, bodyTemplate, responseParser } = this.config;

    const body = bodyTemplate
      ? bodyTemplate(message, context)
      : {
          message,
          conversation_id: context?.conversationId ?? `fabrik-session-${Date.now()}`,
        };

    const start = performance.now();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    const latencyMs = performance.now() - start;

    if (!res.ok) {
      throw new Error(`Agent responded with HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = responseParser ? responseParser(data) : parseResponse(data);

    return new AgentResponse({
      text,
      toolCalls: extractToolCalls(data),
      latencyMs,
      tokenUsage: extractTokenUsage(data),
      raw: data,
    });
  }

  async reset(): Promise<void> {
    // HTTP adapter is stateless per-request; nothing to reset
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }
}

function parseResponse(data: unknown): string {
  if (typeof data === "string") return data;
  if (typeof data !== "object" || data === null) return String(data);

  const obj = data as Record<string, unknown>;

  for (const key of ["message", "text", "content", "response"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }

  // Check nested: data.choices[0].message.content (OpenAI-style)
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choice = obj.choices[0] as Record<string, unknown>;
    if (choice.message && typeof choice.message === "object") {
      const msg = choice.message as Record<string, unknown>;
      if (typeof msg.content === "string") return msg.content;
    }
  }

  return JSON.stringify(data);
}

function extractToolCalls(data: unknown): { name: string; arguments: Record<string, unknown> }[] {
  if (typeof data !== "object" || data === null) return [];
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.tool_calls)) {
    return obj.tool_calls.map((tc: Record<string, unknown>) => ({
      name: String(tc.name ?? tc.function ?? "unknown"),
      arguments:
        typeof tc.arguments === "object" && tc.arguments !== null
          ? (tc.arguments as Record<string, unknown>)
          : {},
    }));
  }

  return [];
}

function extractTokenUsage(
  data: unknown
): { input: number; output: number; total: number } | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const obj = data as Record<string, unknown>;

  if (typeof obj.usage === "object" && obj.usage !== null) {
    const usage = obj.usage as Record<string, unknown>;
    const input = Number(usage.prompt_tokens ?? usage.input ?? 0);
    const output = Number(usage.completion_tokens ?? usage.output ?? 0);
    return { input, output, total: input + output };
  }

  return undefined;
}
