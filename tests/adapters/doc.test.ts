import { describe, expect, it } from "vitest";

import { buildDocTree } from "../../src/adapters/doc";

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
      get: { operationId: "listUsers", summary: "List users", tags: ["Users"] },
      post: { operationId: "createUser", summary: "Create user", tags: ["Users"] },
    },
    "/orders": {
      get: { operationId: "listOrders", summary: "List orders", tags: ["Orders"] },
    },
  },
};

const tagGroupsDocument = {
  openapi: "3.1.0",
  info: { title: "Tag Groups API", version: "1.0.0" },
  tags: [
    { name: "Users" },
    { name: "Orders" },
    { name: "Products" },
    { name: "Inventory" },
  ],
  "x-tagGroups": [
    {
      name: "Customer Management",
      tags: ["Users", "Orders"],
    },
    {
      name: "Store Management",
      tags: ["Products", "Inventory"],
      groups: [
        {
          name: "Stock",
          tags: ["Inventory"],
        },
      ],
    },
  ],
  paths: {
    "/users": { get: { operationId: "listUsers", tags: ["Users"] } },
    "/orders": { get: { operationId: "listOrders", tags: ["Orders"] } },
    "/products": { get: { operationId: "listProducts", tags: ["Products"] } },
    "/inventory": { get: { operationId: "listInventory", tags: ["Inventory"] } },
  },
};

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("buildDocTree", () => {
  it("builds a documentation tree from a valid document", () => {
    const result = buildDocTree(basicDocument);

    expect(result.root.name).toBe("API Documentation");
    expect(result.root.children).toBeDefined();
    expect(result.root.children?.length).toBeGreaterThan(0);
  });

  it("handles null document gracefully", () => {
    const result = buildDocTree(null);

    expect(result.root.children).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles undefined document gracefully", () => {
    const result = buildDocTree(undefined);

    expect(result.root.children).toEqual([]);
  });

  it("handles document with no paths", () => {
    const result = buildDocTree({
      openapi: "3.1.0",
      info: { title: "Empty", version: "1.0.0" },
    });

    expect(result.root.children).toBeDefined();
  });

  it("groups operations by tag in flat mode", () => {
    const result = buildDocTree(basicDocument);
    const tagNames = result.root.children?.map((n) => n.name);

    expect(tagNames).toContain("Users");
    expect(tagNames).toContain("Orders");
  });

  it("operation nodes carry method and path metadata", () => {
    const result = buildDocTree(basicDocument);
    const usersTag = result.root.children?.find((n) => n.name === "Users");
    const operations = usersTag?.children ?? [];

    expect(operations.length).toBeGreaterThan(0);
    expect(operations[0]?.metadata?.method).toBeDefined();
    expect(operations[0]?.metadata?.path).toBeDefined();
  });
});

describe("buildDocTree with x-tagGroups", () => {
  it("builds multi-level navigation from x-tagGroups", () => {
    const result = buildDocTree(tagGroupsDocument);
    const groupNames = result.root.children?.map((n) => n.name);

    expect(groupNames).toContain("Customer Management");
    expect(groupNames).toContain("Store Management");
  });

  it("tag groups contain their tags as children", () => {
    const result = buildDocTree(tagGroupsDocument);
    const customerGroup = result.root.children?.find(
      (n) => n.name === "Customer Management",
    );

    expect(customerGroup?.children?.length).toBe(2);
    expect(customerGroup?.children?.map((n) => n.name)).toContain("Users");
    expect(customerGroup?.children?.map((n) => n.name)).toContain("Orders");
  });

  it("supports nested sub-groups within x-tagGroups", () => {
    const result = buildDocTree(tagGroupsDocument);
    const storeGroup = result.root.children?.find((n) => n.name === "Store Management");
    const subGroupNames = storeGroup?.children?.map((n) => n.name);

    expect(subGroupNames).toContain("Stock");
  });

  it("nested sub-group contains its operations", () => {
    const result = buildDocTree(tagGroupsDocument);
    const storeGroup = result.root.children?.find((n) => n.name === "Store Management");
    const stockGroup = storeGroup?.children?.find((n) => n.name === "Stock");
    const inventoryTag = stockGroup?.children?.find((n) => n.name === "Inventory");

    expect(inventoryTag?.children?.length).toBeGreaterThan(0);
    expect(inventoryTag?.children?.[0]?.metadata?.operationId).toBe("listInventory");
  });

  it("tag group nodes have correct metadata kind", () => {
    const result = buildDocTree(tagGroupsDocument);
    const customerGroup = result.root.children?.find(
      (n) => n.name === "Customer Management",
    );

    expect(customerGroup?.metadata?.kind).toBe("tag-group");
    expect(customerGroup?.metadata?.source).toBe("tag-group");
  });
});
