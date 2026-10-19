/*
  Run the Lighthouse CLI once per page per run. Each run is a fresh process
  with a fresh Chrome profile in a temp dir (the default profile location is
  not writable on some CI runners). Only the performance category runs:
  accessibility, SEO, and best practices are other tools' jobs and skipping
  them roughly halves the time per run.

  Output: <outDir>/lhr/<page>-<n>.json per run, plus <outDir>/runs.json
  listing them so `speed-check report` can re-render later.
*/
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

/** Lighthouse's CLI entry, resolved from this package's own dependency (never `npx`). */
export function lighthouseCli() {
  return require.resolve("lighthouse/cli/index.js");
}

/** "/" -> "home", "/apply/" -> "apply", "/a/b" -> "a-b". */
export function pageSlug(page) {
  const s = page
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "home";
}

const BASE_CHROME_FLAGS = ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"];

/** The argument list for one Lighthouse run (after the CLI path). */
export function lighthouseArgs(config, url, outPath, profileDir) {
  const chromeFlags = [
    ...BASE_CHROME_FLAGS,
    `--user-data-dir=${profileDir}`,
    ...config.chromeFlags,
  ].join(" ");
  const args = [
    url,
    "--output=json",
    `--output-path=${outPath}`,
    "--quiet",
    "--only-categories=performance",
    "--no-enable-error-reporting",
    `--chrome-flags=${chromeFlags}`,
  ];
  if (config.formFactor === "desktop") args.push("--preset=desktop");
  if (config.skipAudits.length) args.push(`--skip-audits=${config.skipAudits.join(",")}`);
  return args;
}

// Async on purpose: the built-in static server runs in this process, and a
// blocking spawnSync would stop it answering Chrome for the whole run.
function defaultExec(args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [lighthouseCli(), ...args], { stdio: "inherit" });
    child.on("error", fail);
    child.on("exit", (code, signal) => done(code ?? `signal ${signal}`));
  });
}

/**
 * @typedef {{ page: string, url: string, run: number, file: string, lhr: any }} RunResult
 *   `file` is relative to outDir.
 */

/**
 * @param {import("./config.js").Config & { outDir: string, baseURL: string, pages: string[], runs: number, skipAudits: string[], chromeFlags: string[] }} config
 * @param {{ log?: (line: string) => void, exec?: (args: string[]) => number|string|Promise<number|string> }} [opts]
 * @returns {Promise<RunResult[]>}
 */
export async function collect(config, { log = console.log, exec = defaultExec } = {}) {
  const lhrDir = join(config.outDir, "lhr");
  rmSync(config.outDir, { recursive: true, force: true });
  mkdirSync(lhrDir, { recursive: true });
  const profileDir = mkdtempSync(join(tmpdir(), "speed-check-chrome-"));

  const slugs = new Map();
  for (const page of config.pages) {
    const base = pageSlug(page);
    let slug = base;
    for (let n = 2; [...slugs.values()].includes(slug); n++) slug = `${base}-${n}`;
    slugs.set(page, slug);
  }

  const results = [];
  try {
    for (const page of config.pages) {
      const url = config.baseURL + page;
      for (let run = 1; run <= config.runs; run++) {
        const file = join("lhr", `${slugs.get(page)}-${run}.json`);
        log(`speed-check: ${page}  run ${run}/${config.runs}`);
        const status = await exec(lighthouseArgs(config, url, join(config.outDir, file), profileDir));
        if (status !== 0) {
          throw new Error(`Lighthouse exited with ${status} for ${url} (run ${run})`);
        }
        const lhr = JSON.parse(readFileSync(join(config.outDir, file), "utf8"));
        if (lhr.runtimeError) {
          throw new Error(
            `Lighthouse could not measure ${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`,
          );
        }
        results.push({ page, url, run, file, lhr });
      }
    }
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }
  writeFileSync(
    join(config.outDir, "runs.json"),
    JSON.stringify(results.map(({ lhr, ...r }) => r), null, 2),
  );
  return results;
}
