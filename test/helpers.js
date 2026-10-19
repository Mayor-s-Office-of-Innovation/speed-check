import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A minimal Lighthouse result with just the audits speed-check reads. */
export function fakeLhr({
  performance = 0.9,
  fcp = 1000,
  lcp = 2000,
  tbt = 100,
  cls = 0.01,
  si = 1500,
  ttfb = 100,
  script = 100 * 1024,
  stylesheet = 20 * 1024,
  image = 0,
  font = 0,
  url = "http://127.0.0.1:4173/",
} = {}) {
  const num = (id, v) => [id, { id, numericValue: v, score: 1 }];
  return {
    lighthouseVersion: "13.5.0",
    requestedUrl: url,
    categories: { performance: { score: performance } },
    audits: Object.fromEntries([
      num("first-contentful-paint", fcp),
      num("largest-contentful-paint", lcp),
      num("total-blocking-time", tbt),
      num("cumulative-layout-shift", cls),
      num("speed-index", si),
      num("server-response-time", ttfb),
      [
        "resource-summary",
        {
          id: "resource-summary",
          details: {
            items: [
              { resourceType: "total", transferSize: script + stylesheet + image + font },
              { resourceType: "script", transferSize: script },
              { resourceType: "stylesheet", transferSize: stylesheet },
              { resourceType: "image", transferSize: image },
              { resourceType: "font", transferSize: font },
            ],
          },
        },
      ],
    ]),
  };
}

export const tmp = (prefix = "speed-check-test-") => mkdtempSync(join(tmpdir(), prefix));
