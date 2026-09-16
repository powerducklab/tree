import { useCallback, useMemo, useRef, useState } from "react";

import type { TreeNode } from "../../core/types";
import { getBranchIds, getExpandableIds } from "../../core/tree-utils";

/**
 * Manages tree expansion state.
 *
 * Keeps local state and notifies consumers through onExpandedChange.
 * Provides expandAll, collapseAll, and expandToDepth helpers.
 */
export function useTreeExpansion<TMetadata>(
  nodes: TreeNode<TMetadata>[],
  options: {
    defaultExpandedIds?: string[];
    defaultExpandDepth?: number;
    onExpandedChange?: (expandedIds: string[]) => void;
  } = {},
) {
  const { defaultExpandedIds, defaultExpandDepth = 1, onExpandedChange } =
    options;

  const initialExpanded = useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandedIds, setExpandedIds] = useState<string[]>(initialExpanded);
  const nodeElementRefs = useRef(new Map<string, HTMLElement>());

  const allBranchIds = useMemo(() => getBranchIds(nodes), [nodes]);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const expandedRef = useRef(expandedIds);
  expandedRef.current = expandedIds;

  const isAllExpanded = useMemo(
    () =>
      allBranchIds.length > 0 &&
      allBranchIds.every((id) => expandedSet.has(id)),
    [allBranchIds, expandedSet],
  );

  const handleExpandedChange = useCallback(
    (nextExpanded: string[]) => {
      expandedRef.current = nextExpanded;
      setExpandedIds(nextExpanded);
      onExpandedChange?.(nextExpanded);
    },
    [onExpandedChange],
  );

  const toggleNode = useCallback(
    (id: string) => {
      const current = expandedRef.current;
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      handleExpandedChange(next);
    },
    [handleExpandedChange],
  );

  const expandAll = useCallback(() => {
    handleExpandedChange([...allBranchIds]);
  }, [allBranchIds, handleExpandedChange]);

  const collapseAll = useCallback(() => {
    handleExpandedChange([]);
  }, [handleExpandedChange]);

  const expandToDepth = useCallback(
    (depth: number) => {
      const ids = getExpandableIds(nodes, {
        maxDepth: depth,
        onlyWithChildren: true,
      });
      handleExpandedChange(ids);
    },
    [nodes, handleExpandedChange],
  );

  const setNodeElementRef = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) {
        nodeElementRefs.current.set(id, element);
      } else {
        nodeElementRefs.current.delete(id);
      }
    },
    [],
  );

  const scrollToNode = useCallback((id: string) => {
    const element = nodeElementRefs.current.get(id);

    if (element) {
      element.scrollIntoView?.({ behavior: "auto", block: "nearest" });
    }
  }, []);

  return {
    expandedIds,
    setExpandedIds: handleExpandedChange,
    toggleNode,
    expandAll,
    collapseAll,
    expandToDepth,
    isAllExpanded,
    allBranchIds,
    setNodeElementRef,
    scrollToNode,
    nodeElementRefs,
  };
}
