import type { LLMProvider } from "../llm/provider.js";
import type { DiscoveredTool, DiscoveryEvidence } from "./agent-profile.js";
import { z } from "zod";
import { EXTRACTOR_PROMPT } from "./prompts.js";

export interface ExtractionResult {
  systemPrompt?: string;
  tools: DiscoveredTool[];
  constraints: string[];
  modelConfig?: { provider?: string; model?: string };
  domain?: string;
  findings: DiscoveryEvidence[];
}

const ExtractionSchema = z.object({
  systemPrompt: z.string().nullable(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.unknown()).optional(),
      source: z.string(),
    })
  ),
  constraints: z.array(z.string()),
  modelConfig: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
    })
    .nullable(),
  domain: z.string().nullable(),
  findings: z.array(
    z.object({
      type: z.enum(["file", "http-probe", "inference", "readme", "config"]),
      source: z.string(),
      finding: z.string(),
      confidence: z.number(),
    })
  ),
});

export async function extractFromFile(
  llm: LLMProvider,
  filePath: string,
  content: string,
  reason: string
): Promise<ExtractionResult> {
  // Truncate very large files to avoid token limits
  const truncated = content.length > 15000 ? content.slice(0, 15000) + "\n\n[... truncated]" : content;

  try {
    const response = await llm.generate({
      messages: [
        { role: "system", content: EXTRACTOR_PROMPT },
        {
          role: "user",
          content: `File: ${filePath}\nReason for reading: ${reason}\n\nContent:\n${truncated}`,
        },
      ],
      outputSchema: ExtractionSchema,
      temperature: 0,
    });

    if (response.parsed) {
      const data = response.parsed as z.infer<typeof ExtractionSchema>;
      return {
        systemPrompt: data.systemPrompt ?? undefined,
        tools: data.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          source: filePath,
        })),
        constraints: data.constraints,
        modelConfig: data.modelConfig ?? undefined,
        domain: data.domain ?? undefined,
        findings: data.findings,
      };
    }

    // Try parsing from text
    let text = response.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = ExtractionSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      const data = parsed.data;
      return {
        systemPrompt: data.systemPrompt ?? undefined,
        tools: data.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          source: filePath,
        })),
        constraints: data.constraints,
        modelConfig: data.modelConfig ?? undefined,
        domain: data.domain ?? undefined,
        findings: data.findings,
      };
    }

    return emptyResult(filePath);
  } catch {
    return emptyResult(filePath);
  }
}

function emptyResult(filePath: string): ExtractionResult {
  return {
    tools: [],
    constraints: [],
    findings: [
      {
        type: "file",
        source: filePath,
        finding: "Failed to extract information from this file",
        confidence: 0,
      },
    ],
  };
}
