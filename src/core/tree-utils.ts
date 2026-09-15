import type {
  ExpandOptions,
  FilterTreeOptions,
  TreeNode,
  TreePath,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Type guards                                                                */
/* -------------------------------------------------------------------------- */

export function isTreeNode<TMetadata>(
  value: TreeNode<TMetadata> | null | undefined,
): value is TreeNode<TMetadata> {
  return value !== null && value !== undefined;
}

/* -------------------------------------------------------------------------- */
/* Traversal                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Finds a node by id in a tree. Returns undefined if not found.
 */
export function findNode<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
): TreeNode<TMetadata> | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children?.length) {
      const found = findNode(node.children, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/**
 * Finds the full path from root to the node with the given id.
 * Returns null if the node is not found.
 */
export function findPath<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
  ancestors: TreeNode<TMetadata>[] = [],
): TreePath<TMetadata> | null {
  for (const node of nodes) {
    const path = [...ancestors, node];

    if (node.id === id) {
      return {
        nodes: path,
        target: node,
        parent: ancestors[ancestors.length - 1],
        ancestorIds: ancestors.map((ancestor) => ancestor.id),
      };
    }

    if (node.children?.length) {
      const found = findPath(node.children, id, path);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Returns all leaf nodes (nodes with no children).
 */
export function getLeaves<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): TreeNode<TMetadata>[] {
  const leaves: TreeNode<TMetadata>[] = [];

  const visit = (node: TreeNode<TMetadata>): void => {
    if (!node.children?.length) {
      leaves.push(node);
      return;
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return leaves;
}

/**
 * Returns the total number of nodes in the tree.
 */
export function countNodes<TMetadata>(nodes: TreeNode<TMetadata>[]): number {
  let count = 0;

  const visit = (node: TreeNode<TMetadata>): void => {
    count += 1;

    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return count;
}

/**
 * Returns the maximum depth of the tree. Root-level nodes are depth 1.
 */
export function getMaxDepth<TMetadata>(nodes: TreeNode<TMetadata>[]): number {
  let maxDepth = 0;

  const visit = (node: TreeNode<TMetadata>, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);

    for (const child of node.children ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const node of nodes) {
    visit(node, 1);
  }

  return maxDepth;
}

/* -------------------------------------------------------------------------- */
/* Sorting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Sorts nodes by order (ascending), then by name (locale-aware, numeric).
 * Nodes without an order value sort after those with one.
 *
 * Returns a new array; does not mutate the input.
 */
export function sortNodes<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): TreeNode<TMetadata>[] {
  return [...nodes].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const nameDifference = left.name.localeCompare(right.name, "en-US", {
      numeric: true,
      sensitivity: "base",
    });

    return nameDifference || left.id.localeCompare(right.id);
  });
}

/**
 * Recursively sorts all nodes in the tree by order, then name.
 * Returns a new tree; does not mutate the input.
 */
export function sortTree<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): TreeNode<TMetadata>[] {
  return sortNodes(nodes).map((node) =>
    node.children?.length
      ? { ...node, children: sortTree(node.children) }
      : node,
  );
}

/* -------------------------------------------------------------------------- */
/* Filtering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Filters a tree by query. Matching nodes and (optionally) their ancestors
 * are retained. Returns a new tree; does not mutate the input.
 *
 * When no query is provided, the original nodes are returned unchanged.
 */
export function filterTree<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  options: FilterTreeOptions,
): TreeNode<TMetadata>[] {
  const query = options.query.trim().toLowerCase();

  if (!query) {
    return nodes;
  }

  const keepAncestors = options.keepAncestors ?? true;

  const matches = (node: TreeNode<TMetadata>): boolean =>
    node.name.toLowerCase().includes(query) ||
    node.id.toLowerCase().includes(query);

  const visit = (node: TreeNode<TMetadata>): TreeNode<TMetadata> | null => {
    const children = (node.children ?? [])
      .map(visit)
      .filter(isTreeNode);

    const nodeMatches = matches(node);

    if (!nodeMatches && !children.length) {
      return null;
    }

    if (!keepAncestors && !nodeMatches) {
      return null;
    }

    if (children.length === (node.children?.length ?? 0)) {
      return node;
    }

    return { ...node, children };
  };

  return nodes.map(visit).filter(isTreeNode);
}

/* -------------------------------------------------------------------------- */
/* Expansion                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns the IDs of all nodes that should be expanded based on options.
 *
 * @param nodes - The root nodes.
 * @param options - maxDepth (default Infinity), onlyWithChildren (default true).
 */
export function getExpandableIds<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  options: ExpandOptions = {},
): string[] {
  const maxDepth = options.maxDepth ?? Infinity;
  const onlyWithChildren = options.onlyWithChildren ?? true;
  const ids: string[] = [];

  const visit = (node: TreeNode<TMetadata>, depth: number): void => {
    if (depth > maxDepth) {
      return;
    }

    const hasChildren = (node.children?.length ?? 0) > 0;

    if (!onlyWithChildren || hasChildren) {
      ids.push(node.id);
    }

    for (const child of node.children ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const node of nodes) {
    visit(node, 1);
  }

  return ids;
}

/**
 * Returns the IDs of all branch nodes (nodes with at least one child).
 */
export function getBranchIds<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): string[] {
  const ids: string[] = [];

  const visit = (node: TreeNode<TMetadata>): void => {
    const children = node.children;

    if (!children || children.length === 0) {
      return;
    }

    ids.push(node.id);

    for (const child of children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return ids;
}

/* -------------------------------------------------------------------------- */
/* Flattening                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Flattens a tree into a list of nodes with their depth.
 * Parent nodes appear before their children (pre-order traversal).
 */
export function flattenTree<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): Array<{ node: TreeNode<TMetadata>; depth: number }> {
  const result: Array<{ node: TreeNode<TMetadata>; depth: number }> = [];

  const visit = (node: TreeNode<TMetadata>, depth: number): void => {
    result.push({ node, depth });

    for (const child of node.children ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const node of nodes) {
    visit(node, 1);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Mutation helpers (immutable)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Returns a new tree with the node at the given id replaced.
 * If the id is not found, the original tree is returned unchanged.
 */
export function updateNode<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
  updater: (node: TreeNode<TMetadata>) => TreeNode<TMetadata>,
): TreeNode<TMetadata>[] {
  let changed = false;

  const result = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return updater(node);
    }

    if (node.children?.length) {
      const updatedChildren = updateNode(node.children, id, updater);

      if (updatedChildren !== node.children) {
        changed = true;
        return { ...node, children: updatedChildren };
      }
    }

    return node;
  });

  return changed ? result : nodes;
}

