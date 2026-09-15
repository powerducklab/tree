import { describe, expect, it } from "vitest";

import {
  buildSchemaTree,
  findSchemaNodeByPath,
  formatSchemaType,
} from "../../src/adapters/json-schema";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const basicSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "User name" },
    age: { type: "integer" },
    email: { type: "string", format: "email" },
  },
  required: ["name"],
};

const nestedSchema = {
  type: "object",
  properties: {
    user: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
        },
      },
    },
  },
};

const arraySchema = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: { type: "string" },
    },
    users: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
        },
      },
    },
  },
};

const combinatorSchema = {
  type: "object",
  properties: {
    pet: {
      oneOf: [
        { type: "object", properties: { breed: { type: "string" } } },
        { type: "object", properties: { species: { type: "string" } } },
      ],
    },
  },
};

const enumSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["active", "inactive", "pending"],
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Basic building                                                             */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - basic", () => {
  it("builds a tree from a valid schema", () => {
    const result = buildSchemaTree(basicSchema);

    expect(result.root.id).toBe("root");
    expect(result.root.metadata?.kind).toBe("object");
    expect(result.root.children?.length).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it("includes property names and types", () => {
    const result = buildSchemaTree(basicSchema);
    const nameProp = result.root.children?.find((n) => n.name === "name");

    expect(nameProp).toBeDefined();
    expect(nameProp?.metadata?.type).toBe("string");
    expect(nameProp?.metadata?.jsonPath).toEqual(["properties", "name"]);
  });

  it("marks required properties", () => {
    const result = buildSchemaTree(basicSchema);
    const nameProp = result.root.children?.find((n) => n.name === "name");
    const ageProp = result.root.children?.find((n) => n.name === "age");

    expect(nameProp?.metadata?.required).toBe(true);
    expect(ageProp?.metadata?.required).toBe(false);
  });

  it("includes format in metadata", () => {
    const result = buildSchemaTree(basicSchema);
    const emailProp = result.root.children?.find((n) => n.name === "email");

    expect(emailProp?.metadata?.format).toBe("email");
  });

  it("handles null schema gracefully", () => {
    const result = buildSchemaTree(null);

    expect(result.root.children).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles undefined schema gracefully", () => {
    const result = buildSchemaTree(undefined);

    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Nested objects                                                             */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - nested objects", () => {
  it("expands nested object properties", () => {
    const result = buildSchemaTree(nestedSchema);
    const user = result.root.children?.find((n) => n.name === "user");

    expect(user).toBeDefined();
    expect(user?.metadata?.type).toBe("object");

    const address = user?.children?.find((n) => n.name === "address");
    expect(address).toBeDefined();

    const street = address?.children?.find((n) => n.name === "street");
    expect(street).toBeDefined();
    expect(street?.metadata?.type).toBe("string");
  });

  it("includes correct jsonPath for nested properties", () => {
    const result = buildSchemaTree(nestedSchema);
    const city = findSchemaNodeByPath(result.root, [
      "properties",
      "user",
      "properties",
      "address",
      "properties",
      "city",
    ]);

    expect(city?.name).toBe("city");
    expect(city?.metadata?.jsonPath).toEqual([
      "properties",
      "user",
      "properties",
      "address",
      "properties",
      "city",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Arrays                                                                     */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - arrays", () => {
  it("creates items child for array properties", () => {
    const result = buildSchemaTree(arraySchema);
    const tags = result.root.children?.find((n) => n.name === "tags");

    expect(tags?.metadata?.type).toBe("array");
    expect(tags?.children?.[0]?.name).toBe("items");
    expect(tags?.children?.[0]?.metadata?.type).toBe("string");
  });

  it("expands object array items", () => {
    const result = buildSchemaTree(arraySchema);
    const users = result.root.children?.find((n) => n.name === "users");
    const items = users?.children?.[0];

    expect(items?.children?.length).toBe(2);
    expect(items?.children?.[0]?.name).toBe("id");
  });
});

/* -------------------------------------------------------------------------- */
/* Combinators (oneOf/anyOf/allOf)                                           */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - combinators", () => {
  it("expands oneOf branches", () => {
    const result = buildSchemaTree(combinatorSchema);
    const pet = result.root.children?.find((n) => n.name === "pet");
    const oneOf = pet?.children?.find((n) => n.name === "oneOf");

    expect(oneOf).toBeDefined();
    expect(oneOf?.metadata?.kind).toBe("oneOf");
    expect(oneOf?.children?.length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - enums", () => {
  it("marks enum properties", () => {
    const result = buildSchemaTree(enumSchema);
    const status = result.root.children?.find((n) => n.name === "status");

    expect(status?.metadata?.kind).toBe("enum");
    expect(status?.metadata?.isLeaf).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Depth limit                                                                */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - depth limit", () => {
  it("respects maxDepth option", () => {
    const result = buildSchemaTree(nestedSchema, { maxDepth: 2 });
    const user = result.root.children?.find((n) => n.name === "user");
    const address = user?.children?.find((n) => n.name === "address");

    /* address should be a leaf because we hit maxDepth */
    expect(address?.metadata?.isLeaf).toBe(true);
    expect(address?.children).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Deprecated properties                                                      */
/* -------------------------------------------------------------------------- */

describe("buildSchemaTree - deprecated", () => {
  it("hides deprecated properties when showDeprecated is false", () => {
    const result = buildSchemaTree(
      {
        type: "object",
        properties: {
          active: { type: "boolean" },
          legacy: { type: "string", deprecated: true },
        },
      },
      { showDeprecated: false },
    );

    expect(result.root.children?.length).toBe(1);
    expect(result.root.children?.[0]?.name).toBe("active");
  });

  it("shows deprecated properties by default", () => {
    const result = buildSchemaTree({
      type: "object",
      properties: {
        active: { type: "boolean" },
        legacy: { type: "string", deprecated: true },
      },
    });

    expect(result.root.children?.length).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* findSchemaNodeByPath                                                       */
/* -------------------------------------------------------------------------- */

describe("findSchemaNodeByPath", () => {
  it("finds a node by jsonPath", () => {
    const result = buildSchemaTree(basicSchema);
    const node = findSchemaNodeByPath(result.root, ["properties", "name"]);

    expect(node?.name).toBe("name");
  });

  it("returns root for empty path", () => {
    const result = buildSchemaTree(basicSchema);
    const node = findSchemaNodeByPath(result.root, []);

    expect(node?.id).toBe("root");
  });

  it("returns undefined for missing path", () => {
    const result = buildSchemaTree(basicSchema);
    const node = findSchemaNodeByPath(result.root, ["properties", "nonexistent"]);

    expect(node).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* formatSchemaType                                                           */
/* -------------------------------------------------------------------------- */

describe("formatSchemaType", () => {
  it("formats simple type", () => {
    expect(
      formatSchemaType({ jsonPath: [], type: "string", kind: "string" }),
    ).toBe("string");
  });

  it("formats type with format", () => {
    expect(
      formatSchemaType({
        jsonPath: [],
        type: "string",
        format: "email",
        kind: "string",
      }),
    ).toBe("string (email)");
  });

  it("formats enum", () => {
    expect(
      formatSchemaType({ jsonPath: [], type: "string", kind: "enum" }),
    ).toBe("enum");
  });

  it("formats multi-type", () => {
    expect(
      formatSchemaType({
        jsonPath: [],
        type: ["string", "null"],
        kind: "unknown",
      }),
    ).toBe("string | null");
  });

  it("returns 'any' for missing type", () => {
    expect(formatSchemaType({ jsonPath: [], kind: "unknown" })).toBe("any");
  });
});
