import { collect } from "./collect.js";
import { exitCodeFor, readResults, renderText, summarize, writeReports } from "./report.js";
import { startServer } from "./serve.js";

export { ConfigError, DEFAULTS, budgetsFor, defineConfig, loadConfigFile, resolveConfig } from "./config.js";
export { DISPLAY_ORDER, METRICS, formatValue } from "./metrics.js";
export { collect, lighthouseArgs, pageSlug } from "./collect.js";
export { exitCodeFor, median, readResults, renderMarkdown, renderText, summarize, writeReports } from "./report.js";
export { serveDirectory, startCommand, startServer } from "./serve.js";

/**
 * Serve (if configured), measure every page, write reports, print the table.
 * @param {ReturnType<typeof import("./config.js").resolveConfig>} config
 * @param {{ log?: (line: string) => void }} [opts]
 */
export async function run(config, { log = console.log } = {}) {
  const server = config.serve ? await startServer(config.serve, config.baseURL) : null;
  let results;
  try {
    results = await collect(config, { log });
  } finally {
    if (server) await server.stop();
  }
  return finish(results, config, log);
}

/** Re-render reports from an earlier run's files in outDir. */
export async function report(config, { log = console.log } = {}) {
  return finish(readResults(config.outDir), config, log);
}

function finish(results, config, log) {
  const summary = summarize(results, config);
  const files = writeReports(summary, config.outDir);
  log(renderText(summary));
  log(`Reports: ${files.md}, ${files.json}`);
  return { summary, exitCode: exitCodeFor(summary) };
}
