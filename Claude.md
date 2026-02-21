# CLAUDE.md — Fabrik Lite

## What You're Building

Fabrik Lite is an open-source agent evaluation harness — "pytest for AI agents." It's a CLI tool that **agentically discovers** everything about a target agent, auto-generates comprehensive test suites, runs them, and produces structured pass/fail reports with LLM-as-judge evaluation and version-to-version regression diffing.

**Core insight #1**: Developers don't know what to test their agents for. The primary flow is pointing Fabrik at an agent and having it figure out what to test.

**Core insight #2**: Nothing should be hardcoded. Fabrik itself acts as an agent — it explores the target agent's codebase, endpoint, tools, system prompt, docs, and config to build a complete understanding, then uses that grounded context for everything. No manual "paste your system prompt here."

## Primary User Flow

```bash
# Install
npm install -g @fabrik/cli

# Initialize project
fabrik init

# THE MAIN FLOW — point Fabrik at your agent, it does the rest:
fabrik gen --repo https://github.com/acme/support-bot
# OR
fabrik gen --agent http://localhost:3000/api/chat

# What happens behind the scenes:
# 1. DISCOVER — Fabrik clones the repo into a Daytona sandbox (or probes the HTTP endpoint)
# 2. EXPLORE  — LLM-driven exploration: finds system prompt, tool definitions, schemas,
#               README, config, example conversations — whatever exists
# 3. PROFILE  — Builds an AgentProfile: structured understanding of what this agent
#               does, what tools it has, what its boundaries are, what could go wrong
# 4. GENERATE — Uses the profile to create 10-15 grounded test files that reference
#               REAL tool names, REAL business logic, REAL edge cases from the codebase
# 5. SAVE     — Writes .test.ts files + caches the AgentProfile at .fabrik/agent-profile.json

# Run the generated tests (profile is loaded automatically for context)
fabrik run

# Compare versions after agent changes
fabrik diff --before v1.2 --after v1.3

# Re-discover after major agent changes
fabrik gen --refresh
```

## Tech Stack

- **Language**: TypeScript (Node.js 18+)
- **Monorepo**: pnpm workspaces + Turborepo
- **CLI framework**: Commander.js
- **Test loader**: Dynamic import of .ts files (tsx for TypeScript execution)
- **YAML parser**: js-yaml
- **Structured output**: Zod schemas
- **Trace storage**: better-sqlite3
- **Terminal output**: chalk + cli-table3
- **LLM providers**: OpenAI SDK, Anthropic SDK (direct API calls, no framework wrappers)
- **Sandbox**: Daytona SDK (@daytonaio/sdk)
- **Config**: cosmiconfig (loads fabrik.config.ts/.js/.json)
- **Build**: tsup for library builds, tsx for CLI execution

## Architecture

### Three Layers

**Layer 1 — Test Definition**: CLI commands, code-first test files (.test.ts), optional YAML files, fabrik.config.ts

**Layer 2 — Core Engine (@fabrik/core)**: Model-agnostic. Discovery engine, scenario engine, agent adapters, assertion pipeline, LLM judge, diff engine, reporter, trace store. This is a standalone npm package with zero vendor lock-in.

**Layer 3 — Infrastructure**: Daytona SDK for sandboxed execution + codebase exploration, pluggable LLM providers (OpenAI, Anthropic, Ollama, custom) for discovery/judge/generation calls.

### Project Structure

