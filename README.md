# @powerduck/tree

Extensible tree component for API navigation, schema exploration, and documentation. Built on a generic core with adapters for OpenAPI, JSON Schema, and custom data sources.

## Features

- **Generic core** — `TreeNode<TMetadata>` works with any data source
- **OpenAPI adapter** — tag-based navigation with OAS 3.2 native parent nesting, `x-tagGroups`, `x-order`, `x-displayName`, `x-internal`
- **JSON Schema adapter** — deep expansion of nested properties, arrays, combinators with `jsonPath` metadata for editor line jumping
- **Doc adapter** — Stripe-style documentation tree with parameters, request body, and responses
- **React component** — search, expand/collapse, keyboard navigation, method badges, custom render props
- **Drag and drop reordering** — reorder nodes within the same parent with visual drop indicators, `canDrag`/`canDrop` predicates, and `onReorder` callback
- **CSS variable theming** — compatible with powerduck `tokens.css`, light/dark mode
- **Zero hard dependencies** — core and adapters have no runtime dependencies; React layer requires `react` and `react-dom`

## Installation

```bash
npm install @powerduck/tree
```

### Peer Dependencies

```bash
npm install react react-dom
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

## Drag and Drop Reordering

Enable drag and drop with the `draggable` prop. Nodes can be reordered within the same parent by dragging the grip handle.

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
    /* Only allow dropping after nodes, not before */
    return position === "after";
  }}
  onReorder={handleReorder}
/>
```

The `onReorder` callback receives a `ReorderResult` containing the new tree, the moved node, parent ID, and from/to indices. Use `reorderNode` and `moveNode` from the core for programmatic reordering.

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
| `showExpandAll` | `boolean` | `false` | Show expand/collapse all buttons |
| `toolbar` | `ReactNode` | — | Custom toolbar content |
| `renderNode` | `(ctx, defaultNode) => ReactNode` | — | Fully custom node renderer |
| `renderIcon` | `(ctx) => ReactNode` | — | Custom icon renderer |
| `renderLabel` | `(ctx) => ReactNode` | — | Custom label renderer |
| `renderSuffix` | `(ctx) => ReactNode` | — | Custom suffix (badges, etc.) |
| `className` | `string` | — | Additional CSS class |
| `style` | `CSSProperties` | — | Inline styles |
| `size` | `"xs" \| "sm" \| "md"` | `"sm"` | Size variant |
| `showIndentGuides` | `boolean` | `true` | Show indent guide lines |
| `maxHeight` | `number \| string` | — | Max height before scrolling |
| `draggable` | `boolean` | `false` | Enable drag and drop reordering |
| `onReorder` | `(result: ReorderResult) => void` | — | Called when a node is reordered |
| `canDrag` | `(node) => boolean` | — | Predicate to control which nodes can be dragged |
| `canDrop` | `(dragged, target, position) => boolean` | — | Predicate to control allowed drop targets |

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

## License

MIT
