import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TreeNode } from "../core/types";
import { moveNode, reorderNode } from "../core/tree-utils";

import { ContextMenu, type ContextMenuState } from "./components/ContextMenu";
import { useTreeExpansion } from "./hooks/useTreeExpansion";
import { useTreeSearch } from "./hooks/useTreeSearch";
import type {
  JsonPatchOp,
  TreeHandle,
  TreeProps,
  TreeRenderContext,
} from "./libs/types";
import { indexTree } from "./libs/tree-index";
import { getMethodLabel } from "./libs/methods";
import "./Tree.css";

/* Plain CSS class name map (no CSS modules dependency for build reliability). */
const styles = {
  branchControl: "pde-tree-branchControl",
  deprecatedLabel: "pde-tree-deprecatedLabel",
  dragHandle: "pde-tree-dragHandle",
  dropIndicatorAfter: "pde-tree-dropIndicatorAfter",
  dropIndicatorBefore: "pde-tree-dropIndicatorBefore",
  dropIndicatorChild: "pde-tree-dropIndicatorChild",
  emptyState: "pde-tree-emptyState",
  expandIcon: "pde-tree-expandIcon",
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
  primitiveDot: "pde-tree-primitiveDot",
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
  LuEllipsisVertical,
  LuFolder,
  LuFolderOpen,
  LuGripVertical,
  LuList,
  LuRefreshCw,
  LuSearch,
  LuZap,
} from "react-icons/lu";
import { MdOutlineUnfoldMore, MdUnfoldLess } from "react-icons/md";

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

/* -------------------------------------------------------------------------- */
/* JSON Patch helpers (for @powerduck/conf-patch integration)                 */
/* -------------------------------------------------------------------------- */

function getNodeJsonPath(node: TreeNode<unknown>): (string | number)[] | undefined {
  const metadata = node.metadata as Record<string, unknown> | undefined;
  const jsonPath = metadata?.jsonPath;

  if (Array.isArray(jsonPath) && jsonPath.length > 0 && jsonPath.every((segment) => typeof segment === "string" || (typeof segment === "number" && Number.isInteger(segment) && segment >= 0))) {
    return jsonPath as (string | number)[];
  }

  return undefined;
}

function buildReorderPatch(
  node: TreeNode<unknown>,
  fromIndex: number,
  toIndex: number,
  siblings: TreeNode<unknown>[],
): JsonPatchOp[] {
  const jsonPath = getNodeJsonPath(node);

  if (!jsonPath || jsonPath.length === 0) {
    return [];
  }

  // Only emit array moves when rendered order matches the source array.
  // Object properties and sorted or filtered views do not have array indices.
  const parent = JSON.stringify(jsonPath.slice(0, -1));
  if (!siblings.every((sibling, index) => {
    const path = getNodeJsonPath(sibling);
    return path && path[path.length - 1] === index && JSON.stringify(path.slice(0, -1)) === parent;
  })) return [];

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
  const className = Object.prototype.hasOwnProperty.call(METHOD_CLASS_MAP, normalized) ? METHOD_CLASS_MAP[normalized] : styles.methodOther;
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
  isFocused: boolean;
  positionInSet: number;
  setSize: number;
  onFocusNode: (id: string) => void;
  /** Derived: whether this node is expanded (for React.memo comparison). */
  isExpanded: boolean;
  /** Derived: whether this node is selected (for React.memo comparison). */
  isSelected: boolean;
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
  /* Context menu */
  showContextMenuButton: boolean;
  activeMenuNodeId: string | null;
  onContextMenu: (node: TreeNode<TMetadata>, event: React.MouseEvent) => void;
  onMoreClick: (node: TreeNode<TMetadata>, event: React.MouseEvent) => void;
}

