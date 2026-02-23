# Architecture — Fabrik Lite

> "pytest for AI agents" — an open-source evaluation harness that agentically discovers, generates, and executes tests against AI agents.

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│                                                                              │
│  fabrik init    fabrik gen    fabrik run    fabrik diff    fabrik report      │
│      │              │             │             │              │              │
└──────┼──────────────┼─────────────┼─────────────┼──────────────┼─────────────┘
       │              │             │             │              │
       ▼              ▼             ▼             ▼              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           @fabrik/cli                                        │
│                                                                              │
│  Config Loader ─── Command Router ─── Sandbox Manager ─── Auth Manager       │
│                                                                              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           @fabrik/core                                       │
│                                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Discovery   │  │  Generation  │  │  Execution   │  │  Analysis       │  │
│  │  Engine      │  │  Engine      │  │  Engine      │  │  Engine         │  │
│  │             │  │              │  │              │  │                 │  │
│  │  Explorer    │  │  Planner     │  │  Scenario    │  │  Diff Engine    │  │
│  │  File Ranker │  │  Writer      │  │  Runner      │  │  Regression     │  │
│  │  Extractors  │  │  Templates   │  │  Assertions  │  │  Detector       │  │
│  │  HTTP Prober │  │              │  │  Scorer      │  │                 │  │
│  │  Synthesizer │  │              │  │              │  │                 │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                │                 │                    │            │
│         ▼                ▼                 ▼                    ▼            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Shared Infrastructure                           │   │
│  │                                                                      │   │
│  │  LLM Provider Interface ─── Agent Adapter Interface ─── Trace Store  │   │
│  │  (OpenAI / Anthropic /      (HTTP / Subprocess /        (SQLite)     │   │
│  │   Ollama / Custom)           Assistant / Custom)                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE LAYER                                  │
│                                                                              │
│  ┌────────────────────────┐        ┌─────────────────────────────────────┐  │
│  │     Daytona Sandbox     │        │     LLM Backend                     │  │
│  │                         │        │                                     │  │
│  │  • Codebase exploration │        │  Default: gpt-5.3-codex via        │  │
│  │  • Agent execution      │        │  ChatGPT session token             │  │
│  │  • Git clone / FS ops   │        │  (~/.codex/auth.json)              │  │
│  │  • Process isolation    │        │                                     │  │
│  │  • Sub-90ms startup     │        │  Fallback: OPENAI_API_KEY,         │  │
│  │                         │        │  Anthropic, Ollama, Custom         │  │
│  └────────────────────────┘        └─────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Package Architecture

Fabrik Lite is a TypeScript monorepo with two packages:

```
fabrik/
├── packages/
│   ├── core/     →  @fabrik/core    (library, model-agnostic, zero vendor lock-in)
│   └── cli/      →  @fabrik/cli     (CLI binary, wires core to Daytona + config)
└── packs/        →  @fabrik/pack-*  (community scenario packs)
```

### @fabrik/core

The engine. Has no opinions about where LLM inference comes from, where sandboxes run, or how the CLI works. Exports pure functions and interfaces.

**Depends on**: `zod`, `js-yaml`, `better-sqlite3`, `chalk`, `cli-table3`
**Does NOT depend on**: `openai`, `@anthropic-ai/sdk`, `@daytonaio/sdk` — these are injected by the CLI.

### @fabrik/cli

The executable. Wires `@fabrik/core` to real infrastructure — Daytona for sandboxes, OpenAI/Anthropic for LLM calls, cosmiconfig for config loading.

**Depends on**: `@fabrik/core`, `commander`, `cosmiconfig`, `openai`, `@anthropic-ai/sdk`, `@daytonaio/sdk`

### Dependency Injection Pattern

The CLI instantiates concrete providers and injects them into core:

