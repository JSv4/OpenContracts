import { useEffect, useRef } from "react";
import { useSearchText } from "../context/DocumentAtom";
import {
  useDocText,
  useSelectedDocument,
  usePages,
  usePageTokenTextMaps,
  useTextSearchState,
} from "../context/DocumentAtom";
import {
  TextSearchSpanResult,
  TextSearchTokenResult,
  TokenId,
} from "../../types";
import _ from "lodash";
import { BoundingBox } from "../types/annotations";

export const useTextSearch = () => {
  const { searchText } = useSearchText();
  const { docText } = useDocText();
  const { selectedDocument } = useSelectedDocument();
  const { pages } = usePages();
  const { pageTokenTextMaps } = usePageTokenTextMaps();
  const { setTextSearchState } = useTextSearchState();

  // Use refs to store previous values
  const previousSelectedDocumentRef = useRef(selectedDocument);

  useEffect(() => {
    // Check if selectedDocument has actually changed
    const documentChanged =
      previousSelectedDocumentRef.current !== selectedDocument;

    // Guard clause
    if (!selectedDocument || !searchText || !pageTokenTextMaps || !pages) {
      console.log("TextSearch: Missing dependencies", {
        hasDocument: !!selectedDocument,
        hasSearchText: !!searchText,
        hasTokenMaps: !!pageTokenTextMaps,
        pagesCount: pages ? Object.keys(pages).length : 0,
      });
      return;
    }

    // Proceed with search logic
    const searchHits: (TextSearchTokenResult | TextSearchSpanResult)[] = [];

    // Now TypeScript knows these values are defined for the rest of the function
    const exactMatch = new RegExp(searchText, "gi");
    const matches = [...docText.matchAll(exactMatch)];

    if (selectedDocument.fileType === "application/pdf") {
      for (let i = 0; i < matches.length; i++) {
        const matchIndex = matches[i].index;
        if (matchIndex === undefined) continue;

        const start_index = matchIndex;
        const end_index = start_index + searchText.length;
        const target_tokens: TokenId[] = [];
        const lead_in_tokens = [];
        const lead_out_tokens = [];
        let end_page = 0;
        let start_page = 0;

        // Context length in characters
        const context_length = 128;

        // Lead-in tokens
        if (start_index > 0) {
          const end_text_index =
            start_index >= context_length ? start_index - context_length : 0;
          let previous_token: TokenId | undefined;

          for (let a = start_index; a >= end_text_index; a--) {
            if (!previous_token && pageTokenTextMaps[a]) {
              previous_token = pageTokenTextMaps[a];
              start_page = previous_token.pageIndex;
            } else if (
              pageTokenTextMaps[a] &&
              (pageTokenTextMaps[a].pageIndex !== previous_token?.pageIndex ||
                pageTokenTextMaps[a].tokenIndex !== previous_token?.tokenIndex)
            ) {
              const chap = pageTokenTextMaps[a];
              previous_token = chap;
              lead_in_tokens.push(
                pages[chap.pageIndex].tokens[chap.tokenIndex]
              );
              start_page = chap.pageIndex;
            }
          }
        }
        const lead_in_text = lead_in_tokens
          .reverse()
          .reduce((prev, curr) => prev + " " + curr.text, "");

        // Target tokens
        for (let j = start_index; j < end_index; j++) {
          if (pageTokenTextMaps?.[j]) {
            target_tokens.push(pageTokenTextMaps[j]);
          }
        }
        const grouped_tokens = _.groupBy(target_tokens, "pageIndex");

        // Lead-out tokens
        const end_text_index =
          docText.length - end_index >= context_length
            ? end_index + context_length
            : docText.length;
        let previous_token: TokenId | undefined;

        for (let b = end_index; b < end_text_index; b++) {
          if (!previous_token && pageTokenTextMaps[b]) {
            previous_token = pageTokenTextMaps[b];
          } else if (
            pageTokenTextMaps[b] &&
            (pageTokenTextMaps[b].pageIndex !== previous_token?.pageIndex ||
              pageTokenTextMaps[b].tokenIndex !== previous_token?.tokenIndex)
          ) {
            const chap = pageTokenTextMaps[b];
            previous_token = chap;
            lead_out_tokens.push(pages[chap.pageIndex].tokens[chap.tokenIndex]);
            end_page = chap.pageIndex;
          }
        }
        const lead_out_text = lead_out_tokens.reduce(
          (prev, curr) => prev + " " + curr.text,
          ""
        );

        // Determine bounds for the results
        const bounds: Record<number, BoundingBox> = {};
        for (const [key, value] of Object.entries(grouped_tokens)) {
          const pageIndex = parseInt(key);
          console.log(`TextSearch: Processing page ${pageIndex}`, {
            hasPage: !!pages[pageIndex],
            tokenCount: value.length,
          });

          if (pages[pageIndex] !== undefined) {
            const page_bounds = pages[pageIndex].getBoundsForTokens(value);
            console.log(`TextSearch: Bounds for page ${pageIndex}`, {
              hasBounds: !!page_bounds,
              bounds: page_bounds,
            });
            if (page_bounds) {
              bounds[pageIndex] = page_bounds;
            }
          }
        }

        const fullContext = (
          <span>
            <i>{lead_in_text}</i> <b>{searchText}</b> <i>{lead_out_text}</i>
          </span>
        );
        searchHits.push({
          id: i,
          tokens: grouped_tokens,
          bounds,
          fullContext,
          end_page,
          start_page,
        } as TextSearchTokenResult);
      }
    }

    setTextSearchState({ matches: searchHits, selectedIndex: 0 });
    previousSelectedDocumentRef.current = selectedDocument;
  }, [
    searchText,
    docText,
    selectedDocument,
    pages,
    pageTokenTextMaps,
    setTextSearchState,
  ]);
};
