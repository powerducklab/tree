import type { TreeNode, TreePath } from "../../core/types";

export function indexTree<T>(nodes: TreeNode<T>[]) {
  const byId = new Map<string, { node: TreeNode<T>; parentId: string | null }>();
  const seen = new Set<TreeNode<T>>();
  const stack = nodes.map((node) => ({ node, parentId: null as string | null })).reverse();
  while (stack.length) {
    const entry = stack.pop()!;
    if (seen.has(entry.node) || byId.has(entry.node.id)) continue;
    seen.add(entry.node);
    byId.set(entry.node.id, entry);
    const children = entry.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, parentId: entry.node.id });
  }
  return {
    byId,
    path(id: string): TreePath<T> | null {
      const entry = byId.get(id);
      if (!entry) return null;
      const path = [entry.node];
      let parentId = entry.parentId;
      while (parentId !== null) {
        const parent = byId.get(parentId);
        if (!parent) break;
        path.push(parent.node);
        parentId = parent.parentId;
      }
      path.reverse();
      return { nodes: path, target: entry.node, parent: path[path.length - 2], ancestorIds: path.slice(0, -1).map((node) => node.id) };
    },
  };
}
