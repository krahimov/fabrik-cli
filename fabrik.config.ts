export default {
  agent: {
    type: "http",
    url: "http://localhost:3210",
  },
  tests: "./tests",
  llm: {
    provider: "chatgpt",
    model: "gpt-5.3-codex",
  },
};
