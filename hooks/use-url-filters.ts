"use client";

import * as React from "react";
import {
  emptyFilters,
  filtersFromSearchParams,
  writeFiltersToSearchParams,
  type Filters,
} from "@/lib/filters";
import { useUrlState } from "@/hooks/use-url-state";

function sameFacets(a: Filters, b: Filters): boolean {
  return (
    a.status.join("\0") === b.status.join("\0") &&
    a.type.join("\0") === b.type.join("\0") &&
    a.priority.join("\0") === b.priority.join("\0") &&
    a.origin.join("\0") === b.origin.join("\0") &&
    a.labels.join("\0") === b.labels.join("\0") &&
    a.assignee.join("\0") === b.assignee.join("\0")
  );
}

/** Shared, URL-backed Board/List filter state. */
export function useUrlFilters() {
  const { searchParams, updateUrl } = useUrlState();
  const filters = React.useMemo(
    () => filtersFromSearchParams(searchParams),
    [searchParams],
  );
  const showArchived = searchParams.get("archived") === "1";

  const setFilters = React.useCallback(
    (next: Filters) => {
      const searchOnly =
        sameFacets(filters, next) && filters.search !== next.search;
      const mode = searchOnly && filters.search ? "replace" : "push";
      updateUrl((params) => writeFiltersToSearchParams(params, next), mode);
    },
    [filters, updateUrl],
  );

  const setShowArchived = React.useCallback(
    (show: boolean) => {
      updateUrl((params) => {
        if (show) params.set("archived", "1");
        else params.delete("archived");
      });
    },
    [updateUrl],
  );

  const clearFilters = React.useCallback(() => {
    updateUrl((params) => {
      writeFiltersToSearchParams(params, emptyFilters);
      params.delete("archived");
    });
  }, [updateUrl]);

  return { filters, setFilters, showArchived, setShowArchived, clearFilters };
}
