import { describe, expect, it } from "vitest";
import { countNodes, filterTree, findPath, flattenTree, getMaxDepth, moveNode, removeNode, reorderNode, sortTree, updateNode } from "../../src/core/tree-utils";
import type { TreeNode } from "../../src/core/types";
import { indexTree } from "../../src/react/libs/tree-index";

describe("deep and malformed trees", () => {
  it("traverses, filters, sorts, and edits 15,000 levels without recursive stack growth", () => {
    let node: TreeNode = { id: "target", name: "Target" };
    for (let i = 0; i < 15000; i++) node = { id: `n${i}`, name: `Node ${i}`, children: [node] };
    const tree = [node];
    expect(countNodes(tree)).toBe(15001);
    expect(getMaxDepth(tree)).toBe(15001);
    expect(findPath(tree, "target")?.nodes).toHaveLength(15001);
    expect(countNodes(filterTree(tree, { query: "target" }))).toBe(15001);
    expect(countNodes(sortTree(tree))).toBe(15001);
    expect(countNodes(removeNode(tree, "target"))).toBe(15000);
    expect(findPath(updateNode(tree, "target", (n) => ({ ...n, name: "Changed" })), "target")?.target.name).toBe("Changed");
    expect(indexTree(tree).path("target")?.nodes).toHaveLength(15001);
  });

  it("terminates on cycles without mutating caller-owned data", () => {
    const node: TreeNode = { id: "cycle", name: "Cycle", children: [] };
    node.children!.push(node);
    expect(countNodes([node])).toBe(1);
    expect(flattenTree([node])).toHaveLength(1);
    expect(findPath([node], "missing")).toBeNull();
    const sorted = sortTree([node]);
    expect(sorted[0]?.children).toEqual([]);
    expect(node.children![0]).toBe(node);
  });

  it("permits moving to an ancestor but rejects self and descendant moves", () => {
    const tree: TreeNode[] = [{ id: "a", name: "A", children: [{ id: "b", name: "B", children: [{ id: "c", name: "C" }] }] }];
    const moved = moveNode(tree, "c", "a")!;
    expect(moved[0]?.children?.map((n) => n.id)).toEqual(["b", "c"]);
    expect(moveNode(tree, "a", "c")).toBeNull();
    expect(moveNode(tree, "a", "a")).toBeNull();
  });

  it("preserves unaffected branches and normalizes noninteger reorder positions", () => {
    const other: TreeNode = { id: "other", name: "Other", children: [{ id: "x", name: "X" }] };
    const tree: TreeNode[] = [{ id: "a", name: "A", children: [{ id: "b", name: "B" }, { id: "c", name: "C" }] }, other];
    expect(reorderNode(tree, "b", 1.9)?.nodes[1]).toBe(other);
    expect(reorderNode(tree, "c", NaN)?.toIndex).toBe(0);
    expect(reorderNode(tree, "c", Infinity)?.toIndex).toBe(1);
  });
});
