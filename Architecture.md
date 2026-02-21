# CLAUDE.md — Fabrik Lite

## What You're Building

Fabrik Lite is an open-source agent evaluation harness — "pytest for AI agents." It's a CLI tool that generates and runs test scenarios against AI agents, producing structured pass/fail reports with LLM-as-judge evaluation and version-to-version regression diffing.

**Core insight**: Developers don't know what to test their agents for. The primary user flow is NOT writing tests manually — it's pointing Fabrik at an agent and having it auto-generate comprehensive test suites. Hand-written tests are for power users adding domain-specific edge cases on top.

## Primary User Flow

```bash
# Install
npm install -g @fabrik/cli

# Initialize project
fabrik init

# Point at your agent, generate tests automatically
fabrik gen --agent http://localhost:3000/api/chat \
           --description "Customer support bot for an e-commerce store"
# → Generates 10-15 .test.ts files covering happy paths, edge cases,
#   guardrails, multi-turn, tool use validation

# Run all generated + custom tests
fabrik run

# Compare versions
fabrik diff --before v1.2 --after v1.3
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

**Layer 2 — Core Engine (@fabrik/core)**: Model-agnostic. Scenario engine, agent adapters, assertion pipeline, LLM judge, diff engine, reporter, trace store. This is a standalone npm package with zero vendor lock-in.

**Layer 3 — Infrastructure**: Daytona SDK for sandboxed execution, pluggable LLM providers (OpenAI, Anthropic, Ollama, custom) for judge/generation calls.

### Project Structure

```
fabrik/
├── packages/
│   ├── core/                      # @fabrik/core
│   │   ├── src/
│   │   │   ├── index.ts                # Public API exports
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
│   │   │   │   ├── generator.ts       # Core test generation logic
│   │   │   │   ├── prompts.ts         # System prompts for test generation
│   │   │   │   └── templates.ts       # Test file templates / scaffolding
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
│       │   │   ├── gen.ts              # fabrik gen (PRIMARY command)
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

## Core Types

```typescript
// packages/core/src/scenario/types.ts

export interface Persona {
  role: string;
  name?: string;
  tone?: string;
  backstory?: string;
  context?: Record<string, any>;
}

export interface Turn {
  role: "persona" | "agent";
  message: string;
}

export interface ScenarioContext {
  agent: AgentHandle;
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

  // LLM assertions (calls configured LLM provider)
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
```

### Provider implementations

- **OpenAI**: Uses `openai` npm package. Chat completions with `response_format: { type: "json_schema" }` for structured output.
- **Anthropic**: Uses `@anthropic-ai/sdk`. Messages API with tool use for structured output.
- **Ollama**: HTTP to local Ollama server. JSON mode for structured output.
- **Custom**: Any OpenAI-compatible endpoint (together.ai, groq, etc.)

## Test Generation (fabrik gen)

This is the **primary entry point** for most users. It should be polished and produce high-quality tests.

```bash
fabrik gen --agent http://localhost:3000/api/chat \
           --description "Customer support bot for an e-commerce store that handles returns, order status, and product questions. Has access to tools: lookup_order, initiate_refund, check_inventory."
```

### Generation Strategy

1. Take the agent description + any provided docs/system prompt
2. Call the LLM to generate a test plan (categories of tests to create)
3. For each category, generate 2-3 concrete test scenarios as .test.ts files
4. Write files to the tests/ directory
5. Print summary of what was generated

### Categories to Always Cover

- **Happy paths**: Normal, expected user interactions
- **Edge cases**: Unusual inputs, boundary conditions, ambiguous requests
- **Adversarial**: Prompt injection, jailbreak attempts, off-topic derailing
- **Guardrails**: PII leakage, hallucination, unsafe advice, policy violations
- **Multi-turn**: Conversations that evolve over multiple exchanges
- **Tool use**: Correct tool selection, error handling, chaining
- **Tone/personality**: Consistency with expected brand voice

### Generated Test Format

Generated files should be clean, readable TypeScript with comments explaining the test's purpose:

```typescript
// tests/generated/edge-case-contradictory-info.test.ts
// Generated by Fabrik — tests agent behavior when given contradictory information
import { scenario, persona, assert } from "@fabrik/core";

export default scenario("contradictory information handling", async ({ agent }) => {
  const user = persona({
    role: "customer",
    tone: "confused",
    backstory: "Saw conflicting prices on the website and in an email promotion",
  });

  const r1 = await agent.send(
    user.says("Your website says $99 but the email I got says $79. Which is it?")
  );

  // Agent should acknowledge the discrepancy, not dismiss it
  assert.sentiment(r1, "helpful");
  assert.guardrail(r1, {
    mustNot: ["you're wrong", "that's not possible"],
    must: ["acknowledge", "look into"],
  });

  // Agent should offer to verify
  assert.llmJudge(r1, {
    criteria: "Did the agent acknowledge the price discrepancy and offer to help resolve it rather than dismissing the customer?",
    threshold: 3,
    scale: 5,
  });
});
```

