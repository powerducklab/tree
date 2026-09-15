/**
 * Schema Navigation Tree Example
 *
 * Shows how to use @powerduck/tree alongside @powerduck/schema-editor for
 * schema-driven navigation. Clicking a tree node jumps to the corresponding
 * line in the editor.
 *
 * Features:
 * - Deep expansion of nested object properties
 * - Array items, oneOf/anyOf/allOf combinators
 * - Required/deprecated markers, type labels
 * - jsonPath metadata for editor line jumping
 */

import { useMemo, useRef } from "react";

import { buildSchemaTree, findSchemaNodeByPath } from "@powerduck/tree";
import { Tree } from "@powerduck/tree/react";
import type { SchemaTreeNode } from "@powerduck/tree/adapters";

/* In a real app, import from @powerduck/schema-editor */
const sampleSchema = {
  type: "object",
  required: ["openapi", "info"],
  properties: {
    openapi: { type: "string", enum: ["3.2.0"] },
    info: {
      type: "object",
      required: ["title", "version"],
      properties: {
        title: { type: "string" },
        version: { type: "string" },
        description: { type: "string" },
        contact: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    paths: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          get: { type: "object" },
          post: { type: "object" },
        },
      },
    },
    components: {
      type: "object",
      properties: {
        schemas: {
          type: "object",
          additionalProperties: { type: "object" },
        },
      },
    },
  },
};

export function SchemaNavigationTreeExample() {
  const { root } = useMemo(() => buildSchemaTree(sampleSchema), []);
  /* In a real app, this would be the schema-editor ref */
  const editorRef = useRef<unknown>(null);

  const handleSelect = (node: SchemaTreeNode) => {
    const jsonPath = node.metadata?.jsonPath;

    if (!jsonPath || !editorRef.current) {
      return;
    }

    /* In a real app, call editorRef.current.revealLine(jsonPath) */
    console.log("Jump to jsonPath:", jsonPath);
  };

  return (
    <div style={{ width: 320, height: 480, border: "1px solid #e0e4e8" }}>
      <Tree
        nodes={root.children ?? []}
        onSelect={handleSelect}
        searchable
        defaultExpandDepth={3}
        searchPlaceholder="Search schema..."
        renderSuffix={({ node }) => {
          const type = node.metadata?.type;
          if (!type) return null;
          return (
            <span
              style={{
                fontSize: 10,
                color: "#989da5",
                fontFamily: "monospace",
              }}
            >
              {Array.isArray(type) ? type.join("|") : type}
            </span>
          );
        }}
      />
    </div>
  );
}

/* Helper: find a schema node by jsonPath (exported for external use) */
export { findSchemaNodeByPath };
