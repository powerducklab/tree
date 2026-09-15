/**
 * Custom Data Tree Example
 *
 * Shows how to use @powerduck/tree with a custom data source that is not
 * OpenAPI or JSON Schema. The generic TreeNode<TMetadata> type allows any
 * metadata shape.
 */

import { Tree } from "@powerduck/tree/react";
import type { TreeNode } from "@powerduck/tree/core";

interface FileNodeMetadata {
  type: "folder" | "file";
  size?: number;
  extension?: string;
}

type FileTreeNode = TreeNode<FileNodeMetadata>;

const fileSystem: FileTreeNode[] = [
  {
    id: "src",
    name: "src",
    metadata: { type: "folder" },
    children: [
      {
        id: "src/components",
        name: "components",
        metadata: { type: "folder" },
        children: [
          {
            id: "src/components/Button.tsx",
            name: "Button.tsx",
            metadata: { type: "file", extension: "tsx", size: 2048 },
          },
          {
            id: "src/components/Input.tsx",
            name: "Input.tsx",
            metadata: { type: "file", extension: "tsx", size: 1536 },
          },
        ],
      },
      {
        id: "src/index.ts",
        name: "index.ts",
        metadata: { type: "file", extension: "ts", size: 512 },
      },
    ],
  },
  {
    id: "package.json",
    name: "package.json",
    metadata: { type: "file", extension: "json", size: 1024 },
  },
  {
    id: "README.md",
    name: "README.md",
    metadata: { type: "file", extension: "md", size: 4096 },
  },
];

export function CustomDataTreeExample() {
  return (
    <div style={{ width: 320, height: 400, border: "1px solid #e0e4e8" }}>
      <Tree
        nodes={fileSystem}
        searchable
        defaultExpandDepth={1}
        searchPlaceholder="Search files..."
        renderIcon={({ node }) => {
          const isFolder = node.metadata?.type === "folder";
          return (
            <span
              style={{
                fontSize: 12,
                marginRight: 4,
                color: isFolder ? "#d98a22" : "#6f747c",
              }}
            >
              {isFolder ? "\u{1F4C1}" : "\u{1F4C4}"}
            </span>
          );
        }}
        renderSuffix={({ node }) => {
          const size = node.metadata?.size;
          if (!size) return null;
          return (
            <span style={{ fontSize: 10, color: "#989da5" }}>
              {size < 1024 ? `${size}B` : `${(size / 1024).toFixed(1)}KB`}
            </span>
          );
        }}
        onSelect={(node) => console.log("Selected:", node.name)}
      />
    </div>
  );
}