```typescript
// packages/cli/src/commands/run.ts
import { runScenarios } from "@fabrik/core";
import { OpenAIProvider } from "@fabrik/core/llm/openai";
import { HttpAdapter } from "@fabrik/core/adapter/http";

const llm = new OpenAIProvider({
  model: config.llm.model,        // gpt-5.3-codex
  auth: await loadSessionToken(), // ~/.codex/auth.json
});

const agent = new HttpAdapter(config.agent);
const profile = await loadCachedProfile();  // .fabrik/agent-profile.json

const results = await runScenarios({
  scenarios: await loadTestFiles(config.tests),
  agent,
  llm,
  profile,    // Discovery context flows into execution
});
```

---

## 3. Agentic Discovery Pipeline

This is the core differentiator. When `fabrik gen` runs, Fabrik acts as an autonomous agent that explores and profiles the target agent.

### 3.1 Discovery Modes

```
┌──────────────────────────────────────────────────────────────────┐
│                     fabrik gen                                    │
│                                                                  │
│  --repo <url>        ──→  Repo Discovery (highest confidence)    │
│  --dir <path>        ──→  Local Dir Discovery (no sandbox)       │
│  --agent <url>       ──→  HTTP Probe Discovery (inference-based) │
│  --assistant <id>    ──→  OpenAI API Discovery (structured)      │
│                                                                  │
│  All paths produce the same output: AgentProfile                 │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Repo Discovery Flow (Primary Path)

```
 fabrik gen --repo https://github.com/acme/support-bot
                    │
                    ▼
 ┌──────────────────────────────────────┐
 │  STEP 1: Clone into Daytona Sandbox  │
 │                                      │
 │  sandbox = daytona.create()          │
 │  sandbox.git.clone(repo, /workspace) │
 └──────────────────┬───────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────┐
 │  STEP 2: Orientation Scan            │
 │                                      │
 │  • find . -maxdepth 3 -type f        │  ← Get file tree
 │  • Read README.md                    │  ← Understand project
 │  • Read package.json / pyproject.toml│  ← Identify dependencies
 │  • Read .env.example                 │  ← Discover config shape
 └──────────────────┬───────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 3: LLM-Driven File Ranking                 │
 │                                                   │
 │  INPUT:  file tree + README + dependencies        │
 │  LLM:    "Which files likely contain the system   │
 │           prompt, tool definitions, route          │
 │           handlers, config, schemas?"              │
 │  OUTPUT: Ranked list of files to read              │
 │          [{ path, reason, priority }]              │
 │                                                   │
 │  ⚠ NO HARDCODED GLOBS — LLM decides what matters │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 4: Read & Extract (top 20 files)            │
 │                                                   │
 │  For each ranked file:                            │
 │    content = sandbox.fs.downloadFile(path)        │
 │    findings = LLM.extract(content, file.reason)   │
 │                                                   │
 │  Extracts:                                        │
 │    • System prompts (verbatim)                    │
 │    • Tool names + descriptions + param schemas    │
 │    • Model configuration                          │
 │    • Behavioral constraints / rules               │
 │    • Business domain context                      │
 │    • API route patterns                           │
 │                                                   │
 │  Each finding has a confidence score (0-1)        │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 5: Profile Synthesis                        │
 │                                                   │
 │  INPUT:  All accumulated evidence[]               │
 │  LLM:    "Resolve conflicts, assign confidence,   │
 │           synthesize into AgentProfile"            │
 │  OUTPUT: Complete AgentProfile                    │
 │                                                   │
 │  Conflict resolution:                             │
 │    Code > README > inference                      │
 │    Explicit > implicit                            │
 │    Recent files > old files                       │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 6: Cache & Cleanup                          │
 │                                                   │
 │  Write .fabrik/agent-profile.json                 │
 │  Destroy Daytona sandbox                          │
 │  Print discovery summary to terminal              │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
              AgentProfile
              (flows into test generation)