## Daytona Sandbox Integration

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

  async destroy(sandbox: any) {
    await this.daytona.delete(sandbox);
  }
}
```

Used when `agent.type === "subprocess"` — the agent-under-test runs inside a Daytona sandbox for isolation.

For `agent.type === "http"`, Daytona is not needed — the agent is already running externally.

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
    model: "gpt-",
    apiKey: "${env.OPENAI_API_KEY}",
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
- Creates `.fabrik/` directory for traces
- Prompts for LLM provider and API key
- Optionally runs `fabrik gen` immediately

### `fabrik gen`
Generates test files from agent description.

```
Options:
  --agent <url>          Agent endpoint URL (or reads from config)
  --description <text>   What the agent does
  --system-prompt <file> Path to agent's system prompt (optional, improves quality)
  --count <n>            Number of test files to generate (default: 10)
  --categories <list>    Specific categories: happy,edge,adversarial,guardrail,multi-turn,tool-use
  --output <dir>         Output directory (default: ./tests/generated/)
```

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
2. Core types (Scenario, Persona, AgentResponse, AssertionResult)
3. `scenario()` and `persona()` API functions
4. `assert.*` local assertions (contains, notContains, matches, latency, toolCalled)
5. Code test loader (dynamic import .test.ts files via tsx)
6. HTTP agent adapter
7. Terminal reporter (basic table with chalk + cli-table3)
8. CLI entry point with `fabrik run` command
9. Write one example test file to prove it works end-to-end

### Phase 2: Test Generation + LLM Judge (BUILD SECOND)
Get `fabrik gen` working, and add LLM-powered assertions.

1. LLMProvider interface
2. OpenAI provider (chat completions + structured output with Zod)
3. Anthropic provider
4. LLM assertions: `assert.sentiment()`, `assert.llmJudge()`, `assert.guardrail()`
5. Test generation engine (fabrik gen)
6. Generation prompts and templates
7. `fabrik gen` CLI command
8. `fabrik init` scaffolding command
9. Config file loader (cosmiconfig)

### Phase 3: Daytona Sandbox + More Adapters
Get subprocess agents working in Daytona sandboxes.

1. SandboxProvider interface
2. Daytona SDK integration
3. Local sandbox mode (no Daytona, for development)
4. Subprocess agent adapter
5. YAML test loader
6. OpenAI Assistant adapter

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
1. Parallel test execution
2. Retry logic for flaky tests
3. Error messages and help text
4. Example projects (basic-http, subprocess, openai-assistant)
5. One community pack (@fabrik/pack-customer-support)
6. README, docs, contributing guide
7. npm publish setup
8. GitHub Actions CI

## Important Implementation Notes

### Assertion Collection Pattern
Assertions should NOT throw errors. Instead, they push results to a shared collector so ALL assertions in a scenario run, even if some fail:

```typescript
// Inside the scenario runner
const collector = new AssertionCollector();
const assertProxy = createAssertProxy(collector, llmProvider);

// Run the scenario function — assertions record results, don't throw
await scenario.fn({ agent: agentHandle, assert: assertProxy, ... });

// After scenario completes, aggregate results
const results = collector.getResults();
const passed = results.every(r => r.passed);
const score = scorer.calculate(results);
```

### Agent Response Should Be Immutable
Once created, AgentResponse should not be mutated. Each `agent.send()` returns a new response.

### LLM Judge Prompts
Keep all LLM judge system prompts in a single file (`generate/prompts.ts` and `assert/prompts.ts`) so they can be iterated on easily. The quality of the prompts IS the quality of the product.

### Test Generation Output Quality
Generated test files must be:
- Clean, readable TypeScript (not spaghetti)
- Well-commented (explain what the test checks and why)
- Realistic scenarios (not generic "test 1", "test 2")
- Properly using the assert.* API
- Ready to run without modification

### Error Handling
- If an agent doesn't respond (timeout): record as a failed assertion with timeout error
- If an LLM judge call fails: retry once, then record as "inconclusive" (not failed)
- If a test file has syntax errors: skip with error message, don't crash the whole run
- If Daytona sandbox creation fails: fall back to local mode with a warning

### Environment Variable Interpolation
Config values like `"${env.OPENAI_API_KEY}"` should be interpolated at config load time from `process.env`.