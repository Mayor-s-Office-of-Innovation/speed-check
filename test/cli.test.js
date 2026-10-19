import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tmp } from "./helpers.js";

const CLI = new URL("../src/cli/index.js", import.meta.url).pathname;
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

test("--help and --version", () => {
  const h = cli(["--help"], tmp());
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage/);
  const v = cli(["-v"], tmp());
  assert.equal(v.status, 0);
  assert.match(v.stdout, /^\d+\.\d+\.\d+/);
});

test("init writes a config once, and the written config is valid", () => {
  const cwd = tmp();
  const first = cli(["init"], cwd);
  assert.equal(first.status, 0);
  assert.ok(existsSync(join(cwd, "speed-check.config.js")));
  const second = cli(["init"], cwd);
  assert.equal(second.status, 2);
  assert.match(second.stderr, /--force/);
  assert.equal(cli(["init", "--force"], cwd).status, 0);
  // The template points at dist/, which does not exist here: a server error (3), not a config error (2).
  const run = cli([], cwd);
  assert.equal(run.status, 3);
  assert.match(run.stderr, /Build the site first/);
});

test("no config, missing config, bad config, unknown command, unknown flag are exit 2", () => {
  const cwd = tmp();
  assert.equal(cli([], cwd).status, 2);
  assert.equal(cli(["-c", "nope.js"], cwd).status, 2);
  writeFileSync(join(cwd, "speed-check.config.json"), JSON.stringify({ baseURL: "http://x", runs: 0 }));
  const bad = cli([], cwd);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /runs/);
  assert.equal(cli(["frobnicate"], cwd).status, 2);
  assert.equal(cli(["--bogus"], cwd).status, 2);
});

test("report with nothing collected is exit 3", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "speed-check.config.json"), JSON.stringify({ baseURL: "http://x" }));
  const r = cli(["report"], cwd);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /runs\.json/);
});