```
fabrik/
├── packages/
│   ├── core/                      # @fabrik/core
│   │   ├── src/
│   │   │   ├── index.ts                # Public API exports
│   │   │   ├── discovery/
│   │   │   │   ├── agent-profile.ts    # AgentProfile type + serialization
│   │   │   │   ├── explorer.ts         # Agentic codebase/endpoint exploration engine
│   │   │   │   ├── file-ranker.ts      # LLM-driven: which files matter most?
│   │   │   │   ├── extractors.ts       # Extract system prompt, tools, schemas from code
│   │   │   │   ├── http-prober.ts      # Probe HTTP endpoints: schema discovery, sample calls
│   │   │   │   └── prompts.ts          # System prompts for discovery LLM calls
│   │   │   ├── scenario/
│   │   │   │   ├── types.ts            # Scenario, Persona, Turn, AssertionResult types
│   │   │   │   ├── api.ts             # scenario(), persona() builder functions
│   │   │   │   ├── code-loader.ts      # Dynamic import of .test.ts files
│   │   │   │   ├── yaml-loader.ts      # YAML → Scenario compiler
│   │   │   │   └── validator.ts        # Validate scenario structure
│   │   │   ├── assert/
│   │   │   │   ├── api.ts             # assert.* public API
│   │   │   │   ├── local.ts           # contains, notContains, matches, jsonSchema, latency, tokenUsage, toolCalled
│   │   │   │   ├── llm-judge.ts       # sentiment, llmJudge, guardrail, factuality — calls LLM provider
│   │   │   │   ├── scorer.ts          # Weighted score aggregation
│   │   │   │   └── types.ts           # Assertion types and results
│   │   │   ├── adapter/
│   │   │   │   ├── interface.ts        # AgentAdapter interface + AgentResponse class
│   │   │   │   ├── http.ts            # HTTP POST adapter
│   │   │   │   ├── subprocess.ts      # Spawn child process adapter
│   │   │   │   ├── openai-assistant.ts # OpenAI Assistants API adapter
│   │   │   │   └── custom.ts          # Load user-provided adapter module
│   │   │   ├── generate/
│   │   │   │   ├── generator.ts       # Core test generation — consumes AgentProfile
│   │   │   │   ├── planner.ts         # LLM plans which test categories/scenarios to create
│   │   │   │   ├── writer.ts          # LLM writes individual .test.ts files
│   │   │   │   ├── prompts.ts         # System prompts for generation LLM calls
│   │   │   │   └── templates.ts       # Test file structure templates
│   │   │   ├── diff/
│   │   │   │   ├── engine.ts           # Compare two RunResult snapshots
│   │   │   │   └── regression.ts       # Detect regressions, score deltas
│   │   │   ├── report/
│   │   │   │   ├── terminal.ts         # CLI table output with chalk
│   │   │   │   ├── json.ts            # Machine-readable JSON report
│   │   │   │   └── html.ts            # Browser-viewable HTML report
│   │   │   ├── llm/
│   │   │   │   ├── provider.ts         # LLMProvider interface
│   │   │   │   ├── openai.ts          # OpenAI provider (chat completions + structured output)
│   │   │   │   ├── anthropic.ts       # Anthropic provider (messages API)
│   │   │   │   ├── ollama.ts          # Ollama provider (local models)
│   │   │   │   └── custom.ts          # Any OpenAI-compatible endpoint
│   │   │   └── store/
│   │   │       ├── trace.ts            # TraceStore interface + operations
│   │   │       └── sqlite.ts          # SQLite implementation
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                       # @fabrik/cli
│       ├── src/
│       │   ├── index.ts                # CLI entry point (commander.js)
│       │   ├── commands/
│       │   │   ├── run.ts              # fabrik run
│       │   │   ├── diff.ts             # fabrik diff
│       │   │   ├── gen.ts              # fabrik gen (PRIMARY command — discovery + generation)
│       │   │   ├── report.ts           # fabrik report
│       │   │   └── init.ts             # fabrik init (scaffold project)
│       │   ├── sandbox/
│       │   │   ├── interface.ts        # SandboxProvider interface
│       │   │   ├── daytona.ts          # Daytona SDK integration
│       │   │   └── local.ts            # Local mode (no sandbox, for dev)
│       │   └── config.ts              # Load fabrik.config.ts via cosmiconfig
│       ├── package.json
│       └── tsconfig.json
│
├── packs/                         # Community scenario packs (npm packages)
│   └── customer-support/
│       ├── src/
│       │   ├── angry-customer.test.ts
│       │   ├── billing-dispute.test.ts
│       │   ├── product-inquiry.test.ts
│       │   └── index.ts
│       └── package.json           # @fabrik/pack-customer-support
│
├── examples/
│   └── basic-http/                # Minimal working example
│       ├── fabrik.config.ts
│       ├── tests/
│       │   ├── hello.test.ts
│       │   └── edge-case.yaml
│       └── README.md
│
├── package.json                   # Monorepo root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── CLAUDE.md                      # This file
└── README.md
```

---

## Agentic Discovery System (CRITICAL — this is the product differentiator)

### Overview

When a user runs `fabrik gen`, Fabrik doesn't ask them to describe their agent or paste their system prompt. Instead, Fabrik **explores autonomously** to discover everything it needs. The discovery engine is an LLM-driven agent that uses Daytona sandboxes for codebase exploration and HTTP probing for live endpoints.

The output of discovery is an **AgentProfile** — a structured, complete understanding of the target agent. This profile is used for both test generation and test execution, and is cached at `.fabrik/agent-profile.json` so discovery doesn't repeat on every run.

### AgentProfile Type

