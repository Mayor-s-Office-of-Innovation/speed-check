# Choosing thresholds and when to gate

## The targets

Core Web Vitals "good" thresholds are LCP 2.5 s, CLS 0.1, and INP 200 ms.
Lighthouse cannot measure INP in the lab; Total Blocking Time stands in for
it, and a TBT of 200 ms or less is the usual proxy. Those are the targets a
site works toward. They are not the first thresholds to put in CI.

## Why not start at the targets

Hosted runners are shared, noisy machines. The same commit measured twice
varies by 10 to 20 percent even with three-run medians. A budget set at the
target on day one fails on noise, people learn to ignore it, and the signal
is gone. A budget set a little above the observed worst case fails only when
something actually regressed.

## The ladder

1. **Warn-only for the first few weeks.** `mode: "warn"` with the loose
   budgets `speed-check init` writes. Every run leaves a report artifact.
2. **Read the spread.** For each metric, take the worst median across those
   runs (the Max column across reports, or the medians in each
   `speed-check.json`). Set the threshold a little above it. That number is
   a regression trip-wire, not a goal.
3. **Promote to gate** (`mode: "gate"`) once two weeks pass without a false
   alarm. Keep CLS strict from the start: it is the least noisy metric, and
   layout shift is a design defect, not a runner artifact.
4. **Tighten toward the targets** as the site improves. Each tightening is a
   reviewed edit to the config, so the history of what the team committed to
   is in version control.

## What gates immediately

A bundle-size check such as `size-limit` is deterministic, runs in seconds,
and catches the most common cause of a lab regression: a dependency bump.
Make that the hard gate from day one and let speed-check be the slower,
noisier second opinion until the ladder says otherwise.

## Reading a red row

- One metric, one page, one run: look at the Min and Max columns first. A
  wide spread means noise. Re-run before investigating.
- TBT up, nothing else: usually a new script, or a third-party script that
  errors on localhost. Check the console in the Lighthouse Viewer.
- LCP up, transfer sizes unchanged: something moved the largest element
  later, often a font or an image that lost its preload.
- CLS up at all: find it. It is almost never noise.
