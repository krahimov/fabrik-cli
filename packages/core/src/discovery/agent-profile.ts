import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface AgentProfile {
  // Metadata
  discoveredAt: string;
  source: AgentSource;
  confidence: number;

  // Identity
  name: string;
  description: string;
  domain: string;

  // Capabilities
  tools: DiscoveredTool[];
  systemPrompt?: string;
  modelInfo?: {
    provider?: string;
    model?: string;
  };

  // Behavior boundaries
  knownConstraints: string[];
  expectedTone: string;
  supportedLanguages: string[];
  maxTurns?: number;

  // API surface
  endpoint?: EndpointInfo;
  inputFormat?: string;
  outputFormat?: string;
  authentication?: string;

  // Codebase context (if repo was explored)
  codebase?: {
    repoUrl?: string;
    framework?: string;
    entryPoint?: string;
    relevantFiles: RelevantFile[];
    dependencies: string[];
  };

  // Raw evidence
  evidence: DiscoveryEvidence[];
}

export interface DiscoveredTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  source: string;
}

export interface RelevantFile {
  path: string;
  role: string;
  excerpt?: string;
}

export interface DiscoveryEvidence {
  type: "file" | "http-probe" | "inference" | "readme" | "config";
  source: string;
  finding: string;
  confidence: number;
}

export interface EndpointInfo {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyFormat?: string;
  responseFormat?: string;
}

export type AgentSource =
  | { type: "repo"; url: string; branch?: string }
  | { type: "local-dir"; path: string }
  | { type: "http"; url: string }
  | { type: "openai-assistant"; assistantId: string };

const PROFILE_DIR = ".fabrik";
const PROFILE_FILE = "agent-profile.json";

export async function writeAgentProfile(dir: string, profile: AgentProfile): Promise<void> {
  const fabrikDir = join(dir, PROFILE_DIR);
  await mkdir(fabrikDir, { recursive: true });
  await writeFile(join(fabrikDir, PROFILE_FILE), JSON.stringify(profile, null, 2), "utf-8");
}

export async function readAgentProfile(dir: string): Promise<AgentProfile | null> {
  try {
    const content = await readFile(join(dir, PROFILE_DIR, PROFILE_FILE), "utf-8");
    return JSON.parse(content) as AgentProfile;
  } catch {
    return null;
  }
}
