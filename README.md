# speed-check

This is an experimental tool. The numbers are only as stable as the runner
they come from; read [Thresholds](#thresholds) before trusting a red row.

Lab performance budgets for CI. speed-check runs Lighthouse against the pages
you name, takes the median of repeated runs, compares it with the budgets in
a small config file, and prints a table into the job summary. Reports stay in
the workflow as an artifact. Nothing is uploaded anywhere.

Status: 0.1.0. CLI, config, built-in static server, composite GitHub Action.
1.0 follows the first outside adopters.

## What it measures, and what it does not

- **Lab metrics on a throttled device profile.** Lighthouse's default mobile
  profile emulates a mid-range Android phone on slow 4G with a 4x CPU
  slowdown. That is the population most government sites exist for: cheap
  phones and old tablets. speed-check keeps that default.
- **Regression, not reality.** These are numbers from one machine type,
  useful for noticing that a change made things slower. Real-user numbers
  come from the field (Chrome UX Report, or your own observability). Never
  quote a lab LCP as "our LCP".
- **Public pages only.** Lighthouse loads each URL fresh. Screens behind a
  login stay with your end-to-end tests.
- **Performance only.** Accessibility is a different discipline with its own
  tool: see [ramp-check](https://github.com/Mayor-s-Office-of-Innovation/ramp-check).

## Quickstart

```sh
npm install --save-dev speed-check
npx speed-check init        # writes speed-check.config.js
npm run build               # whatever produces your site's output
npx speed-check
```

```js
// speed-check.config.js
export default {
  serve: { dir: "dist" },            // or { command: "npx vite preview --port 4173" }, or omit and set baseURL
  pages: ["/", "/services", "/apply"],
  runs: 3,
  mode: "warn",                      // "gate" once the noise floor is known
  budgets: {
    "*": { performance: 0.8, lcp: 4000, tbt: 500, cls: 0.1, scriptKB: 400, stylesheetKB: 250 },
    "/apply": { lcp: 4500 },         // per-page override
  },
};
```

Output, in the terminal and in `speed-check-report/speed-check.md`:

```
speed-check: Lighthouse 13.5.0, mobile, median of 3 runs

/  (http://127.0.0.1:4173/)
Metric                    Min      Median   Max      Budget      Status
------------------------  -------  -------  -------  ----------  ------
Performance score         96       98       98       >= 80       OK
First Contentful Paint    1790 ms  1852 ms  1940 ms
Largest Contentful Paint  2101 ms  2154 ms  2388 ms  <= 4000 ms  OK
Total Blocking Time       20 ms    29 ms    61 ms    <= 500 ms   OK
Cumulative Layout Shift   0.027    0.027    0.027    <= 0.100    OK
Speed Index               1790 ms  1852 ms  1940 ms
Script transfer           115 kB   115 kB   115 kB   <= 400 kB   OK
Stylesheet transfer       28 kB    28 kB    28 kB    <= 250 kB   OK
Total transfer            147 kB   147 kB   147 kB

All 6 budgets met.
Lab numbers on this machine, not field data.
```

Needs Node 22.19 or newer and a Chrome install. GitHub's hosted Ubuntu runners
have Chrome; locally, set `CHROME_PATH` if it is somewhere unusual.

Every option: [docs/config.md](docs/config.md). Budget keys: `performance`,
`fcp`, `lcp`, `tbt`, `cls`, `si`, `ttfb`, `scriptKB`, `stylesheetKB`,
`imageKB`, `fontKB`, `totalKB`.

## In CI

```yaml
jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: Mayor-s-Office-of-Innovation/speed-check/action@main
```

The action writes the table to the job summary, uploads the reports as an
artifact, and fails the job only in gate mode. Keep it in its own job after
the build, never inside the deploy job. Details and the plain-YAML
alternative: [action/README.md](action/README.md).

## Thresholds

Core Web Vitals "good" is LCP 2.5 s, CLS 0.1, and INP 200 ms. In the lab,
Total Blocking Time stands in for INP, with 200 ms as the usual proxy. Those
are the targets. They are not the first thresholds. Hosted runners vary by
10 to 20 percent run to run even with three-run medians, so:

1. Start in warn mode with loose budgets (`init` writes them).
2. After a few weeks, read the spread: for each metric, take the worst median
   across those runs and set the threshold a little above it.
3. Switch to gate mode once two weeks pass without a false alarm. Keep CLS
   strict from the start; layout shift is a design defect, not runner noise.
4. Tighten toward the targets as the site improves, one reviewed edit at a
   time.

Pair it with a deterministic bundle-size gate such as `size-limit`. It runs
in seconds and catches the thing that most often moves lab numbers: a
dependency bump. The full ladder: [docs/thresholds.md](docs/thresholds.md).

## Pitfalls

- **Third-party scripts on localhost.** Analytics or map keys restricted to
  the production hostname throw console errors and can skew TBT. Stub them in
  the build used for the perf job, or accept the noise.
- **Transfer sizes are what the local server sent.** Most local servers do
  not compress. Budget on the uncompressed number and compare like with like.
- **Project pages under a prefix** (`/repo/`): the page paths must include it
  if the build wrote links with it.
- **A single-page app with client routing** needs `serve: { dir, spa: true }`
  so deep paths get `index.html`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Measured; budgets met, or mode is warn. |
| 1 | Mode is gate and at least one budget is over threshold. |
| 2 | Config error. |
| 3 | Lighthouse or server failure. |

## Why not Lighthouse CI or a vendor action

Lighthouse CI pins an older Lighthouse, brings its own config layer, and its
documented default uploads reports to public temporary storage. Lighthouse
itself removed its budgets feature in 12.0, so a tool that wants budgets has
to evaluate them anyway. speed-check is that evaluator and nothing more: one
dependency, the current Lighthouse, full control of flags, and the reports
never leave the runner.

## Programmatic use

```js
import { loadConfigFile, resolveConfig, run } from "speed-check";
const { raw, baseDir } = await loadConfigFile("speed-check.config.js");
const { summary, exitCode } = await run(resolveConfig(raw, {}, { baseDir }));
```

## Roadmap

- A `history` command that appends each run's medians to a file so step 2 of
  the ladder is a command, not a spreadsheet.
- Lighthouse user flows for pages that need a click first.

## License

MIT.
