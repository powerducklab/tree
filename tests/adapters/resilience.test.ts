import { describe, expect, it } from "vitest";
import { buildDocTree } from "../../src/adapters/doc";
import { buildOpenApiTree } from "../../src/adapters/openapi";
import { buildSchemaTree, findSchemaNodeByPath } from "../../src/adapters/json-schema";
import { countNodes, flattenTree, getMaxDepth } from "../../src/core/tree-utils";
import { getMethodLabel } from "../../src/react/libs/methods";

describe("adapter boundaries", () => {
  it("builds 10,000 nested tags without recursion or sentinel-name collisions", () => {
    const tags = Array.from({ length: 10000 }, (_, i) => ({ name: i === 0 ? "__root__" : `tag${i}`, ...(i ? { parent: i === 1 ? "__root__" : `tag${i - 1}` } : {}) }));
    const document = { openapi: "3.2.0", info: { title: "Deep tags", version: "1" }, tags, paths: {} };
    const api = buildOpenApiTree(document);
    const doc = buildDocTree(document);
    expect(getMaxDepth([api.root])).toBeGreaterThanOrEqual(10000);
    expect(getMaxDepth([doc.root])).toBeGreaterThanOrEqual(10000);
    expect(api.warnings).toEqual([]);
    expect(doc.warnings).toEqual([]);
  });

  it("retains operations whose tags are not declared in a nested document", () => {
    const document = { openapi: "3.2.0", info: { title: "Tags", version: "1" }, tags: [{ name: "Parent" }, { name: "Child", parent: "Parent" }], paths: { "/pets": { get: { tags: ["Undeclared"], summary: "Pets" } } } };
    for (const build of [buildOpenApiTree, buildDocTree]) {
      expect(flattenTree([build(document).root]).some(({ node }) => node.name === "Pets")).toBe(true);
    }
  });

  it("bounds generated schema nodes and terminates object cycles", () => {
    const shared: Record<string, unknown> = { type: "object" };
    shared.properties = { self: shared };
    const circular = buildSchemaTree(shared, { maxDepth: Infinity });
    expect(countNodes([circular.root])).toBe(2);
    expect(circular.warnings.some((message) => message.includes("Circular"))).toBe(true);
    const broad = { type: "object", properties: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`p${i}`, { type: "string" }])) };
    const limited = buildSchemaTree(broad, { maxNodes: 50 });
    expect(countNodes([limited.root])).toBe(50);
    expect(limited.warnings.some((message) => message.includes("node limit"))).toBe(true);
  });

  it("distinguishes literal dots in property names from path boundaries", () => {
    const { root } = buildSchemaTree({ type: "object", properties: { "a.properties.b": { type: "string" }, a: { type: "object", properties: { b: { type: "number" } } } } });
    const literal = findSchemaNodeByPath(root, ["properties", "a.properties.b"]);
    const nested = findSchemaNodeByPath(root, ["properties", "a", "properties", "b"]);
    expect(literal?.metadata?.type).toBe("string");
    expect(nested?.metadata?.type).toBe("number");
    expect(literal?.id).not.toBe(nested?.id);
  });

  it("does not interpret inherited object properties as method labels or sort orders", () => {
    expect(getMethodLabel("constructor")).toBe("CONS");
    const { root } = buildSchemaTree({ type: "object", properties: { constructor: { type: "string" } } });
    expect(root.children?.[0]?.order).toBeUndefined();
  });

  it("warns and terminates circular tag-group input", () => {
    const group: Record<string, unknown> = { name: "Circular" };
    group.groups = [group];
    const result = buildDocTree({ openapi: "3.2.0", info: { title: "Groups", version: "1" }, paths: {}, "x-tagGroups": [group] });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(countNodes([result.root])).toBeLessThan(5);
  });
});


it("bounds repeated tag-group expansion even when the source is a shared graph", () => {
  let group: Record<string, unknown> = { name: "Leaf" };
  for (let i = 0; i < 16; i++) group = { name: `Group ${i}`, groups: [group, group] };
  const result = buildDocTree({ openapi: "3.2.0", info: { title: "Groups", version: "1" }, paths: {}, "x-tagGroups": [group] });
  expect(countNodes([result.root])).toBeLessThanOrEqual(10001);
  expect(result.warnings.some((message) => message.includes("group limit"))).toBe(true);
});
