import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TreeNode } from "../core/types";
import { findPath, moveNode, reorderNode } from "../core/tree-utils";

import { useTreeExpansion } from "./hooks/useTreeExpansion";
import { useTreeSearch } from "./hooks/useTreeSearch";
import type {
  TreeHandle,
  TreeProps,
  TreeRenderContext,
} from "./libs/types";
import { getAncestorIdsToReveal } from "./libs/utils";
import "./Tree.css";

/* Plain CSS class name map (no CSS modules dependency for build reliability). */
const styles = {
  branchControl: "pde-tree-branchControl",
  deprecatedLabel: "pde-tree-deprecatedLabel",
  dragHandle: "pde-tree-dragHandle",
  dragHandleDisabled: "pde-tree-dragHandleDisabled",
  dropIndicatorAfter: "pde-tree-dropIndicatorAfter",
  dropIndicatorBefore: "pde-tree-dropIndicatorBefore",
  dropIndicatorChild: "pde-tree-dropIndicatorChild",
  emptyState: "pde-tree-emptyState",
  expandIcon: "pde-tree-expandIcon",
  expandIconExpanded: "pde-tree-expandIconExpanded",
  expandIconPlaceholder: "pde-tree-expandIconPlaceholder",
  highlight: "pde-tree-highlight",
  iconButton: "pde-tree-iconButton",
  indentGuide: "pde-tree-indentGuide",
  leafItem: "pde-tree-leafItem",
  methodBadge: "pde-tree-methodBadge",
  methodDelete: "pde-tree-methodDelete",
  methodGet: "pde-tree-methodGet",
  methodOther: "pde-tree-methodOther",
  methodPatch: "pde-tree-methodPatch",
  methodPost: "pde-tree-methodPost",
  methodPut: "pde-tree-methodPut",
  nodeDragging: "pde-tree-nodeDragging",
  nodeIcon: "pde-tree-nodeIcon",
  nodeLabel: "pde-tree-nodeLabel",
  nodeLabelBranch: "pde-tree-nodeLabelBranch",
  nodeRow: "pde-tree-nodeRow",
  nodeRowSelected: "pde-tree-nodeRowSelected",
  nodeSuffix: "pde-tree-nodeSuffix",
  requiredDot: "pde-tree-requiredDot",
  root: "pde-tree-root",
  searchIcon: "pde-tree-searchIcon",
  searchInput: "pde-tree-searchInput",
  searchInputWrap: "pde-tree-searchInputWrap",
  searchRow: "pde-tree-searchRow",
  toolbar: "pde-tree-toolbar",
  treeContainer: "pde-tree-treeContainer",
} as const;