```typescript
// packages/core/src/discovery/agent-profile.ts

export interface AgentProfile {
  // Metadata
  discoveredAt: string;              // ISO timestamp
  source: AgentSource;               // How was this agent discovered
  confidence: number;                // 0-1 overall confidence in the profile

  // Identity
  name: string;                      // Best guess at agent's name
  description: string;               // What this agent does (synthesized from all sources)
  domain: string;                    // e.g. "customer-support", "coding-assistant", "rag-qa"

  // Capabilities
  tools: DiscoveredTool[];           // Tools/functions the agent can call
  systemPrompt?: string;             // The agent's system prompt if found
  modelInfo?: {                      // What model powers the agent
    provider?: string;               // openai, anthropic, etc.
    model?: string;                  // gpt-4o, claude-sonnet, etc.
  };

  // Behavior boundaries
  knownConstraints: string[];        // Things the agent is told NOT to do
  expectedTone: string;              // professional, casual, empathetic, etc.
  supportedLanguages: string[];      // Human languages the agent handles
  maxTurns?: number;                 // Max conversation length if limited

  // API surface
  endpoint?: EndpointInfo;           // HTTP endpoint details
  inputFormat?: string;              // Expected request format
  outputFormat?: string;             // Expected response format
  authentication?: string;           // Auth mechanism if detected

  // Codebase context (if repo was explored)
  codebase?: {
    repoUrl?: string;
    framework?: string;              // langchain, crewai, openai-assistants, custom, etc.
    entryPoint?: string;             // Main file path
    relevantFiles: RelevantFile[];   // Files that informed this profile
    dependencies: string[];          // Key packages
  };

  // Raw evidence — everything the explorer found, for transparency
  evidence: DiscoveryEvidence[];
}

export interface DiscoveredTool {
  name: string;
  description: string;
  parameters?: Record<string, any>;  // JSON schema of params if found
  source: string;                     // Where was this found (file path or inference)
}

export interface RelevantFile {
  path: string;
  role: string;         // "system-prompt", "tool-definition", "config", "readme", "schema", etc.
  excerpt?: string;     // Key snippet that was extracted
}

export interface DiscoveryEvidence {
  type: "file" | "http-probe" | "inference" | "readme" | "config";
  source: string;       // File path or URL
  finding: string;      // What was discovered
  confidence: number;   // 0-1 confidence for this specific finding
}

export type AgentSource =
  | { type: "repo"; url: string; branch?: string; }
  | { type: "local-dir"; path: string; }
  | { type: "http"; url: string; }
  | { type: "openai-assistant"; assistantId: string; };
```

### Discovery Flow — Repo-Based Agent

When the user provides a repo URL or local directory:

```
fabrik gen --repo https://github.com/acme/support-bot
```

**Step 1: Clone into Sandbox**
```typescript
const sandbox = await daytona.create({ language: "typescript" });
await sandbox.git.clone("https://github.com/acme/support-bot", "/workspace/agent");
```

**Step 2: Orientation Scan**
Read the top-level file listing and key files to orient the LLM:
```typescript
// Get directory tree (non-recursive first, then selective depth)
const tree = await sandbox.process.exec("find /workspace/agent -maxdepth 3 -type f | head -200");

// Read README if exists
const readme = await tryRead(sandbox, "/workspace/agent/README.md");

// Read package.json / pyproject.toml / requirements.txt for dependencies
const packageJson = await tryRead(sandbox, "/workspace/agent/package.json");
```

**Step 3: LLM-Driven File Ranking**
Send the file tree + README + package.json to the LLM and ask it to rank which files are most likely to contain:
- System prompt / agent instructions
- Tool definitions / function schemas
- Agent configuration (model, temperature, etc.)
- API route handlers / entry points
- Example conversations or test data

The LLM returns a ranked list of file paths to read. This is the **agentic** part — the LLM decides what to explore based on what it sees, not hardcoded glob patterns.

```typescript
const fileRanking = await llm.generate({
  messages: [
    { role: "system", content: FILE_RANKER_PROMPT },
    { role: "user", content: `File tree:\n${tree}\n\nREADME:\n${readme}\n\nDependencies:\n${packageJson}` },
  ],
  outputSchema: FileRankingSchema,  // Zod schema: { files: { path, reason, priority }[] }
});
```

**Step 4: Read & Extract**
Read each high-priority file from the sandbox and extract relevant information:
```typescript
for (const file of fileRanking.files.slice(0, 20)) {  // Read top 20 files max
  const content = await sandbox.fs.downloadFile(file.path);
  const extracted = await llm.generate({
    messages: [
      { role: "system", content: EXTRACTOR_PROMPT },
      { role: "user", content: `File: ${file.path}\nReason for reading: ${file.reason}\n\nContent:\n${content}` },
    ],
    outputSchema: ExtractionResultSchema,
  });
  // Accumulate evidence
  evidence.push(...extracted.findings);
}
```

**Step 5: Synthesize Profile**
Take all evidence and synthesize into a coherent AgentProfile:
```typescript
const profile = await llm.generate({
  messages: [
    { role: "system", content: PROFILE_SYNTHESIZER_PROMPT },
    { role: "user", content: `Evidence:\n${JSON.stringify(evidence, null, 2)}` },
  ],
  outputSchema: AgentProfileSchema,
});
```

**Step 6: Cache & Cleanup**
```typescript
await writeFile(".fabrik/agent-profile.json", JSON.stringify(profile, null, 2));
await daytona.delete(sandbox);
```

### Discovery Flow — HTTP Endpoint Agent

When the user provides only an HTTP URL:

```
fabrik gen --agent http://localhost:3000/api/chat
```

Discovery has less to work with, so it probes the endpoint:

**Step 1: Schema Discovery**
```typescript
// Try common schema endpoints
const openApiSpec = await tryFetch(`${baseUrl}/../openapi.json`);
const healthCheck = await tryFetch(`${baseUrl}/../health`);
const wellKnown = await tryFetch(`${baseUrl}/../.well-known/ai-plugin.json`);
```

**Step 2: Sample Probing**
Send a few carefully chosen messages to the agent and analyze the responses:
```typescript
const probes = [
  "Hello, what can you help me with?",           // Discover capabilities
  "What tools do you have available?",            // Some agents will list tools
  "Can you help me with [intentionally vague]?",  // See how it handles ambiguity
];

for (const probe of probes) {
  const response = await agentAdapter.send(probe);
  evidence.push({
    type: "http-probe",
    source: probe,
    finding: response.text,
    confidence: 0.5,  // Lower confidence — inference from behavior
  });
}
```

**Step 3: LLM Analysis of Probe Results**
The LLM analyzes the agent's responses to infer capabilities, tone, boundaries:
```typescript
const profile = await llm.generate({
  messages: [
    { role: "system", content: HTTP_PROFILER_PROMPT },
    { role: "user", content: `Endpoint: ${url}\nProbe results:\n${JSON.stringify(probeResults)}` },
  ],
  outputSchema: AgentProfileSchema,
});
```

**Step 4: Optional — User Can Provide Repo for Deeper Discovery**
If the profile is low-confidence, suggest:
```
⚠ Limited discovery from HTTP endpoint alone (confidence: 0.45)
   For deeper analysis, provide the agent's source repo:
   fabrik gen --repo https://github.com/acme/support-bot
```

### Discovery Flow — OpenAI Assistant

When the user provides an Assistant ID:

```
fabrik gen --assistant asst_abc123
```

Use the Assistants API to fetch the configuration directly:
```typescript
const assistant = await openai.beta.assistants.retrieve(assistantId);
// assistant.instructions → system prompt
// assistant.tools → tool definitions
// assistant.model → model info
// assistant.metadata → any metadata
```

This gives very high-confidence profiles since the data is structured.

### How Discovery Context Flows Into Generation

The AgentProfile is not just stored — it's the foundation for test generation:

```typescript
// packages/core/src/generate/generator.ts

export async function generateTests(
  profile: AgentProfile,
  llm: LLMProvider,
  opts: GenerateOpts
): Promise<GeneratedTest[]> {

  // Step 1: Plan — LLM reads the profile and plans test categories
  const plan = await llm.generate({
    messages: [
      { role: "system", content: TEST_PLANNER_PROMPT },
      { role: "user", content: `Agent Profile:\n${JSON.stringify(profile, null, 2)}\n\nGenerate a test plan.` },
    ],
    outputSchema: TestPlanSchema,
    // Schema: { categories: { name, description, scenarios: { name, description, turns, assertions }[] }[] }
  });

  // Step 2: Write — For each planned scenario, generate the actual .test.ts code
  const tests: GeneratedTest[] = [];
  for (const category of plan.categories) {
    for (const scenarioSpec of category.scenarios) {
      const testCode = await llm.generate({
        messages: [
          { role: "system", content: TEST_WRITER_PROMPT },
          { role: "user", content: buildWriterContext(profile, category, scenarioSpec) },
        ],
        // Returns raw TypeScript code string, not structured output
      });
      tests.push({
        fileName: slugify(`${category.name}-${scenarioSpec.name}`) + ".test.ts",
        category: category.name,
        code: testCode.text,
        scenario: scenarioSpec,
      });
    }
  }

  return tests;
}
```

**The critical thing**: the TEST_PLANNER_PROMPT and TEST_WRITER_PROMPT receive the full AgentProfile. This means generated tests reference:
- **Real tool names** from `profile.tools` (not generic "some_tool")
- **Real business logic** from `profile.description` and `profile.codebase.relevantFiles`
- **Real constraints** from `profile.knownConstraints` and `profile.systemPrompt`
- **Real edge cases** inferred from the actual codebase, not imagination

### How Discovery Context Flows Into Execution

The AgentProfile is also loaded during `fabrik run` to provide context to LLM-judge assertions:

```typescript
// When running assert.llmJudge(), the judge receives profile context
const judgment = await llm.generate({
  messages: [
    { role: "system", content: JUDGE_PROMPT },
    { role: "user", content: `
      AGENT PROFILE:
      ${profile.description}
      Known constraints: ${profile.knownConstraints.join(", ")}
      Available tools: ${profile.tools.map(t => t.name).join(", ")}

      SCENARIO: ${scenario.name}
      AGENT RESPONSE: ${response.text}

      CRITERIA: ${criteria}

      Score 1-5.
    ` },
  ],
  outputSchema: JudgmentSchema,
});
```

This means the judge evaluates the agent **in the context of what it's actually supposed to do**, not against generic standards.

### Discovery Caching & Refresh

