/*
  Turn Lighthouse results into a summary (min/median/max per metric per page,
  budgets evaluated against the median), then render it as text for the log
  and as Markdown for files, the GitHub job summary, and PR comments.
*/
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgetsFor } from "./config.js";
import { DISPLAY_ORDER, METRICS, formatValue } from "./metrics.js";

export const MARKER = "<!-- speed-check-report -->";

/** @param {number[]} nums */
export function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {import("./collect.js").RunResult[]} results
 * @param {any} config  resolved config
 */
export function summarize(results, config, { now = new Date() } = {}) {
  const pages = config.pages.map((page) => {
    const runs = results.filter((r) => r.page === page);
    const metrics = {};
    for (const [key, m] of Object.entries(METRICS)) {
      const values = runs
        .map((r) => m.get(r.lhr))
        .filter((v) => typeof v === "number" && !Number.isNaN(v));
      metrics[key] = values.length
        ? { values, min: Math.min(...values), median: median(values), max: Math.max(...values) }
        : { values: [], min: null, median: null, max: null };
    }
    const budgets = Object.entries(budgetsFor(config, page)).map(([key, threshold]) => {
      const m = METRICS[key];
      const med = metrics[key].median;
      const ok = med != null && (m.operator === ">=" ? med >= threshold : med <= threshold);
      return { key, label: m.label, unit: m.unit, operator: m.operator, threshold, median: med, ok };
    });
    return {
      page,
      url: runs[0]?.url ?? config.baseURL + page,
      runs: runs.length,
      metrics,
      budgets,
      failed: budgets.filter((b) => !b.ok).length,
    };
  });
  return {
    tool: "speed-check",
    generatedAt: now.toISOString(),
    lighthouseVersion: results[0]?.lhr?.lighthouseVersion ?? null,
    formFactor: config.formFactor,
    runs: config.runs,
    mode: config.mode,
    budgeted: pages.reduce((n, p) => n + p.budgets.length, 0),
    failed: pages.reduce((n, p) => n + p.failed, 0),
    pages,
  };
}

/** 0 unless the mode is gate and a budget failed. */
export function exitCodeFor(summary) {
  return summary.mode === "gate" && summary.failed > 0 ? 1 : 0;
}

const HEAD = ["Metric", "Min", "Median", "Max", "Budget", "Status"];

function rowsFor(page, mode) {
  const keys = [
    ...DISPLAY_ORDER,
    ...page.budgets.map((b) => b.key).filter((k) => !DISPLAY_ORDER.includes(k)),
  ];
  return keys.map((key) => {
    const m = METRICS[key];
    const s = page.metrics[key];
    const b = page.budgets.find((x) => x.key === key);
    return [
      m.label,
      formatValue(s.min, m.unit),
      formatValue(s.median, m.unit),
      formatValue(s.max, m.unit),
      b ? `${b.operator} ${formatValue(b.threshold, m.unit)}` : "",
      b ? (b.ok ? "OK" : mode === "gate" ? "FAIL" : "WARN") : "",
    ];
  });
}

function verdict(summary) {
  if (summary.budgeted === 0) return "No budgets configured.";
  if (summary.failed === 0) return `All ${summary.budgeted} budgets met.`;
  const over = `${summary.failed} of ${summary.budgeted} budgets over threshold`;
  return summary.mode === "gate"
    ? `${over}. Mode is gate: the job fails.`
    : `${over}. Mode is warn: advisory, the job does not fail.`;
}

function title(summary) {
  const lh = summary.lighthouseVersion ? `Lighthouse ${summary.lighthouseVersion}` : "Lighthouse";
  return `${lh}, ${summary.formFactor}, median of ${summary.runs} run${summary.runs === 1 ? "" : "s"}`;
}

export function renderText(summary) {
  const out = ["", `speed-check: ${title(summary)}`];
  for (const page of summary.pages) {
    const rows = rowsFor(page, summary.mode);
    const widths = HEAD.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
    out.push("", `${page.page}  (${page.url})`, line(HEAD), line(widths.map((w) => "-".repeat(w))));
    for (const r of rows) out.push(line(r));
  }
  out.push("", verdict(summary), "Lab numbers on this machine, not field data.", "");
  return out.join("\n");
}

export function renderMarkdown(summary) {
  const out = [MARKER, `## speed-check: lab performance`, "", `${title(summary)}.`];
  for (const page of summary.pages) {
    out.push("", `### \`${page.page}\``, "", `| ${HEAD.join(" | ")} |`, `|${HEAD.map(() => "---").join("|")}|`);
    for (const r of rowsFor(page, summary.mode)) out.push(`| ${r.join(" | ")} |`);
  }
  out.push("", `_${verdict(summary)} Lab numbers on this runner, not field data._`, "");
  return out.join("\n");
}

/**
 * Write speed-check.json and speed-check.md into outDir, and append the
 * Markdown to the GitHub job summary when running in Actions.
 */
export function writeReports(summary, outDir, { stepSummaryPath = process.env.GITHUB_STEP_SUMMARY } = {}) {
  mkdirSync(outDir, { recursive: true });
  const md = renderMarkdown(summary);
  writeFileSync(join(outDir, "speed-check.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "speed-check.md"), md);
  if (stepSummaryPath) appendFileSync(stepSummaryPath, `${md}\n`);
  return { json: join(outDir, "speed-check.json"), md: join(outDir, "speed-check.md") };
}

/** Reload the results of an earlier `collect` from outDir. */
export function readResults(outDir) {
  const manifest = join(outDir, "runs.json");
  if (!existsSync(manifest)) {
    throw new Error(`No runs.json in ${outDir}. Run speed-check first.`);
  }
  return JSON.parse(readFileSync(manifest, "utf8")).map((r) => ({
    ...r,
    lhr: JSON.parse(readFileSync(join(outDir, r.file), "utf8")),
  }));
}
