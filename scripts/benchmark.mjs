import { performance } from "node:perf_hooks";
import { sortNodes, countNodes, filterTree } from "../dist/core/index.js";

function measure(action) {
  action();
  const runs = Array.from({ length: 7 }, () => {
    const start = performance.now();
    action();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return Number(runs[3].toFixed(2));
}

for (const size of [1000, 5000, 10000]) {
  const nodes = Array.from({ length: size }, (_, i) => ({ id: String(i), name: `Resource ${(i * 7919) % size}` }));
  const previousSortMs = measure(() => [...nodes].sort((left, right) => {
    const difference = left.name.localeCompare(right.name, "en-US", { numeric: true, sensitivity: "base" });
    return difference || left.id.localeCompare(right.id);
  }));
  const currentSortMs = measure(() => sortNodes(nodes));
  const traversalMs = measure(() => countNodes(nodes));
  const searchMs = measure(() => filterTree(nodes, { query: "Resource 99" }));
  console.log(JSON.stringify({ nodes: size, previousSortMs, currentSortMs, traversalMs, searchMs,
    sortSpeedup: Number((previousSortMs / Math.max(currentSortMs, 0.01)).toFixed(1)) }));
}
