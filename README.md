# @powerduck/tree

Extensible tree component for API navigation, schema exploration, and documentation. Built on a generic core with adapters for OpenAPI, JSON Schema, and custom data sources.

[Website](https://www.powerduck.com) · [Documentation](https://www.powerduck.com/docs/tree) · [GitHub](https://github.com/powerducklab/tree) · [npm](https://www.npmjs.com/package/@powerduck/tree)

## Features

- **Generic core** — `TreeNode<TMetadata>` works with any data source
- **OpenAPI adapter** — tag-based navigation with OAS 3.2 native parent nesting, `x-tagGroups`, `x-order`, `x-displayName`, `x-internal`
- **JSON Schema adapter** — deep expansion of nested properties, arrays, combinators with `jsonPath` metadata for editor line jumping
- **Doc adapter** — Stripe-style documentation tree with operation count badges, parameters, request body, and responses
- **React component** — search, expand/collapse toggle (Material Design unfold icons), keyboard navigation, method badges, custom render props, `searchRowExtra` for inline toolbar extensions
- **Drag and drop** — reorder within the same parent **and cross-level move into folders**, with three-zone drop detection, `canDrag`/`canDrop` predicates, `dragGroupKey` isolation, `onReorder`/`onMove` callbacks, and circular reference prevention
- **Context menu** — right-click or the more (…) button for per-node actions, with custom item definitions, icons, separators, danger styling, and two-step confirm for destructive actions
- **Imperative locate** — `locateNode(predicate)` finds a node, expands all ancestors, selects it, and scrolls into view (ideal for "jump to API" features)
- **JSON Patch integration** — `onPatch` callback emits RFC 6902 operations for reorder/move/delete, compatible with [`@powerduck/conf-patch`](https://www.npmjs.com/package/@powerduck/conf-patch) for applying to the original document
- **High-quality icons** — powered by [react-icons](https://react-icons.github.io/react-icons/) (Lucide + Material Design icon sets)
- **CSS variable theming** — compatible with powerduck `tokens.css`, light/dark mode
- **Zero hard dependencies** — core and adapters have no runtime dependencies; React layer requires `react`, `react-dom`, and `react-icons`

## Installation

```bash
npm install @powerduck/tree
```

### Peer Dependencies

```bash
npm install react react-dom react-icons
```

### CSS Import

Import the component styles in your app entry point:

```ts
import "@powerduck/tree/react/index.css";
```

## Quick Start

### API Debug Tree

```tsx
import { useMemo } from "react";
import { buildOpenApiTree } from "@powerduck/tree";
import { Tree } from "@powerduck/tree/react";

function ApiNav({ document }) {
  const { root } = useMemo(() => buildOpenApiTree(document), [document]);

  return (
    <div style={{ width: 320, height: "100%" }}>
      <Tree
        nodes={root.children ?? []}
        onSelect={(node) => console.log(node.metadata?.method, node.metadata?.path)}
        searchable
        showExpandAll
        defaultExpandDepth={2}
      />
    </div>
  );
}
```

### Schema Navigation Tree

```tsx
import { useMemo } from "react";
import { buildSchemaTree } from "@powerduck/tree";
import { Tree } from "@powerduck/tree/react";

function SchemaNav({ schema, editorRef }) {
  const { root } = useMemo(() => buildSchemaTree(schema), [schema]);

  const handleSelect = (node) => {
    const jsonPath = node.metadata?.jsonPath;
    if (jsonPath) {
      editorRef.current?.revealLine(jsonPath);
    }
  };

  return (
    <Tree
      nodes={root.children ?? []}
      onSelect={handleSelect}
      searchable
      defaultExpandDepth={3}
    />
  );
}
```

### Custom Data Source

```tsx
import { Tree } from "@powerduck/tree/react";
import type { TreeNode } from "@powerduck/tree/core";

interface FileMeta {
  type: "folder" | "file";
  size?: number;
}

const files: TreeNode<FileMeta>[] = [
  {
    id: "src",
    name: "src",
    metadata: { type: "folder" },
    children: [
      { id: "src/index.ts", name: "index.ts", metadata: { type: "file", size: 512 } },
    ],
  },
];

function FileTree() {
  return <Tree nodes={files} searchable defaultExpandDepth={1} />;
}
```

## Drag and Drop

Enable drag and drop with the `draggable` prop. Nodes can be reordered within the same parent **or moved into a different parent** (cross-level) by dragging the grip handle.

### Reordering (same level)

```tsx
import { useState } from "react";
import { Tree } from "@powerduck/tree/react";
import type { ReorderResult } from "@powerduck/tree/core";

function SortableTree({ initialNodes }) {
  const [nodes, setNodes] = useState(initialNodes);

  const handleReorder = (result: ReorderResult) => {
    console.log(`Moved "${result.moved.name}" from index ${result.fromIndex} to ${result.toIndex}`);
    setNodes(result.nodes);
  };

  return (
    <Tree
      nodes={nodes}
      draggable
      onReorder={handleReorder}
    />
  );
}
```

### Cross-level move (drag into folder)

When dragging over a branch node, the middle 50% of the row highlights the node as a drop target (folder). Dropping there moves the node to become a child of that folder.

```tsx
import { useState } from "react";
import { Tree } from "@powerduck/tree/react";
import type { TreeNode } from "@powerduck/tree/core";

function MoveableTree({ initialNodes }) {
  const [nodes, setNodes] = useState(initialNodes);

  const handleMove = (newNodes: TreeNode[], movedNode, targetParentId) => {
    console.log(`Moved "${movedNode.name}" into folder "${targetParentId}"`);
    setNodes(newNodes);
  };

  return (
    <Tree
      nodes={nodes}
      draggable
      onReorder={(result) => setNodes(result.nodes)}
      onMove={handleMove}
    />
  );
}
```

Drop zones on a branch node:
- **Top 25%** — insert before (reorder)
- **Middle 50%** — move into this folder (cross-level)
- **Bottom 25%** — insert after (reorder)

Circular references are automatically prevented: a node cannot be dropped into its own descendant.

### Control which nodes can be dragged

```tsx
<Tree
  nodes={nodes}
  draggable
  canDrag={(node) => node.metadata?.type !== "folder"}
  onReorder={handleReorder}
/>
```

### Control where nodes can be dropped

```tsx
<Tree
  nodes={nodes}
  draggable
  canDrop={(dragged, target, position) => {
    /* position is "before" | "after" | "child" */
    return position !== "child" || target.metadata?.type === "folder";
  }}
  onReorder={handleReorder}
  onMove={(nodes) => setNodes(nodes)}
/>
```

## Imperative Handle

Access tree methods via `ref`:

```tsx
import { useRef } from "react";
import { Tree } from "@powerduck/tree/react";
import type { TreeHandle } from "@powerduck/tree/react";

function TreeWithLocate() {
  const treeRef = useRef<TreeHandle>(null);

  const locateByOperationId = (operationId: string) => {
    const found = treeRef.current?.locateNode((node) =>
      node.metadata?.operationId === operationId
    );
    /* found is the matched TreeNode, or undefined if not found */
  };

  return (
    <>
      <button onClick={() => locateByOperationId("getPet")}>Locate getPet</button>
      <Tree ref={treeRef} nodes={nodes} />
    </>
  );
}
```

### Handle methods

| Method | Description |
| --- | --- |
| `expandAll()` | Expand all nodes |
| `collapseAll()` | Collapse all nodes |
| `expandToDepth(depth)` | Expand nodes to a specific depth |
| `getExpandedIds()` | Get currently expanded node IDs |
| `getSelectedNode()` | Get the currently selected node |
| `scrollToNode(id)` | Scroll a node into view by ID |
| `locateNode(predicate)` | Find a node by predicate, expand ancestors, select, and scroll into view |

## Context Menu

Enable per-node actions via right-click or the more (…) button that appears on row hover. Define menu items with the `contextMenuItems` prop.

```tsx
import { LuCopy, LuTrash2 } from "react-icons/lu";
import { Tree } from "@powerduck/tree/react";
import type { ContextMenuItem } from "@powerduck/tree/react";

function ApiTree({ nodes }) {
  const buildMenu = (node): ContextMenuItem[] => [
    {
      label: "Copy operationId",
      icon: <LuCopy size={14} />,
      onClick: (n) => navigator.clipboard.writeText(n.metadata?.operationId ?? ""),
    },
    { separator: true, label: "", onClick: () => undefined },
    {
      label: "Delete",
      icon: <LuTrash2 size={14} />,
      danger: true,
      onClick: (n) => console.log("Delete", n.id),
    },
  ];

  return <Tree nodes={nodes} contextMenuItems={buildMenu} />;
}
```

### ContextMenuItem properties

| Property | Type | Description |
| --- | --- | --- |
| `label` | `string` | Display text |
| `icon` | `ReactNode` | Optional icon before label |
| `onClick` | `(node) => void` | Click handler |
| `disabled` | `boolean` | Disable the item |
| `danger` | `boolean` | Red text for destructive actions |
| `separator` | `boolean` | Render a horizontal line above this item |

## JSON Patch & conf-patch Integration

When nodes carry a `jsonPath` in their metadata, the tree emits RFC 6902 JSON Patch operations via the `onPatch` callback. Apply these to the original document with [`@powerduck/conf-patch`](https://www.npmjs.com/package/@powerduck/conf-patch).

```tsx
import { patchContent } from "@powerduck/conf-patch/core";
import { Tree } from "@powerduck/tree/react";
import type { JsonPatchOp } from "@powerduck/tree/react";

function EditableTree({ initialDocument, format }) {
  const [document, setDocument] = useState(initialDocument);

  const handlePatch = (ops: JsonPatchOp[]) => {
    /* Apply patch operations to the document string. */
    const updated = patchContent(document, ops, format);
    setDocument(updated);
  };

  return (
    <Tree
      nodes={nodes}
      draggable
      onReorder={(result) => setNodes(result.nodes)}
      onPatch={handlePatch}
    />
  );
}
```

Patch operations are currently emitted for **reorder** (array `move`). Nodes must have `metadata.jsonPath` as an array of path segments for patch generation.

## API Reference

### Core

#### `TreeNode<TMetadata>`

```ts
interface TreeNode<TMetadata = unknown> {
  id: string;
  name: string;
  order?: number;
  children?: TreeNode<TMetadata>[];
  metadata?: TMetadata;
}
```

#### Tree Utilities

| Function | Description |
|----------|-------------|
| `findNode(nodes, id)` | Find a node by ID |
| `findPath(nodes, id)` | Find full path from root to node |
| `getLeaves(nodes)` | Get all leaf nodes |
| `countNodes(nodes)` | Count all nodes |
| `getMaxDepth(nodes)` | Get maximum tree depth |
| `sortNodes(nodes)` | Sort by order, then name |
| `sortTree(nodes)` | Recursively sort all levels |
| `filterTree(nodes, { query })` | Filter by search query |
| `getExpandableIds(nodes, { maxDepth })` | Get IDs to expand |
| `getBranchIds(nodes)` | Get all branch node IDs |
| `flattenTree(nodes)` | Flatten to pre-order list with depth |
| `updateNode(nodes, id, updater)` | Immutable node update |
| `removeNode(nodes, id)` | Immutable node removal |
| `insertChild(nodes, parentId, child)` | Immutable child insertion |

### OpenAPI Adapter

#### `buildOpenApiTree(document, options?)`

```ts
interface OpenApiTreeOptions {
  showInternal?: boolean;      // default false
  showComponents?: boolean;    // default true
  showWebhooks?: boolean;      // default true
  defaultExpandDepth?: number; // default 2
}
```

**Navigation strategy (priority order):**
1. OAS 3.2 native `parent`-nested tags
2. `x-tagGroups` (with powerduck nested `groups` extension)
3. Flat tag grouping (fallback)

**Supported extensions:**
- `x-order` — sort tags and operations
- `x-displayName` — human-friendly tag label
- `x-internal` / `x-scalar-ignore` — hide operations
- `x-tagGroups` — group tags into navigation folders

### JSON Schema Adapter

#### `buildSchemaTree(schema, options?)`

```ts
interface SchemaTreeOptions {
  maxDepth?: number;          // default 8
  showDeprecated?: boolean;   // default true
  expandCombinators?: boolean; // default true
  showArrayItems?: boolean;   // default true
}
```

#### `findSchemaNodeByPath(root, jsonPath)`

Find a schema tree node by its JSON path.

#### `formatSchemaType(metadata)`

Format a schema type label for display (e.g. `"string (email)"`, `"string | null"`).

### Doc Adapter

#### `buildDocTree(document, options?)`

```ts
interface DocTreeOptions {
  showInternal?: boolean;         // default false
  showComponents?: boolean;       // default true
  showWebhooks?: boolean;         // default true
  expandOperationDetails?: boolean; // default true
}
```

Builds a Stripe-style documentation tree where each operation expands to show parameters, request body, and responses.

### React Component

#### `<Tree />` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `nodes` | `TreeNode[]` | required | Root nodes to render |
| `onSelect` | `(node) => void` | — | Called when a leaf node is clicked |
| `onExpandedChange` | `(ids) => void` | — | Called when expanded nodes change |
| `defaultExpandedIds` | `string[]` | — | Initially expanded node IDs |
| `defaultExpandDepth` | `number` | `1` | Default expansion depth |
| `searchable` | `boolean` | `false` | Show search input |
| `searchPlaceholder` | `string` | `"Search..."` | Search input placeholder |
| `searchRowExtra` | `ReactNode` | — | Extra content inside the search row (between input and action buttons) |
| `showExpandAll` | `boolean` | `false` | Show expand/collapse all toggle button (single toggle, Material Design unfold icons) |
| `showRefresh` | `boolean` | `false` | Show refresh button |
| `onRefresh` | `() => void` | — | Called when refresh button is clicked |
| `toolbar` | `ReactNode` | — | Custom toolbar content rendered above the tree |
| `renderNode` | `(ctx, defaultNode) => ReactNode` | — | Fully custom node renderer |
| `renderIcon` | `(ctx) => ReactNode` | — | Custom icon renderer |
| `renderLabel` | `(ctx) => ReactNode` | — | Custom label renderer |
| `renderSuffix` | `(ctx) => ReactNode` | — | Custom suffix (badges, count, etc.) |
| `className` | `string` | — | Additional CSS class |
| `style` | `CSSProperties` | — | Inline styles |
| `size` | `"xs" \| "sm" \| "md"` | `"sm"` | Size variant |
| `showIndentGuides` | `boolean` | `true` | Show indent guide lines |
| `maxHeight` | `number \| string` | — | Max height before scrolling |
| `draggable` | `boolean` | `false` | Enable drag and drop reordering |
| `dragGroupKey` | `string` | — | Metadata key for drag isolation (nodes with different group values cannot intermix) |
| `onReorder` | `(result: ReorderResult) => void` | — | Called when a node is reordered within the same parent |
| `onMove` | `(nodes, movedNode, targetParentId) => void` | — | Called when a node is moved to a different parent |
| `canDrag` | `(node) => boolean` | — | Predicate to control which nodes can be dragged |
| `canDrop` | `(dragged, target, position) => boolean` | — | Predicate to control allowed drop targets |
| `contextMenuItems` | `(node) => ContextMenuItem[]` | — | Right-click / more-button context menu items |
| `onPatch` | `(ops, context) => void` | — | Called with RFC 6902 JSON Patch ops on reorder (for conf-patch integration) |

#### Tree Handle (via ref)

```ts
interface TreeHandle {
  expandAll: () => void;
  collapseAll: () => void;
  expandToDepth: (depth: number) => void;
  getExpandedIds: () => string[];
  getSelectedNode: () => TreeNode | undefined;
  scrollToNode: (id: string) => void;
}
```

## Architecture

```
@powerduck/tree
├── core/           Generic tree types and utilities (zero dependencies)
├── adapters/       Data source adapters
│   ├── openapi.ts    OpenAPI document → navigation tree
│   ├── json-schema.ts JSON Schema → deep exploration tree
│   └── doc.ts        OpenAPI → Stripe-style documentation tree
├── react/          React Tree component
│   ├── Tree.tsx       Main component
│   ├── Tree.module.css Styles (CSS variables)
│   ├── hooks/         useTreeSearch, useTreeExpansion
│   └── libs/          Types and utilities
└── index.ts          Main entry (core + adapters)
```

### Entry Points

| Import | Description |
|--------|-------------|
| `@powerduck/tree` | Core types, utilities, and all adapters |
| `@powerduck/tree/react` | React Tree component and hooks |
| `@powerduck/tree/adapters` | OpenAPI, JSON Schema, and Doc adapters |
| `@powerduck/tree/core` | Core types and utilities only |

## Theming

The component uses CSS variables that align with powerduck's `tokens.css`. Override them in your application:

```css
:root {
  --color-surface: #ffffff;
  --color-text-primary: #26282b;
  --color-accent: #f28c28;
  /* ... see tokens.css for full list */
}

:root[data-theme="dark"] {
  --color-surface: #1f2125;
  --color-text-primary: #edf0f3;
  /* ... */
}
```

## OAS 3.2 Nested Tags

OAS 3.2 supports native tag nesting via the `parent` field:

```yaml
tags:
  - name: Account
  - name: Users
    parent: Account
  - name: Admin
    parent: Account
  - name: Roles
    parent: Admin
```

The adapter automatically detects and resolves nested tags, with circular reference detection and unknown parent warnings.

## x-tagGroups with Nested Folders

The powerduck extension supports nested groups via the `groups` field:

```yaml
x-tagGroups:
  - name: Account
    tags: [Users]
    groups:
      - name: Admin
        tags: [Roles, Permissions]
```

Redoc and Scalar safely ignore the unknown `groups` field.

## Development

```bash
npm install
npm run build      # Build with tsup
npm run test       # Run tests with vitest
npm run typecheck  # Type check with tsc
```

## Links

- [Official Website](https://www.powerduck.com/opensource/tree.html)
- [Documentation](https://www.powerduck.com/docs/tree/introduction/)
- [Live Demo](https://www.powerduck.com/demo/tree)
- [GitHub](https://github.com/powerducklab/tree)
- [npm](https://www.npmjs.com/package/@powerduck/tree)

## License

MIT


## Quality and interaction updates

The tree inherits `powerduck-react` color tokens without overwriting the host's
palette. Standalone instances can use `theme="light"` or `theme="dark"`; inherited
`data-theme` also supplies matching fallback colors. Menus carry the same tokens
when portalled outside the tree. Search controls, row selection, focus rings,
buttons, and hover states use the shared palette and radius tokens. Scrollbar
thumbs appear on hover or keyboard interaction, with visible touch affordances.

Keyboard navigation uses a single row tab stop. Up/Down, Home/End, and Left/Right
navigate visible rows and branches. Typing a label prefix finds a visible row.
Enter or Space activates the row. Shift+F10 opens the row's context menu; menu
arrows skip disabled actions, and Escape closes the menu and returns focus.
Context-menu separators now appear above their actions rather than replacing them.

For more than 500 visible rows, fixed-height trees automatically render a window
around the viewport. Set `virtualized={false}` to opt out or `virtualized={true}`
to enable it for smaller trees. Document variants and custom `renderNode` content
retain full rendering because their heights may vary. Give the tree a bounded
parent height or `maxHeight` to benefit from windowing. Row sizing follows `size`;
custom variable-height rows should disable windowing. Imperative node location
reveals ancestors, clears search, and scrolls after the new rows are committed.

Core traversal, transformation, and nested-tag assembly avoid recursive stack
growth. Object-reference cycles terminate safely; transforming malformed graphs
omits cyclic edges. IDs must still be unique, and caller-owned inputs should be
treated as immutable. Pass a new tree reference when changing data. Expansion
callbacks are notifications for local state, not a controlled expansion prop.

Schema generation accepts `maxNodes` (default 10,000; bounded to 1–100,000).
`maxDepth` defaults to 8 and is bounded to 0–128; non-finite limits use the default.
Generation warns when the node budget is exhausted or an object cycle is found.
Literal dots, brackets, and backslashes in schema path segments are escaped in
node IDs; use `metadata.jsonPath` or `findSchemaNodeByPath` for exact lookup.
Nested documentation tag groups are limited to 128 levels and 10,000 generated
groups with a warning.

JSON Patch reorder notifications are emitted only for source arrays whose
metadata paths match the rendered sibling order. Object-property paths and
sorted/filtered views do not receive misleading array move patches. Dragging
rechecks group and drop constraints before committing a move. Native drag and
drop is a desktop interaction; touch reordering is not implemented.

### Local verification

```sh
npm run check       # Source language, package and preview types, tests, build
npm run preview     # Interactive examples at http://127.0.0.1:4174
npm run benchmark   # Build and compare the old/new sorting comparator
```

The benchmark reports medians from seven runs over a deterministic shuffled input.
It measures sorting, traversal, and filtering only, not end-to-end browser latency.
See [QUALITY.md](./QUALITY.md) for findings, evidence, and remaining limitations.
