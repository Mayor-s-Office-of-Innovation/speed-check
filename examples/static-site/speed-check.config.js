// Paths are relative to this file. Every option: ../../docs/config.md
export default {
  serve: { dir: "site" },
  pages: ["/", "/about"],
  runs: 3,
  formFactor: "mobile",
  mode: "warn",
  budgets: {
    "*": {
      performance: 0.8,
      lcp: 4000,
      tbt: 500,
      cls: 0.1,
      scriptKB: 400,
      stylesheetKB: 250,
    },
    "/about": { lcp: 3500 },
  },
};
