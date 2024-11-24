import { useState, useCallback, useEffect } from "react";

import { TextSearchSpanResult, TextSearchTokenResult } from "../../types";
import _ from "lodash";
import { useDocumentContext } from "../context/DocumentAtom";

export type TextSearchResult = TextSearchSpanResult | TextSearchTokenResult;

/**
 * Hook for managing document text search functionality
 */
export function useAnnotationSearch() {
  const { docText, pageTextMaps, pages } = useDocumentContext();
  const [searchText, setSearchText] = useState<string>();
  const [searchResults, setSearchResults] = useState<TextSearchResult[]>([]);
  const [selectedSearchResultIndex, setSelectedSearchResultIndex] = useState(0);

  // Debounced search implementation
  const debouncedSearch = useCallback(
    _.debounce((searchTerm: string) => {
      if (!searchTerm) {
        setSearchResults([]);
        return;
      }

      let results: TextSearchResult[] = [];
      const exactMatch = new RegExp(searchTerm, "gi");
      const matches = [...(docText?.matchAll(exactMatch) ?? [])];

      // Process matches based on document type
      if (!pageTextMaps) {
        // Text document search
        results = matches.map(
          (match, i) =>
            ({
              id: i,
              text:
                docText?.substring(
                  match.index!,
                  match.index! + searchTerm.length
                ) ?? "",
              start_index: match.index!,
              end_index: match.index! + searchTerm.length,
            } as TextSearchSpanResult)
        );
      } else {
        // PDF document search
        results = matches
          .map((match) => {
            if (!match.index) return null;

            const start_index = match.index;
            const end_index = start_index + searchTerm.length;
            let target_tokens = [];
            let start_page = 0;
            let end_page = 0;
            let bounds: Record<number, any> = {};

            // Get tokens for the match
            for (let j = start_index; j < end_index; j++) {
              if (pageTextMaps[j]) {
                target_tokens.push(pageTextMaps[j]);
              }
            }

            // Group tokens by page
            const grouped_tokens = _.groupBy(target_tokens, "pageIndex");

            // Get bounds and page info
            for (const [key, value] of Object.entries(grouped_tokens)) {
              const pageNum = parseInt(key);
              if (pages[pageNum]) {
                const page_bounds = pages[pageNum].getBoundsForTokens(value);
                if (page_bounds) {
                  bounds[pageNum] = page_bounds;
                }
                if (!start_page) start_page = pageNum;
                end_page = pageNum;
              }
            }

            return {
              id: start_index,
              tokens: grouped_tokens,
              bounds,
              start_page,
              end_page,
              fullContext: (
                <span>
                  <b>{searchTerm}</b>
                </span>
              ),
            } as TextSearchTokenResult;
          })
          .filter((result): result is TextSearchTokenResult => result !== null);
      }

      setSearchResults(results);
      setSelectedSearchResultIndex(0);
    }, 300),
    [docText, pageTextMaps, pages]
  );

  // Update search when text changes
  useEffect(() => {
    if (searchText) {
      debouncedSearch(searchText);
    } else {
      setSearchResults([]);
      setSelectedSearchResultIndex(0);
    }
  }, [searchText, debouncedSearch]);

  const nextResult = useCallback(() => {
    if (searchResults.length > 0) {
      setSelectedSearchResultIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : 0
      );
    }
  }, [searchResults.length]);

  const previousResult = useCallback(() => {
    if (searchResults.length > 0) {
      setSelectedSearchResultIndex((prev) =>
        prev > 0 ? prev - 1 : searchResults.length - 1
      );
    }
  }, [searchResults.length]);

  return {
    searchText,
    searchResults,
    selectedSearchResultIndex,
    setSearchText,
    nextResult,
    previousResult,
    setSelectedSearchResultIndex,
  };
}
