import { sortNodes } from "../core/tree-utils";
import type { TreeNode } from "../core/types";

/** Resolve parent links once, then assemble nodes without recursive calls. */
export function buildTagHierarchy<T extends { name: string; parent?: string }, M>(
  definitions: T[], buildNode: (tag: T) => TreeNode<M>, warnings: string[],
): TreeNode<M>[] {
  const tags = new Map<string, T>();
  for (const tag of definitions) {
    if (tags.has(tag.name)) warnings.push(`Duplicate tag "${tag.name}" was ignored.`);
    else tags.set(tag.name, tag);
  }
  const parents = new Map<string, string | null>();
  for (const tag of tags.values()) {
    if (tag.parent && !tags.has(tag.parent)) warnings.push(`Tag "${tag.name}" references unknown parent "${tag.parent}", treating as root.`);
    parents.set(tag.name, tag.parent && tags.has(tag.parent) ? tag.parent : null);
  }
  const complete = new Set<string>();
  for (const name of tags.keys()) {
    const chain = new Set<string>();
    let current: string | null = name;
    while (current !== null && !complete.has(current)) {
      if (chain.has(current)) {
        warnings.push(`Circular tag reference detected at "${current}". Breaking cycle.`);
        parents.set(current, null);
        break;
      }
      chain.add(current);
      current = parents.get(current) ?? null;
    }
    for (const id of chain) complete.add(id);
  }
  const nodes = new Map(Array.from(tags, ([name, tag]) => [name, buildNode(tag)]));
  const roots: TreeNode<M>[] = [];
  for (const [name, node] of nodes) {
    const parent = parents.get(name);
    if (parent == null) roots.push(node);
    else {
      const parentNode = nodes.get(parent)!;
      (parentNode.children ??= []).push(node);
    }
  }
  for (const node of nodes.values()) if (node.children) node.children = sortNodes(node.children);
  return sortNodes(roots);
}
