import { describe, expect, it } from "vitest";

import { buildOpenApiTree } from "../../src/adapters/openapi";
import { findNode } from "../../src/core/tree-utils";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const basicDocument = {
  openapi: "3.1.0",
  info: { title: "Test API", version: "1.0.0" },
  tags: [
    { name: "Users", description: "User operations" },
    { name: "Orders", description: "Order operations" },
  ],
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        tags: ["Users"],
      },
      post: {
        operationId: "createUser",
        summary: "Create user",
        tags: ["Users"],
      },
    },
    "/users/{id}": {
      get: {
        operationId: "getUser",
        summary: "Get user",
        tags: ["Users"],
      },
    },
    "/orders": {
      get: {
        operationId: "listOrders",
        summary: "List orders",
        tags: ["Orders"],
      },
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Basic building                                                             */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - basic", () => {
  it("builds a tree from a valid document", () => {
    const result = buildOpenApiTree(basicDocument);

    expect(result.root.id).toBe("root");
    expect(result.root.children?.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("groups operations by tag", () => {
    const result = buildOpenApiTree(basicDocument);
    const usersTag = result.root.children?.find((n) => n.name === "Users");

    expect(usersTag).toBeDefined();
    expect(usersTag?.children?.length).toBe(3);
  });

  it("includes method in operation metadata", () => {
    const result = buildOpenApiTree(basicDocument);
    const operation = findNode(result.root.children ?? [], "op:Users:listUsers");

    expect(operation?.metadata?.method).toBe("get");
    expect(operation?.metadata?.path).toBe("/users");
  });

  it("handles null document gracefully", () => {
    const result = buildOpenApiTree(null);

    expect(result.root.children).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles undefined document gracefully", () => {
    const result = buildOpenApiTree(undefined);

    expect(result.root.children).toEqual([]);
  });

  it("handles document with no paths", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Empty", version: "1.0.0" },
    });

    expect(result.root.children).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Untagged operations                                                        */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - untagged", () => {
  it("places untagged operations in Other group", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/health": {
          get: { operationId: "healthCheck", summary: "Health check" },
        },
      },
    });

    const other = result.root.children?.find((n) => n.name === "Other");
    expect(other).toBeDefined();
    expect(other?.children?.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* x-order                                                                     */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - x-order", () => {
  it("sorts tags by x-order", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [
        { name: "Zebra", "x-order": 2 },
        { name: "Apple", "x-order": 1 },
      ],
      paths: {
        "/z": { get: { tags: ["Zebra"], summary: "Z" } },
        "/a": { get: { tags: ["Apple"], summary: "A" } },
      },
    });

    expect(result.root.children?.[0]?.name).toBe("Apple");
    expect(result.root.children?.[1]?.name).toBe("Zebra");
  });

  it("sorts operations by x-order within a tag", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/a": {
          get: { tags: ["Test"], summary: "A", "x-order": 2 },
          post: { tags: ["Test"], summary: "B", "x-order": 1 },
        },
      },
    });

    const tag = result.root.children?.[0];
    expect(tag?.children?.[0]?.name).toBe("B");
    expect(tag?.children?.[1]?.name).toBe("A");
  });
});

/* -------------------------------------------------------------------------- */
/* x-displayName                                                               */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - x-displayName", () => {
  it("uses x-displayName for tag label", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [{ name: "usr", "x-displayName": "User Management" }],
      paths: {
        "/users": { get: { tags: ["usr"], summary: "List" } },
      },
    });

    expect(result.root.children?.[0]?.name).toBe("User Management");
  });
});