```

### 3.3 HTTP Probe Discovery Flow

```
 fabrik gen --agent http://localhost:3000/api/chat
                    │
                    ▼
 ┌──────────────────────────────────────┐
 │  STEP 1: Schema Discovery            │
 │                                      │
 │  Try fetching:                       │
 │    /openapi.json                     │
 │    /.well-known/ai-plugin.json       │
 │    /health                           │
 │    /docs                             │
 └──────────────────┬───────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 2: Sample Probing                           │
 │                                                   │
 │  Send carefully crafted messages:                 │
 │    "Hello, what can you help me with?"            │
 │    "What tools do you have available?"            │
 │    "Can you help me with [intentionally vague]?"  │
 │    "[edge case / boundary test message]"          │
 │                                                   │
 │  Record: response text, latency, response format  │
 │  Confidence: 0.5 (inference from behavior)        │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  STEP 3: LLM Profile Inference                    │
 │                                                   │
 │  LLM analyzes probe results to infer:             │
 │    • Agent capabilities and domain                │
 │    • Available tools (from agent mentioning them) │
 │    • Tone and personality                         │
 │    • Constraints (from refusals / redirects)      │
 │    • Response format patterns                     │
 │                                                   │
 │  Lower overall confidence than repo discovery     │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
              AgentProfile (confidence: ~0.4-0.6)
              + suggestion to provide --repo for deeper analysis
```

### 3.4 OpenAI Assistant Discovery Flow

```
 fabrik gen --assistant asst_abc123
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  Fetch via Assistants API                         │
 │                                                   │
 │  assistant = openai.beta.assistants.retrieve(id)  │
 │                                                   │
 │  assistant.instructions  → systemPrompt           │
 │  assistant.tools         → tools[]                │
 │  assistant.model         → modelInfo              │
 │  assistant.metadata      → additional context     │
 │                                                   │
 │  Confidence: 0.9+ (structured, direct from API)   │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
              AgentProfile (confidence: ~0.9)
```

---

## 4. AgentProfile — The Central Data Structure

Everything flows through the AgentProfile. It's the single source of truth about the target agent.

```
                    ┌────────────────────────┐
                    │     AgentProfile        │
                    │                        │
                    │  name                  │
                    │  description           │
                    │  domain                │
                    │  tools[]               │
                    │  systemPrompt          │
                    │  modelInfo             │
                    │  knownConstraints[]    │
                    │  expectedTone          │
                    │  endpoint              │
                    │  codebase              │
                    │  evidence[]            │
                    │  confidence            │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
     ┌────────────────┐ ┌──────────────┐ ┌────────────────┐
     │ Test Generation │ │ Test         │ │ LLM Judge      │
     │                 │ │ Execution    │ │ Assertions     │
     │ Planner reads   │ │              │ │                │
     │ profile to plan │ │ Profile      │ │ Judge receives │
     │ grounded tests  │ │ available in │ │ profile as     │
     │                 │ │ ScenarioCtx  │ │ evaluation     │
     │ Writer uses     │ │ for runtime  │ │ context        │
     │ real tool names,│ │ access       │ │                │
     │ real constraints│ │              │ │ Evaluates      │
     │ from profile    │ │              │ │ against actual │
     │                 │ │              │ │ agent purpose  │
     └────────────────┘ └──────────────┘ └────────────────┘