/** Only rows whose own state or callbacks change need to render again. */
function areNodePropsEqual<TMetadata>(
  prev: NodeRendererProps<TMetadata>,
  next: NodeRendererProps<TMetadata>,
): boolean {
  if (prev.isFocused !== next.isFocused || prev.positionInSet !== next.positionInSet || prev.setSize !== next.setSize) return false;
  if (prev.node !== next.node) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.showIndentGuides !== next.showIndentGuides) return false;
  if (prev.canDragNode !== next.canDragNode) return false;
  if (prev.draggable !== next.draggable) return false;
  if (prev.showContextMenuButton !== next.showContextMenuButton) return false;
  if ((prev.activeMenuNodeId === prev.node.id) !== (next.activeMenuNodeId === next.node.id)) return false;

  /* Drag-derived state: only re-render if this node is involved. */
  const prevDragging = prev.dragState.draggedId === prev.node.id;
  const nextDragging = next.dragState.draggedId === next.node.id;
  if (prevDragging !== nextDragging) return false;

  const prevDragOver = prev.dragState.dragOverId === prev.node.id;
  const nextDragOver = next.dragState.dragOverId === next.node.id;
  if (prevDragOver !== nextDragOver) return false;
  if (
    prevDragOver &&
    nextDragOver &&
    prev.dragState.dragOverPosition !== next.dragState.dragOverPosition
  ) {
    return false;
  }

  /* Render props: compare references (consumer should memoize). */
  if (prev.renderIcon !== next.renderIcon) return false;
  if (prev.renderLabel !== next.renderLabel) return false;
  if (prev.renderSuffix !== next.renderSuffix) return false;
  if (prev.renderNode !== next.renderNode) return false;

  /* Callbacks: should be stable via useCallback. */
  if (prev.onToggle !== next.onToggle) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onNodeRef !== next.onNodeRef) return false;
  if (prev.onDragStart !== next.onDragStart) return false;
  if (prev.onDragOver !== next.onDragOver) return false;
  if (prev.onDragLeave !== next.onDragLeave) return false;
  if (prev.onDrop !== next.onDrop) return false;
  if (prev.onDragEnd !== next.onDragEnd) return false;
  if (prev.onContextMenu !== next.onContextMenu) return false;
  if (prev.onMoreClick !== next.onMoreClick) return false;

  return true;
}

function NodeRendererInner<TMetadata>(props: NodeRendererProps<TMetadata>) {
  const {
    node,
    depth,

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
    showContextMenuButton,
    activeMenuNodeId,
    onContextMenu,
    onMoreClick,
  } = props;

  const { isExpanded, isSelected } = props;
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
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleClick();
      } else if (event.key === "ArrowRight" && isBranch && !isExpanded) {
        event.preventDefault();
        event.stopPropagation();
        onToggle(node.id);
      } else if (event.key === "ArrowLeft" && isBranch && isExpanded) {
        event.preventDefault();
        event.stopPropagation();
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
           use a unified CSS dot for consistent size and centering. */
        // <span className={styles.primitiveDot} />
        method && <MethodBadge method={method} />
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

  /* Default suffix: only consumer renderSuffix (required dot is inline after label) */
  const defaultSuffix = renderSuffix ? renderSuffix(context) : null;

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

  const setRowRef = useCallback((element: HTMLDivElement | null) => onNodeRef(node.id, element), [node.id, onNodeRef]);
  const defaultNode = (
    <div
      ref={setRowRef}
      className={rowClassName}
      style={{ paddingLeft: `${Math.min(depth, 20) * 12 + 4}px` }}
      data-node-id={node.id}
      role="treeitem"
      aria-expanded={isBranch ? isExpanded : undefined}
      aria-label={method ? `${getMethodLabel(method)} ${node.name}` : node.name}
      aria-selected={isSelected}
      aria-level={depth + 1}
      aria-posinset={props.positionInSet}
      aria-setsize={props.setSize}
      aria-grabbed={draggable && canDragNode ? isDragging : undefined}
      tabIndex={props.isFocused ? 0 : -1}
      onFocus={() => props.onFocusNode(node.id)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={showContextMenuButton ? (event) => onContextMenu(node, event) : undefined}
      onDragOver={draggable ? (event) => onDragOver(node, event) : undefined}
      onDragLeave={draggable ? () => onDragLeave(node) : undefined}
      onDrop={draggable ? (event) => onDrop(node, event) : undefined}
    >
      {showIndentGuides &&
        depth > 1 &&
        Array.from({ length: Math.min(depth - 1, 20) }, (_, i) => (
          <span
            key={`guide-${i}`}
            className={styles.indentGuide}
            style={{ left: `${(i + 1) * 12 + 11}px` }}
          />
        ))}
      {draggable && canDragNode ? (
        <span
          className={styles.dragHandle}
          style={{ left: `${Math.min(depth, 20) * 12 + 4}px` }}
          draggable
          onDragStart={(event) => onDragStart(node, event)}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <DragHandleIcon />
        </span>
      ) : null}
      {isBranch ? (
        <ChevronIcon expanded={isExpanded} />
      ) : (
        <span className={styles.expandIconPlaceholder} />
      )}
      {defaultIcon}
      {/* {method && <MethodBadge method={method} />} */}
      {defaultLabel}
      {required && <span className={styles.requiredDot} title="Required" />}
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
          aria-label={`More actions for ${node.name}`}
          aria-haspopup="menu"
          aria-expanded={activeMenuNodeId === node.id}
          tabIndex={-1}
        >
          <MoreIcon />
        </button>
      )}
    </div>
  );

  const content = renderNode ? renderNode(context, defaultNode) : defaultNode;

  return <>{content}</>;
}