```typescript
// .fabrik/agent-profile.json is cached after first discovery
// Loaded automatically on subsequent runs

// Force re-discovery:
fabrik gen --refresh

// Partial update (re-probe HTTP but keep repo data):
fabrik gen --refresh-probes
```

The profile includes a `discoveredAt` timestamp. `fabrik run` prints a warning if the profile is older than 7 days:
```
⚠ Agent profile is 12 days old. Run `fabrik gen --refresh` to update.
```

---

## Core Types

```typescript
// packages/core/src/scenario/types.ts

export interface Persona {
  role: string;
  name?: string;
  tone?: string;
  backstory?: string;
  context?: Record<string, any>;

  // Helper method — sugar for building turn messages
  says(message: string): PersonaMessage;
}

export interface PersonaMessage {
  persona: Persona;
  message: string;
}

export interface ScenarioContext {
  agent: AgentHandle;
  profile?: AgentProfile;           // Loaded from .fabrik/agent-profile.json if available
  scores: Map<string, number>;
  score(name: string, value: number): void;
}

export type ScenarioFn = (ctx: ScenarioContext) => Promise<void>;

export interface Scenario {
  name: string;
  tags?: string[];
  fn: ScenarioFn;
  filePath?: string;
}

export interface RunResult {
  scenario: string;
  passed: boolean;
  score: number;
  assertions: AssertionResult[];
  turns: TurnRecord[];
  duration: number;
  error?: string;
}
```

## Code-First Test API

This is the primary test authoring interface. Tests are TypeScript files.

```typescript
// tests/angry-customer.test.ts
import { scenario, persona, assert } from "@fabrik/core";

export default scenario("angry customer refund request", async ({ agent }) => {
  const karen = persona({
    role: "customer",
    tone: "frustrated",
    backstory: "Received damaged laptop 3 days ago",
  });

  const r1 = await agent.send(
    karen.says("I want a full refund RIGHT NOW or I'm disputing the charge.")
  );

  assert.sentiment(r1, "empathetic");
  assert.notContains(r1, "blame the customer");
  assert.toolCalled(r1, "lookup_order");

  // Multi-turn with conditional logic
  if (r1.mentions("refund")) {
    const r2 = await agent.send(
      karen.says("Fine, but I want it processed TODAY.")
    );
    assert.llmJudge(r2, {
      criteria: "Did the agent set realistic expectations?",
      threshold: 3,
      scale: 5,
    });
  }
});
```

### YAML Sugar (optional, compiles to same internal format)

```yaml
name: "simple product inquiry"
persona:
  role: customer
  tone: neutral
turns:
  - says: "What's the return policy?"
assertions:
  - contains: "30 days"
  - sentiment: helpful
```

### Test File Discovery

- `fabrik run` scans the configured `tests` directory (default: `./tests`)
- Loads `*.test.ts`, `*.test.js`, `*.yaml`, `*.yml`
- Each file exports one or more Scenario objects
- Files can be filtered: `fabrik run --test angry-customer` (partial match on filename or scenario name)

## Agent Adapter Interface

```typescript
// packages/core/src/adapter/interface.ts

export interface AgentAdapter {
  connect(config: AgentConfig): Promise<void>;
  send(message: string, context?: ConversationContext): Promise<AgentResponse>;
  reset(): Promise<void>;
  disconnect(): Promise<void>;
}

export class AgentResponse {
  text: string;
  toolCalls: ToolCall[];
  latencyMs: number;
  tokenUsage?: { input: number; output: number; total: number };
  raw?: any;

  mentions(text: string): boolean {
    return this.text.toLowerCase().includes(text.toLowerCase());
  }
}

export type AgentConfig =
  | { type: "http"; url: string; headers?: Record<string, string>; bodyTemplate?: (msg: string) => any; responseParser?: (data: any) => string; }
  | { type: "subprocess"; command: string; args?: string[]; cwd?: string; }
  | { type: "openai-assistant"; assistantId: string; apiKey?: string; }
  | { type: "custom"; module: string; };
```

### HTTP Adapter Behavior

Default request format:
```json
POST ${url}
Content-Type: application/json

{
  "message": "user's message",
  "conversation_id": "fabrik-session-xxx"
}
```

Default response parsing: looks for `.message`, `.text`, `.content`, `.response`, or uses the full body as string.

Users can override with `bodyTemplate` and `responseParser` in config.

## Assertion API

