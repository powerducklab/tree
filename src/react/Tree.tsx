import {
  forwardRef,
  useCallback,
  useEffect,
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
  ContextMenuItem,
  JsonPatchOp,
  TreeHandle,
  TreeProps,
  TreeRenderContext,
} from "./libs/types";
import { getAncestorIdsToReveal } from "./libs/utils";
import { getMethodLabel } from "./libs/methods";
import "./Tree.css";

/* Plain CSS class name map (no CSS modules dependency for build reliability). */
const styles = {
  branchControl: "pde-tree-branchControl",
  contextMenu: "pde-tree-contextMenu",
  contextMenuItem: "pde-tree-contextMenuItem",
  contextMenuItemDanger: "pde-tree-contextMenuItemDanger",
  contextMenuItemConfirming: "pde-tree-contextMenuItemConfirming",
  contextMenuIcon: "pde-tree-contextMenuIcon",
  contextMenuSeparator: "pde-tree-contextMenuSeparator",
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
  moreButton: "pde-tree-moreButton",
  moreButtonActive: "pde-tree-moreButtonActive",
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

import {
  LuBraces,
  LuChevronDown,
  LuChevronRight,
  LuChevronsDown,
  LuChevronsUp,
  LuCircle,
  LuEllipsisVertical,
  LuFolder,
  LuFolderOpen,
  LuGripVertical,
  LuList,
  LuRefreshCw,
  LuSearch,
  LuZap,
} from "react-icons/lu";

/* -------------------------------------------------------------------------- */
/* Icons (react-icons/lucide, high-quality flat design)                       */
/* -------------------------------------------------------------------------- */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <span className={styles.expandIcon}>
      {expanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
    </span>
  );
}

function SearchIcon() {
  return <LuSearch size={14} aria-hidden="true" />;
}

function DragHandleIcon() {
  return <LuGripVertical size={14} aria-hidden="true" />;
}

function MoreIcon() {
  return <LuEllipsisVertical size={14} aria-hidden="true" />;
}

/* -------------------------------------------------------------------------- */
/* Context menu (lightweight dropdown, no external dependency)                */
/* -------------------------------------------------------------------------- */

interface ContextMenuState<TMetadata> {
  x: number;
  y: number;
  node: TreeNode<TMetadata>;
  items: ContextMenuItem<TMetadata>[];
}

