import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { LLMProvider, LLMResponse } from "./provider.js";
import type { ZodType } from "zod";

export interface ChatGPTProviderConfig {
  /** Model to use. Defaults to "gpt-5.3-codex" */
  model?: string;
  /** Path to auth.json. Defaults to ~/.codex/auth.json */
  authPath?: string;
  /** Direct access token (alternative to reading from file) */
  accessToken?: string;
}

interface CodexAuthFile {
  auth_mode: string;
  tokens: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_at?: string;
  };
  last_refresh?: string;
}

export class ChatGPTProvider implements LLMProvider {
  private model: string;
  private authPath: string;
  private accessToken?: string;

  constructor(config?: ChatGPTProviderConfig) {
    this.model = config?.model ?? "gpt-5.3-codex";
    this.authPath = config?.authPath ?? join(homedir(), ".codex", "auth.json");
    this.accessToken = config?.accessToken;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    try {
      const raw = await readFile(this.authPath, "utf-8");
      const auth = JSON.parse(raw) as CodexAuthFile;

      if (!auth.tokens?.access_token) {
        throw new Error("No access_token found in auth file");
      }

      // Check expiration
      if (auth.tokens.expires_at) {
        const expiresAt = new Date(auth.tokens.expires_at);
        if (expiresAt < new Date()) {
          throw new Error(
            "ChatGPT session token has expired. Run `codex login` to refresh it."
          );
        }
      }

      return auth.tokens.access_token;
    } catch (e) {
      if (e instanceof Error && e.message.includes("ENOENT")) {
        throw new Error(
          `No ChatGPT session token found at ${this.authPath}. Run \`codex login\` first to authenticate with your ChatGPT account.`
        );
      }
      throw e;
    }
  }

  async generate(params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    outputSchema?: ZodType;
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse> {
    const token = await this.getAccessToken();

    // Separate system message from conversation messages
    const systemMessage = params.messages.find((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter((m) => m.role !== "system");

    // Build input in the ChatGPT backend-api format
    const input = nonSystemMessages.map((m) => ({
      type: "message" as const,
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: m.content }],
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      instructions: systemMessage?.content ?? "",
      input,
      tools: [],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: { summary: "auto" },
      store: false,
      stream: true,
    };

    if (params.maxTokens) {
      body.max_output_tokens = params.maxTokens;
    }

    const res = await fetch(
      "https://chatgpt.com/backend-api/codex/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 401) {
        throw new Error(
          `ChatGPT session expired (401). Run \`codex login\` to re-authenticate.\n${errorText}`
        );
      }
      throw new Error(`ChatGPT API error ${res.status}: ${errorText}`);
    }

    // Parse SSE streaming response — collect all events into a final response
    const text = await this.consumeStream(res);

    let parsed: unknown;
    if (params.outputSchema) {
      try {
        let jsonText = text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText
            .replace(/^```(?:json)?\n?/, "")
            .replace(/\n?```$/, "");
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
      tokenUsage: { input: 0, output: 0, total: 0 },
    };
  }

  private async consumeStream(res: Response): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    const textParts: string[] = [];
    let lastCompleteResponse: Record<string, unknown> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data) as Record<string, unknown>;

            // Collect text deltas from output_text.delta events
            if (event.type === "response.output_text.delta") {
              const delta = event.delta as string;
              if (delta) textParts.push(delta);
            }

            // Also check for content_part.delta format
            if (event.type === "response.content_part.delta") {
              const delta = event.delta as Record<string, unknown> | undefined;
              if (delta && typeof delta.text === "string") {
                textParts.push(delta.text);
              }
            }

            // Capture the completed response object
            if (event.type === "response.completed" || event.type === "response.done") {
              lastCompleteResponse = event;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    // If we got text deltas, use them
    if (textParts.length > 0) {
      return textParts.join("");
    }

    // Fallback: try to extract text from the completed response
    if (lastCompleteResponse) {
      const extracted = extractTextFromResponse(lastCompleteResponse);
      if (extracted) return extracted;
    }

    return "";
  }
}

function extractTextFromResponse(data: Record<string, unknown>): string | null {
  // Try response.response.output format
  const response = data.response as Record<string, unknown> | undefined;
  if (response) {
    return extractFromOutput(response);
  }

  // Try direct output format
  return extractFromOutput(data);
}

function extractFromOutput(data: Record<string, unknown>): string | null {
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      const obj = item as Record<string, unknown>;
      if (obj.type === "message" && Array.isArray(obj.content)) {
        const texts: string[] = [];
        for (const c of obj.content) {
          const content = c as Record<string, unknown>;
          if (typeof content.text === "string") {
            texts.push(content.text);
          }
        }
        if (texts.length > 0) return texts.join("");
      }
    }
  }

  if (typeof data.text === "string") return data.text;
  if (typeof data.content === "string") return data.content;

  return null;
}
