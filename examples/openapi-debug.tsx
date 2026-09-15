/**
 * API Debug Tree Example
 *
 * Shows how to use @powerduck/tree to build an API navigation tree for a
 * debug/request client, similar to the MenuTree component in powerduck-react.
 *
 * Features:
 * - Tag-based grouping with x-tagGroups support
 * - OAS 3.2 native parent-nested tags
 * - x-order sorting, x-displayName, x-internal filtering
 * - Search, expand/collapse all, method badges
 */

import { useMemo } from "react";

import { buildOpenApiTree } from "@powerduck/tree";
import { Tree } from "@powerduck/tree/react";
import type { OpenApiTreeNode } from "@powerduck/tree/adapters";

const sampleDocument = {
  openapi: "3.1.0",
  info: { title: "Pet Store API", version: "1.0.0" },
  tags: [
    { name: "Pets", description: "Pet operations" },
    { name: "Store", description: "Store operations" },
    { name: "User", description: "User operations" },
  ],
  "x-tagGroups": [
    { name: "Pet Management", tags: ["Pets"] },
    { name: "Store & Users", tags: ["Store", "User"] },
  ],
  paths: {
    "/pets": {
      get: { operationId: "listPets", summary: "List all pets", tags: ["Pets"] },
      post: { operationId: "createPet", summary: "Create a pet", tags: ["Pets"] },
    },
    "/pets/{id}": {
      get: { operationId: "getPet", summary: "Get a pet", tags: ["Pets"] },
      delete: {
        operationId: "deletePet",
        summary: "Delete a pet",
        tags: ["Pets"],
        deprecated: true,
      },
    },
    "/store/inventory": {
      get: {
        operationId: "getInventory",
        summary: "Get store inventory",
        tags: ["Store"],
      },
    },
    "/user": {
      post: { operationId: "createUser", summary: "Create user", tags: ["User"] },
    },
  },
};

export function ApiDebugTreeExample() {
  const { root } = useMemo(() => buildOpenApiTree(sampleDocument), []);

  const handleSelect = (node: OpenApiTreeNode) => {
    if (node.metadata?.method && node.metadata?.path) {
      console.log(`Selected: ${node.metadata.method.toUpperCase()} ${node.metadata.path}`);
    }
  };

  return (
    <div style={{ width: 320, height: 480, border: "1px solid #e0e4e8" }}>
      <Tree
        nodes={root.children ?? []}
        onSelect={handleSelect}
        searchable
        showExpandAll
        defaultExpandDepth={2}
        searchPlaceholder="Search APIs..."
      />
    </div>
  );
}