function ContextMenu<TMetadata>({
  state,
  onClose,
}: {
  state: ContextMenuState<TMetadata>;
  onClose: () => void;
}) {
  const { x, y, items } = state;
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);

  const handleItemClick = (item: ContextMenuItem<TMetadata>, index: number) => {
    if (item.confirm && confirmingIndex !== index) {
      setConfirmingIndex(index);
      return;
    }

    item.onClick(state.node);
    setConfirmingIndex(null);
    onClose();
  };

  return (
    <div
      className={styles.contextMenu}
      style={{ left: x, top: y }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} className={styles.contextMenuSeparator} />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={[
              styles.contextMenuItem,
              item.danger ? styles.contextMenuItemDanger : "",
              confirmingIndex === index ? styles.contextMenuItemConfirming : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={item.disabled}
            onClick={() => handleItemClick(item, index)}
          >
            {item.icon && <span className={styles.contextMenuIcon}>{item.icon}</span>}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.confirm && confirmingIndex === index
                ? item.confirmLabel ?? "Confirm?"
                : item.label}
            </span>
          </button>
        ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* JSON Patch helpers (for @powerduck/conf-patch integration)                 */
/* -------------------------------------------------------------------------- */

function getNodeJsonPath(node: TreeNode<unknown>): (string | number)[] | undefined {
  const metadata = node.metadata as Record<string, unknown> | undefined;
  const jsonPath = metadata?.jsonPath;

  if (Array.isArray(jsonPath) && jsonPath.length > 0) {
    return jsonPath as (string | number)[];
  }

  return undefined;
}

function buildReorderPatch(
  node: TreeNode<unknown>,
  fromIndex: number,
  toIndex: number,
): JsonPatchOp[] {
  const jsonPath = getNodeJsonPath(node);

  if (!jsonPath || jsonPath.length === 0) {
    return [];
  }

  /* The parent path is everything except the last segment (the array index). */
  const parentPath = jsonPath.slice(0, -1);

  return [
    { op: "move", from: [...parentPath, fromIndex], path: [...parentPath, toIndex] },
  ];
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
  const label = getMethodLabel(method);

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
  canDragNodeFn: (node: TreeNode<TMetadata>) => boolean;
  onDragStart: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragOver: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragLeave: (node: TreeNode<TMetadata>) => void;
  onDrop: (node: TreeNode<TMetadata>, event: React.DragEvent) => void;
  onDragEnd: () => void;
  /* Context menu */
  showContextMenuButton: boolean;
  activeMenuNodeId: string | null;
  onContextMenu: (node: TreeNode<TMetadata>, event: React.MouseEvent) => void;
  onMoreClick: (node: TreeNode<TMetadata>, event: React.MouseEvent) => void;
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
    canDragNodeFn,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    showContextMenuButton,
    activeMenuNodeId,
    onContextMenu,
    onMoreClick,
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
  const nodeKind = typeof metadata?.kind === "string" ? metadata.kind : undefined;

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
      {nodeKind === "section" && metadata?.section === "components" ? (
        <LuBraces size={14} />
      ) : nodeKind === "section" && metadata?.section === "webhooks" ? (
        <LuZap size={14} />
      ) : nodeKind === "schema" || nodeKind === "component" || nodeKind === "object" ? (
        <LuBraces size={14} />
      ) : nodeKind === "array" || nodeKind === "items" ? (
        <LuList size={14} />
      ) : isBranch ? (
        isExpanded ? (
          <LuFolderOpen size={14} />
        ) : (
          <LuFolder size={14} />
        )
      ) : (
        /* Primitive leaves (string, number, boolean, null, property, tag, etc.)
           use a unified small dot for a clean, consistent look. */
        <LuCircle size={8} />
      )}
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
    <>{required && <span className={styles.requiredDot} title="Required" />}</>
  );

  const rowClassName = [
    styles.nodeRow,
    isBranch ? styles.branchControl : styles.leafItem,
    isSelected ? styles.nodeRowSelected : "",
    isDragging ? styles.nodeDragging : "",
    isDragOver && dragOverPosition === "before" ? styles.dropIndicatorBefore : "",
    isDragOver && dragOverPosition === "after" ? styles.dropIndicatorAfter : "",
    isDragOver && dragOverPosition === "child" ? styles.dropIndicatorChild : "",
    nodeKind ? `pde-tree-kind-${nodeKind}` : "",
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
      onContextMenu={showContextMenuButton ? (event) => onContextMenu(node, event) : undefined}
      onDragOver={draggable ? (event) => onDragOver(node, event) : undefined}
      onDragLeave={draggable ? () => onDragLeave(node) : undefined}
      onDrop={draggable ? (event) => onDrop(node, event) : undefined}
    >
      {showIndentGuides &&
        depth > 1 &&
        Array.from({ length: depth - 1 }, (_, i) => (
          <span
            key={`guide-${i}`}
            className={styles.indentGuide}
            style={{ left: `${(i + 2) * 16 - 1}px` }}
          />
        ))}
      {draggable && canDragNode && (
        <span
          className={styles.dragHandle}
          draggable
          onDragStart={(event) => onDragStart(node, event)}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
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
      {method && <MethodBadge method={method} />}
      {defaultLabel}
      <span className={styles.nodeSuffix}>{defaultSuffix}</span>
      {showContextMenuButton && (
        <button
          type="button"
          className={[
            styles.moreButton,
            activeMenuNodeId === node.id ? styles.moreButtonActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={(event) => onMoreClick(node, event)}
          title="More actions"
          aria-label="More actions"
        >
          <MoreIcon />
        </button>
      )}
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
          canDragNode={canDragNodeFn(child)}
        />
      ))}
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
    showRefresh = false,
    onRefresh,
    toolbar,
    renderNode,
    renderIcon,
    renderLabel,
    renderSuffix,
    className,
    style,
    size = "sm",
    variant = "default",
    showIndentGuides = true,
    maxHeight,
    rootRef,
    draggable = false,
    dragGroupKey,
    onReorder,
    onMove,
    canDrag,
    canDrop,
    contextMenuItems,
    onPatch,
  } = props;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const [contextMenu, setContextMenu] = useState<ContextMenuState<TMetadata> | null>(null);
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

      /* Section nodes (e.g. APIs, Components) are not draggable by default. */
      const meta = node.metadata as Record<string, unknown> | undefined;
      if (meta?.kind === "section") {
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

      /* Drag group isolation: nodes from different groups cannot intermix. */
      if (dragGroupKey) {
        const draggedPath = findPath(nodes, dragState.draggedId);
        const targetPath = findPath(nodes, node.id);

        if (draggedPath && targetPath) {
          const resolveGroup = (path: typeof draggedPath): unknown => {
            const allNodes = [...path.nodes].reverse();
            for (const n of allNodes) {
              const meta = n.metadata as Record<string, unknown> | undefined;
              if (meta && dragGroupKey in meta) {
                return meta[dragGroupKey];
              }
            }
            return undefined;
          };

          const draggedGroup = resolveGroup(draggedPath);
          const targetGroup = resolveGroup(targetPath);

          if (
            draggedGroup !== undefined &&
            targetGroup !== undefined &&
            draggedGroup !== targetGroup
          ) {
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
      const targetParentId = targetPath.parent?.id ?? null;
      const isCrossParent = draggedPath?.parent?.id ?? null !== targetParentId;

      if (isCrossParent) {
        /* Cross-directory move: move to target's parent at the calculated index. */
        const movedNode = draggedPath?.target;
        const newNodes = moveNode(nodes, draggedId, targetParentId, toIndex);

        if (newNodes && movedNode) {
          onMove?.(newNodes, movedNode, targetParentId);
        }

        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      /* Same-parent reorder. */
      if (draggedPath && draggedPath.parent === targetPath.parent) {
        const draggedIndex = siblings.findIndex((sibling) => sibling.id === draggedId);

        if (draggedIndex !== -1 && draggedIndex < toIndex) {
          toIndex -= 1;
        }
      }

      const result = reorderNode(nodes, draggedId, toIndex);

      if (result && result.fromIndex !== result.toIndex) {
        onReorder?.(result);

        /* Emit JSON Patch if the moved node carries a jsonPath in metadata. */
        if (onPatch) {
          const patchOps = buildReorderPatch(result.moved, result.fromIndex, result.toIndex);

          if (patchOps.length > 0) {
            onPatch(patchOps, { node: result.moved, type: "reorder" });
          }
        }
      }

      setDragState(INITIAL_DRAG_STATE);
    },
    [dragState, nodes, onMove, onPatch, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(INITIAL_DRAG_STATE);
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Context menu                                                              */
  /* ------------------------------------------------------------------------ */

  const openContextMenu = useCallback(
    (node: TreeNode<TMetadata>, x: number, y: number) => {
      if (!contextMenuItems) {
        return;
      }

      const items = contextMenuItems(node);

      if (items.length === 0) {
        return;
      }

      /* Clamp position to viewport. */
      const menuWidth = 200;
      const menuHeight = items.length * 28 + 8;
      const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
      const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

      setContextMenu({ x: Math.max(8, clampedX), y: Math.max(8, clampedY), node, items });
    },
    [contextMenuItems],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = useCallback(
    (node: TreeNode<TMetadata>, event: React.MouseEvent) => {
      event.preventDefault();
      openContextMenu(node, event.clientX, event.clientY);
    },
    [openContextMenu],
  );

  const handleMoreButtonClick = useCallback(
    (node: TreeNode<TMetadata>, event: React.MouseEvent) => {
      event.stopPropagation();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      openContextMenu(node, rect.left, rect.bottom + 4);
    },
    [openContextMenu],
  );

  /* Close context menu on outside click or escape. */
  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (!target.closest(`.${styles.contextMenu}`) && !target.closest(`.${styles.moreButton}`)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

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

  const rootClassName = [
    styles.root,
    variant !== "default" ? `pde-tree-variant-${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
                <LuChevronsDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={expansion.collapseAll}
                disabled={expansion.expandedIds.length === 0}
                title="Collapse all"
                aria-label="Collapse all"
              >
                <LuChevronsUp size={14} aria-hidden="true" />
              </button>
            </>
          )}
          {showRefresh && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefresh}
              title="Refresh"
              aria-label="Refresh"
            >
              <LuRefreshCw size={14} aria-hidden="true" />
            </button>
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
              depth={0}
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
              canDragNodeFn={canDragNode}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              showContextMenuButton={Boolean(contextMenuItems)}
              activeMenuNodeId={contextMenu?.node.id ?? null}
              onContextMenu={handleNodeContextMenu}
              onMoreClick={handleMoreButtonClick}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu state={contextMenu} onClose={closeContextMenu} />
      )}
    </div>
  );
}) as <TMetadata = unknown>(
  props: TreeProps<TMetadata> & { ref?: React.Ref<TreeHandle> },
) => React.ReactElement;
