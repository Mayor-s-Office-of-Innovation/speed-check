# Releasing

Maintainer checklist. Every step is manual on purpose.

1. `npm test`, then `npm run smoke` (needs a local Chrome).
2. Update `CHANGELOG.md`: move "Unreleased" into a version heading.
3. Bump `version` in `package.json`.
4. Commit, tag `vX.Y.Z`, push the tag. The Release workflow re-runs the
   tests and the smoke run, checks the tag matches the version, and publishes
   with provenance. Publishing needs either npm trusted publishing configured
   for this repo on npmjs.com, or an automation token in the `NPM_TOKEN`
   secret.
5. Verify: `npx speed-check@X.Y.Z --help` from an empty directory.
6. Pin the Action references in the READMEs from `@main` to the tag once `v1`
   exists.

Before 1.0.0:

- The Action has run on a real pull request in another repo and the job
  summary showed the table.
- Someone other than the author has taken a fresh static site to a green CI
  run in under ten minutes following only the README.
