import React from "react";
import { Provider as JotaiProvider, useAtom, useSetAtom } from "jotai";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { UnifiedContentFeed } from "../src/components/knowledge_base/document/unified_feed";
import {
  ContentFilters,
  SortOption,
  Note,
} from "../src/components/knowledge_base/document/unified_feed/types";
import {
  searchTextAtom,
  textSearchStateAtom,
} from "../src/components/annotator/context/DocumentAtom";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
} from "../src/components/annotator/context/AnnotationAtoms";
import {
  TextSearchSpanResult,
  TextSearchTokenResult,
} from "../src/components/types";
import { PdfAnnotations } from "../src/components/annotator/types/annotations";

interface UnifiedContentFeedTestWrapperProps {
  notes?: Note[];
  filters?: ContentFilters;
  sortBy?: SortOption;
  isLoading?: boolean;
  onItemSelect?: () => void;
  fetchMore?: () => Promise<void>;
  readOnly?: boolean;
  // Mock data configuration
  mockAnnotations?: any[];
  mockRelations?: any[];
  mocks?: MockedResponse[];
}

// Default filters
const defaultFilters: ContentFilters = {
  contentTypes: new Set(["note", "annotation", "relationship", "search"]),
  annotationFilters: {
    showStructural: false,
  },
  relationshipFilters: {
    showStructural: false,
  },
  searchQuery: "",
};

// Mock note factory
const createMockNote = (id: string, title: string, content: string): Note => ({
  id,
  title,
  content,
  created: new Date().toISOString(),
  creator: {
    email: "test@example.com",
  },
});

// Inner component to set up Jotai atoms
const InnerWrapper: React.FC<
  UnifiedContentFeedTestWrapperProps & { children: React.ReactNode }
> = ({ mockAnnotations = [], mockRelations = [], children }) => {
  const setPdfAnnotations = useSetAtom(pdfAnnotationsAtom);
  const setStructuralAnnotations = useSetAtom(structuralAnnotationsAtom);
  const [textSearchState, setTextSearchState] = useAtom(textSearchStateAtom);
  const setTextSearchMatches = (
    matches: (TextSearchTokenResult | TextSearchSpanResult)[]
  ) => setTextSearchState((prev) => ({ ...prev, matches }));

  const setSearchText = useSetAtom(searchTextAtom);

  React.useEffect(() => {
    setPdfAnnotations(new PdfAnnotations(mockAnnotations, mockRelations, []));
    setStructuralAnnotations([]);
    setTextSearchMatches([]);
    setSearchText("");
  }, [mockAnnotations, mockRelations]);

  return <>{children}</>;
};

export const UnifiedContentFeedTestWrapper: React.FC<
  UnifiedContentFeedTestWrapperProps
> = ({
  notes = [
    createMockNote("1", "Test Note 1", "This is the first test note"),
    createMockNote("2", "Test Note 2", "This is the second test note"),
  ],
  filters = defaultFilters,
  sortBy = "page",
  isLoading = false,
  onItemSelect = () => {},
  fetchMore,
  readOnly = false,
  mockAnnotations = [],
  mockRelations = [],
  mocks = [],
}) => {
  return (
    <JotaiProvider>
      <MockedProvider mocks={mocks} addTypename>
        <InnerWrapper
          mockAnnotations={mockAnnotations}
          mockRelations={mockRelations}
        >
          <div
            style={{
              width: "400px",
              height: "600px",
              position: "relative",
              background: "#f5f5f5",
            }}
          >
            <UnifiedContentFeed
              notes={notes}
              filters={filters}
              sortBy={sortBy}
              isLoading={isLoading}
              onItemSelect={onItemSelect}
              fetchMore={fetchMore}
              readOnly={readOnly}
            />
          </div>
        </InnerWrapper>
      </MockedProvider>
    </JotaiProvider>
  );
};
