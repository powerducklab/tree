# Tree quality review

Reviewed September 16, 2026. Scope: the `@powerduck/tree` package, its public
adapters, React UI, development preview, and verification tools.

## Initial assessment

The package already separated framework-independent algorithms, adapters, and
React rendering, and its initial 177 tests passed. The main gaps were behavioral
rather than cosmetic:

- Recursive traversal and nested tag assembly could overflow on deep inputs.
- Moving a node toward an ancestor was incorrectly rejected by the cycle guard.
- Repeated locale-comparator construction and array membership checks added cost.
- The React tree recursively rendered every expanded row, without windowing.
- Every row was a tab stop, root levels started at zero, and arrow navigation was incomplete.
- Context menus lacked complete keyboard navigation and reliable viewport positioning.
- A separator flag replaced its action instead of adding a separator above it.
- Drag-group changes could leave stale constraints, and object paths could receive invalid array patches.
- Dark CSS overrode host tokens with an unrelated blue palette.
- Development used React 18 despite the published React 19 peer requirement.

## Implemented changes

Core algorithms and nested-tag assembly now use iterative traversal. Immutable
edits retain unrelated branches. Object cycles terminate, nested tags use a linear
parent-link validation pass, and sort operations reuse an `Intl.Collator`.
Schema generation has cycle, depth, and total-node bounds. Exact path lookup and
escaped IDs distinguish punctuation in property names from structural separators.

The UI uses a flat visible-row list, indexed paths, constant-time expansion
membership, and memoized rows. Fixed-height lists automatically window above 500
visible rows. Keyboard focus waits for the target window to commit. Root levels,
sibling positions, a single tab stop, arrow navigation, prefix search, and menu
keyboard behavior are covered by regression tests.

Context menus portal outside clipped containers while staying in native dialogs.
They measure their actual size, exclude the browser scrollbar from usable width,
carry theme tokens, and restore focus. Menus close on external scroll or resize.
Row buttons, search fields, menu states, hover surfaces, borders, focus indicators,
and scrollbar visibility follow the host palette with standalone theme fallbacks.

## Verification

- Package and preview TypeScript checks pass.
- The complete automated suite passes under React 19.3.0.
- Author-maintained code passes the English-only source check.
- ESM, CommonJS, declarations, and CSS builds pass.
- Built ESM/CommonJS core exports and React 19 server rendering pass smoke checks.
- Deep-input tests exercise 15,000 tree levels and 10,000 nested tags.
- Interaction tests cover search restoration, focus, menus, drag isolation,
  array-patch validation, cycles, windowing, and virtual-list Home/End navigation.
- Browser checks cover light/dark surfaces, desktop and 390px mobile layouts,
  menu clipping, usable viewport boundaries, and keyboard focus on 20,000 items.
- The final React 19 preview loads three trees without console warnings or errors.

## Measurements

The browser mounted 29 rows for a 20,000-item list in a 353px viewport. At the end
of the list it mounted 21 rows. Home/End moved focus between items 1 and 20,000.
These counts include overscan and vary with viewport size.

`node scripts/benchmark.mjs` measures seven-run medians after a warm-up, using
identical deterministic shuffled names for the previous and current comparators.
One local run on Node 23.10.0 produced:

| Nodes | Previous sort | Current sort | Speedup | Traversal | Filtering |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 39.40 ms | 1.20 ms | 32.8x | 0.09 ms | 0.17 ms |
| 5,000 | 249.55 ms | 8.66 ms | 28.8x | 0.34 ms | 0.43 ms |
| 10,000 | 638.39 ms | 21.59 ms | 29.6x | 0.67 ms | 0.94 ms |

These are local microbenchmarks, not end-to-end rendering or latency guarantees.

## Remaining limits

- No independent scoring rubric justifies a universal 9.5/10 rating.
- Document variants and custom row renderers are not automatically windowed.
  Large variable-height custom trees still need application-specific profiling.
- Search and visible-row derivation remain linear; input parsing is synchronous.
- Native drag and drop is desktop-oriented; touch reordering is not implemented.
- Nodes require unique IDs and immutable updates. Invalid shared/cyclic input is
  handled defensively, but it is not a supported graph-editing model.
- CSS imported by an application must preserve the package's row-height rules
  when windowing is enabled. Custom variable heights should opt out.
- npm audit reports three development-tool advisories: two moderate reports in
  Vitest/mocker and one low report in esbuild. No production dependency appears
  in the current report. The previous high/critical tool advisories were removed
  by updating Vite to 6.4.3 and Vitest to 3.2.7. The newer Vitest fix requires a
  supported Node 20/22/24+ line; this workspace runs Node 23.10.0. A separate
  supported-runtime/toolchain update is still needed for a clean development audit.

No package version was changed and nothing was published.
