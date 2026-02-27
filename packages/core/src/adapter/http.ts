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
    const { url, headers, bodyTemplate, responseParser, requestFormat, streaming } = this.config;

    const body = bodyTemplate
      ? bodyTemplate(message, context)
      : buildDefaultBody(message, context, requestFormat);

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

    // Streaming response: read the full text stream
    if (streaming) {
      const text = await readStreamResponse(res);
      return new AgentResponse({
        text,
        toolCalls: [],
        latencyMs,
        raw: text,
      });
    }

    // Check content-type to auto-detect streaming
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
      const text = await readStreamResponse(res);
      return new AgentResponse({
        text,
        toolCalls: [],
        latencyMs,
        raw: text,
      });
    }

    // Standard JSON response
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

/**
 * Build the default request body based on requestFormat.
 * "messages" (default) sends { messages: [{role, content}] } — compatible with OpenAI, Vercel AI SDK, etc.
 * "legacy" sends { message, conversation_id } — the original format.
 */
function buildDefaultBody(
  message: string,
  context: ConversationContext | undefined,
  requestFormat: "messages" | "legacy" | undefined
): unknown {
  if (requestFormat === "legacy") {
    return {
      message,
      conversation_id: context?.conversationId ?? `fabrik-session-${Date.now()}`,
    };
  }

  // Default: "messages" format (OpenAI-compatible)
  const messages: { role: string; content: string }[] = [];

  if (context?.turns) {
    for (const turn of context.turns) {
      messages.push({ role: turn.role, content: turn.message });
    }
  }

  messages.push({ role: "user", content: message });

  return { messages };
}

/**
 * Read a streaming response (SSE / text stream) and return the accumulated text.
 * Handles:
 *  - Vercel AI SDK data stream protocol (lines prefixed with 0:, data chunks as JSON strings)
 *  - Vercel AI SDK UI message stream (data: {"type":"text-delta","textDelta":"..."})
 *  - OpenAI SSE (data: {"choices":[{"delta":{"content":"..."}}]})
 *  - Plain text streams
 */
async function readStreamResponse(res: Response): Promise<string> {
  const raw = await res.text();
  const lines = raw.split("\n");

  let accumulated = "";
  let formatDetected: "data-stream" | "sse" | "plain" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Vercel AI SDK data stream protocol: lines like 0:"text chunk"
    // Format: <digit>:<payload> where 0=text, e=finish, d=done, f=metadata
    if (/^\d+:/.test(trimmed)) {
      formatDetected = "data-stream";
      const colonIdx = trimmed.indexOf(":");
      const prefix = trimmed.slice(0, colonIdx);
      const payload = trimmed.slice(colonIdx + 1);

      // 0 = text token
      if (prefix === "0") {
        try {
          const parsed = JSON.parse(payload);
          const streamError = extractStreamError(parsed);
          if (streamError) {
            throw new Error(`Agent stream error: ${streamError}`);
          }
          const chunk = extractTextChunk(parsed);
          if (chunk) accumulated += chunk;
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("Agent stream error:")) {
            throw err;
          }
          accumulated += payload;
        }
      }
      continue;
    }

    // SSE format: data: {...} or data: [DONE]
    if (trimmed.startsWith("data:")) {
      formatDetected = "sse";
      const data = trimmed.slice(trimmed.startsWith("data: ") ? 6 : 5).trim();
      if (data === "[DONE]" || !data) continue;

      try {
        const parsed = JSON.parse(data);
        const streamError = extractStreamError(parsed);
        if (streamError) {
          throw new Error(`Agent stream error: ${streamError}`);
        }
        const chunk = extractTextChunk(parsed);
        if (chunk) accumulated += chunk;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Agent stream error:")) {
          throw err;
        }
        // Not JSON — treat as plain text SSE data
        accumulated += data;
      }
      continue;
    }

    // event: lines in SSE — skip
    if (trimmed.startsWith("event:")) continue;

    // Plain text (only accumulate if no structured format detected)
    if (!formatDetected) {
      formatDetected = "plain";
      accumulated += trimmed + "\n";
    } else if (formatDetected === "plain") {
      accumulated += trimmed + "\n";
    }
  }

  return accumulated.trim();
}

function extractTextChunk(payload: unknown): string | null {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return null;

  const obj = payload as Record<string, unknown>;

  // Vercel AI SDK UI message stream variants:
  // {"type":"text-delta","textDelta":"..."} or {"type":"text-delta","delta":"..."}
  if (obj.type === "text-delta") {
    if (typeof obj.textDelta === "string") return obj.textDelta;
    if (typeof obj.delta === "string") return obj.delta;
    if (typeof obj.text === "string") return obj.text;
  }

  // OpenAI streaming format: {"choices":[{"delta":{"content":"..."}}]}
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choice = obj.choices[0];
    if (typeof choice === "object" && choice !== null) {
      const delta = (choice as Record<string, unknown>).delta;
      if (typeof delta === "object" && delta !== null) {
        const content = (delta as Record<string, unknown>).content;
        if (typeof content === "string") return content;
      }
    }
  }

  // Generic common fields
  for (const key of ["textDelta", "delta", "text", "content"]) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }

  // Anthropic-style content array: [{ type: "text", text: "..." }]
  if (Array.isArray(obj.content)) {
    let text = "";
    for (const part of obj.content) {
      if (typeof part === "string") {
        text += part;
        continue;
      }
      if (typeof part !== "object" || part === null) continue;
      const item = part as Record<string, unknown>;
      if (typeof item.text === "string") text += item.text;
      else if (typeof item.content === "string") text += item.content;
      else if (typeof item.delta === "string") text += item.delta;
    }
    if (text) return text;
  }

  return null;
}

function extractStreamError(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const obj = payload as Record<string, unknown>;

  if (obj.type === "error") {
    if (typeof obj.errorText === "string") return obj.errorText;
    if (typeof obj.message === "string") return obj.message;
  }

  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.errorText === "string") return obj.errorText;

  if (typeof obj.error === "object" && obj.error !== null) {
    const err = obj.error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
  }

  return null;
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