```typescript
// packages/core/src/assert/api.ts

export const assert = {
  // Local assertions (instant, no LLM)
  contains: (response: AgentResponse, text: string) => void;
  notContains: (response: AgentResponse, text: string) => void;
  matches: (response: AgentResponse, pattern: RegExp) => void;
  jsonSchema: (response: AgentResponse, schema: ZodType) => void;
  latency: (response: AgentResponse, opts: { max: number }) => void;
  tokenUsage: (response: AgentResponse, opts: { max: number }) => void;
  toolCalled: (response: AgentResponse, toolName: string) => void;
  toolNotCalled: (response: AgentResponse, toolName: string) => void;

  // LLM assertions (calls configured LLM provider, receives AgentProfile context)
  sentiment: (response: AgentResponse, expected: string) => Promise<void>;
  llmJudge: (response: AgentResponse, opts: {
    criteria: string;
    threshold: number;
    scale?: number;  // default 5
  }) => Promise<void>;
  guardrail: (response: AgentResponse, opts: {
    mustNot?: string[];
    must?: string[];
  }) => Promise<void>;
  factuality: (response: AgentResponse, opts: {
    groundTruth: string;
    context?: string;
  }) => Promise<void>;

  // Custom
  custom: (name: string, fn: (response: AgentResponse) => boolean | Promise<boolean>) => Promise<void>;
};
```

### Assertion Results Collection

Assertions don't throw — they record results in a shared context that gets aggregated at the end of the scenario. This allows all assertions to run even if some fail, giving users a complete picture.

```typescript
interface AssertionResult {
  type: string;           // "contains", "sentiment", "llm_judge", etc.
  passed: boolean;
  expected?: any;
  actual?: any;
  reasoning?: string;     // LLM judge explanation
  latencyMs?: number;     // How long the assertion took
  error?: string;         // Error message if assertion crashed
}
```

## LLM Provider Interface

```typescript
// packages/core/src/llm/provider.ts

export interface LLMProvider {
  generate(params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    outputSchema?: ZodType;    // For structured output
    temperature?: number;
    maxTokens?: number;
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  text: string;
  parsed?: any;            // Parsed structured output if schema was provided
  tokenUsage: { input: number; output: number; total: number };
}

export interface LLMAuthConfig {
  type: "chatgpt-session" | "api-key";
  // chatgpt-session: reads token from ~/.codex/auth.json (user runs `fabrik auth` or `codex login`)
  // api-key: reads from config apiKey field or OPENAI_API_KEY / ANTHROPIC_API_KEY env vars
  apiKey?: string;  // Only used when type === "api-key"
}
```

### Provider implementations

- **OpenAI (default)**: Uses `openai` npm package. Default model: `gpt-5.3-codex`. Default auth: ChatGPT session token from `~/.codex/auth.json`. The session token is obtained via `codex login` OAuth flow (same flow the Codex CLI uses). This means users authenticate with their ChatGPT subscription — all LLM inference (discovery, generation, judge) runs on their subscription token allocation. Falls back to `OPENAI_API_KEY` env var if no session token found.
- **Anthropic**: Uses `@anthropic-ai/sdk`. Messages API with tool use for structured output. Requires `ANTHROPIC_API_KEY`.
- **Ollama**: HTTP to local Ollama server. JSON mode for structured output. No auth needed.
- **Custom**: Any OpenAI-compatible endpoint (together.ai, groq, etc.). Requires API key.

## Daytona Sandbox Integration

Daytona is used for TWO purposes:

1. **Discovery** — clone agent repos and explore their codebase in isolation
2. **Execution** — run subprocess agents in isolated environments

```typescript
// packages/cli/src/sandbox/daytona.ts
import { Daytona } from "@daytonaio/sdk";

export class DaytonaSandbox implements SandboxProvider {
  private daytona: Daytona;

  constructor(config: { apiKey: string; target?: string }) {
    this.daytona = new Daytona({ apiKey: config.apiKey, target: config.target });
  }

  async create(opts: SandboxOpts) {
    return await this.daytona.create({
      language: opts.language || "typescript",
      envVars: opts.envVars,
    });
  }

  async exec(sandbox: any, command: string, opts?: ExecOpts) {
    return await sandbox.process.exec(command, {
      cwd: opts?.cwd,
      timeout: opts?.timeout || 30000,
    });
  }

  async readFile(sandbox: any, path: string): Promise<string> {
    const content = await sandbox.fs.downloadFile(path);
    return content.toString();
  }

  async writeFile(sandbox: any, path: string, content: string | Buffer) {
    await sandbox.fs.uploadFile(
      typeof content === "string" ? Buffer.from(content) : content,
      path
    );
  }

  async cloneRepo(sandbox: any, url: string, destPath: string) {
    await sandbox.git.clone(url, destPath);
  }

  async findFiles(sandbox: any, rootDir: string, pattern: string) {
    return await sandbox.fs.findFiles(rootDir, pattern);
  }

  async destroy(sandbox: any) {
    await this.daytona.delete(sandbox);
  }
}
```

## Config File

