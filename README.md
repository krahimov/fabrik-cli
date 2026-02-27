# Fabrik

**Automated testing for AI agents.** Fabrik discovers what your agent does, generates behavioral test scenarios, runs them, and tracks regressions across versions.

Think of it as pytest for AI agents — but the tests write themselves.

## How It Works

1. **Discovery** — Fabrik probes your agent's HTTP endpoint (or reads its source code) to build a profile: what tools it has, what domain it serves, what constraints it follows.
2. **Generation** — An LLM creates diverse test scenarios across categories: happy path, edge cases, adversarial attacks, guardrail checks, multi-turn conversations, and tool usage.
3. **Execution** — Each scenario runs against your live agent. Responses are evaluated using LLM-as-judge with rich, scenario-specific criteria.
4. **Diff** — Compare results across versions to catch regressions before they ship.

## Install

```bash
npm install -g @fabriklabs/cli
```

Or use directly with npx:

```bash
npx @fabriklabs/cli init
```

## Quickstart

```bash
# 1. Initialize a project
fabrik init

# 2. Edit fabrik.config.ts to point at your agent
#    (see Configuration below)

# 3. Generate tests from your agent's source
fabrik gen --dir ./path/to/agent/source

# 4. Run the tests
fabrik run

# 5. Save results and compare versions
fabrik run --save --label v1.0
# ... make changes to your agent ...
fabrik run --save --label v1.1
fabrik diff --before v1.0 --after v1.1
```

## Configuration

Create a `fabrik.config.ts` in your project root:

```typescript
export default {
  agent: {
    type: "http",
    url: "http://localhost:3000",
  },
  tests: "./tests",
  llm: {
    provider: "openai",
    model: "gpt-5.3-codex",
  },
};
```

### Agent Types

| Type | Config | Description |
|------|--------|-------------|
| `http` | `url`, `headers` | HTTP endpoint that accepts messages |
| `subprocess` | `command`, `args` | Local process (stdin/stdout) |
| `openai-assistant` | `assistantId` | OpenAI Assistant API |

### LLM Providers

Fabrik uses an LLM for test generation and evaluation. Supported providers:

| Provider | Model Example | Auth |
|----------|---------------|------|
| `openai` | `gpt-5.2-codex` | `OPENAI_API_KEY` env var |
| `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` env var |
| `chatgpt` | `gpt-5.3-codex` | ChatGPT session token |
| `ollama` | `llama3` | Local, no auth needed |

### Eval Options

```typescript
export default {
  // ...
  eval: {
    parallelism: 3,      // concurrent test runs
    retries: 2,           // retry failed tests
    defaultTimeout: 30000, // ms per scenario
  },
};
```

## CLI Commands

### `fabrik init`

Creates a new Fabrik project with config file and test directories.

### `fabrik gen`

Discovers your agent and generates test files.

```
Options:
  --dir <path>          Local source directory to explore
  --repo <url>          Git repo URL to clone and explore
  --agent <url>         HTTP endpoint to probe directly
  --assistant <id>      OpenAI Assistant ID
  --refresh             Force re-discovery (ignore cache)
  --count <n>           Number of test files to generate (default: 10)
  --categories <list>   Filter: happy,edge,adversarial,guardrail,multi-turn,tool-use
  --output <dir>        Output directory (default: tests/generated)
```

### `fabrik run`

Runs all test scenarios against your agent.

```
Options:
  --test <pattern>      Filter by test name
  --tag <tag>           Filter by tag
  --parallel <n>        Concurrent scenario runs
  --timeout <ms>        Override default timeout
  --format <type>       Output: terminal, json, html (default: terminal)
  --output <file>       Write report to file
  --save                Save results to trace store
  --label <label>       Version label for saved results
```

### `fabrik diff`

Compares test results between two saved versions.

```
Options:
  --before <version>    Base version (or "previous")
  --after <version>     Target version (or "latest")
  --threshold <n>       Regression detection threshold (default: 0.05)
  --json                Output as JSON
```

## Generated Tests

Fabrik generates TypeScript test files that look like this:

```typescript
import { scenario, persona } from "@fabriklabs/core";

export default scenario("handles flight search", async ({ agent, assert }) => {
  const traveler = persona({ role: "customer", tone: "direct", backstory: "Business traveler" });

  const r1 = await agent.send(
    traveler.says("Find me flights from NYC to London next Friday")
  );

  await assert.llmJudge(r1, {
    criteria: `The agent should search for flights and return relevant results.
    It should acknowledge the origin (NYC), destination (London), and date.
    Results should include price and airline information from tool calls.`,
    threshold: 3,
    scale: 5,
  });
});
```

Tests use `assert.llmJudge()` with rich criteria that evaluate the agent's behavior holistically — no brittle string matching.

## Project Structure

```
your-project/
├── fabrik.config.ts
├── tests/
│   └── generated/        # auto-generated test files
├── .fabrik/
│   ├── agent-profile.json  # cached agent profile
│   └── traces.db           # test result history
```

## License

MIT
