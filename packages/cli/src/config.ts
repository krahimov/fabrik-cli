import { cosmiconfig } from "cosmiconfig";

export interface FabrikConfig {
  agent: {
    type: "http" | "subprocess" | "openai-assistant" | "custom";
    url?: string;
    headers?: Record<string, string>;
    command?: string;
    args?: string[];
    assistantId?: string;
    module?: string;
  };
  tests: string;
  llm: {
    provider: "chatgpt" | "openai" | "anthropic" | "ollama" | "custom";
    model?: string;
    auth?: "chatgpt-session" | "api-key";
    apiKey?: string;
    accessToken?: string;
    authPath?: string;
    baseURL?: string;
  };
  sandbox?: {
    provider: "daytona" | "local";
    daytona?: {
      apiKey: string;
      target?: string;
    };
  };
  eval?: {
    parallelism?: number;
    retries?: number;
    defaultTimeout?: number;
  };
  diff?: {
    regressionThreshold?: number;
  };
  report?: {
    formats?: string[];
    outputDir?: string;
  };
  store?: {
    path?: string;
  };
}

export function defineConfig(config: FabrikConfig): FabrikConfig {
  return config;
}

export async function loadConfig(searchFrom?: string): Promise<FabrikConfig> {
  const explorer = cosmiconfig("fabrik", {
    searchPlaces: [
      "fabrik.config.ts",
      "fabrik.config.js",
      "fabrik.config.json",
      ".fabrikrc",
      ".fabrikrc.json",
    ],
  });

  const result = searchFrom
    ? await explorer.search(searchFrom)
    : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      "No fabrik.config.ts found. Run `fabrik init` to create one."
    );
  }

  const config = result.config as FabrikConfig;
  return interpolateEnvVars(config);
}

function interpolateEnvVars<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\$\{env\.(\w+)\}/g, (_, key) => {
      return process.env[key] ?? "";
    }) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars) as T;
  }
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result as T;
  }
  return obj;
}
