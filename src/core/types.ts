/**
 * Generic tree node with extensible metadata.
 *
 * The metadata field is generic so each adapter (openapi, json-schema, doc)
 * can attach its own data without subclassing.
 */
export interface TreeNode<TMetadata = unknown> {
  /** Unique identifier within the tree. */
  id: string;
  /** Display label. */
  name: string;
  /** Optional sort order. Lower values come first. */
  order?: number;
  /** Child nodes. Undefined means a leaf; empty array means expandable with no children. */
  children?: TreeNode<TMetadata>[];
  /** Adapter-specific data (method, path, jsonPath, type, etc.). */
  metadata?: TMetadata;
}

/**
 * A resolved path through the tree, from root to a target node.
 */
export interface TreePath<TMetadata = unknown> {
  /** All nodes from root (inclusive) to the target (inclusive). */
  nodes: TreeNode<TMetadata>[];
  /** The target node (last in nodes). */
  target: TreeNode<TMetadata>;
  /** The parent node, or undefined if the target is at the root level. */
  parent: TreeNode<TMetadata> | undefined;
  /** IDs of all ancestor nodes (excluding the target). */
  ancestorIds: string[];
}

/**
 * Options for filtering trees.
 */
export interface FilterTreeOptions {
  /** Case-insensitive substring match on node name and id. */
  query: string;
  /** When true, ancestors of matching nodes are retained even if they do not match. */
  keepAncestors?: boolean;
}

/**
 * Options for building expansion paths.
 */
export interface ExpandOptions {
  /** Maximum depth to expand. Root nodes have depth 1; 0 expands nothing. Defaults to Infinity. */
  maxDepth?: number;
  /** When true, only expand nodes that have children. Defaults to true. */
  onlyWithChildren?: boolean;
}
