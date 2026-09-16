import type { ExpandOptions, FilterTreeOptions, TreeNode, TreePath } from "./types";

export function isTreeNode<T>(value: TreeNode<T> | null | undefined): value is TreeNode<T> {
  return value !== null && value !== undefined;
}

interface Entry<T> {
  node: TreeNode<T>;
  parent?: Entry<T>;
  depth: number;
}

/** Iterative pre-order traversal. Repeated object references are visited once. */
function* entries<T>(nodes: TreeNode<T>[], maxDepth = Infinity): Generator<Entry<T>> {
  const seen = new Set<TreeNode<T>>();
  const stack: Entry<T>[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push({ node: nodes[i]!, depth: 1 });
  while (stack.length) {
    const entry = stack.pop()!;
    if (seen.has(entry.node) || entry.depth > maxDepth) continue;
    seen.add(entry.node);
    yield entry;
    const children = entry.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i]!, parent: entry, depth: entry.depth + 1 });
    }
  }
}

export function findNode<T>(nodes: TreeNode<T>[], id: string): TreeNode<T> | undefined {
  for (const { node } of entries(nodes)) if (node.id === id) return node;
  return undefined;
}

export function findPath<T>(nodes: TreeNode<T>[], id: string, ancestors: TreeNode<T>[] = []): TreePath<T> | null {
  for (const entry of entries(nodes)) {
    if (entry.node.id !== id) continue;
    const path: TreeNode<T>[] = [];
    let current: Entry<T> | undefined = entry;
    while (current) { path.push(current.node); current = current.parent; }
    path.reverse();
    const fullPath = [...ancestors, ...path];
    return { nodes: fullPath, target: entry.node, parent: fullPath[fullPath.length - 2], ancestorIds: fullPath.slice(0, -1).map((node) => node.id) };
  }
  return null;
}

export function getLeaves<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  const result: TreeNode<T>[] = [];
  for (const { node } of entries(nodes)) if (!node.children?.length) result.push(node);
  return result;
}

export function countNodes<T>(nodes: TreeNode<T>[]): number {
  let count = 0;
  for (const _entry of entries(nodes)) count++;
  return count;
}

export function getMaxDepth<T>(nodes: TreeNode<T>[]): number {
  let depth = 0;
  for (const entry of entries(nodes)) depth = Math.max(depth, entry.depth);
  return depth;
}

const nameCollator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
export function sortNodes<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return [...nodes].sort((left, right) => {
    const order = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    return (Number.isNaN(order) ? 0 : order) || nameCollator.compare(left.name, right.name) || left.id.localeCompare(right.id);
  });
}

/** Post-order transformation without recursion. Cyclic child edges are omitted. */
function transform<T>(nodes: TreeNode<T>[], visit: (node: TreeNode<T>) => TreeNode<T> | null,
  descend: (node: TreeNode<T>) => boolean = () => true): TreeNode<T>[] {
  type Frame = { source: TreeNode<T>[]; output: TreeNode<T>[]; index: number; owner?: TreeNode<T> };
  const active = new Set<TreeNode<T>>();
  const completed = new Map<TreeNode<T>, TreeNode<T> | null>();
  const stack: Frame[] = [{ source: nodes, output: [], index: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    if (frame.index < frame.source.length) {
      const node = frame.source[frame.index++]!;
      if (active.has(node)) continue;
      if (completed.has(node)) {
        const cached = completed.get(node);
        if (cached) frame.output.push(cached);
      } else if (node.children?.length && descend(node)) {
        active.add(node);
        stack.push({ source: node.children, output: [], index: 0, owner: node });
      } else {
        const result = visit(node);
        completed.set(node, result);
        if (result) frame.output.push(result);
      }
      continue;
    }
    stack.pop();
    const children = frame.source.length === frame.output.length && frame.source.every((node, i) => node === frame.output[i])
      ? frame.source : frame.output;
    if (!frame.owner) return children;
    const node = frame.owner;
    const result = visit(children === node.children ? node : { ...node, children });
    active.delete(node);
    completed.set(node, result);
    if (result) stack[stack.length - 1]!.output.push(result);
  }
  return nodes;
}

export function sortTree<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return sortNodes(transform(nodes, (node) => node.children?.length ? { ...node, children: sortNodes(node.children) } : node));
}

