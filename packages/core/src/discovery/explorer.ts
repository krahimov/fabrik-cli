import type { LLMProvider } from "../llm/provider.js";
import type { AgentAdapter, AgentConfig } from "../adapter/interface.js";
import type {
  AgentProfile,
  AgentSource,
  DiscoveredTool,
  DiscoveryEvidence,
  RelevantFile,
} from "./agent-profile.js";
import { PROFILE_SYNTHESIZER_PROMPT } from "./prompts.js";
import { rankFiles } from "./file-ranker.js";
import { extractFromFile, type ExtractionResult } from "./extractors.js";
import { probeEndpoint } from "./http-prober.js";
import { z } from "zod";

/** Abstraction for reading files from sandbox or local filesystem */
export interface FileReader {
  readFile(path: string): Promise<string>;
  exec(command: string): Promise<string>;
}

export interface ExplorerOptions {
  source: AgentSource;
  llm: LLMProvider;
  fileReader?: FileReader;
  adapter?: AgentAdapter;
  agentConfig?: AgentConfig;
  description?: string;
  onProgress?: (message: string) => void;
}

const EXTRACT_CONCURRENCY = 5;
const MAX_FILES_TO_READ = 20;

const ProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  domain: z.string(),
  confidence: z.number(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.unknown()).optional(),
      source: z.string(),
    })
  ),
  systemPrompt: z.string().nullable().optional(),
  modelInfo: z
    .object({ provider: z.string().optional(), model: z.string().optional() })
    .nullable()
    .optional(),
  knownConstraints: z.array(z.string()),
  expectedTone: z.string(),
  supportedLanguages: z.array(z.string()),
  codebase: z
    .object({
      framework: z.string().optional(),
      entryPoint: z.string().optional(),
      relevantFiles: z.array(
        z.object({
          path: z.string(),
          role: z.string(),
          excerpt: z.string().optional(),
        })
      ),
      dependencies: z.array(z.string()),
    })
    .nullable()
    .optional(),
});

export async function discoverAgent(opts: ExplorerOptions): Promise<AgentProfile> {
  const { source, llm, onProgress } = opts;
  const log = onProgress ?? (() => {});

  if (source.type === "http") {
    return discoverFromHttp(opts, log);
  }

  if (source.type === "repo" || source.type === "local-dir") {
    return discoverFromCodebase(opts, log);
  }

  // Fallback: minimal profile from description
  return buildMinimalProfile(opts);
}

async function discoverFromHttp(
  opts: ExplorerOptions,
  log: (msg: string) => void
): Promise<AgentProfile> {
  if (!opts.adapter || !opts.agentConfig) {
    throw new Error("HTTP discovery requires an adapter and agent config");
  }

  const url = opts.source.type === "http" ? opts.source.url : "";
  log("Probing HTTP endpoint...");

  const { profile } = await probeEndpoint(opts.adapter, opts.agentConfig, opts.llm, url);

  // Supplement with description hint if provided
  if (opts.description) {
    profile.description = `${opts.description}\n\nDiscovered behavior: ${profile.description}`;
  }

  return profile;
}

