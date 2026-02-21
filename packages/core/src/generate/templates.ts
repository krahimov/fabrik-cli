export function wrapGeneratedTest(code: string): string {
  // Ensure the code starts with the right import
  if (!code.includes("@fabrik/core")) {
    code = `import { scenario, persona, assert } from "@fabrik/core";\n\n${code}`;
  }
  return code;
}

export function generateFileName(categorySlug: string, scenarioSlug: string): string {
  return `${categorySlug}-${scenarioSlug}.test.ts`;
}