export function filterTree<T>(nodes: TreeNode<T>[], options: FilterTreeOptions): TreeNode<T>[] {
  const query = options.query.trim().toLowerCase();
  if (!query) return nodes;
  return transform(nodes, (node) => {
    const matches = node.name.toLowerCase().includes(query) || node.id.toLowerCase().includes(query);
    return matches || ((options.keepAncestors ?? true) && node.children?.length) ? node : null;
  });
}

export function getExpandableIds<T>(nodes: TreeNode<T>[], options: ExpandOptions = {}): string[] {
  const result: string[] = [];
  for (const { node, depth } of entries(nodes, options.maxDepth ?? Infinity)) {
    if (depth <= (options.maxDepth ?? Infinity) && (!(options.onlyWithChildren ?? true) || node.children?.length)) result.push(node.id);
  }
  return result;
}

export function getBranchIds<T>(nodes: TreeNode<T>[]): string[] {
  return getExpandableIds(nodes);
}

export function flattenTree<T>(nodes: TreeNode<T>[]): Array<{ node: TreeNode<T>; depth: number }> {
  return Array.from(entries(nodes), ({ node, depth }) => ({ node, depth }));
}

export function updateNode<T>(nodes: TreeNode<T>[], id: string, updater: (node: TreeNode<T>) => TreeNode<T>): TreeNode<T>[] {
  return transform(nodes, (node) => node.id === id ? updater(node) : node, (node) => node.id !== id);
}

export function removeNode<T>(nodes: TreeNode<T>[], id: string): TreeNode<T>[] {
  return transform(nodes, (node) => node.id === id ? null : node, (node) => node.id !== id);
}

export function insertChild<T>(nodes: TreeNode<T>[], parentId: string, child: TreeNode<T>): TreeNode<T>[] {
  return updateNode(nodes, parentId, (node) => ({ ...node, children: [...(node.children ?? []), child] }));
}

export interface ReorderResult<T> {
  nodes: TreeNode<T>[];
  moved: TreeNode<T>;
  parentId: string | null;
  fromIndex: number;
  toIndex: number;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Number.isNaN(index) ? 0 : Math.trunc(index), length));
}

export function reorderNode<T>(nodes: TreeNode<T>[], nodeId: string, toIndex: number): ReorderResult<T> | null {
  const path = findPath(nodes, nodeId);
  if (!path) return null;
  const siblings = path.parent?.children ?? nodes;
  const fromIndex = siblings.indexOf(path.target);
  const targetIndex = clampIndex(toIndex, siblings.length - 1);
  const result = { nodes, moved: path.target, parentId: path.parent?.id ?? null, fromIndex, toIndex: targetIndex };
  if (targetIndex === fromIndex) return result;
  const reordered = [...siblings];
  reordered.splice(fromIndex, 1);
  reordered.splice(targetIndex, 0, path.target);
  return { ...result, nodes: path.parent ? updateNode(nodes, path.parent.id, (node) => ({ ...node, children: reordered })) : reordered };
}

/** Move indices refer to the destination children after removal of the source. */
export function moveNode<T>(nodes: TreeNode<T>[], nodeId: string, targetParentId: string | null, targetIndex?: number): TreeNode<T>[] | null {
  const source = findNode(nodes, nodeId);
  if (!source) return null;
  if (targetParentId !== null && (!findNode(nodes, targetParentId) || findNode([source], targetParentId))) return null;
  const remaining = removeNode(nodes, nodeId);
  const insert = (children: TreeNode<T>[]) => {
    const result = [...children];
    result.splice(clampIndex(targetIndex ?? result.length, result.length), 0, source);
    return result;
  };
  return targetParentId === null ? insert(remaining) : updateNode(remaining, targetParentId, (node) => ({ ...node, children: insert(node.children ?? []) }));
}