/* Memoized with custom equality to prevent full-tree re-renders on every
   expand/select/drag-over event. Only nodes whose derived state changes
   (isExpanded, isSelected, drag-involvement) will re-render. */
const NodeRenderer = memo(NodeRendererInner, areNodePropsEqual) as typeof NodeRendererInner;

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
    searchRowExtra,
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
    onContextMenuOpen,
    onPatch,
    theme,
    virtualized = "auto",
  } = props;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const [contextMenu, setContextMenu] = useState<ContextMenuState<TMetadata> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const nodeIndex = useMemo(() => indexTree(nodes), [nodes]);
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const [pendingScroll, setPendingScroll] = useState<{ id: string; focus: boolean } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);


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

  const expandedSet = useMemo(() => new Set(visibleExpandedIds), [visibleExpandedIds]);
  const visibleRows = useMemo(() => {
    const result: Array<{ node: TreeNode<TMetadata>; depth: number; parentId: string | null; positionInSet: number; setSize: number }> = [];
    const seen = new Set<string>();
    const stack = search.filteredNodes.map((node, index, siblings) => ({ node, depth: 0, parentId: null as string | null, positionInSet: index + 1, setSize: siblings.length })).reverse();
    while (stack.length) {
      const row = stack.pop()!;
      if (seen.has(row.node.id)) continue;
      seen.add(row.node.id);
      result.push(row);
      if (expandedSet.has(row.node.id)) {
        const children = row.node.children ?? [];
        for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, depth: row.depth + 1, parentId: row.node.id, positionInSet: i + 1, setSize: children.length });
      }
    }
    return result;
  }, [search.filteredNodes, expandedSet]);
  const visibleIndex = useMemo(() => new Map(visibleRows.map((row, index) => [row.node.id, index])), [visibleRows]);
  const rowHeight = size === "xs" ? 24 : size === "md" ? 32 : 28;
  const windowed = virtualized !== false && variant !== "doc" && !renderNode && (virtualized === true || visibleRows.length > 500);
  const startRow = windowed ? Math.max(0, Math.min(Math.floor(viewport.top / rowHeight) - 8, visibleRows.length - 1)) : 0;
  const endRow = windowed ? Math.min(visibleRows.length, startRow + Math.ceil(viewport.height / rowHeight) + 16) : visibleRows.length;
  const renderedRows = visibleRows.slice(startRow, endRow);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setViewport({ top: container.scrollTop, height: container.clientHeight || 400 });
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    if (!pendingScroll) return;
    const index = visibleIndex.get(pendingScroll.id);
    if (index === undefined) { setPendingScroll(null); return; }
    const container = containerRef.current;
    if (windowed && container && (index < startRow || index >= endRow)) {
      const height = container.clientHeight || 400;
      const top = Math.min(index * rowHeight, Math.max(0, visibleRows.length * rowHeight - height));
      container.scrollTop = top;
      setViewport((current) => ({ ...current, top: container.scrollTop }));
      return;
    }
    // Focus only after the requested row's render window has committed.
    const element = expansion.nodeElementRefs.current.get(pendingScroll.id);
    if (pendingScroll.focus) element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: "nearest" });
    setPendingScroll(null);
  }, [pendingScroll, visibleIndex, windowed, rowHeight, startRow, endRow, visibleRows.length, expansion.nodeElementRefs]);
  const focusedIndex = focusedId === null ? undefined : visibleIndex.get(focusedId);
  const tabStopId = focusedIndex !== undefined && focusedIndex >= startRow && focusedIndex < endRow ? focusedId : renderedRows[0]?.node.id;
  const typeahead = useRef({ query: "", time: 0 });
  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "treeitem") return;
    const index = visibleIndex.get(event.target.dataset.nodeId ?? "");
    if (index === undefined) return;
    const row = visibleRows[index]!;
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(index + 1, visibleRows.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visibleRows.length - 1;
    else if (event.key === "ArrowRight" && row.node.children?.length && expandedSet.has(row.node.id)) next = Math.min(index + 1, visibleRows.length - 1);
    else if (event.key === "ArrowLeft" && (!row.node.children?.length || !expandedSet.has(row.node.id))) next = visibleIndex.get(row.parentId ?? "") ?? index;
    else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      const rect = event.target.getBoundingClientRect();
      event.preventDefault();
      openContextMenu(row.node, rect.left + 24, rect.bottom);
      return;
    } else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const query = now - typeahead.current.time < 600 ? typeahead.current.query + event.key.toLowerCase() : event.key.toLowerCase();
      typeahead.current = { query, time: now };
      for (let offset = 1; offset <= visibleRows.length; offset++) {
        const candidate = (index + offset) % visibleRows.length;
        if (visibleRows[candidate]!.node.name.toLowerCase().startsWith(query)) { next = candidate; break; }
      }
    } else return;
    event.preventDefault();
    const id = visibleRows[next]!.node.id;
    setFocusedId(id);
    setPendingScroll({ id, focus: true });
  };

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setViewport((current) => ({ ...current, top: 0 }));
  }, [search.deferredQuery]);

  const handleSelect = useCallback(
    (node: TreeNode<TMetadata>) => {
      setSelectedId(node.id);
      onSelect?.(node);
    },
    [onSelect],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      if (!value.trim() && search.expandedBeforeSearch) expansion.setExpandedIds(search.expandedBeforeSearch);
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

  const isAllowedDrop = useCallback((source: TreeNode<TMetadata>, target: TreeNode<TMetadata>, position: "before" | "after" | "child") => {
    if (source.id === target.id || !canDragNode(source)) return false;
    const targetPath = nodeIndex.path(target.id);
    if (targetPath?.ancestorIds.includes(source.id)) return false;
    if (dragGroupKey) {
      const groupFor = (id: string) => {
        const path = nodeIndex.path(id)?.nodes ?? [];
        for (let i = path.length - 1; i >= 0; i--) {
          const metadata = path[i]?.metadata;
          if (metadata && typeof metadata === "object" && Object.prototype.hasOwnProperty.call(metadata, dragGroupKey)) return (metadata as Record<string, unknown>)[dragGroupKey];
        }
        return undefined;
      };
      const sourceGroup = groupFor(source.id);
      const targetGroup = groupFor(target.id);
      if (sourceGroup !== undefined && targetGroup !== undefined && sourceGroup !== targetGroup) return false;
    }
    return !canDrop || canDrop(source, target, position);
  }, [canDragNode, canDrop, dragGroupKey, nodeIndex]);

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

      event.dataTransfer.dropEffect = "none";

      const source = nodeIndex.byId.get(dragState.draggedId)?.node;
      if (!source) {
        setDragState((prev) => prev.dragOverId === null ? prev : { ...prev, dragOverId: null, dragOverPosition: null });
        return;
      }

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const relativeY = (event.clientY - rect.top) / rect.height;
      const hasChildren = (node.children?.length ?? 0) > 0;

      /* Geometric before/after preference by pointer band. A container ("child")
         zone is offered when the node already holds children, or when the host
         explicitly allows dropping into it, so an empty folder can receive its
         first item while generic leaves never become containers. The host's
         canDrop is the source of truth for whether a target can hold children. */
      const lean: "before" | "after" = relativeY < 0.5 ? "before" : "after";

      let candidates: Array<"before" | "after" | "child">;
      let childSlot: number;
      if (relativeY < 0.25) {
        candidates = ["before", "after"];
        childSlot = 1;
      } else if (relativeY > 0.75) {
        candidates = ["after", "before"];
        childSlot = 1;
      } else {
        candidates = [lean];
        childSlot = 0;
      }

      const hostAllowsChild = canDrop ? isAllowedDrop(source, node, "child") : false;
      if (hasChildren || hostAllowsChild) {
        candidates.splice(childSlot, 0, "child");
      }

      const position = candidates.find((candidate) => isAllowedDrop(source, node, candidate));

      if (!position) {
        setDragState((prev) => prev.dragOverId === null ? prev : { ...prev, dragOverId: null, dragOverPosition: null });
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
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
    [isAllowedDrop, canDrop, dragState.draggedId, nodeIndex],
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

      if (!draggedId || !position || draggedId === node.id || dragState.dragOverId !== node.id) {
        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      const source = nodeIndex.byId.get(draggedId)?.node;
      if (!source || !isAllowedDrop(source, node, position)) {
        setDragState(INITIAL_DRAG_STATE);
        return;
      }

      /* Cross-level move: drop into a folder. */
      if (position === "child") {
        const draggedPath = nodeIndex.path(draggedId);
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
      const targetPath = nodeIndex.path(node.id);

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
      const draggedPath = nodeIndex.path(draggedId);
      const targetParentId = targetPath.parent?.id ?? null;
      const isCrossParent = (draggedPath?.parent?.id ?? null) !== targetParentId;

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
          const patchOps = buildReorderPatch(result.moved, result.fromIndex, result.toIndex, siblings);

          if (patchOps.length > 0) {
            onPatch(patchOps, { node: result.moved, type: "reorder" });
          }
        }
      }

      setDragState(INITIAL_DRAG_STATE);
    },
    [dragState, nodes, nodeIndex, isAllowedDrop, onMove, onPatch, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragState(INITIAL_DRAG_STATE);
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Context menu                                                              */
  /* ------------------------------------------------------------------------ */

  const openContextMenu = useCallback(
    (node: TreeNode<TMetadata>, x: number, y: number) => {
      if (contextMenuItems) {
        const items = contextMenuItems(node);

        if (items.length === 0) {
          return;
        }

        const anchor = expansion.nodeElementRefs.current.get(node.id);
        if (anchor) setContextMenu({ x, y, node, items, anchor });
        return;
      }

      onContextMenuOpen?.({ node, x, y });
    },
    [contextMenuItems, onContextMenuOpen, expansion.nodeElementRefs],
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

  const locateNode = useCallback(
    (id: string) => {
      const path = nodeIndex.path(id);
      if (!path) return;
      const ancestorIds = path.ancestorIds;

      expansion.setExpandedIds([
        ...new Set([...expansion.expandedIds, ...ancestorIds]),
      ]);

      search.clearSearch();
      setPendingScroll({ id, focus: false });
    },
    [expansion, nodeIndex, search.clearSearch],
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

        const path = nodeIndex.path(selectedId);
        return path?.target;
      },
      scrollToNode: locateNode,
      locateNode: (predicate: (node: TreeNode<TMetadata>) => boolean) => {
        /* BFS search for the first matching node. */
        const queue: TreeNode<TMetadata>[] = [...nodes];

        const seen = new Set<TreeNode<TMetadata>>();
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const node = queue[cursor];

          if (!node || seen.has(node)) {
            continue;
          }

          seen.add(node);
          if (predicate(node)) {
            /* Expand all ancestors and select the node. */
            const path = nodeIndex.path(node.id);

            if (path) {
              expansion.setExpandedIds([
                ...new Set([...expansion.expandedIds, ...path.ancestorIds]),
              ]);
            }

            search.clearSearch();
            setSelectedId(node.id);

            setPendingScroll({ id: node.id, focus: false });

            return node;
          }

          if (node.children?.length) {
            for (const child of node.children) queue.push(child);
          }
        }

        return undefined;
      },
    }),
    [expansion, locateNode, selectedId, nodes, nodeIndex, search.clearSearch],
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
      data-theme={theme}
    >
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}

      {(searchable || showExpandAll || showRefresh || searchRowExtra) && (
        <div className={styles.searchRow}>
          {searchable && <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              className={styles.searchInput}
              type="search"
              aria-controls={searchId}
              placeholder={searchPlaceholder}
              value={search.query}
              onChange={(event) => handleSearchChange(event.target.value)}
              aria-label="Search tree"
            />
          </div>}
          {searchRowExtra}
          {showExpandAll && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={expansion.isAllExpanded ? expansion.collapseAll : expansion.expandAll}
              title={expansion.isAllExpanded ? "Collapse all" : "Expand all"}
              aria-label={expansion.isAllExpanded ? "Collapse all" : "Expand all"}
            >
              {expansion.isAllExpanded ? (
                <MdUnfoldLess size={16} aria-hidden="true" />
              ) : (
                <MdOutlineUnfoldMore size={16} aria-hidden="true" />
              )}
            </button>
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
        data-virtualized={windowed || undefined}
        onScroll={(event) => { if (windowed) setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight || 400 }); }}
        id={searchId}
        role="tree"
        onKeyDown={handleTreeKeyDown}
        aria-label="Tree navigation"
      >
        {search.filteredNodes.length === 0 ? (
          <div className={styles.emptyState}>
            {search.isSearching ? "No matching results" : "No items"}
          </div>
        ) : (
          <>
          {windowed && <div role="presentation" style={{ height: startRow * rowHeight }} />}
          {renderedRows.map(({ node, depth, positionInSet, setSize }) => (
            <NodeRenderer
              key={node.id}
              node={node}
              depth={depth}
              positionInSet={positionInSet}
              setSize={setSize}
              isFocused={node.id === tabStopId}
              onFocusNode={setFocusedId}
              isExpanded={expandedSet.has(node.id)}
              isSelected={selectedId === node.id}
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
              showContextMenuButton={Boolean(contextMenuItems || onContextMenuOpen)}
              activeMenuNodeId={contextMenu?.node.id ?? null}
              onContextMenu={handleNodeContextMenu}
              onMoreClick={handleMoreButtonClick}
            />
          ))}
          {windowed && <div role="presentation" style={{ height: (visibleRows.length - endRow) * rowHeight }} />}
          </>
        )}
      </div>

      {contextMenu && (
        <ContextMenu key={contextMenu.node.id} state={contextMenu} onClose={closeContextMenu} />
      )}
    </div>
  );
}) as <TMetadata = unknown>(
  props: TreeProps<TMetadata> & { ref?: React.Ref<TreeHandle> },
) => React.ReactElement;