```

### Where the Profile is Used

| Component | How it uses AgentProfile |
|---|---|
| **Test Planner** | Reads `tools[]` to plan tool-use tests for each real tool. Reads `knownConstraints[]` to plan adversarial tests against real guardrails. Reads `domain` to plan domain-specific scenarios. |
| **Test Writer** | Uses `tools[].name` in `assert.toolCalled()`. Uses `knownConstraints` in `assert.guardrail()`. Uses `expectedTone` for `assert.sentiment()`. Uses `systemPrompt` excerpts in test comments. |
| **LLM Judge** | Receives profile summary as context. Evaluates agent responses against what the agent is *supposed to do*, not generic standards. |
| **Guardrail Check** | Uses `knownConstraints` as the ground truth for what the agent must/must not do. |
| **Terminal Reporter** | Displays agent name, domain, tool count, confidence from profile in the run header. |

### Profile Caching

```
.fabrik/
├── agent-profile.json     ← Cached AgentProfile (auto-loaded on `fabrik run`)
└── traces.db              ← SQLite run history
```

- First `fabrik gen` populates the cache
- Subsequent `fabrik run` loads it automatically
- `fabrik gen --refresh` forces re-discovery
- Warning printed if profile > 7 days old

---

## 5. Test Generation Pipeline

```
 AgentProfile
      │
      ▼
 ┌──────────────────────────────────────────────────┐
 │  TEST PLANNER (LLM call)                          │
 │                                                   │
 │  Input: Full AgentProfile                         │
 │  Output: TestPlan (structured via Zod)             │
 │                                                   │
 │  {                                                │
 │    categories: [                                  │
 │      {                                            │
 │        name: "happy-path",                        │
 │        scenarios: [                               │
 │          { name, description, turns, assertions } │
 │        ]                                          │
 │      },                                           │
 │      { name: "tool-use", ... },                   │
 │      { name: "adversarial", ... },                │
 │      { name: "guardrail", ... },                  │
 │      { name: "multi-turn", ... },                 │
 │      { name: "tone", ... },                       │
 │    ]                                              │
 │  }                                                │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  TEST WRITER (LLM call per scenario)              │
 │                                                   │
 │  Input: AgentProfile + category + scenario spec   │
 │  Output: Raw TypeScript .test.ts file content     │
 │                                                   │
 │  Generated code:                                  │
 │    • Imports from @fabrik/core                     │
 │    • Uses scenario() + persona() API              │
 │    • References real tool names from profile       │
 │    • References real constraints from profile      │
 │    • Includes explanatory comments                │
 │    • Uses appropriate assert.* methods            │
 │    • Ready to run without modification            │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  FILE OUTPUT                                      │
 │                                                   │
 │  ./tests/generated/                               │
 │    ├── happy-path-order-status.test.ts            │
 │    ├── happy-path-product-inquiry.test.ts         │
 │    ├── tool-use-lookup-order.test.ts              │
 │    ├── tool-use-initiate-refund.test.ts           │
 │    ├── adversarial-prompt-injection.test.ts       │
 │    ├── adversarial-topic-derail.test.ts           │
 │    ├── guardrail-pii-leakage.test.ts             │
 │    ├── guardrail-policy-violation.test.ts         │
 │    ├── multi-turn-escalation.test.ts             │
 │    └── tone-brand-consistency.test.ts            │
 └──────────────────────────────────────────────────┘
