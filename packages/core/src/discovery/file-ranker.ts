import type { LLMProvider } from "../llm/provider.js";
import { z } from "zod";
import { FILE_RANKER_PROMPT } from "./prompts.js";

export interface RankedFile {
  path: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

const FileRankingSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    })
  ),
});

export async function rankFiles(
  llm: LLMProvider,
  fileTree: string,
  readme?: string,
  packageInfo?: string
): Promise<RankedFile[]> {
  const parts = [`File tree:\n${fileTree}`];
  if (readme) parts.push(`\nREADME:\n${readme}`);
  if (packageInfo) parts.push(`\nDependencies:\n${packageInfo}`);

  try {
    const response = await llm.generate({
      messages: [
        { role: "system", content: FILE_RANKER_PROMPT },
        { role: "user", content: parts.join("\n") },
      ],
      outputSchema: FileRankingSchema,
      temperature: 0,
    });

    if (response.parsed) {
      return (response.parsed as z.infer<typeof FileRankingSchema>).files;
    }

    // Try parsing from text if structured output didn't work
    let text = response.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = FileRankingSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data.files;
    }

    return [];
  } catch {
    // Fallback: return heuristic-based ranking
    return fallbackRanking(fileTree);
  }
}

/** Heuristic fallback when LLM ranking fails */
function fallbackRanking(fileTree: string): RankedFile[] {
  const files = fileTree.split("\n").map((l) => l.trim()).filter(Boolean);
  const ranked: RankedFile[] = [];

  const highPatterns = [/prompt/i, /system/i, /instruction/i, /config/i, /tool/i, /agent/i];
  const mediumPatterns = [/route/i, /handler/i, /api/i, /index\.(ts|js)$/i, /main\.(ts|js)$/i];
  const readmePattern = /readme/i;

  for (const path of files) {
    if (readmePattern.test(path)) {
      ranked.push({ path, reason: "Documentation file", priority: "high" });
    } else if (highPatterns.some((p) => p.test(path))) {
      ranked.push({ path, reason: "Matches agent-related filename pattern", priority: "high" });
    } else if (mediumPatterns.some((p) => p.test(path))) {
      ranked.push({ path, reason: "Matches entry point pattern", priority: "medium" });
    }
  }

  return ranked.slice(0, 25);
}