/**
 * Returns a new tree with the node at the given id removed.
 * If the id is not found, the original tree is returned unchanged.
 */
export function removeNode<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
): TreeNode<TMetadata>[] {
  const result: TreeNode<TMetadata>[] = [];
  let changed = false;

  for (const node of nodes) {
    if (node.id === id) {
      changed = true;
      continue;
    }

    if (node.children?.length) {
      const updatedChildren = removeNode(node.children, id);

      if (updatedChildren !== node.children) {
        changed = true;
        result.push({ ...node, children: updatedChildren });
        continue;
      }
    }

    result.push(node);
  }

  return changed ? result : nodes;
}

/**
 * Returns a new tree with a child inserted at the given parent id.
 * If the parent id is not found, the original tree is returned unchanged.
 */
export function insertChild<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  parentId: string,
  child: TreeNode<TMetadata>,
): TreeNode<TMetadata>[] {
  let changed = false;

  const result = nodes.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return {
        ...node,
        children: [...(node.children ?? []), child],
      };
    }

    if (node.children?.length) {
      const updatedChildren = insertChild(node.children, parentId, child);

      if (updatedChildren !== node.children) {
        changed = true;
        return { ...node, children: updatedChildren };
      }
    }

    return node;
  });

  return changed ? result : nodes;
}

/* -------------------------------------------------------------------------- */
/* Reordering                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Result of a reorder operation.
 */
export interface ReorderResult<TMetadata> {
  /** The reordered tree. */
  nodes: TreeNode<TMetadata>[];
  /** The moved node. */
  moved: TreeNode<TMetadata>;
  /** ID of the parent containing the moved node, or null for root. */
  parentId: string | null;
  /** Original index within the parent's children. */
  fromIndex: number;
  /** New index within the parent's children. */
  toIndex: number;
}

