# Small author-owned measurement example

From the scene root, after installing the optional benchmark helpers:

```sh
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --quick
npm run htn:measure -- tools/consumer/example/jobs.measure.ts --quick --json report.json
```

In this source checkout, use `node scripts/htn-measure.mjs` for the same command.
Copy/customize these files in your own tool folder. Replace the worlds with a
representative snapshot and your intended worst case. `many facts`, `slow callterm`
and `unreachable` are negative controls, not estimates of your game's workload.

Expected plans were written explicitly. Full task arguments matter: `!choose 42`
is different from `!choose 41`. The same manifest can be passed to `htn:check`.
See [measurement notes](../../../docs/consumer-benchmark.md) for comparisons,
exit codes, allocations and profiling the target client.