async function discoverFromCodebase(
  opts: ExplorerOptions,
  log: (msg: string) => void
): Promise<AgentProfile> {
  if (!opts.fileReader) {
    throw new Error("Codebase discovery requires a fileReader");
  }

  const reader = opts.fileReader;
  const rootDir =
    opts.source.type === "local-dir" ? opts.source.path : "/workspace/agent";

  // Step 1: Orientation scan
  log("Scanning file tree...");
  const fileTree = await reader.exec(
    `find ${rootDir} -maxdepth 4 -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/dist/*' ! -path '*/.next/*' | head -200`
  );

  const readme = await tryRead(reader, `${rootDir}/README.md`);
  const packageJson = await tryRead(reader, `${rootDir}/package.json`);
  const pyProject = await tryRead(reader, `${rootDir}/pyproject.toml`);

  // Step 2: LLM-driven file ranking
  log("Ranking files by relevance...");
  const rankedFiles = await rankFiles(
    opts.llm,
    fileTree,
    readme ?? undefined,
    packageJson ?? pyProject ?? undefined
  );

  const highPriority = rankedFiles.filter((f) => f.priority === "high" || f.priority === "medium");
  const filesToRead = highPriority.slice(0, MAX_FILES_TO_READ);

  // Step 3: Read & extract in parallel (with concurrency limit)
  log(`Analyzing ${filesToRead.length} files...`);
  const extractions: ExtractionResult[] = [];
  let completed = 0;

  for (let i = 0; i < filesToRead.length; i += EXTRACT_CONCURRENCY) {
    const batch = filesToRead.slice(i, i + EXTRACT_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const content = await tryRead(reader, file.path);
        if (!content) return null;
        const result = await extractFromFile(opts.llm, file.path, content, file.reason);
        completed++;
        log(`  Analyzed ${completed}/${filesToRead.length} files`);
        return result;
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        extractions.push(result.value);
      }
    }
  }

  // Step 4: Synthesize profile
  log("Synthesizing agent profile...");
  const evidence: DiscoveryEvidence[] = extractions.flatMap((e) => e.findings);
  const allTools: DiscoveredTool[] = extractions.flatMap((e) => e.tools);
  const allConstraints: string[] = [...new Set(extractions.flatMap((e) => e.constraints))];
  const systemPrompts = extractions.map((e) => e.systemPrompt).filter(Boolean) as string[];
  const modelConfigs = extractions.map((e) => e.modelConfig).filter(Boolean);
  const domains = extractions.map((e) => e.domain).filter(Boolean) as string[];

  // Add README evidence
  if (readme) {
    evidence.push({
      type: "readme",
      source: `${rootDir}/README.md`,
      finding: readme.slice(0, 1000),
      confidence: 0.7,
    });
  }

  const synthesisInput = {
    evidence,
    tools: deduplicateTools(allTools),
    constraints: allConstraints,
    systemPrompts,
    modelConfigs,
    domains,
    readme: readme?.slice(0, 2000),
    description: opts.description,
  };

  const response = await opts.llm.generate({
    messages: [
      { role: "system", content: PROFILE_SYNTHESIZER_PROMPT },
      {
        role: "user",
        content: `Evidence:\n${JSON.stringify(synthesisInput, null, 2)}`,
      },
    ],
    outputSchema: ProfileSchema,
    temperature: 0,
  });

  let profileData: z.infer<typeof ProfileSchema>;

  if (response.parsed) {
    profileData = response.parsed as z.infer<typeof ProfileSchema>;
  } else {
    let text = response.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = ProfileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error("Failed to synthesize agent profile from evidence");
    }
    profileData = parsed.data;
  }

  const relevantFiles: RelevantFile[] = filesToRead.map((f) => ({
    path: f.path,
    role: f.reason,
  }));

  const repoUrl = opts.source.type === "repo" ? opts.source.url : undefined;

  const profile: AgentProfile = {
    discoveredAt: new Date().toISOString(),
    source: opts.source,
    confidence: profileData.confidence,
    name: profileData.name,
    description: profileData.description,
    domain: profileData.domain,
    tools: profileData.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      source: t.source,
    })),
    systemPrompt: profileData.systemPrompt ?? undefined,
    modelInfo: profileData.modelInfo ?? undefined,
    knownConstraints: profileData.knownConstraints,
    expectedTone: profileData.expectedTone,
    supportedLanguages: profileData.supportedLanguages,
    codebase: {
      repoUrl,
      framework: profileData.codebase?.framework,
      entryPoint: profileData.codebase?.entryPoint,
      relevantFiles,
      dependencies: profileData.codebase?.dependencies ?? [],
    },
    evidence,
  };

  log("Discovery complete.");
  return profile;
}

async function buildMinimalProfile(opts: ExplorerOptions): Promise<AgentProfile> {
  return {
    discoveredAt: new Date().toISOString(),
    source: opts.source,
    confidence: 0.2,
    name: "Unknown Agent",
    description: opts.description ?? "No description provided",
    domain: "unknown",
    tools: [],
    knownConstraints: [],
    expectedTone: "professional",
    supportedLanguages: ["en"],
    evidence: [],
  };
}

async function tryRead(reader: FileReader, path: string): Promise<string | null> {
  try {
    return await reader.readFile(path);
  } catch {
    return null;
  }
}

function deduplicateTools(tools: DiscoveredTool[]): DiscoveredTool[] {
  const seen = new Map<string, DiscoveredTool>();
  for (const tool of tools) {
    if (!seen.has(tool.name)) {
      seen.set(tool.name, tool);
    }
  }
  return [...seen.values()];
}
