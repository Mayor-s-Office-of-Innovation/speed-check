#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { ConfigError, loadConfigFile, resolveConfig } from "../config.js";
import { report, run } from "../index.js";

const pkg = createRequire(import.meta.url)("../../package.json");

const CONFIG_CANDIDATES = ["speed-check.config.js", "speed-check.config.mjs", "speed-check.config.json"];

const HELP = `speed-check ${pkg.version}
Lab performance budgets with Lighthouse, for CI.

Usage
  speed-check [options]           serve (if configured), measure, report
  speed-check report [options]    re-render the report from an earlier run
  speed-check init [--force]      write speed-check.config.js

Options
  -c, --config <path>       config file (default: ${CONFIG_CANDIDATES.join(", ")})
      --base-url <url>      override baseURL, e.g. a preview deployment
      --pages <a,b,c>       override pages
      --runs <n>            override runs
      --mode <warn|gate>    override mode
      --form-factor <mobile|desktop>
      --out <dir>           override outDir (relative to the current directory)
  -h, --help
  -v, --version

Exit codes
  0  measured; budgets met, or mode is warn
  1  mode is gate and at least one budget is over threshold
  2  config error
  3  Lighthouse or server failure
`;

const INIT_TEMPLATE = `// speed-check configuration.
// Every option: https://github.com/Mayor-s-Office-of-Innovation/speed-check/blob/main/docs/config.md
// Paths are relative to this file.
export default {
  // How to reach the built site. Pick one:
  //  - serve.dir:     speed-check serves a built directory itself (static sites)
  //  - serve.command: a shell command that serves it, e.g. "npx vite preview --port 4173"
  //  - neither:       baseURL points at a server that is already running, or a preview deployment
  serve: { dir: "dist" },
  baseURL: "http://127.0.0.1:4173",

  // Paths to measure: the home page plus one page per template. Five pages
  // of three runs each is about four minutes on a hosted runner.
  pages: ["/"],
  runs: 3,

  // "mobile" is Lighthouse's default: a mid-range phone on slow 4G with 4x
  // CPU slowdown. Measure that unless the site is desktop-only.
  formFactor: "mobile",

  // Advisory until the noise floor is known. Switch to "gate" once two weeks
  // pass without a false alarm. See docs/thresholds.md.
  mode: "warn",

  // Medians across runs are compared with these. Loose on purpose: they catch
  // regressions, they are not goals. Tighten in reviewed edits.
  // Keyed by "*" for every page, or by a page path for overrides.
  budgets: {
    "*": {
      performance: 0.8, // 0 to 1
      lcp: 4000, // ms; "good" is 2500
      tbt: 500, // ms; "good" is 200
      cls: 0.1, // keep strict from day one
      scriptKB: 400, // transfer size as served locally
      stylesheetKB: 250,
    },
  },
};
`;

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        "base-url": { type: "string" },
        pages: { type: "string" },
        runs: { type: "string" },
        mode: { type: "string" },
        "form-factor": { type: "string" },
        out: { type: "string" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    console.error(`speed-check: ${err.message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(pkg.version);
    return 0;
  }
  const cmd = positionals[0] ?? "run";
  if (cmd === "init") return init(values);
  if (cmd !== "run" && cmd !== "report") {
    console.error(`speed-check: unknown command "${cmd}"\n\n${HELP}`);
    return 2;
  }

  const configPath = values.config ?? CONFIG_CANDIDATES.find((f) => existsSync(f));
  if (!configPath) {
    console.error("speed-check: no config found. Run `speed-check init` or pass --config <path>.");
    return 2;
  }
  if (!existsSync(configPath)) {
    console.error(`speed-check: config not found: ${configPath}`);
    return 2;
  }
  const overrides = {
    baseURL: values["base-url"],
    pages: values.pages?.split(",").map((s) => s.trim()).filter(Boolean),
    runs: values.runs,
    mode: values.mode,
    formFactor: values["form-factor"],
    outDir: values.out,
  };
  const { raw, baseDir } = await loadConfigFile(configPath);
  const config = resolveConfig(raw, overrides, { baseDir });
  const { exitCode } = cmd === "report" ? await report(config) : await run(config);
  return exitCode;
}

function init({ force }) {
  const file = "speed-check.config.js";
  if (existsSync(file) && !force) {
    console.error(`speed-check: ${file} exists. Pass --force to overwrite it.`);
    return 2;
  }
  writeFileSync(file, INIT_TEMPLATE);
  console.log(`Wrote ${file}. Set serve and pages, build the site, then run: npx speed-check`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`speed-check: ${err.message}`);
    process.exit(err instanceof ConfigError ? 2 : 3);
  },
);