/* -------------------------------------------------------------------------- */
/* x-internal / x-scalar-ignore                                               */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - internal", () => {
  it("hides x-internal operations by default", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/public": { get: { tags: ["Test"], summary: "Public" } },
        "/internal": {
          get: { tags: ["Test"], summary: "Internal", "x-internal": true },
        },
      },
    });

    const tag = result.root.children?.[0];
    expect(tag?.children?.length).toBe(1);
    expect(tag?.children?.[0]?.name).toBe("Public");
  });

  it("shows x-internal operations when showInternal is true", () => {
    const result = buildOpenApiTree(
      {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/public": { get: { tags: ["Test"], summary: "Public" } },
          "/internal": {
            get: { tags: ["Test"], summary: "Internal", "x-internal": true },
          },
        },
      },
      { showInternal: true },
    );

    const tag = result.root.children?.[0];
    expect(tag?.children?.length).toBe(2);
  });

  it("hides x-scalar-ignore operations", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/visible": { get: { tags: ["Test"], summary: "Visible" } },
        "/hidden": {
          get: { tags: ["Test"], summary: "Hidden", "x-scalar-ignore": true },
        },
      },
    });

    const tag = result.root.children?.[0];
    expect(tag?.children?.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* x-tagGroups                                                                 */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - x-tagGroups", () => {
  it("groups tags into x-tagGroups", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      "x-tagGroups": [
        { name: "Account", tags: ["Users", "Auth"] },
        { name: "Billing", tags: ["Orders", "Payments"] },
      ],
      paths: {
        "/users": { get: { tags: ["Users"], summary: "List users" } },
        "/orders": { get: { tags: ["Orders"], summary: "List orders" } },
      },
    });

    expect(result.root.children?.[0]?.name).toBe("Account");
    expect(result.root.children?.[0]?.children?.[0]?.name).toBe("Users");
    expect(result.root.children?.[1]?.name).toBe("Billing");
  });

  it("supports nested groups via groups field", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      "x-tagGroups": [
        {
          name: "Account",
          tags: ["Users"],
          groups: [{ name: "Admin", tags: ["Roles"] }],
        },
      ],
      paths: {
        "/users": { get: { tags: ["Users"], summary: "List" } },
        "/roles": { get: { tags: ["Roles"], summary: "Roles" } },
      },
    });

    const account = result.root.children?.[0];
    expect(account?.name).toBe("Account");
    expect(account?.children?.length).toBe(2);

    const admin = account?.children?.find((c) => c.name === "Admin");
    expect(admin).toBeDefined();
    expect(admin?.children?.[0]?.name).toBe("Roles");
  });
});

/* -------------------------------------------------------------------------- */
/* OAS 3.2 native parent nesting                                              */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - OAS 3.2 parent nesting", () => {
  it("builds nested tree from OAS 3.2 parent tags", () => {
    const result = buildOpenApiTree({
      openapi: "3.2.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [
        { name: "Account" },
        { name: "Users", parent: "Account" },
        { name: "Admin", parent: "Account" },
        { name: "Roles", parent: "Admin" },
      ],
      paths: {
        "/users": { get: { tags: ["Users"], summary: "List users" } },
        "/roles": { get: { tags: ["Roles"], summary: "List roles" } },
      },
    });

    const account = result.root.children?.find((n) => n.name === "Account");
    expect(account).toBeDefined();

    const users = account?.children?.find((n) => n.name === "Users");
    expect(users).toBeDefined();
    expect(users?.children?.[0]?.name).toBe("List users");

    const admin = account?.children?.find((n) => n.name === "Admin");
    expect(admin).toBeDefined();

    const roles = admin?.children?.find((n) => n.name === "Roles");
    expect(roles).toBeDefined();
    expect(roles?.children?.[0]?.name).toBe("List roles");
  });

  it("detects circular parent references and breaks cycle", () => {
    const result = buildOpenApiTree({
      openapi: "3.2.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [
        { name: "A", parent: "B" },
        { name: "B", parent: "A" },
      ],
      paths: {
        "/a": { get: { tags: ["A"], summary: "A" } },
      },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Circular");
  });

  it("warns on unknown parent", () => {
    const result = buildOpenApiTree({
      openapi: "3.2.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [{ name: "Child", parent: "NonExistent" }],
      paths: {
        "/c": { get: { tags: ["Child"], summary: "C" } },
      },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("unknown parent");
  });
});

/* -------------------------------------------------------------------------- */
/* Deprecated operations                                                      */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - deprecated", () => {
  it("marks deprecated operations in metadata", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/old": {
          get: { tags: ["Test"], summary: "Old", deprecated: true },
        },
      },
    });

    const operation = result.root.children?.[0]?.children?.[0];
    expect(operation?.metadata?.deprecated).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Components section                                                         */
