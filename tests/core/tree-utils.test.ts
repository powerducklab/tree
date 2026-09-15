import { describe, expect, it } from "vitest";

import type { TreeNode } from "../../src/core/types";
import {
  countNodes,
  filterTree,
  findNode,
  findPath,
  flattenTree,
  getBranchIds,
  getExpandableIds,
  getLeaves,
  getMaxDepth,
  insertChild,
  isTreeNode,
  moveNode,
  removeNode,
  reorderNode,
  sortNodes,
  sortTree,
  updateNode,
} from "../../src/core/tree-utils";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const sampleTree: TreeNode[] = [
  {
    id: "a",
    name: "Alpha",
    order: 2,
    children: [
      { id: "a1", name: "Alpha One", order: 1 },
      { id: "a2", name: "Alpha Two", order: 2 },
    ],
  },
  {
    id: "b",
    name: "Beta",
    order: 1,
    children: [
      {
        id: "b1",
        name: "Beta One",
        children: [{ id: "b1a", name: "Beta One A" }],
      },
    ],
  },
  { id: "c", name: "Charlie", order: 3 },
];

/* -------------------------------------------------------------------------- */
/* isTreeNode                                                                 */
/* -------------------------------------------------------------------------- */

describe("isTreeNode", () => {
  it("returns true for a valid node", () => {
    expect(isTreeNode({ id: "x", name: "X" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isTreeNode(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTreeNode(undefined)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* findNode                                                                   */
/* -------------------------------------------------------------------------- */

describe("findNode", () => {
  it("finds a root node", () => {
    expect(findNode(sampleTree, "b")?.name).toBe("Beta");
  });

  it("finds a nested node", () => {
    expect(findNode(sampleTree, "b1a")?.name).toBe("Beta One A");
  });

  it("returns undefined for missing id", () => {
    expect(findNode(sampleTree, "nonexistent")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* findPath                                                                   */
/* -------------------------------------------------------------------------- */

describe("findPath", () => {
  it("returns full path from root to target", () => {
    const path = findPath(sampleTree, "b1a");

    expect(path).not.toBeNull();
    expect(path?.nodes.map((n) => n.id)).toEqual(["b", "b1", "b1a"]);
    expect(path?.target.id).toBe("b1a");
    expect(path?.ancestorIds).toEqual(["b", "b1"]);
  });

  it("returns null for missing id", () => {
    expect(findPath(sampleTree, "missing")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* getLeaves                                                                  */
/* -------------------------------------------------------------------------- */

describe("getLeaves", () => {
  it("returns all leaf nodes", () => {
    const leaves = getLeaves(sampleTree);

    expect(leaves.map((n) => n.id).sort()).toEqual(
      ["a1", "a2", "b1a", "c"].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* countNodes                                                                 */
/* -------------------------------------------------------------------------- */

describe("countNodes", () => {
  it("counts all nodes including branches", () => {
    expect(countNodes(sampleTree)).toBe(7);
  });

  it("returns 0 for empty array", () => {
    expect(countNodes([])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getMaxDepth                                                                */
/* -------------------------------------------------------------------------- */

describe("getMaxDepth", () => {
  it("returns the maximum depth", () => {
    expect(getMaxDepth(sampleTree)).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(getMaxDepth([])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* sortNodes                                                                  */
/* -------------------------------------------------------------------------- */

describe("sortNodes", () => {
  it("sorts by order ascending", () => {
    const sorted = sortNodes(sampleTree);

    expect(sorted.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by name when order is equal", () => {
    const nodes: TreeNode[] = [
      { id: "z", name: "Zebra" },
      { id: "a", name: "Apple" },
      { id: "m", name: "Mango" },
    ];

    expect(sortNodes(nodes).map((n) => n.id)).toEqual(["a", "m", "z"]);
  });

  it("does not mutate the input", () => {
    const original = [...sampleTree];
    sortNodes(sampleTree);
    expect(sampleTree).toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */
/* sortTree                                                                   */
/* -------------------------------------------------------------------------- */

describe("sortTree", () => {
  it("recursively sorts all levels", () => {
    const sorted = sortTree(sampleTree);
    const alpha = sorted.find((n) => n.id === "a");

    expect(alpha?.children?.map((n) => n.id)).toEqual(["a1", "a2"]);
  });
});

/* -------------------------------------------------------------------------- */
/* filterTree                                                                 */
/* -------------------------------------------------------------------------- */

describe("filterTree", () => {
  it("returns original nodes when query is empty", () => {
    const filtered = filterTree(sampleTree, { query: "" });

    expect(filtered).toBe(sampleTree);
  });

  it("filters by name substring", () => {
    const filtered = filterTree(sampleTree, { query: "alpha" });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("a");
  });

  it("keeps ancestors of matching nodes by default", () => {
    const filtered = filterTree(sampleTree, { query: "beta one a" });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("b");
    expect(filtered[0]?.children?.[0]?.id).toBe("b1");
    expect(filtered[0]?.children?.[0]?.children?.[0]?.id).toBe("b1a");
  });

  it("is case-insensitive", () => {
    const filtered = filterTree(sampleTree, { query: "CHARLIE" });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("c");
  });
});

/* -------------------------------------------------------------------------- */
/* getExpandableIds                                                           */
/* -------------------------------------------------------------------------- */

describe("getExpandableIds", () => {
  it("returns all branch ids by default", () => {
    expect(getExpandableIds(sampleTree).sort()).toEqual(["a", "b", "b1"].sort());
  });

  it("respects maxDepth", () => {
    expect(getExpandableIds(sampleTree, { maxDepth: 1 }).sort()).toEqual(
      ["a", "b"].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* getBranchIds                                                               */
/* -------------------------------------------------------------------------- */

describe("getBranchIds", () => {
  it("returns ids of nodes with children", () => {
    expect(getBranchIds(sampleTree).sort()).toEqual(["a", "b", "b1"].sort());
  });
});

/* -------------------------------------------------------------------------- */
/* flattenTree                                                                */
/* -------------------------------------------------------------------------- */

describe("flattenTree", () => {
  it("returns nodes in pre-order with depth", () => {
    const flat = flattenTree(sampleTree);

    expect(flat.length).toBe(7);
    expect(flat[0]?.node.id).toBe("a");
    expect(flat[0]?.depth).toBe(1);
    expect(flat[1]?.node.id).toBe("a1");
    expect(flat[1]?.depth).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* updateNode                                                                 */
/* -------------------------------------------------------------------------- */

describe("updateNode", () => {
  it("updates a node by id", () => {
    const updated = updateNode(sampleTree, "c", (node) => ({
      ...node,
      name: "Charlie Updated",
    }));

    expect(updated.find((n) => n.id === "c")?.name).toBe("Charlie Updated");
  });

  it("updates a nested node", () => {
    const updated = updateNode(sampleTree, "b1a", (node) => ({
      ...node,
      name: "Deep Updated",
    }));

    expect(findNode(updated, "b1a")?.name).toBe("Deep Updated");
  });

  it("returns original when id not found", () => {
    const updated = updateNode(sampleTree, "missing", (node) => node);

    expect(updated).toBe(sampleTree);
  });
});

/* -------------------------------------------------------------------------- */
/* removeNode                                                                 */
/* -------------------------------------------------------------------------- */

describe("removeNode", () => {
  it("removes a root node", () => {
    const result = removeNode(sampleTree, "c");

    expect(result.length).toBe(2);
    expect(result.find((n) => n.id === "c")).toBeUndefined();
  });

  it("removes a nested node", () => {
    const result = removeNode(sampleTree, "a2");
    const alpha = result.find((n) => n.id === "a");

    expect(alpha?.children?.length).toBe(1);
    expect(alpha?.children?.[0]?.id).toBe("a1");
  });

  it("returns original when id not found", () => {
    const result = removeNode(sampleTree, "missing");

    expect(result).toBe(sampleTree);
  });
});

/* -------------------------------------------------------------------------- */
/* insertChild                                                                */
/* -------------------------------------------------------------------------- */

describe("insertChild", () => {
  it("inserts a child at the given parent id", () => {
    const newChild: TreeNode = { id: "a3", name: "Alpha Three" };
    const result = insertChild(sampleTree, "a", newChild);
    const alpha = result.find((n) => n.id === "a");

    expect(alpha?.children?.length).toBe(3);
    expect(alpha?.children?.[2]?.id).toBe("a3");
  });

  it("returns original when parent not found", () => {
    const result = insertChild(sampleTree, "missing", { id: "x", name: "X" });

    expect(result).toBe(sampleTree);
  });
});

/* -------------------------------------------------------------------------- */
/* reorderNode                                                                */
/* -------------------------------------------------------------------------- */

describe("reorderNode", () => {
  it("moves a root node forward", () => {
    const result = reorderNode(sampleTree, "a", 2);

    expect(result).not.toBeNull();
    expect(result?.nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(result?.fromIndex).toBe(0);
    expect(result?.toIndex).toBe(2);
    expect(result?.parentId).toBeNull();
    expect(result?.moved.id).toBe("a");
  });

  it("moves a root node backward", () => {
    const result = reorderNode(sampleTree, "c", 0);

    expect(result?.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(result?.fromIndex).toBe(2);
    expect(result?.toIndex).toBe(0);
  });

  it("reorders nested children", () => {
    const result = reorderNode(sampleTree, "a1", 1);

    expect(result).not.toBeNull();
    const alpha = result?.nodes.find((n) => n.id === "a");
    expect(alpha?.children?.map((n) => n.id)).toEqual(["a2", "a1"]);
    expect(result?.parentId).toBe("a");
  });

  it("returns null when id not found", () => {
    const result = reorderNode(sampleTree, "missing", 0);

    expect(result).toBeNull();
  });

  it("returns original tree when moving to same index", () => {
    const result = reorderNode(sampleTree, "a", 0);

    expect(result?.nodes).toBe(sampleTree);
    expect(result?.fromIndex).toBe(0);
    expect(result?.toIndex).toBe(0);
  });

  it("clamps out-of-range target index", () => {
    const result = reorderNode(sampleTree, "a", 99);

    expect(result?.nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(result?.toIndex).toBe(2);
  });

  it("clamps negative target index", () => {
    const result = reorderNode(sampleTree, "c", -5);

    expect(result?.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(result?.toIndex).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* moveNode                                                                   */
/* -------------------------------------------------------------------------- */

describe("moveNode", () => {
  it("moves a node to another parent", () => {
    const result = moveNode(sampleTree, "a1", "b");

    expect(result).not.toBeNull();
    const alpha = result?.find((n) => n.id === "a");
    const beta = result?.find((n) => n.id === "b");

    expect(alpha?.children?.length).toBe(1);
    expect(alpha?.children?.[0]?.id).toBe("a2");
    expect(beta?.children?.length).toBe(2);
    expect(beta?.children?.map((n) => n.id)).toEqual(["b1", "a1"]);
  });

  it("moves a node to root level", () => {
    const result = moveNode(sampleTree, "a1", null);

    expect(result).not.toBeNull();
    expect(result?.length).toBe(4);
    expect(result?.[3]?.id).toBe("a1");
  });

  it("moves a node to root at specific index", () => {
    const result = moveNode(sampleTree, "a1", null, 0);

    expect(result?.[0]?.id).toBe("a1");
    expect(result?.length).toBe(4);
  });

  it("returns null when source not found", () => {
    const result = moveNode(sampleTree, "missing", "b");

    expect(result).toBeNull();
  });

  it("returns null when target not found", () => {
    const result = moveNode(sampleTree, "a1", "missing");

    expect(result).toBeNull();
  });

  it("inserts at end when no target index given", () => {
    const newChild: TreeNode = { id: "b2", name: "Beta Two" };
    const treeWithChild = insertChild(sampleTree, "b", newChild);
    const result = moveNode(treeWithChild, "a1", "b");

    const beta = result?.find((n) => n.id === "b");
    expect(beta?.children?.map((n) => n.id)).toEqual(["b1", "b2", "a1"]);
  });
});