```typescript
// fabrik.config.ts
import { defineConfig } from "@fabrik/cli";

export default defineConfig({
  agent: {
    type: "http",
    url: "http://localhost:3000/api/chat",
    headers: { "Authorization": "Bearer ${env.AGENT_API_KEY}" },
  },
  tests: "./tests",
  llm: {
    provider: "openai",
    model: "gpt-5.3-codex",        // Frontier Codex model
    auth: "chatgpt-session",        // Uses ChatGPT session token (codex login)
    // Auth is read from ~/.codex/auth.json — no API key needed
    // Users authenticate via: fabrik auth (which runs codex login)
    // Falls back to OPENAI_API_KEY env var if session token unavailable
  },
  sandbox: {
    provider: "daytona",  // or "local"
    daytona: {
      apiKey: "${env.DAYTONA_API_KEY}",
      target: "us",
    },
  },
  eval: {
    parallelism: 3,
    retries: 1,
    defaultTimeout: 30000,
  },
  diff: {
    regressionThreshold: 0.05,
  },
  report: {
    formats: ["terminal", "json"],
    outputDir: "./fabrik-reports",
  },
  store: {
    path: "./.fabrik/traces.db",
  },
});
```

## CLI Commands

### `fabrik init`
Scaffolds a new Fabrik project:
- Creates `fabrik.config.ts` with sensible defaults
- Creates `tests/` directory
- Creates `.fabrik/` directory for traces and agent profile
- Prompts for LLM provider and API key
- Optionally runs `fabrik gen` immediately

### `fabrik gen`
**The primary command.** Discovers the agent and generates test files.

```
Arguments:
  --repo <url>           Git repo URL to clone and explore (highest quality discovery)
  --dir <path>           Local directory to explore (no sandbox needed)
  --agent <url>          HTTP endpoint to probe (lower quality, inference-based)
  --assistant <id>       OpenAI Assistant ID (direct API access to config)

Options:
  --refresh              Force re-discovery even if cached profile exists
  --refresh-probes       Re-run HTTP probes only, keep repo data
  --count <n>            Number of test files to generate (default: 10)
  --categories <list>    Specific categories: happy,edge,adversarial,guardrail,multi-turn,tool-use
  --output <dir>         Output directory (default: ./tests/generated/)
  --description <text>   Optional hint about what the agent does (supplements discovery)
```

If none of --repo/--dir/--agent/--assistant are passed, reads from fabrik.config.ts.

### `fabrik run`
Runs all discovered tests.

```
Options:
  --test <pattern>       Filter by test name/file (partial match)
  --tag <tag>            Filter by tag
  --parallel <n>         Concurrent scenario runs (default: from config)
  --timeout <ms>         Override default timeout
  --format <type>        Output format: terminal, json, html (default: terminal)
  --output <file>        Write report to file
  --save                 Save results to trace store (for diffing)
  --version <tag>        Version label for this run (used in diff)
```

### `fabrik diff`
Compares two saved runs.

```
Options:
  --before <version>     Previous version label
  --after <version>      Current version label
  --format <type>        Output format: terminal, json, html
```

### `fabrik report`
Regenerates a report from a saved run.

```
Options:
  --run-id <id>          Run ID from trace store
  --format <type>        Output format
```

## Build Order

### Phase 1: Core Engine + Code Tests (BUILD FIRST)
Get `fabrik run` working with a hand-written .test.ts file against an HTTP agent.

1. Scaffold monorepo (pnpm init, workspace config, turbo.json, tsconfig)
2. Core types (Scenario, Persona, AgentResponse, AssertionResult, AgentProfile)
3. `scenario()` and `persona()` API functions
4. `assert.*` local assertions (contains, notContains, matches, latency, toolCalled)
5. Code test loader (dynamic import .test.ts files via tsx)
6. HTTP agent adapter
7. Terminal reporter (basic table with chalk + cli-table3)
8. CLI entry point with `fabrik run` command
9. Config file loader (cosmiconfig)
10. Write one example test file to prove it works end-to-end

### Phase 2: LLM Providers + LLM Assertions (BUILD SECOND)
Add LLM-powered assertions so generated tests can use the full assert API.

1. LLMProvider interface
2. OpenAI provider (chat completions + structured output with Zod)
3. Anthropic provider
4. LLM assertions: `assert.sentiment()`, `assert.llmJudge()`, `assert.guardrail()`
5. Weighted scoring system

### Phase 3: Agentic Discovery + Test Generation (BUILD THIRD — the main event)
Get `fabrik gen` working with full agentic discovery.

1. AgentProfile type + serialization (read/write .fabrik/agent-profile.json)
2. Daytona sandbox integration (create, clone, readFile, exec, destroy)
3. Orientation scanner (file tree, README, package.json/pyproject.toml)
4. LLM-driven file ranker (which files to read based on file tree)
5. File content extractors (send file contents to LLM, extract findings)
6. HTTP endpoint prober (schema discovery + sample probing)
7. Profile synthesizer (aggregate all evidence into AgentProfile)
8. Test planner (LLM reads profile, plans test categories and scenarios)
9. Test writer (LLM generates .test.ts code for each planned scenario)
10. `fabrik gen` CLI command (wires it all together)
11. `fabrik init` scaffolding command
12. All discovery/generation system prompts (prompts.ts files — these ARE the product quality)

### Phase 4: Diff Engine + Persistence
Get `fabrik diff` working with version comparison.

