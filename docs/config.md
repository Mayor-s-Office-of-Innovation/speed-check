# Configuration

`speed-check.config.js` (ESM default export), `.mjs`, or `.json`. The CLI
looks for those names in the current directory; `--config` points elsewhere.
Paths in the file are relative to the file. Paths on the command line are
relative to the current directory.

```js
export default {
  serve: { dir: "dist" },
  baseURL: "http://127.0.0.1:4173",
  pages: ["/"],
  runs: 3,
  formFactor: "mobile",
  skipAudits: ["uses-http2"],
  chromeFlags: [],
  outDir: "speed-check-report",
  mode: "warn",
  budgets: {},
};
```

## `serve`

How the built site gets onto a local port. Omit it when `baseURL` already
answers: a server started in an earlier CI step, or a preview deployment.

| Form | Meaning |
| --- | --- |
| `{ dir: "dist" }` | speed-check serves the directory with its own static server. Directories get `index.html`, `/about` finds `about.html`. Add `port` (default 4173) and `spa: true` to answer unknown paths with `index.html`. |
| `{ command: "npx vite preview --port 4173" }` | A shell command that serves the site. speed-check polls `baseURL` until it answers (`readyTimeout`, default 15000 ms), then kills the command and its children when done. `cwd` defaults to the config file's directory. |

Exactly one of `dir` or `command`.

## `baseURL`

Absolute URL the pages are joined to. Required unless `serve.dir` is set, in
which case it defaults to `http://127.0.0.1:<port>`. `--base-url` overrides
it, which is how the Action targets a preview deployment.

## `pages`

Paths to measure. Default `["/"]`. The home page plus one page per template
is the usual set; each page costs `runs` Lighthouse runs of about 20 to 40
seconds on a hosted runner. Include a project-pages prefix if the build
wrote links with one.

## `runs`

Lighthouse runs per page, default 3. Budgets compare against the median.
One run is fine for a smoke test; five tightens the median at the cost of
time.

## `formFactor`

`"mobile"` (default) or `"desktop"`. Mobile is Lighthouse's default profile:
a mid-range phone, slow 4G, 4x CPU slowdown. Desktop uses Lighthouse's
`desktop` preset: no CPU slowdown, faster network, larger viewport. Pick
desktop only for a site that is genuinely desktop-only.

## `skipAudits`

Lighthouse audit ids to skip. Default `["uses-http2"]`, which is a false
positive behind any local server and behind most CDNs alike.

## `chromeFlags`

Extra flags for Chrome, added to `--headless=new --no-sandbox
--disable-dev-shm-usage --user-data-dir=<temp profile>`.

## `outDir`

Where reports go, default `speed-check-report` next to the config. Contains
`speed-check.json` (the summary), `speed-check.md` (the table), `runs.json`,
and `lhr/<page>-<n>.json` (full Lighthouse results, viewable in the
Lighthouse Viewer). Add it to `.gitignore`.

## `mode`

`"warn"` (default): budgets are advisory and the exit code is 0.
`"gate"`: any budget over threshold exits 1. See
[thresholds.md](thresholds.md) for when to switch.

## `budgets`

An object keyed by `"*"` (every page) or a page path exactly as written in
`pages`. A page's own budgets merge over the shared ones. Values are
thresholds; the direction is fixed per metric.

| Key | Unit | Met when | Lighthouse source |
| --- | --- | --- | --- |
| `performance` | 0 to 1 | median >= | performance category score |
| `fcp` | ms | median <= | first-contentful-paint |
| `lcp` | ms | median <= | largest-contentful-paint |
| `tbt` | ms | median <= | total-blocking-time |
| `cls` | ratio | median <= | cumulative-layout-shift |
| `si` | ms | median <= | speed-index |
| `ttfb` | ms | median <= | server-response-time |
| `scriptKB` | kB | median <= | resource-summary, script transfer |
| `stylesheetKB` | kB | median <= | resource-summary, stylesheet transfer |
| `imageKB` | kB | median <= | resource-summary, image transfer |
| `fontKB` | kB | median <= | resource-summary, font transfer |
| `totalKB` | kB | median <= | resource-summary, total transfer |

Transfer sizes are what the local server sent. Most local servers do not
compress, so these are larger than production numbers behind a CDN. Set the
budget from a local run, not from production.

## Command line

```
speed-check [options]           serve (if configured), measure, report
speed-check report [options]    re-render the report from an earlier run
speed-check init [--force]      write speed-check.config.js

  -c, --config <path>
      --base-url <url>
      --pages <a,b,c>
      --runs <n>
      --mode <warn|gate>
      --form-factor <mobile|desktop>
      --out <dir>
```

Environment: `GITHUB_STEP_SUMMARY` (set by GitHub Actions) receives the
Markdown table; `CHROME_PATH` points Lighthouse at a specific Chrome.
