import { defineConfig } from "@fabrik/cli";

export default defineConfig({
  agent: {
    type: "http",
    url: "http://localhost:3000/api/chat",
  },
  tests: "./tests",
  llm: {
    provider: "chatgpt",
    model: "gpt-5.3-codex",
    // Uses your ChatGPT session token from ~/.codex/auth.json
    // Run `codex login` to authenticate
  },
});