1. SQLite trace store (save/load run results)
2. Diff engine (compare two RunResult sets)
3. Regression detector (score deltas, assertion flips)
4. `fabrik diff` command
5. JSON report format
6. HTML report format
7. `--save` and `--version` flags on `fabrik run`

### Phase 5: Polish + Launch
1. Subprocess agent adapter (runs in Daytona sandbox)
2. YAML test loader
3. OpenAI Assistant adapter + discovery
4. Local sandbox mode (no Daytona, for development)
5. Parallel test execution
6. Retry logic for flaky tests
7. Error messages and help text
8. Example projects (basic-http, subprocess, openai-assistant)
9. One community pack (@fabrik/pack-customer-support)
10. README, docs, contributing guide
11. npm publish setup
12. GitHub Actions CI

## Important Implementation Notes

### Assertion Collection Pattern
Assertions should NOT throw errors. Instead, they push results to a shared collector so ALL assertions in a scenario run, even if some fail:

```typescript
// Inside the scenario runner
const collector = new AssertionCollector();
const assertProxy = createAssertProxy(collector, llmProvider, agentProfile);

// Run the scenario function — assertions record results, don't throw
await scenario.fn({ agent: agentHandle, assert: assertProxy, profile: agentProfile, ... });

// After scenario completes, aggregate results
const results = collector.getResults();
const passed = results.every(r => r.passed);
const score = scorer.calculate(results);
```

### Agent Response Should Be Immutable
Once created, AgentResponse should not be mutated. Each `agent.send()` returns a new response.

### LLM Prompts Are The Product
Keep all LLM system prompts in dedicated `prompts.ts` files:
- `discovery/prompts.ts` — file ranker, extractor, profile synthesizer, HTTP profiler
- `generate/prompts.ts` — test planner, test writer
- `assert/prompts.ts` — sentiment judge, general judge, guardrail checker, factuality checker

The quality of these prompts IS the quality of the product. They should be iterated on aggressively. Every prompt should:
- Receive the AgentProfile context when relevant
- Use structured output (Zod schemas) wherever possible
- Include few-shot examples for critical tasks (test writing especially)
- Be explicit about output format expectations

### Test Generation Output Quality
Generated test files must be:
- Clean, readable TypeScript (not spaghetti)
- Well-commented (explain what the test checks and why)
- Grounded in reality (reference actual tool names, actual constraints from the profile)
- Not generic (no "test 1", "test 2" — specific scenarios)
- Properly using the assert.* API
- Ready to run without modification

### Discovery Should Be Resilient
- If a file can't be read: skip it, log warning, continue
- If the LLM returns garbage from file ranking: fall back to heuristic glob patterns
- If Daytona is unavailable: fall back to local file system reads (if --dir was used)
- If HTTP probing gets blocked: note it, generate tests from description/repo only
- Always produce SOMETHING useful — even with minimal info, generate basic tests

### Error Handling
- If an agent doesn't respond (timeout): record as a failed assertion with timeout error
- If an LLM judge call fails: retry once, then record as "inconclusive" (not failed)
- If a test file has syntax errors: skip with error message, don't crash the whole run
- If Daytona sandbox creation fails: fall back to local mode with a warning
- If discovery finds nothing useful: still generate basic tests from description, warn the user

### Environment Variable Interpolation
Config values like `"${env.OPENAI_API_KEY}"` should be interpolated at config load time from `process.env`.

### Discovery Prompts — Critical Guidelines

The FILE_RANKER_PROMPT should instruct the LLM to look for:
- Files with "prompt", "system", "instruction" in the name or path
- Files defining tools/functions (function schemas, OpenAI-style tool definitions)
- Agent configuration files (model selection, temperature, etc.)
- Route handlers or entry points (where the agent receives and responds to messages)
- README, docs, or any documentation
- Environment config that might reveal capabilities

The EXTRACTOR_PROMPT should instruct the LLM to extract:
- System prompts (verbatim if possible)
- Tool names + descriptions + parameter schemas
- Model configuration
- Any behavioral constraints or rules
- Business domain context
- Error handling patterns

The PROFILE_SYNTHESIZER_PROMPT should:
- Resolve conflicts between sources (e.g., README says one thing, code says another — code wins)
- Assign confidence scores to each finding
- Identify gaps — what couldn't be discovered
- Synthesize a coherent description from multiple evidence sources

The TEST_PLANNER_PROMPT should:
- Read the full AgentProfile
- Plan tests that specifically target the agent's known capabilities and constraints
- Include adversarial tests based on the actual guardrails (not generic ones)
- Plan tool-use tests for EACH discovered tool
- Consider multi-turn flows relevant to the domain

The TEST_WRITER_PROMPT should:
- Receive the AgentProfile + the specific scenario spec from the planner
- Write clean TypeScript using the scenario/persona/assert API
- Use real tool names from the profile in assert.toolCalled()
- Use real constraint language from the profile in assert.guardrail()
- Include comments explaining WHY this test matters
- Include the Fabrik API imports at the top