```

### Test Categories (Always Generated)

| Category | What it tests | Informed by |
|---|---|---|
| **Happy path** | Normal expected interactions | `profile.description`, `profile.domain` |
| **Tool use** | One test per discovered tool — correct invocation, error handling | `profile.tools[]` |
| **Adversarial** | Prompt injection, jailbreak, topic derailing | `profile.knownConstraints`, `profile.systemPrompt` |
| **Guardrail** | PII leakage, hallucination, unsafe advice, policy violations | `profile.knownConstraints` |
| **Multi-turn** | Conversations that evolve, context retention, escalation | `profile.domain`, `profile.tools[]` |
| **Tone** | Brand voice consistency across scenarios | `profile.expectedTone` |
| **Edge case** | Ambiguous inputs, contradictions, empty inputs | `profile.description` |

---

## 6. Test Execution Pipeline

```
 fabrik run
      │
      ▼
 ┌──────────────────────────────────────────────────┐
 │  LOAD PHASE                                       │
 │                                                   │
 │  1. Load fabrik.config.ts (cosmiconfig)           │
 │  2. Load .fabrik/agent-profile.json               │
 │  3. Scan tests/ directory                         │
 │  4. Dynamic import .test.ts files (via tsx)       │
 │  5. Parse .yaml files → Scenario objects          │
 │  6. Apply --test / --tag filters                  │
 │  7. Initialize LLM provider (session token)       │
 │  8. Initialize agent adapter (HTTP / subprocess)  │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  EXECUTE PHASE (per scenario)                     │
 │                                                   │
 │  For each Scenario:                               │
 │                                                   │
 │  1. Create AssertionCollector                     │
 │  2. Create assert proxy (bound to collector +     │
 │     LLM provider + AgentProfile)                  │
 │  3. Create AgentHandle (bound to adapter)         │
 │  4. Run scenario.fn({ agent, assert, profile })   │
 │     │                                             │
 │     ├── agent.send(message)                       │
 │     │   → adapter.send() → AgentResponse          │
 │     │                                             │
 │     ├── assert.contains(response, text)           │
 │     │   → instant check → push to collector       │
 │     │                                             │
 │     ├── assert.llmJudge(response, opts)           │
 │     │   → LLM call (with profile context)         │
 │     │   → push to collector                       │
 │     │                                             │
 │     └── (repeat for all turns/assertions)         │
 │                                                   │
 │  5. Aggregate results from collector              │
 │  6. Calculate weighted score                      │
 │  7. Determine pass/fail                           │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  REPORT PHASE                                     │
 │                                                   │
 │  ┌─────────────────────────────────────────────┐  │
 │  │  Terminal Output                             │  │
 │  │                                              │  │
 │  │  Agent: Acme Support Bot (customer-support)  │  │
 │  │  Tools: 4 discovered | Confidence: 0.87      │  │
 │  │                                              │  │
 │  │  SCENARIO                    RESULT  SCORE   │  │
 │  │  ─────────────────────────────────────────   │  │
 │  │  angry customer refund       PASS    4.2/5   │  │
 │  │  prompt injection attempt    PASS    5.0/5   │  │
 │  │  tool: lookup_order          PASS    3.8/5   │  │
 │  │  tool: initiate_refund       FAIL    1.5/5   │  │
 │  │  pii leakage check           PASS    4.5/5   │  │
 │  │                                              │  │
 │  │  12 passed, 1 failed | Score: 4.1/5         │  │
 │  └─────────────────────────────────────────────┘  │
 │                                                   │
 │  Optional: --save → write to SQLite trace store   │
 │  Optional: --format json → write .json report     │
 │  Optional: --format html → write .html report     │
 └──────────────────────────────────────────────────┘
```

### Assertion Execution Model

Assertions **never throw**. They record results to a collector so every assertion in a scenario runs regardless of failures:

```
 scenario.fn() executing...
      │
      ├── assert.contains(r1, "refund")     → { type: "contains", passed: true }
      ├── assert.toolCalled(r1, "lookup")    → { type: "tool_called", passed: true }
      ├── assert.sentiment(r1, "empathetic") → { type: "sentiment", passed: false, reasoning: "..." }
      ├── assert.llmJudge(r1, { ... })       → { type: "llm_judge", passed: true, score: 4 }
      │
      ▼
 AssertionCollector.getResults()
      │
      ▼
 Scorer.calculate(results)  →  weighted score 0-5
```

### Assertion Types

```
 ┌─────────────────────────────────────────────┐
 │  LOCAL ASSERTIONS (instant, no LLM)          │
 │                                              │
 │  assert.contains(response, text)             │
 │  assert.notContains(response, text)          │
 │  assert.matches(response, /regex/)           │
 │  assert.jsonSchema(response, zodSchema)      │
 │  assert.latency(response, { max: 3000 })     │
 │  assert.tokenUsage(response, { max: 500 })   │
 │  assert.toolCalled(response, "tool_name")    │
 │  assert.toolNotCalled(response, "tool_name") │
 └─────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────┐
 │  LLM ASSERTIONS (calls LLM provider, profile-aware)     │
 │                                                          │
 │  assert.sentiment(response, "empathetic")                │
 │    → LLM classifies response tone against expected       │
 │                                                          │
 │  assert.llmJudge(response, { criteria, threshold })      │
 │    → LLM scores response 1-5 against criteria            │
 │    → Judge receives AgentProfile for context              │
 │                                                          │
 │  assert.guardrail(response, { mustNot, must })           │
 │    → LLM checks behavioral boundaries                    │
 │    → Grounded in profile.knownConstraints                │
 │                                                          │
 │  assert.factuality(response, { groundTruth, context })   │
 │    → LLM checks factual accuracy                         │
 └─────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────┐
 │  CUSTOM ASSERTIONS                           │
 │                                              │
 │  assert.custom("name", async (response) => { │
 │    // Any custom logic                       │
 │    return true/false;                        │
 │  })                                          │
 └─────────────────────────────────────────────┘
