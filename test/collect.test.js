import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { collect, lighthouseArgs, lighthouseCli, pageSlug } from "../src/collect.js";
import { resolveConfig } from "../src/config.js";
import { readResults } from "../src/report.js";
import { fakeLhr, tmp } from "./helpers.js";

const outPathOf = (args) => args.find((a) => a.startsWith("--output-path=")).slice("--output-path=".length);

test("pageSlug", () => {
  assert.equal(pageSlug("/"), "home");
  assert.equal(pageSlug("/apply/"), "apply");
  assert.equal(pageSlug("/a/b?x=1"), "a-b-x-1");
});

test("the Lighthouse CLI resolves from the dependency", () => {
  assert.match(lighthouseCli(), /lighthouse[\\/]cli[\\/]index\.js$/);
});

test("lighthouseArgs: performance only, no error reporting, fresh profile, preset and skips", () => {
  const c = resolveConfig({ baseURL: "http://x", skipAudits: ["uses-http2", "bf-cache"], chromeFlags: ["--lang=en"] }, {}, { baseDir: "/b" });
  const args = lighthouseArgs(c, "http://x/", "/out/x.json", "/tmp/profile");
  assert.equal(args[0], "http://x/");
  assert.ok(args.includes("--only-categories=performance"));
  assert.ok(args.includes("--no-enable-error-reporting"));
  assert.ok(args.includes("--skip-audits=uses-http2,bf-cache"));
  assert.ok(!args.some((a) => a.startsWith("--preset")));
  const chrome = args.find((a) => a.startsWith("--chrome-flags="));
  assert.match(chrome, /--headless=new/);
  assert.match(chrome, /--user-data-dir=\/tmp\/profile/);
  assert.match(chrome, /--lang=en/);
  const d = lighthouseArgs({ ...c, formFactor: "desktop", skipAudits: [] }, "http://x/", "/o.json", "/p");
  assert.ok(d.includes("--preset=desktop"));
  assert.ok(!d.some((a) => a.startsWith("--skip-audits")));
});

test("collect runs pages x runs, names files, writes runs.json, and readResults reloads them", async () => {
  const dir = tmp();
  const c = resolveConfig({ baseURL: "http://x", pages: ["/", "/about"], runs: 2, outDir: dir }, {}, { baseDir: "/b" });
  const calls = [];
  const exec = (args) => {
    calls.push(args[0]);
    writeFileSync(outPathOf(args), JSON.stringify(fakeLhr({ lcp: calls.length * 100 })));
    return 0;
  };
  const log = [];
  const results = await collect(c, { exec, log: (l) => log.push(l) });
  assert.deepEqual(calls, ["http://x/", "http://x/", "http://x/about", "http://x/about"]);
  assert.deepEqual(results.map((r) => r.file), ["lhr/home-1.json", "lhr/home-2.json", "lhr/about-1.json", "lhr/about-2.json"]);
  assert.ok(existsSync(join(dir, "runs.json")));
  assert.equal(log.length, 4);
  const manifest = JSON.parse(readFileSync(join(dir, "runs.json"), "utf8"));
  assert.equal(manifest[0].lhr, undefined);
  const again = readResults(dir);
  assert.equal(again.length, 4);
  assert.equal(again[3].lhr.audits["largest-contentful-paint"].numericValue, 400);
});

test("collect fails on a non-zero exit or a Lighthouse runtime error", async () => {
  const c = resolveConfig({ baseURL: "http://x", runs: 1, outDir: tmp() }, {}, { baseDir: "/b" });
  await assert.rejects(collect(c, { exec: () => 1, log() {} }), /exited with 1/);
  const bad = (args) => {
    writeFileSync(outPathOf(args), JSON.stringify({ runtimeError: { code: "NO_FCP", message: "nothing painted" } }));
    return 0;
  };
  await assert.rejects(collect(c, { exec: bad, log() {} }), /NO_FCP nothing painted/);
});
