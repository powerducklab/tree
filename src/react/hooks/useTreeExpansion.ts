import { useCallback, useMemo, useRef, useState } from "react";

import type { TreeNode } from "../../core/types";
import { getBranchIds, getExpandableIds } from "../../core/tree-utils";

/**
 * Manages tree expansion state.
 *
 * Supports controlled (via onExpandedChange) and uncontrolled usage.
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
    if (defaultExpandedIds && defaultExpandedIds.length > 0) {
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

  const isAllExpanded = useMemo(
    () =>
      allBranchIds.length > 0 &&
      allBranchIds.every((id) => expandedIds.includes(id)),
    [allBranchIds, expandedIds],
  );

  const handleExpandedChange = useCallback(
    (nextExpanded: string[]) => {
      setExpandedIds(nextExpanded);
      onExpandedChange?.(nextExpanded);
    },
    [onExpandedChange],
  );

  const toggleNode = useCallback(
    (id: string) => {
      setExpandedIds((current) => {
        const isExpanded = current.includes(id);
        const next = isExpanded
          ? current.filter((expandedId) => expandedId !== id)
          : [...current, id];

        onExpandedChange?.(next);
        return next;
      });
    },
    [onExpandedChange],
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
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  };
}