```

---

## 7. Authentication Architecture

Fabrik uses ChatGPT session tokens as the primary auth mechanism for LLM calls. This means users pay through their existing ChatGPT subscription — no separate API billing.

```
 ┌──────────────────────────────────────────────────┐
 │  AUTH FLOW                                        │
 │                                                   │
 │  fabrik auth (or fabrik init)                     │
 │       │                                           │
 │       ▼                                           │
 │  Runs `codex login` OAuth flow                    │
 │       │                                           │
 │       ▼                                           │
 │  User authenticates with ChatGPT in browser       │
 │       │                                           │
 │       ▼                                           │
 │  Session token cached at ~/.codex/auth.json       │
 │       │                                           │
 │       ▼                                           │
 │  All LLM calls (discovery, generation, judge)     │
 │  use this token → gpt-5.3-codex model             │
 │                                                   │
 │  FALLBACK: If no session token found:             │
 │    → Check OPENAI_API_KEY env var                 │
 │    → Check config.llm.apiKey                      │
 │    → Error with instructions to run `fabrik auth` │
 └──────────────────────────────────────────────────┘
```

### Auth Priority

```
1. ChatGPT session token  (~/.codex/auth.json)     ← Default, no API costs
2. OPENAI_API_KEY          (env var)                ← API billing
3. config.llm.apiKey       (fabrik.config.ts)       ← Explicit override
4. Error                   "Run fabrik auth"        ← Guide user
```

---

## 8. Sandbox Architecture

Daytona provides sandboxed environments for two purposes:

### 8.1 Discovery Sandboxes

Used by `fabrik gen --repo` to safely clone and explore unknown repositories.

```
 ┌────────────────────────────────────────────────┐
 │  Discovery Sandbox Lifecycle                    │
 │                                                 │
 │  create()  →  clone repo  →  scan files  →     │
 │  read files  →  extract info  →  destroy()     │
 │                                                 │
 │  Typical lifetime: 30-120 seconds               │
 │  Isolation: Full (untrusted code never executes)│
 └────────────────────────────────────────────────┘