/**
 * Moves a node to a new position within the same parent.
 *
 * Returns the reordered tree and metadata about the move. If the node id
 * is not found, returns null.
 */
export function reorderNode<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  nodeId: string,
  toIndex: number,
): ReorderResult<TMetadata> | null {
  const findParentArray = (
    currentNodes: TreeNode<TMetadata>[],
    parentId: string | null,
  ): {
    array: TreeNode<TMetadata>[];
    index: number;
    parentId: string | null;
  } | null => {
    const index = currentNodes.findIndex((node) => node.id === nodeId);

    if (index !== -1) {
      return { array: currentNodes, index, parentId };
    }

    for (const node of currentNodes) {
      if (node.children?.length) {
        const found = findParentArray(node.children, node.id);

        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  const location = findParentArray(nodes, null);

  if (!location) {
    return null;
  }

  const { array, index: fromIndex, parentId } = location;
  const clampedToIndex = Math.max(0, Math.min(toIndex, array.length - 1));

  if (clampedToIndex === fromIndex) {
    return {
      nodes,
      moved: array[fromIndex]!,
      parentId,
      fromIndex,
      toIndex: fromIndex,
    };
  }

  const reorderedArray = [...array];
  const [moved] = reorderedArray.splice(fromIndex, 1);
  reorderedArray.splice(clampedToIndex, 0, moved!);

  const updateParent = (
    currentNodes: TreeNode<TMetadata>[],
  ): TreeNode<TMetadata>[] => {
    if (parentId === null) {
      return reorderedArray;
    }

    return currentNodes.map((node) => {
      if (node.id === parentId) {
        return { ...node, children: reorderedArray };
      }

      if (node.children?.length) {
        return { ...node, children: updateParent(node.children) };
      }

      return node;
    });
  };

  return {
    nodes: updateParent(nodes),
    moved: moved!,
    parentId,
    fromIndex,
    toIndex: clampedToIndex,
  };
}

/**
 * Moves a node to a different parent.
 *
 * Returns the new tree, or null if either the source or target is not found.
 */
export function moveNode<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  nodeId: string,
  targetParentId: string | null,
  targetIndex?: number,
): TreeNode<TMetadata>[] | null {
  let removedNode: TreeNode<TMetadata> | null = null;

  /* Guard against circular references: cannot move a node into its own descendant. */
  if (targetParentId !== null) {
    const sourcePath = findPath(nodes, nodeId);

    if (sourcePath && sourcePath.ancestorIds.includes(targetParentId)) {
      return null;
    }
  }

  const removeFromTree = (
    currentNodes: TreeNode<TMetadata>[],
  ): TreeNode<TMetadata>[] => {
    const result: TreeNode<TMetadata>[] = [];
    let changed = false;

    for (const node of currentNodes) {
      if (node.id === nodeId) {
        removedNode = node;
        changed = true;
        continue;
      }

      if (node.children?.length) {
        const updatedChildren = removeFromTree(node.children);

        if (updatedChildren !== node.children) {
          changed = true;
          result.push({ ...node, children: updatedChildren });
          continue;
        }
      }

      result.push(node);
    }

    return changed ? result : currentNodes;
  };

  const treeAfterRemoval = removeFromTree(nodes);

  if (!removedNode) {
    return null;
  }

  if (targetParentId === null) {
    const index = targetIndex ?? treeAfterRemoval.length;
    const result = [...treeAfterRemoval];
    result.splice(Math.max(0, Math.min(index, result.length)), 0, removedNode);
    return result;
  }

  let inserted = false;

  const insertIntoTree = (
    currentNodes: TreeNode<TMetadata>[],
  ): TreeNode<TMetadata>[] => {
    return currentNodes.map((node) => {
      if (node.id === targetParentId) {
        inserted = true;
        const children = [...(node.children ?? [])];
        const index = targetIndex ?? children.length;
        children.splice(Math.max(0, Math.min(index, children.length)), 0, removedNode!);
        return { ...node, children };
      }

      if (node.children?.length) {
        return { ...node, children: insertIntoTree(node.children) };
      }

      return node;
    });
  };

  const result = insertIntoTree(treeAfterRemoval);

  return inserted ? result : null;
}
