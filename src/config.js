import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { METRICS } from "./metrics.js";

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export const DEFAULT_PORT = 4173;

export const DEFAULTS = Object.freeze({
  pages: ["/"],
  runs: 3,
  formFactor: "mobile",
  skipAudits: ["uses-http2"],
  chromeFlags: [],
  outDir: "speed-check-report",
  mode: "warn",
  budgets: {},
});

/**
 * @typedef {object} Config
 * @property {{ dir?: string, command?: string, port?: number, spa?: boolean, readyTimeout?: number } | null} [serve]
 * @property {string} [baseURL]
 * @property {string[]} [pages]
 * @property {number} [runs]
 * @property {"mobile"|"desktop"} [formFactor]
 * @property {string[]} [skipAudits]
 * @property {string[]} [chromeFlags]
 * @property {string} [outDir]
 * @property {"warn"|"gate"} [mode]
 * @property {Record<string, Record<string, number>>} [budgets]
 */

/** Identity helper so editors can complete the config. @param {Config} config */
export function defineConfig(config) {
  return config;
}

/**
 * Load a config file. `.json` is parsed; anything else is imported as ESM and
 * its default export used.
 * @returns {Promise<{ raw: any, baseDir: string }>}
 */
export async function loadConfigFile(path) {
  const abs = resolve(path);
  const baseDir = dirname(abs);
  if (extname(abs) === ".json") {
    return { raw: JSON.parse(await readFile(abs, "utf8")), baseDir };
  }
  const mod = await import(pathToFileURL(abs).href);
  return { raw: mod.default ?? mod, baseDir };
}

const isStringArray = (a) =>
  Array.isArray(a) && a.every((s) => typeof s === "string");
const stripUndefined = (o) =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
const safeURL = (s) => {
  try {
    return new URL(s);
  } catch {
    return null;
  }
};

/**
 * Apply defaults and overrides, validate, and resolve paths.
 *
 * Paths in the config file (`serve.dir`, `outDir`) are relative to `baseDir`,
 * normally the config file's directory. Overrides from the command line are
 * relative to the current directory.
 *
 * @param {Config} raw
 * @param {Partial<Config>} [overrides]
 * @param {{ baseDir?: string, cwd?: string }} [opts]
 */
export function resolveConfig(raw = {}, overrides = {}, opts = {}) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError("config must be an object");
  }
  const baseDir = opts.baseDir ?? process.cwd();
  const cwd = opts.cwd ?? process.cwd();
  const file = stripUndefined(raw);
  const cli = stripUndefined(overrides);
  const c = { ...DEFAULTS, ...file, ...cli };

  if (c.serve != null) {
    if (typeof c.serve !== "object") {
      throw new ConfigError("serve must be an object with `dir` or `command`");
    }
    const { dir, command } = c.serve;
    if (!dir === !command) {
      throw new ConfigError(
        "serve needs exactly one of `dir` (built-in static server) or `command` (a shell command that serves the site)",
      );
    }
    const serve = { readyTimeout: 15_000, spa: false, ...c.serve };
    if (dir) {
      if (typeof dir !== "string") throw new ConfigError("serve.dir must be a path");
      serve.dir = resolve(baseDir, dir);
      const fromBase = c.baseURL ? Number(safeURL(c.baseURL)?.port) : NaN;
      serve.port = Number(serve.port ?? (fromBase || DEFAULT_PORT));
      if (!Number.isInteger(serve.port) || serve.port <= 0) {
        throw new ConfigError("serve.port must be a positive integer");
      }
      c.baseURL ??= `http://127.0.0.1:${serve.port}`;
    } else {
      if (typeof command !== "string") throw new ConfigError("serve.command must be a string");
      serve.cwd = resolve(baseDir, serve.cwd ?? ".");
    }
    if (!Number.isInteger(serve.readyTimeout) || serve.readyTimeout <= 0) {
      throw new ConfigError("serve.readyTimeout must be a positive number of milliseconds");
    }
    c.serve = serve;
  } else {
    c.serve = null;
  }

  if (typeof c.baseURL !== "string" || !safeURL(c.baseURL)) {
    throw new ConfigError(
      "baseURL must be an absolute URL (with serve.dir it defaults to http://127.0.0.1:<port>)",
    );
  }
  c.baseURL = c.baseURL.replace(/\/+$/, "");

  if (!isStringArray(c.pages) || c.pages.length === 0) {
    throw new ConfigError('pages must be a non-empty array of paths, e.g. ["/", "/about"]');
  }
  c.pages = c.pages.map((p) => (p.startsWith("/") ? p : `/${p}`));

  c.runs = Number(c.runs);
  if (!Number.isInteger(c.runs) || c.runs < 1) {
    throw new ConfigError("runs must be an integer of 1 or more");
  }
  if (!["mobile", "desktop"].includes(c.formFactor)) {
    throw new ConfigError('formFactor must be "mobile" or "desktop"');
  }
  if (!["warn", "gate"].includes(c.mode)) {
    throw new ConfigError('mode must be "warn" or "gate"');
  }
  if (!isStringArray(c.skipAudits)) {
    throw new ConfigError("skipAudits must be an array of Lighthouse audit ids");
  }
  if (!isStringArray(c.chromeFlags)) {
    throw new ConfigError("chromeFlags must be an array of strings");
  }
  if (typeof c.outDir !== "string" || !c.outDir) {
    throw new ConfigError("outDir must be a path");
  }
  c.outDir = resolve(cli.outDir !== undefined ? cwd : baseDir, c.outDir);

  if (c.budgets == null || typeof c.budgets !== "object" || Array.isArray(c.budgets)) {
    throw new ConfigError('budgets must be an object keyed by "*" or a page path');
  }
  for (const [page, b] of Object.entries(c.budgets)) {
    if (page !== "*" && !c.pages.includes(page)) {
      throw new ConfigError(`budgets["${page}"] names a page that is not in pages`);
    }
    if (b == null || typeof b !== "object" || Array.isArray(b)) {
      throw new ConfigError(`budgets["${page}"] must be an object of metric: threshold`);
    }
    for (const [key, threshold] of Object.entries(b)) {
      if (!METRICS[key]) {
        throw new ConfigError(
          `budgets["${page}"].${key}: unknown metric. Known: ${Object.keys(METRICS).join(", ")}`,
        );
      }
      if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
        throw new ConfigError(`budgets["${page}"].${key} must be a number`);
      }
    }
  }
  return c;
}

/** Budgets that apply to one page: the "*" set with the page's own on top. */
export function budgetsFor(config, page) {
  return { ...(config.budgets["*"] ?? {}), ...(config.budgets[page] ?? {}) };
}
