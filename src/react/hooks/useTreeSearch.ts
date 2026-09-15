import { useCallback, useDeferredValue, useMemo, useState } from "react";

import type { TreeNode } from "../../core/types";
import { filterTree } from "../../core/tree-utils";

/**
 * Manages tree search state with deferred query for performance.
 *
 * When searching, the expansion state is temporarily overridden to show
 * all matching nodes and their ancestors. When the search is cleared,
 * the previous expansion state is restored.
 */
export function useTreeSearch<TMetadata>(nodes: TreeNode<TMetadata>[]) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expandedBeforeSearch, setExpandedBeforeSearch] = useState<
    string[] | null
  >(null);

  const isSearching = deferredQuery.trim().length > 0;

  const filteredNodes = useMemo(() => {
    if (!isSearching) {
      return nodes;
    }

    return filterTree(nodes, {
      query: deferredQuery,
      keepAncestors: true,
    });
  }, [nodes, deferredQuery, isSearching]);

  const handleQueryChange = useCallback(
    (value: string, currentExpanded: string[]) => {
      const previousQuery = query.trim();
      const nextQuery = value.trim();

      if (!previousQuery && nextQuery) {
        setExpandedBeforeSearch(currentExpanded);
      }

      if (previousQuery && !nextQuery) {
        setExpandedBeforeSearch(null);
      }

      setQuery(value);
    },
    [query],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setExpandedBeforeSearch(null);
  }, []);

  return {
    query,
    deferredQuery,
    isSearching,
    filteredNodes,
    expandedBeforeSearch,
    handleQueryChange,
    clearSearch,
  };
}
