import type { TreeNode } from "../../core/types";
import { findPath, getBranchIds, getExpandableIds } from "../../core/tree-utils";

/**
 * Computes the initially expanded node IDs based on defaultExpandDepth
 * or explicit defaultExpandedIds.
 */
export function computeInitialExpanded<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  defaultExpandDepth: number,
  defaultExpandedIds?: string[],
): string[] {
  if (defaultExpandedIds !== undefined) {
    return [...defaultExpandedIds];
  }

  if (defaultExpandDepth <= 1) {
    return [];
  }

  return getExpandableIds(nodes, {
    maxDepth: defaultExpandDepth - 1,
    onlyWithChildren: true,
  });
}

/**
 * Returns all branch node IDs (for expand-all).
 */
export function getAllBranchIds<TMetadata>(
  nodes: TreeNode<TMetadata>[],
): string[] {
  return getBranchIds(nodes);
}

/**
 * Finds a node in the tree by ID and returns its full path.
 * Returns null if not found.
 */
export function findNodePath<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
  ancestors: TreeNode<TMetadata>[] = [],
): Array<TreeNode<TMetadata>> | null {
  return findPath(nodes, id, ancestors)?.nodes ?? null;
}

/**
 * Returns the ancestor IDs needed to reveal a node (all ancestors except
 * the node itself).
 */
export function getAncestorIdsToReveal<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  id: string,
): string[] {
  const path = findNodePath(nodes, id);

  if (!path) {
    return [];
  }

  return path.slice(0, -1).map((node) => node.id);
}
