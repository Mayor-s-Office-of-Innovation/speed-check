# Example: a static site

Two HTML pages and a stylesheet in `site/`, served by speed-check's built-in
static server. The repo's CI smoke job runs this config on every push.

```sh
npx speed-check --config examples/static-site/speed-check.config.js
```

To use it as a starting point for your own site: copy
`speed-check.config.js` next to your `package.json`, set `serve.dir` to your
build output (or `serve.command` to whatever serves it), list the pages, and
keep the loose budgets until you have read the spread. See
[docs/thresholds.md](../../docs/thresholds.md).
