/*
  The metric catalog. A budget key in the config is a key of METRICS. Each
  entry knows how to pull its number out of a Lighthouse result (an LHR),
  which direction is good, and how to print it.

  Resource sizes are transfer sizes in kB as the local server sent them. Most
  local servers do not compress, so those are uncompressed numbers unless the
  serve command compresses. Budget accordingly, and compare like with like.
*/

const audit = (id) => (lhr) => {
  const v = lhr.audits?.[id]?.numericValue;
  return typeof v === "number" ? v : null;
};

const resource = (type) => (lhr) => {
  const item = lhr.audits?.["resource-summary"]?.details?.items?.find(
    (i) => i.resourceType === type,
  );
  return item && typeof item.transferSize === "number"
    ? item.transferSize / 1024
    : null;
};

/**
 * @typedef {object} Metric
 * @property {string} label
 * @property {"score"|"ms"|"kB"|"ratio"} unit
 * @property {"<="|">="} operator  Direction in which the budget is met.
 * @property {(lhr: any) => number|null} get
 */

/** @type {Record<string, Metric>} */
export const METRICS = {
  performance: {
    label: "Performance score",
    unit: "score",
    operator: ">=",
    get: (lhr) => {
      const s = lhr.categories?.performance?.score;
      return typeof s === "number" ? s : null;
    },
  },
  fcp: { label: "First Contentful Paint", unit: "ms", operator: "<=", get: audit("first-contentful-paint") },
  lcp: { label: "Largest Contentful Paint", unit: "ms", operator: "<=", get: audit("largest-contentful-paint") },
  tbt: { label: "Total Blocking Time", unit: "ms", operator: "<=", get: audit("total-blocking-time") },
  cls: { label: "Cumulative Layout Shift", unit: "ratio", operator: "<=", get: audit("cumulative-layout-shift") },
  si: { label: "Speed Index", unit: "ms", operator: "<=", get: audit("speed-index") },
  ttfb: { label: "Server response time", unit: "ms", operator: "<=", get: audit("server-response-time") },
  scriptKB: { label: "Script transfer", unit: "kB", operator: "<=", get: resource("script") },
  stylesheetKB: { label: "Stylesheet transfer", unit: "kB", operator: "<=", get: resource("stylesheet") },
  imageKB: { label: "Image transfer", unit: "kB", operator: "<=", get: resource("image") },
  fontKB: { label: "Font transfer", unit: "kB", operator: "<=", get: resource("font") },
  totalKB: { label: "Total transfer", unit: "kB", operator: "<=", get: resource("total") },
};

/** Metrics every report shows, in this order. Budgeted metrics outside this list follow. */
export const DISPLAY_ORDER = [
  "performance",
  "fcp",
  "lcp",
  "tbt",
  "cls",
  "si",
  "scriptKB",
  "stylesheetKB",
  "totalKB",
];

/**
 * @param {number|null|undefined} value
 * @param {Metric["unit"]} unit
 */
export function formatValue(value, unit) {
  if (value == null || Number.isNaN(value)) return "n/a";
  switch (unit) {
    case "score":
      return String(Math.round(value * 100));
    case "ms":
      return `${Math.round(value)} ms`;
    case "kB":
      return `${Math.round(value)} kB`;
    default:
      return value.toFixed(3);
  }
}