/* -------------------------------------------------------------------------- */
/* Icons (inline SVG, no external dependency)                                 */
/* -------------------------------------------------------------------------- */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`${styles.expandIcon} ${expanded ? styles.expandIconExpanded : ""}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg
      width="12"
      height="16"
      viewBox="0 0 12 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="9" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="9" cy="13" r="1.2" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Highlight helper                                                           */
/* -------------------------------------------------------------------------- */

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) {
    return <>{text}</>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <span className={styles.highlight}>
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Method badge                                                               */
/* -------------------------------------------------------------------------- */

const METHOD_CLASS_MAP: Record<string, string> = {
  get: styles.methodGet,
  post: styles.methodPost,
  put: styles.methodPut,
  patch: styles.methodPatch,
  delete: styles.methodDelete,
};

function MethodBadge({ method }: { method: string }) {
  const normalized = method.toLowerCase();
  const className = METHOD_CLASS_MAP[normalized] ?? styles.methodOther;
  const label = normalized.slice(0, 4).toUpperCase();

  return <span className={`${styles.methodBadge} ${className}`}>{label}</span>;
}

/* -------------------------------------------------------------------------- */
/* Drag state                                                                  */
/* -------------------------------------------------------------------------- */

interface DragState {
  draggedId: string | null;
  dragOverId: string | null;
  dragOverPosition: "before" | "after" | "child" | null;
}

const INITIAL_DRAG_STATE: DragState = {
  draggedId: null,
  dragOverId: null,
  dragOverPosition: null,
};

/* -------------------------------------------------------------------------- */
/* Node renderer                                                              */
/* -------------------------------------------------------------------------- */

interface NodeRendererProps<TMetadata> {
  node: TreeNode<TMetadata>;
  depth: number;
  expandedIds: string[];
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode<TMetadata>) => void;
  onNodeRef: (id: string, element: HTMLElement | null) => void;
  searchQuery: string;
  showIndentGuides: boolean;
  renderIcon?: TreeProps<TMetadata>["renderIcon"];
  renderLabel?: TreeProps<TMetadata>["renderLabel"];
  renderSuffix?: TreeProps<TMetadata>["renderSuffix"];
  renderNode?: TreeProps<TMetadata>["renderNode"];
  /* Drag and drop */
  draggable: boolean;
  dragState: DragState;
  canDragNode: boolean;
  onDragStart: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragOver: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragLeave: (node: TreeNode<TMetadata>) => void;
  onDrop: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragEnd: () => void;
}

function NodeRenderer<TMetadata>(props: NodeRendererProps<TMetadata>) {
  const {
    node,
    depth,
    expandedIds,
    selectedId,
    onToggle,
    onSelect,
    onNodeRef,
    searchQuery,
    showIndentGuides,
    renderIcon,
    renderLabel,
    renderSuffix,
    renderNode,
    draggable,
    dragState,
    canDragNode,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  } = props;

  const isExpanded = expandedIds.includes(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isBranch = hasChildren;
  const isLeaf = !hasChildren;
  const isDragging = dragState.draggedId === node.id;
  const isDragOver = dragState.dragOverId === node.id;
  const dragOverPosition = isDragOver ? dragState.dragOverPosition : null;

  const metadata = node.metadata as Record<string, unknown> | undefined;
  const method = typeof metadata?.method === "string" ? metadata.method : undefined;
  const deprecated = metadata?.deprecated === true;
  const required = metadata?.required === true;

  const context: TreeRenderContext<TMetadata> = {
    node,
    depth,
    isExpanded,
    isSelected,
    isBranch,
    isLeaf,
    isDragging,
    isDragOver,
    dragOverPosition,
  };

  const handleClick = useCallback(() => {
    if (isBranch) {
      onToggle(node.id);
    } else {
      onSelect(node);
    }
  }, [isBranch, node, onSelect, onToggle]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleClick();
      } else if (event.key === "ArrowRight" && isBranch && !isExpanded) {
        event.preventDefault();
        onToggle(node.id);
      } else if (event.key === "ArrowLeft" && isBranch && isExpanded) {
        event.preventDefault();
        onToggle(node.id);
      }
    },
    [handleClick, isBranch, isExpanded, node.id, onToggle],
  );

  /* Default icon */
  const defaultIcon = renderIcon ? (
    renderIcon(context)
  ) : method ? null : (
    <span className={styles.nodeIcon}>
      <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
        {isBranch ? (
          <path
            d="M2 4C2 3.44772 2.44772 3 3 3H6.5L8.5 5H13C13.5523 5 14 5.44772 14 6V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12V4Z"
            fill="currentColor"
            opacity="0.3"
          />
        ) : (
          <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.4" />
        )}
      </svg>
    </span>
  );

  /* Default label */
  const defaultLabel = renderLabel ? (
    renderLabel(context)
  ) : (
    <span
      className={`${styles.nodeLabel} ${isBranch ? styles.nodeLabelBranch : ""} ${
        deprecated ? styles.deprecatedLabel : ""
      }`}
    >
      <HighlightedText text={node.name} query={searchQuery} />
    </span>
  );

  /* Default suffix */
  const defaultSuffix = renderSuffix ? (
    renderSuffix(context)
  ) : (
    <>
      {method && <MethodBadge method={method} />}
      {required && <span className={styles.requiredDot} title="Required" />}
    </>
  );

  const rowClassName = [
    styles.nodeRow,
    isBranch ? styles.branchControl : styles.leafItem,
    isSelected ? styles.nodeRowSelected : "",
    isDragging ? styles.nodeDragging : "",
    isDragOver && dragOverPosition === "before" ? styles.dropIndicatorBefore : "",
    isDragOver && dragOverPosition === "after" ? styles.dropIndicatorAfter : "",
    isDragOver && dragOverPosition === "child" ? styles.dropIndicatorChild : "",
  ]
    .filter(Boolean)
    .join(" ");

  const defaultNode = (
    <div
      ref={(element) => onNodeRef(node.id, element)}
      className={rowClassName}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      role="treeitem"
      aria-expanded={isBranch ? isExpanded : undefined}
      aria-selected={isSelected}
      aria-level={depth}
      aria-grabbed={draggable && canDragNode ? isDragging : undefined}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={draggable ? (event) => onDragOver(node, event) : undefined}
      onDragLeave={draggable ? () => onDragLeave(node) : undefined}
      onDrop={draggable ? (event) => onDrop(node, event) : undefined}
    >
      {draggable && (
        <span
          className={`${styles.dragHandle} ${canDragNode ? "" : styles.dragHandleDisabled}`}
          draggable={canDragNode}
          onDragStart={canDragNode ? (event) => onDragStart(node, event) : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
          title={canDragNode ? "Drag to reorder" : "Cannot drag this node"}
          aria-label="Drag to reorder"
        >
          <DragHandleIcon />
        </span>
      )}
      {isBranch ? (
        <ChevronIcon expanded={isExpanded} />
      ) : (
        <span className={styles.expandIconPlaceholder} />
      )}
      {defaultIcon}
      {defaultLabel}
      <span className={styles.nodeSuffix}>{defaultSuffix}</span>
    </div>
  );

  const content = renderNode ? renderNode(context, defaultNode) : defaultNode;

  return (
    <div role="presentation">
      {content}
      {isBranch && isExpanded && node.children?.map((child) => (
        <NodeRenderer
          key={child.id}
          {...props}
          node={child}
          depth={depth + 1}
        />
      ))}
      {showIndentGuides && isBranch && !isExpanded && null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export const Tree = forwardRef(function Tree<TMetadata = unknown>(
  props: TreeProps<TMetadata>,
  ref: React.Ref<TreeHandle>,
) {
  const {
    nodes,
    onSelect,
    onExpandedChange,
    defaultExpandedIds,
    defaultExpandDepth = 1,
    searchable = false,
    searchPlaceholder = "Search...",
    showExpandAll = false,
    toolbar,
    renderNode,
    renderIcon,
    renderLabel,
    renderSuffix,
    className,
    style,
    size = "sm",
    showIndentGuides = true,
    maxHeight,
    rootRef,
    draggable = false,
    onReorder,
    onMove,
    canDrag,
    canDrop,
  } = props;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const containerRef = useRef<HTMLDivElement>(null);

  const expansion = useTreeExpansion(nodes, {
    defaultExpandedIds,
    defaultExpandDepth,
    onExpandedChange,
  });

  const search = useTreeSearch(nodes);

  /* When searching, expand all matching branches. */
  const visibleExpandedIds = search.isSearching
    ? expansion.allBranchIds
    : search.expandedBeforeSearch ?? expansion.expandedIds;

  const handleSelect = useCallback(
    (node: TreeNode<TMetadata>) => {
      setSelectedId(node.id);
      onSelect?.(node);
    },
    [onSelect],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      search.handleQueryChange(value, expansion.expandedIds);
    },
    [expansion.expandedIds, search],
  );

  /* ------------------------------------------------------------------------ */
  /* Drag and drop handlers                                                   */
  /* ------------------------------------------------------------------------ */

  const canDragNode = useCallback(
    (node: TreeNode<TMetadata>) => {
      if (!draggable) {
        return false;
      }

      if (canDrag) {
        return canDrag(node);
      }

      return true;
    },
    [canDrag, draggable],
  );

  const handleDragStart = useCallback(
    (node: TreeNode<TMetadata>, event: React.DragEvent) => {
      if (!canDragNode(node)) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", node.id);

      setDragState({
        draggedId: node.id,
        dragOverId: null,
        dragOverPosition: null,
      });
    },
    [canDragNode],
  );

  const handleDragOver = useCallback(
    (node: TreeNode<TMetadata>, event: React.DragEvent) => {
      if (!dragState.draggedId || dragState.draggedId === node.id) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const relativeY = (event.clientY - rect.top) / rect.height;
      const hasChildren = (node.children?.length ?? 0) > 0;

      /* Three-zone detection for branch nodes: before (top 25%), child (middle 50%), after (bottom 25%).
         Leaf nodes only support before/after. */
      let position: "before" | "after" | "child";

      if (hasChildren) {
        if (relativeY < 0.25) {
          position = "before";
        } else if (relativeY > 0.75) {
          position = "after";
        } else {
          position = "child";
        }
      } else {
        position = relativeY < 0.5 ? "before" : "after";
      }

      /* Prevent dropping into own descendant (circular reference). */
      if (position === "child") {
        const draggedPath = findPath(nodes, dragState.draggedId);

        if (draggedPath) {
          const isDescendant = draggedPath.ancestorIds.includes(node.id);

          if (isDescendant) {
            return;
          }
        }
      }

      /* Check canDrop predicate if provided. */
      if (canDrop) {
        const draggedPath = findPath(nodes, dragState.draggedId);
        const draggedNode = draggedPath?.target;

        if (!draggedNode || !canDrop(draggedNode, node, position)) {
          return;
        }
      }

      setDragState((prev) => {
        if (prev.dragOverId === node.id && prev.dragOverPosition === position) {
          return prev;
        }

        return {
          ...prev,
          dragOverId: node.id,
          dragOverPosition: position,
        };
      });
    },
    [canDrop, dragState.draggedId, nodes],
  );

  const handleDragLeave = useCallback(
    (node: TreeNode<TMetadata>) => {
      setDragState((prev) => {
        if (prev.dragOverId !== node.id) {
          return prev;
        }

        return { ...prev, dragOverId: null, dragOverPosition: null };
      });
    },
    [],
  );

  const handleDrop = useCallback(
    (node: TreeNode<TMetadata>, event: React.DragEvent) => {
      event.preventDefault();

      const draggedId = dragState.draggedId;
      const position = dragState.dragOverPosition;

      if (!draggedId || !position || draggedId === node.id) {
        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      /* Cross-level move: drop into a folder. */
      if (position === "child") {
        const draggedPath = findPath(nodes, draggedId);
        const movedNode = draggedPath?.target;

        if (!movedNode) {
          setDragState(INITIAL_DRAG_STATE);
          return;
        }

        const newNodes = moveNode(nodes, draggedId, node.id);

        if (newNodes) {
          onMove?.(newNodes, movedNode, node.id);
        }

        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      /* Same-level reorder: before or after. */
      const targetPath = findPath(nodes, node.id);

      if (!targetPath) {
        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      const siblings = targetPath.parent?.children ?? nodes;
      const targetIndex = siblings.findIndex((sibling) => sibling.id === node.id);

      if (targetIndex === -1) {
        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      let toIndex = position === "before" ? targetIndex : targetIndex + 1;

      const draggedPath = findPath(nodes, draggedId);

      if (draggedPath && draggedPath.parent === targetPath.parent) {
        const draggedIndex = siblings.findIndex((sibling) => sibling.id === draggedId);

        if (draggedIndex !== -1 && draggedIndex < toIndex) {
          toIndex -= 1;
        }
      }

      const result = reorderNode(nodes, draggedId, toIndex);

      if (result && result.fromIndex !== result.toIndex) {
        onReorder?.(result);
      }

      setDragState(INITIAL_DRAG_STATE);
    },
    [dragState, nodes, onMove, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(INITIAL_DRAG_STATE);
  }, []);

  /* ------------------------------------------------------------------------ */

  const locateNode = useCallback(
    (id: string) => {
      const ancestorIds = getAncestorIdsToReveal(nodes, id);

      expansion.setExpandedIds([
        ...new Set([...expansion.expandedIds, ...ancestorIds]),
      ]);

      requestAnimationFrame(() => {
        expansion.scrollToNode(id);
      });
    },
    [expansion, nodes],
  );

  useImperativeHandle(
    ref,
    () => ({
      expandAll: expansion.expandAll,
      collapseAll: expansion.collapseAll,
      expandToDepth: expansion.expandToDepth,
      getExpandedIds: () => expansion.expandedIds,
      getSelectedNode: () => {
        if (!selectedId) {
          return undefined;
        }

        const path = findPath(nodes, selectedId);
        return path?.target;
      },
      scrollToNode: locateNode,
      locateNode: (predicate: (node: TreeNode<TMetadata>) => boolean) => {
        /* BFS search for the first matching node. */
        const queue: TreeNode<TMetadata>[] = [...nodes];

        while (queue.length > 0) {
          const node = queue.shift();

          if (!node) {
            continue;
          }

          if (predicate(node)) {
            /* Expand all ancestors and select the node. */
            const path = findPath(nodes, node.id);

            if (path) {
              expansion.setExpandedIds([
                ...new Set([...expansion.expandedIds, ...path.ancestorIds]),
              ]);
            }

            setSelectedId(node.id);

            requestAnimationFrame(() => {
              expansion.scrollToNode(node.id);
            });

            return node;
          }

          if (node.children?.length) {
            queue.push(...node.children);
          }
        }

        return undefined;
      },
    }),
    [expansion, locateNode, selectedId, nodes],
  );

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      ...style,
      ...(maxHeight !== undefined ? { maxHeight } : {}),
    }),
    [style, maxHeight],
  );

  const rootClassName = [styles.root, className].filter(Boolean).join(" ");

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      style={containerStyle}
      data-size={size}
    >
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}

      {searchable && (
        <div className={styles.searchRow}>
          <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              className={styles.searchInput}
              type="search"
              placeholder={searchPlaceholder}
              value={search.query}
              onChange={(event) => handleSearchChange(event.target.value)}
              aria-label="Search tree"
            />
          </div>
          {showExpandAll && (
            <>
              <button
                type="button"
                className={styles.iconButton}
                onClick={expansion.expandAll}
                disabled={expansion.isAllExpanded}
                title="Expand all"
                aria-label="Expand all"
              >
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
                  <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={expansion.collapseAll}
                disabled={expansion.expandedIds.length === 0}
                title="Collapse all"
                aria-label="Collapse all"
              >
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
                  <path d="M4 4H14M4 8H14M4 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className={styles.treeContainer}
        role="tree"
        aria-label="Tree navigation"
      >
        {search.filteredNodes.length === 0 ? (
          <div className={styles.emptyState}>
            {search.isSearching ? "No matching results" : "No items"}
          </div>
        ) : (
          search.filteredNodes.map((node) => (
            <NodeRenderer
              key={node.id}
              node={node}
              depth={1}
              expandedIds={visibleExpandedIds}
              selectedId={selectedId}
              onToggle={expansion.toggleNode}
              onSelect={handleSelect}
              onNodeRef={expansion.setNodeElementRef}
              searchQuery={search.deferredQuery}
              showIndentGuides={showIndentGuides}
              renderIcon={renderIcon}
              renderLabel={renderLabel}
              renderSuffix={renderSuffix}
              renderNode={renderNode}
              draggable={draggable}
              dragState={dragState}
              canDragNode={canDragNode(node)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}) as <TMetadata = unknown>(
  props: TreeProps<TMetadata> & { ref?: React.Ref<TreeHandle> },
) => React.ReactElement;
