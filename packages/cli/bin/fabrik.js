#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntryPath = resolve(packageRoot, "src/index.ts");
const packageJsonPath = resolve(packageRoot, "package.json");

let packageVersion = "";
try {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof pkg.version === "string") {
    packageVersion = pkg.version;
  }
} catch {
  // best-effort only; CLI still has fallback version source
}

const result = spawnSync(process.execPath, [tsxCliPath, cliEntryPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    TSX_DISABLE_CACHE: process.env.TSX_DISABLE_CACHE ?? "1",
    FABRIK_CLI_VERSION: process.env.FABRIK_CLI_VERSION ?? packageVersion,
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
