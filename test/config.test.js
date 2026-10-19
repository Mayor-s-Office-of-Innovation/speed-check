import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { ConfigError, DEFAULT_PORT, budgetsFor, resolveConfig } from "../src/config.js";

const base = "/base";

test("defaults apply and pages are normalised", () => {
  const c = resolveConfig({ baseURL: "http://localhost:3000/" }, {}, { baseDir: base });
  assert.equal(c.baseURL, "http://localhost:3000");
  assert.deepEqual(c.pages, ["/"]);
  assert.equal(c.runs, 3);
  assert.equal(c.formFactor, "mobile");
  assert.equal(c.mode, "warn");
  assert.deepEqual(c.skipAudits, ["uses-http2"]);
  assert.equal(c.serve, null);
  assert.equal(c.outDir, resolve(base, "speed-check-report"));
  const d = resolveConfig({ baseURL: "http://x", pages: ["about", "/contact"] }, {}, { baseDir: base });
  assert.deepEqual(d.pages, ["/about", "/contact"]);
});

test("serve.dir derives baseURL, port, and resolves the dir against the config file", () => {
  const c = resolveConfig({ serve: { dir: "site" } }, {}, { baseDir: base });
  assert.equal(c.serve.dir, resolve(base, "site"));
  assert.equal(c.serve.port, DEFAULT_PORT);
  assert.equal(c.baseURL, `http://127.0.0.1:${DEFAULT_PORT}`);
  const d = resolveConfig({ serve: { dir: "site" }, baseURL: "http://127.0.0.1:8080" }, {}, { baseDir: base });
  assert.equal(d.serve.port, 8080);
  const e = resolveConfig({ serve: { dir: "site", port: 9000 } }, {}, { baseDir: base });
  assert.equal(e.baseURL, "http://127.0.0.1:9000");
});

test("serve.command gets a cwd and needs a baseURL", () => {
  const c = resolveConfig({ serve: { command: "npx vite preview" }, baseURL: "http://127.0.0.1:4173" }, {}, { baseDir: base });
  assert.equal(c.serve.cwd, base);
  assert.equal(c.serve.readyTimeout, 15_000);
  assert.throws(() => resolveConfig({ serve: { command: "x" } }), ConfigError);
});

test("serve rejects both or neither of dir and command", () => {
  assert.throws(() => resolveConfig({ serve: { dir: "a", command: "b" } }), /exactly one/);
  assert.throws(() => resolveConfig({ serve: {} }), /exactly one/);
});

test("validation errors are ConfigErrors with a clear message", () => {
  assert.throws(() => resolveConfig({}), /baseURL/);
  assert.throws(() => resolveConfig({ baseURL: "nope" }), /baseURL/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", pages: [] }), /pages/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", runs: 0 }), /runs/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", formFactor: "tablet" }), /formFactor/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", mode: "strict" }), /mode/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", budgets: { "*": { lcpx: 1 } } }), /unknown metric/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", budgets: { "/other": { lcp: 1 } } }), /not in pages/);
  assert.throws(() => resolveConfig({ baseURL: "http://x", budgets: { "*": { lcp: "fast" } } }), /must be a number/);
  assert.throws(() => resolveConfig([]), ConfigError);
});

test("command-line overrides win, undefined overrides are ignored, --out is cwd-relative", () => {
  const c = resolveConfig(
    { baseURL: "http://x", runs: 3, mode: "warn", outDir: "from-file" },
    { runs: "1", mode: "gate", baseURL: undefined, outDir: "from-cli" },
    { baseDir: base, cwd: "/cwd" },
  );
  assert.equal(c.runs, 1);
  assert.equal(c.mode, "gate");
  assert.equal(c.baseURL, "http://x");
  assert.equal(c.outDir, resolve("/cwd", "from-cli"));
});

test("budgetsFor merges the page's budgets over the shared ones", () => {
  const c = resolveConfig(
    { baseURL: "http://x", pages: ["/", "/heavy"], budgets: { "*": { lcp: 4000, cls: 0.1 }, "/heavy": { lcp: 5000 } } },
    {},
    { baseDir: base },
  );
  assert.deepEqual(budgetsFor(c, "/"), { lcp: 4000, cls: 0.1 });
  assert.deepEqual(budgetsFor(c, "/heavy"), { lcp: 5000, cls: 0.1 });
});