/* -------------------------------------------------------------------------- */

describe("buildOpenApiTree - components", () => {
  it("includes components section by default", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      components: {
        schemas: {
          User: { type: "object" },
          Order: { type: "object" },
        },
      },
    });

    const components = result.root.children?.find(
      (n) => n.name === "Components",
    );
    expect(components).toBeDefined();
    expect(components?.children?.length).toBe(2);
  });

  it("hides components when showComponents is false", () => {
    const result = buildOpenApiTree(
      {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        components: { schemas: { User: { type: "object" } } },
      },
      { showComponents: false },
    );

    expect(result.root.children?.find((n) => n.name === "Components")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Edge cases                                                                  */
/* -------------------------------------------------------------------------- */

describe("openapi adapter edge cases", () => {
  it("handles document with no paths and no tags", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Empty", version: "1.0.0" },
    });

    expect(result.root.children).toHaveLength(0);
  });

  it("handles document with paths but no tags (flat fallback)", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "No Tags", version: "1.0.0" },
      paths: {
        "/users": { get: { operationId: "listUsers" } },
        "/orders": { post: { operationId: "createOrder" } },
      },
    });

    /* Without tags, operations should appear directly under root (flat). */
    expect(result.root.children?.length).toBeGreaterThan(0);
  });

  it("handles x-tagGroups with unknown tag names gracefully", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [{ name: "Users" }],
      "x-tagGroups": [{ name: "Group", tags: ["Users", "NonExistent"] }],
      paths: {
        "/users": { get: { operationId: "listUsers", tags: ["Users"] } },
      },
    });

    /* Should not throw, unknown tags are ignored. */
    expect(result.root.children?.length).toBeGreaterThan(0);
  });

  it("handles empty x-tagGroups array", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0.0" },
      tags: [{ name: "Users" }],
      "x-tagGroups": [],
      paths: {
        "/users": { get: { operationId: "listUsers", tags: ["Users"] } },
      },
    });

    expect(result.root.children?.length).toBeGreaterThan(0);
  });

  it("handles OAS 3.2 parent nesting with cycle detection", () => {
    const result = buildOpenApiTree({
      openapi: "3.2.0",
      info: { title: "Cycle", version: "1.0.0" },
      tags: [
        { name: "A", "x-tag-extension": { parent: "B" } },
        { name: "B", "x-tag-extension": { parent: "A" } },
      ],
      paths: {
        "/a": { get: { operationId: "aOp", tags: ["A"] } },
      },
    });

    /* Should not infinite loop or throw. */
    expect(result.root.children).toBeDefined();
  });

  it("respects x-order for tag sorting", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Order", version: "1.0.0" },
      tags: [
        { name: "Zebra", "x-order": 1 },
        { name: "Apple", "x-order": 0 },
      ],
      paths: {
        "/z": { get: { operationId: "zOp", tags: ["Zebra"] } },
        "/a": { get: { operationId: "aOp", tags: ["Apple"] } },
      },
    });

    const tagNames = result.root.children?.map((n) => n.name);
    expect(tagNames?.[0]).toBe("Apple");
    expect(tagNames?.[1]).toBe("Zebra");
  });

  it("handles deprecated operations without crashing", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "Dep", version: "1.0.0" },
      paths: {
        "/old": { get: { operationId: "oldOp", deprecated: true } },
        "/new": { get: { operationId: "newOp" } },
      },
    });

    expect(result.root).toBeDefined();
    expect(result.root.children).toBeDefined();
  });

  it("handles operations with no operationId", () => {
    const result = buildOpenApiTree({
      openapi: "3.1.0",
      info: { title: "No OpId", version: "1.0.0" },
      paths: {
        "/test": { get: { summary: "Test endpoint" } },
      },
    });

    expect(result.root.children?.length).toBeGreaterThan(0);
  });
});
