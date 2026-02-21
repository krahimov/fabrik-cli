import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Scenario } from "./types.js";
import { validateScenario } from "./validator.js";

export async function loadTestFiles(
  dir: string,
  filter?: string
): Promise<Scenario[]> {
  const absDir = resolve(dir);
  const scenarios: Scenario[] = [];

  const files = await scanDir(absDir);
  const testFiles = files.filter(
    (f) => f.endsWith(".test.ts") || f.endsWith(".test.js")
  );

  const filtered = filter
    ? testFiles.filter(
        (f) =>
          f.toLowerCase().includes(filter.toLowerCase()) ||
          f.replace(/\\/g, "/").toLowerCase().includes(filter.toLowerCase())
      )
    : testFiles;

  for (const file of filtered) {
    try {
      const mod = await import(file);
      const exported = mod.default ?? mod;

      const candidates: unknown[] = [];
      if (isScenario(exported)) {
        candidates.push(exported);
      } else if (Array.isArray(exported)) {
        candidates.push(...exported.filter(isScenario));
      } else if (typeof exported === "object" && exported !== null) {
        candidates.push(...Object.values(exported).filter(isScenario));
      }

      for (const candidate of candidates) {
        const result = validateScenario(candidate);
        if (result.valid) {
          (candidate as Scenario).filePath = file;
          scenarios.push(candidate as Scenario);
        } else {
          console.warn(
            `Warning: Skipping invalid scenario in ${file}: ${result.errors.join(", ")}`
          );
        }
        for (const w of result.warnings) {
          console.warn(`Warning: ${file}: ${w}`);
        }
      }
    } catch (e) {
      console.error(
        `Warning: Failed to load test file ${file}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return scenarios;
}

function isScenario(obj: unknown): obj is Scenario {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "name" in obj &&
    "fn" in obj &&
    typeof (obj as Scenario).name === "string" &&
    typeof (obj as Scenario).fn === "function"
  );
}

async function scanDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await scanDir(fullPath);
        files.push(...nested);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
  return files;
}
