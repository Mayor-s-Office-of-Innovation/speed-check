import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../src/config.js";
import { MARKER, exitCodeFor, median, readResults, renderMarkdown, renderText, summarize, writeReports } from "../src/report.js";
import { fakeLhr, tmp } from "./helpers.js";

const results = (page, lhrs) => lhrs.map((lhr, i) => ({ page, url: `http://x${page}`, run: i + 1, file: `lhr/x-${i + 1}.json`, lhr }));

test("median handles odd, even, and empty", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("summarize takes min, median, max per metric and checks budgets against the median", () => {
  const config = resolveConfig(
    { baseURL: "http://x", pages: ["/"], budgets: { "*": { lcp: 2500, performance: 0.9, cls: 0.1, scriptKB: 150 } } },
    {},
    { baseDir: "/b" },
  );
  const r = results("/", [
    fakeLhr({ lcp: 2000, performance: 0.95, script: 100 * 1024 }),
    fakeLhr({ lcp: 3000, performance: 0.85, script: 200 * 1024 }),
    fakeLhr({ lcp: 2600, performance: 0.91, script: 120 * 1024 }),
  ]);
  const s = summarize(r, config);
  const page = s.pages[0];
  assert.deepEqual(page.metrics.lcp, { values: [2000, 3000, 2600], min: 2000, median: 2600, max: 3000 });
  assert.equal(page.metrics.scriptKB.median, 120);
  const by = Object.fromEntries(page.budgets.map((b) => [b.key, b.ok]));
  assert.deepEqual(by, { lcp: false, performance: true, cls: true, scriptKB: true });
  assert.equal(s.failed, 1);
  assert.equal(s.budgeted, 4);
  assert.equal(s.lighthouseVersion, "13.5.0");
});

test("exit code follows mode", () => {
  const config = (mode) => resolveConfig({ baseURL: "http://x", mode, budgets: { "*": { lcp: 1000 } } }, {}, { baseDir: "/b" });
  const r = results("/", [fakeLhr({ lcp: 5000 })]);
  assert.equal(exitCodeFor(summarize(r, config("warn"))), 0);
  assert.equal(exitCodeFor(summarize(r, config("gate"))), 1);
  assert.equal(exitCodeFor(summarize(results("/", [fakeLhr({ lcp: 500 })]), config("gate"))), 0);
});

test("a page with no results reports n/a and fails its budgets", () => {
  const config = resolveConfig({ baseURL: "http://x", pages: ["/", "/missing"], budgets: { "*": { lcp: 1000 } } }, {}, { baseDir: "/b" });
  const s = summarize(results("/", [fakeLhr()]), config);
  assert.equal(s.pages[1].runs, 0);
  assert.equal(s.pages[1].metrics.lcp.median, null);
  assert.equal(s.pages[1].budgets[0].ok, false);
  assert.match(renderText(s), /n\/a/);
});

test("text and markdown renderings carry the table, statuses, and the lab caveat", () => {
  const config = resolveConfig({ baseURL: "http://x", pages: ["/"], budgets: { "*": { lcp: 1000, cls: 0.1, fontKB: 10 } } }, {}, { baseDir: "/b" });
  const s = summarize(results("/", [fakeLhr({ lcp: 2000, font: 50 * 1024 })]), config);
  const text = renderText(s);
  assert.match(text, /Largest Contentful Paint\s+2000 ms\s+2000 ms\s+2000 ms\s+<= 1000 ms\s+WARN/);
  assert.match(text, /Cumulative Layout Shift.*OK/);
  assert.match(text, /Font transfer.*50 kB.*WARN/);
  assert.match(text, /not field data/);
  const md = renderMarkdown(s);
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /\| Largest Contentful Paint \| 2000 ms \| 2000 ms \| 2000 ms \| <= 1000 ms \| WARN \|/);
  assert.match(md, /Mode is warn/);
  const gate = renderMarkdown(summarize(results("/", [fakeLhr({ lcp: 2000 })]), { ...config, mode: "gate" }));
  assert.match(gate, /FAIL/);
  assert.match(gate, /the job fails/);
});

test("writeReports writes json and md and appends to the step summary; readResults round-trips", () => {
  const dir = tmp();
  const config = resolveConfig({ baseURL: "http://x", outDir: dir }, {}, { baseDir: "/b" });
  const r = results("/", [fakeLhr()]);
  const summaryFile = join(dir, "summary.md");
  const files = writeReports(summarize(r, config), dir, { stepSummaryPath: summaryFile });
  assert.ok(existsSync(files.json));
  assert.ok(existsSync(files.md));
  assert.equal(JSON.parse(readFileSync(files.json, "utf8")).tool, "speed-check");
  assert.match(readFileSync(summaryFile, "utf8"), /speed-check: lab performance/);
  assert.throws(() => readResults(dir), /runs\.json/);
});