```

### 8.2 Execution Sandboxes

Used by `fabrik run` when the agent under test is a subprocess (not HTTP).

```
 ┌────────────────────────────────────────────────┐
 │  Execution Sandbox Lifecycle                    │
 │                                                 │
 │  create()  →  install deps  →  start agent  →  │
 │  send test messages  →  collect responses  →   │
 │  destroy()                                      │
 │                                                 │
 │  Typical lifetime: duration of test run         │
 │  Isolation: Full (agent can't affect host)      │
 └────────────────────────────────────────────────┘
```

### 8.3 When Sandboxes Are Used

| Command | Sandbox? | Why |
|---|---|---|
| `fabrik gen --repo` | **YES** (Daytona) | Clone untrusted repo, explore files |
| `fabrik gen --dir` | **NO** | Read local files directly (trusted) |
| `fabrik gen --agent` | **NO** | HTTP probing only |
| `fabrik gen --assistant` | **NO** | API call only |
| `fabrik run` (HTTP agent) | **NO** | Agent is external |
| `fabrik run` (subprocess agent) | **YES** (Daytona) | Isolate agent execution |

### 8.4 Sandbox Provider Interface

```typescript
interface SandboxProvider {
  create(opts: SandboxOpts): Promise<Sandbox>;
  exec(sandbox: Sandbox, command: string, opts?: ExecOpts): Promise<ExecResult>;
  readFile(sandbox: Sandbox, path: string): Promise<string>;
  writeFile(sandbox: Sandbox, path: string, content: string | Buffer): Promise<void>;
  cloneRepo(sandbox: Sandbox, url: string, dest: string): Promise<void>;
  findFiles(sandbox: Sandbox, root: string, pattern: string): Promise<string[]>;
  destroy(sandbox: Sandbox): Promise<void>;
}
```

Implementations: `DaytonaSandbox` (production), `LocalSandbox` (development, no isolation).

---

## 9. Diff & Regression Engine

```
 fabrik diff --before v1.2 --after v1.3
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  Load RunResult[] for both versions from SQLite   │
 │                                                   │
 │  v1.2: [scenario1: PASS 4.2, scenario2: PASS 3.8]│
 │  v1.3: [scenario1: PASS 4.5, scenario2: FAIL 1.2]│
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  DIFF ENGINE                                      │
 │                                                   │
 │  Match scenarios by name across versions          │
 │  Calculate: score delta, pass/fail flips          │
 │  Detect regressions (score drop > threshold)      │
 │  Detect improvements                              │
 │  Flag new/removed scenarios                       │
 └──────────────────┬────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │  REGRESSION REPORT                                │
 │                                                   │
 │  SCENARIO              v1.2   v1.3   DELTA        │
 │  ──────────────────────────────────────────────   │
 │  angry customer refund  4.2    4.5    +0.3 ✅     │
 │  tool: initiate_refund  3.8    1.2    -2.6 🔴     │
 │  [new] edge case xyz    —      4.0    new          │
 │                                                   │
 │  ⚠ 1 regression detected                          │
 └──────────────────────────────────────────────────┘
```

---

## 10. Data Flow Summary

```
 ┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌────────────┐
 │  Source   │────→│ Discovery │────→│ AgentProfile │────→│ Generation │
 │  (repo/  │     │  Engine   │     │  (.fabrik/   │     │  Engine    │
 │   http/  │     │           │     │   agent-     │     │            │
 │   asst)  │     │           │     │   profile.   │     │            │
 └──────────┘     └───────────┘     │   json)      │     └─────┬──────┘
                                    └──────┬───────┘           │
                                           │                   │
                                           │              .test.ts files
                                           │                   │
                                           ▼                   ▼
                                    ┌──────────────┐    ┌──────────────┐
                                    │  Execution   │◀───│  Test Files  │
                                    │  Engine      │    │  (generated  │
                                    │              │    │   + manual)  │
                                    │  LLM judge   │    └──────────────┘
                                    │  uses profile│
                                    │  as context  │
                                    └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │  RunResult[] │
                                    │              │
                                    ├──────────────┤
                                    │  Terminal    │
                                    │  JSON / HTML │
                                    │  SQLite      │──→ fabrik diff
                                    └──────────────┘
```

---

## 11. LLM Call Map

Every LLM call Fabrik makes, and where it happens:

| Call | Module | Purpose | Structured Output? |
|---|---|---|---|
| File Ranking | `discovery/file-ranker.ts` | Decide which files to read from repo | Yes (Zod) |
| Content Extraction | `discovery/extractors.ts` | Extract findings from file contents | Yes (Zod) |
| Profile Synthesis | `discovery/explorer.ts` | Merge evidence into AgentProfile | Yes (Zod) |
| HTTP Profiling | `discovery/http-prober.ts` | Infer profile from probe responses | Yes (Zod) |
| Test Planning | `generate/planner.ts` | Plan test categories and scenarios | Yes (Zod) |
| Test Writing | `generate/writer.ts` | Write .test.ts file code | No (raw TS) |
| Sentiment Judge | `assert/llm-judge.ts` | Classify response sentiment | Yes (Zod) |
| General Judge | `assert/llm-judge.ts` | Score response against criteria | Yes (Zod) |
| Guardrail Check | `assert/llm-judge.ts` | Check behavioral boundaries | Yes (Zod) |
| Factuality Check | `assert/llm-judge.ts` | Verify factual accuracy | Yes (Zod) |

All calls go through the LLMProvider interface. Default: `gpt-5.3-codex` via ChatGPT session token.

---

## 12. File System Layout (Runtime)

```
my-project/
├── fabrik.config.ts               ← Project config
├── tests/
│   ├── generated/                 ← Auto-generated by `fabrik gen`
│   │   ├── happy-path-*.test.ts
│   │   ├── tool-use-*.test.ts
│   │   ├── adversarial-*.test.ts
│   │   ├── guardrail-*.test.ts
│   │   ├── multi-turn-*.test.ts
│   │   └── tone-*.test.ts
│   └── custom/                    ← Hand-written by user
│       └── my-edge-case.test.ts
├── .fabrik/
│   ├── agent-profile.json         ← Cached discovery profile
│   └── traces.db                  ← SQLite run history
└── fabrik-reports/                 ← Generated reports
    ├── run-2025-01-15-143022.json
    └── run-2025-01-15-143022.html
```

---

## 13. Error Handling Strategy

```
 ┌────────────────────────────┬──────────────────────────────────┐
 │  Failure                   │  Behavior                        │
 ├────────────────────────────┼──────────────────────────────────┤
 │  Agent timeout             │  Record FAIL assertion           │
 │  Agent returns error       │  Record FAIL + capture error msg │
 │  LLM judge call fails      │  Retry once → "inconclusive"    │
 │  Test file syntax error    │  Skip file, log warning          │
 │  Daytona unavailable       │  Fall back to local mode         │
 │  Session token expired     │  Prompt user to run fabrik auth  │
 │  File unreadable (disco.)  │  Skip file, continue discovery   │
 │  LLM returns garbage       │  Fall back to heuristic patterns │
 │  No profile found (run)    │  Run without profile context     │
 │  Discovery finds nothing   │  Generate basic tests + warn     │
 └────────────────────────────┴──────────────────────────────────┘
```

**Principle**: Never crash. Always produce something useful. Degrade gracefully.

---

## 14. Security Model

```
 ┌──────────────────────────────────────────────────┐
 │  TRUST BOUNDARIES                                 │
 │                                                   │
 │  TRUSTED:                                         │
 │    • User's fabrik.config.ts                      │
 │    • User's hand-written .test.ts files           │
 │    • User's local filesystem (--dir mode)         │
 │                                                   │
 │  UNTRUSTED:                                       │
 │    • Cloned repositories (--repo mode)            │
 │      → Always explored in Daytona sandbox         │
 │      → Code is NEVER executed, only read          │
 │    • Agent responses                              │
 │      → Treated as untrusted input                 │
 │    • LLM outputs                                  │
 │      → Validated via Zod schemas                  │
 │      → Generated test code is written to disk     │
 │        but not auto-executed without user review   │
 │                                                   │
 │  SECRETS:                                         │
 │    • Session token: ~/.codex/auth.json (600 perms)│
 │    • API keys: env vars only, never in config     │
 │    • Agent auth: interpolated at runtime           │
 └──────────────────────────────────────────────────┘
```

---

## 15. Extension Points

```
 ┌────────────────────┬──────────────────────────────────────┐
 │  Extension          │  Mechanism                           │
 ├────────────────────┼──────────────────────────────────────┤
 │  LLM Providers      │  Implement LLMProvider interface     │
 │  Agent Adapters      │  Implement AgentAdapter interface    │
 │  Sandbox Providers   │  Implement SandboxProvider interface │
 │  Custom Assertions   │  assert.custom("name", fn)          │
 │  Scenario Packs      │  npm packages (@fabrik/pack-*)      │
 │  Report Formats      │  Implement Reporter interface       │
 │  Discovery Sources   │  Implement DiscoverySource interface │
 └────────────────────┴──────────────────────────────────────┘
```