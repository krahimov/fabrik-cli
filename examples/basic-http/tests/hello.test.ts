// Basic test — verifies the agent responds to a simple greeting
import { scenario, persona, assert } from "@fabrik/core";

export default scenario("basic greeting", async ({ agent }) => {
  const user = persona({
    role: "customer",
    tone: "friendly",
    backstory: "First-time visitor to the website",
  });

  const r1 = await agent.send(user.says("Hi there! How are you?"));

  assert.contains(r1, "hello");
  assert.latency(r1, { max: 5000 });
});
