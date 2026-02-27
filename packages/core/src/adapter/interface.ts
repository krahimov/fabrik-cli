export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export class AgentResponse {
  readonly text: string;
  readonly toolCalls: ToolCall[];
  readonly latencyMs: number;
  readonly tokenUsage?: TokenUsage;
  readonly raw?: unknown;

  constructor(opts: {
    text: string;
    toolCalls?: ToolCall[];
    latencyMs: number;
    tokenUsage?: TokenUsage;
    raw?: unknown;
  }) {
    this.text = opts.text;
    this.toolCalls = opts.toolCalls ?? [];
    this.latencyMs = opts.latencyMs;
    this.tokenUsage = opts.tokenUsage;
    this.raw = opts.raw;
  }

  mentions(text: string): boolean {
    return this.text.toLowerCase().includes(text.toLowerCase());
  }
}

export interface ConversationContext {
  conversationId: string;
  turns: { role: string; message: string }[];
}

export type AgentConfig =
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
      /** "messages" sends {messages: [{role,content}]}. "legacy" sends {message, conversation_id}. Default: "messages". */
      requestFormat?: "messages" | "legacy";
      bodyTemplate?: (msg: string, ctx?: ConversationContext) => unknown;
      responseParser?: (data: unknown) => string;
      /** When true, reads streaming text responses (SSE/AI SDK) instead of calling res.json() */
      streaming?: boolean;
    }
  | { type: "subprocess"; command: string; args?: string[]; cwd?: string }
  | { type: "openai-assistant"; assistantId: string; apiKey?: string }
  | { type: "custom"; module: string };

export interface AgentAdapter {
  connect(config: AgentConfig): Promise<void>;
  send(message: string, context?: ConversationContext): Promise<AgentResponse>;
  reset(): Promise<void>;
  disconnect(): Promise<void>;
}
