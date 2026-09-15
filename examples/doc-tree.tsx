/**
 * API Documentation Tree Example
 *
 * Shows how to use @powerduck/tree to build a Stripe-style documentation
 * navigation tree. Each operation expands to show parameters, request body,
 * and responses.
 */

import { useMemo } from "react";

import { buildDocTree } from "@powerduck/tree";
import { Tree } from "@powerduck/tree/react";
import type { DocTreeNode } from "@powerduck/tree/adapters";

const sampleDocument = {
  openapi: "3.1.0",
  info: { title: "Payment API", version: "2.0.0" },
  tags: [
    { name: "Charges", description: "Charge operations" },
    { name: "Refunds", description: "Refund operations" },
  ],
  paths: {
    "/v1/charges": {
      get: {
        operationId: "listCharges",
        summary: "List all charges",
        description: "Returns a list of charges.",
        tags: ["Charges"],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "starting_after", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Successful response" },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        operationId: "createCharge",
        summary: "Create a charge",
        tags: ["Charges"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "201": { description: "Charge created" },
        },
      },
    },
    "/v1/charges/{id}": {
      get: {
        operationId: "getCharge",
        summary: "Retrieve a charge",
        tags: ["Charges"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Successful response" },
          "404": { description: "Not found" },
        },
      },
    },
    "/v1/refunds": {
      post: {
        operationId: "createRefund",
        summary: "Create a refund",
        tags: ["Refunds"],
        responses: {
          "201": { description: "Refund created" },
        },
      },
    },
  },
};

export function DocTreeExample() {
  const { root } = useMemo(() => buildDocTree(sampleDocument), []);

  const handleSelect = (node: DocTreeNode) => {
    if (node.metadata?.kind === "operation") {
      console.log(`Navigate to: ${node.metadata.operationId ?? node.name}`);
    }
  };

  return (
    <div style={{ width: 280, height: 560, border: "1px solid #e0e4e8" }}>
      <Tree
        nodes={root.children ?? []}
        onSelect={handleSelect}
        searchable
        defaultExpandDepth={2}
        searchPlaceholder="Search docs..."
      />
    </div>
  );
}
