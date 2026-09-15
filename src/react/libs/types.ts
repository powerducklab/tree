import type { ReactNode } from "react";

import type { TreeNode } from "../../core/types";
import type { ReorderResult } from "../../core/tree-utils";

/**
 * Render context passed to custom render functions.
 */
export interface TreeRenderContext<TMetadata = unknown> {
  node: TreeNode<TMetadata>;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  isBranch: boolean;
  isLeaf: boolean;
  /** Whether this node is currently being dragged. */
  isDragging: boolean;
  /** Whether this node is the current drop target. */
  isDragOver: boolean;
  /** Drop position relative to this node. */
  dragOverPosition: "before" | "after" | "child" | null;
}

/**
 * Props for the Tree component.
 */
export interface TreeProps<TMetadata = unknown> {
  /** Root nodes to render. */
  nodes: TreeNode<TMetadata>[];

  /** Called when a leaf node is selected (clicked). */
  onSelect?: (node: TreeNode<TMetadata>) => void;

  /** Called when expanded nodes change. */
  onExpandedChange?: (expandedIds: string[]) => void;

  /** Initially expanded node IDs. Overrides defaultExpandDepth. */
  defaultExpandedIds?: string[];

  /** Default expansion depth. 1 = root only, 2 = root + children, etc. Default 1. */
  defaultExpandDepth?: number;

  /** Enable search input. Default false. */
  searchable?: boolean;

  /** Placeholder text for the search input. Default "Search...". */
  searchPlaceholder?: string;

  /** Show expand/collapse all buttons in the toolbar. Default false. */
  showExpandAll?: boolean;

  /** Custom toolbar content rendered above the tree. */
  toolbar?: ReactNode;

  /** Custom node renderer. Overrides all default rendering. */
  renderNode?: (
    context: TreeRenderContext<TMetadata>,
    defaultNode: ReactNode,
  ) => ReactNode;

  /** Custom icon renderer. */
  renderIcon?: (context: TreeRenderContext<TMetadata>) => ReactNode;

  /** Custom label renderer. */
  renderLabel?: (context: TreeRenderContext<TMetadata>) => ReactNode;

  /** Custom suffix renderer (rendered after the label, e.g. badges). */
  renderSuffix?: (context: TreeRenderContext<TMetadata>) => ReactNode;

  /** Additional CSS class name. */
  className?: string;

  /** Inline styles. */
  style?: React.CSSProperties;

  /** Size variant. Default "sm". */
  size?: "xs" | "sm" | "md";

  /** Whether to show indent guides. Default true. */
  showIndentGuides?: boolean;

  /** Maximum height before scrolling. Default undefined (no limit). */
  maxHeight?: number | string;

  /** Callback ref for the root DOM element. */
  rootRef?: React.Ref<HTMLDivElement>;

  /** Enable drag and drop reordering. Default false. */
  draggable?: boolean;

  /** Called when a node is reordered via drag and drop. */
  onReorder?: (result: ReorderResult<TMetadata>) => void;

  /** Called when a node is moved to a different parent via drag and drop. */
  onMove?: (nodes: TreeNode<TMetadata>[], movedNode: TreeNode<TMetadata>, targetParentId: string | null) => void;

  /** Predicate to control which nodes can be dragged. Default all nodes draggable. */
  canDrag?: (node: TreeNode<TMetadata>) => boolean;

  /** Predicate to control whether a drop is allowed at the target. Default all drops allowed. */
  canDrop?: (
    draggedNode: TreeNode<TMetadata>,
    targetNode: TreeNode<TMetadata>,
    position: "before" | "after" | "child",
  ) => boolean;
}

/**
 * Handle exposed by the Tree component via ref.
 */
export interface TreeHandle {
  /** Expand all nodes. */
  expandAll: () => void;
  /** Collapse all nodes. */
  collapseAll: () => void;
  /** Expand nodes to a specific depth. */
  expandToDepth: (depth: number) => void;
  /** Get the currently expanded node IDs. */
  getExpandedIds: () => string[];
  /** Get the currently selected node. */
  getSelectedNode: () => TreeNode | undefined;
  /** Scroll a node into view by ID. */
  scrollToNode: (id: string) => void;
  /** Find a node by predicate, expand its ancestors, select it, and scroll into view. Returns the found node or undefined. */
  locateNode: (predicate: (node: TreeNode) => boolean) => TreeNode | undefined;
}
