# speed-check GitHub Action

Runs `speed-check` in CI, writes the Markdown table to the job summary, and
uploads the reports as an artifact. It does not post anything anywhere else.

## Usage

Build the site first. Run speed-check in its own job, after the build and
never inside the deploy job, so a slow or flaky Lighthouse run cannot delay a
deploy and the deploy job's permissions stay minimal.

```yaml
name: Performance
on: pull_request

permissions:
  contents: read

jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: Mayor-s-Office-of-Innovation/speed-check/action@main
        with:
          config: speed-check.config.js
```

Against a preview deployment instead of a local server:

```yaml
      - uses: Mayor-s-Office-of-Innovation/speed-check/action@main
        with:
          base-url: ${{ steps.deploy.outputs.url }}
```

Chrome is already installed on GitHub's hosted Ubuntu runners. On a
self-hosted runner, install it and set `CHROME_PATH` if it is not on the path.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `config` | `speed-check.config.js` | Config path, relative to `working-directory`. |
| `base-url` | | Override the config's `baseURL`. |
| `mode` | | Override the config's `mode` (`warn` or `gate`). |
| `runs` | | Override runs per page. |
| `working-directory` | `.` | Where `package.json` and the config live. |
| `version` | `latest` | speed-check version to install if the repo does not already depend on it. |
| `comment` | `"false"` | Post or update a PR comment. Needs `pull-requests: write`. |
| `artifact-name` | `speed-check-report` | Name of the uploaded artifact. |
| `retention-days` | `14` | Artifact retention. |
| `node-version` | `22` | Node.js version. |

## Outputs

| Output | Meaning |
| --- | --- |
| `exit-code` | 0 within budget or warn mode, 1 over budget in gate mode, 2 config error, 3 Lighthouse or server failure. |
| `report-dir` | Directory with `speed-check.json`, `speed-check.md`, and `lhr/*.json`. |

## What happens

1. Node is set up. If the repo does not depend on `speed-check`, the
   requested version is installed for the run.
2. `npx speed-check` runs with the report directory under `RUNNER_TEMP`. The
   Markdown table is appended to the job summary.
3. The report directory is uploaded as an artifact, pass or fail. The
   `lhr/*.json` files open in the Lighthouse Viewer
   (https://googlechrome.github.io/lighthouse/viewer/) by drag and drop.
4. Optionally, on pull requests, the Markdown is posted as a comment that
   later runs update in place.
5. The job fails if the exit code was not zero. In warn mode that only
   happens for config or Lighthouse failures.

## Pinning

`@main` tracks the development branch. Once releases are tagged, pin to a tag
or a commit SHA.
