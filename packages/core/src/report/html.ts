import type { RunResult } from "../scenario/types.js";

export function generateHtmlReport(
  results: RunResult[],
  options?: { version?: string }
): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const versionLabel = options?.version ? ` — ${esc(options.version)}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fabrik Report${versionLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8f9fa;color:#212529;padding:2rem;max-width:1200px;margin:0 auto}
.header{margin-bottom:2rem}
.header h1{font-size:1.5rem;font-weight:600}
.header .meta{color:#6c757d;font-size:.875rem;margin-top:.25rem}
.summary{display:flex;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
.stat{background:#fff;border-radius:8px;padding:1rem 1.5rem;border:1px solid #dee2e6;min-width:120px}
.stat .value{font-size:1.5rem;font-weight:700}
.stat .label{color:#6c757d;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
.pass{color:#198754}
.fail{color:#dc3545}
table{width:100%;background:#fff;border-radius:8px;border-collapse:collapse;border:1px solid #dee2e6;margin-bottom:2rem}
th{text-align:left;padding:.75rem 1rem;border-bottom:2px solid #dee2e6;font-size:.875rem;color:#6c757d}
td{padding:.75rem 1rem;border-bottom:1px solid #dee2e6;font-size:.875rem}
tr:last-child td{border-bottom:none}
tr:hover{background:#f8f9fa}
.scenario-detail{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:1rem;margin-bottom:1rem}
.scenario-detail summary{cursor:pointer;font-weight:600;font-size:.95rem;padding:.25rem 0}
.scenario-detail summary:hover{color:#0d6efd}
.assertions{margin-top:.75rem}
.assertion{font-size:.8rem;padding:.35rem .5rem;margin:.25rem 0;border-radius:4px;background:#f8f9fa}
.assertion.passed{border-left:3px solid #198754}
.assertion.failed{border-left:3px solid #dc3545}
.turns{margin-top:.75rem}
.turn{font-size:.8rem;padding:.35rem .5rem;margin:.25rem 0;border-radius:4px;background:#f8f9fa;white-space:pre-wrap;word-break:break-word}
.turn.persona{border-left:3px solid #0d6efd}
.turn.agent{border-left:3px solid #198754}
.tool-calls{font-size:.75rem;color:#6c757d;margin-top:.25rem;font-style:italic}
</style>
</head>
<body>
<div class="header">
  <h1>Fabrik Test Report</h1>
  <div class="meta">Generated ${new Date().toISOString()}${options?.version ? ` | Version: ${esc(options.version)}` : ""} | Duration: ${fmtDur(totalDuration)}</div>
</div>
<div class="summary">
  <div class="stat"><div class="value">${results.length}</div><div class="label">Total</div></div>
  <div class="stat"><div class="value pass">${passed}</div><div class="label">Passed</div></div>
  <div class="stat"><div class="value fail">${failed}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="value">${Math.round(avgScore * 100)}%</div><div class="label">Avg Score</div></div>
</div>
<table>
  <thead><tr><th>Scenario</th><th>Result</th><th>Score</th><th>Assertions</th><th>Duration</th></tr></thead>
  <tbody>
${results.map((r) => `    <tr>
      <td>${esc(r.scenario)}</td>
      <td class="${r.passed ? "pass" : "fail"}">${r.passed ? "PASS" : "FAIL"}</td>
      <td>${Math.round(r.score * 100)}%</td>
      <td>${r.assertions.filter((a) => a.passed).length}/${r.assertions.length}</td>
      <td>${fmtDur(r.duration)}</td>
    </tr>`).join("\n")}
  </tbody>
</table>
<h2 style="margin:1.5rem 0 1rem;font-size:1.2rem">Scenario Details</h2>
${results.map((r) => renderDetail(r)).join("\n")}
<script>window.__FABRIK_DATA__=${JSON.stringify(results)};</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderDetail(r: RunResult): string {
  const assertions = r.assertions
    .map(
      (a) =>
        `<div class="assertion ${a.passed ? "passed" : "failed"}"><strong>[${esc(a.type)}]</strong> ${a.passed ? "PASS" : "FAIL"}${a.expected ? ` — expected: ${esc(String(a.expected))}` : ""}${a.actual ? `, got: ${esc(String(a.actual))}` : ""}${a.reasoning ? `<br><em>${esc(a.reasoning)}</em>` : ""}</div>`
    )
    .join("\n    ");

  const turns = r.turns
    .map((t) => {
      const toolInfo =
        t.toolCalls && t.toolCalls.length > 0
          ? `<div class="tool-calls">Tools: ${t.toolCalls.map((tc) => tc.name).join(", ")}</div>`
          : "";
      return `<div class="turn ${t.role}"><strong>${t.role}:</strong> ${esc(t.message.slice(0, 500))}${t.message.length > 500 ? "..." : ""}${toolInfo}</div>`;
    })
    .join("\n    ");

  return `<details class="scenario-detail">
  <summary class="${r.passed ? "pass" : "fail"}">${r.passed ? "PASS" : "FAIL"} — ${esc(r.scenario)}</summary>
  <div class="assertions">
    <h4 style="font-size:.85rem;margin:.5rem 0 .25rem">Assertions</h4>
    ${assertions}
  </div>
  <div class="turns">
    <h4 style="font-size:.85rem;margin:.5rem 0 .25rem">Conversation</h4>
    ${turns}
  </div>
</details>`;
}
