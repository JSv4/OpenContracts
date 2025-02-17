import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Fuse from "fuse.js";
import { Form, Segment } from "semantic-ui-react";
import { ExtractType } from "../../types/graphql-api";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { useCorpusState } from "../annotator/context/CorpusAtom";
import {
  useAnalysisManager,
  useAnalysisSelection,
} from "../annotator/hooks/AnalysisHooks";
import { ExtractItem } from "../extracts/ExtractItem";
import styled from "styled-components";

/**
 * Props for ExtractTraySelector.
 */
interface ExtractTraySelectorProps {
  /** Determines if the selector should be read-only */
  read_only: boolean;
  /** The list of available extracts */
  extracts: ExtractType[];
}

const TrayContainer = styled(Segment.Group)`
  height: 100%;
  display: flex !important;
  flex-direction: column !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  overflow: hidden;
`;

const SearchSegment = styled(Segment)`
  flex: 0 0 auto !important;
  padding: 1.25rem !important;
  background: white !important;
  border: 1px solid #e2e8f0 !important;
  border-bottom: none !important;
  border-radius: 12px 12px 0 0 !important;
  z-index: 1;

  .ui.input {
    width: 100%;

    input {
      border-radius: 10px !important;
      border: 1px solid #e2e8f0 !important;
      padding: 0.75rem 1rem !important;
      font-size: 0.875rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;

      &::placeholder {
        color: #94a3b8;
      }

      &:focus {
        border-color: #4a90e2 !important;
        box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.08) !important;
      }
    }

    i.icon {
      font-size: 1rem;
      color: #64748b;
      opacity: 0.7;
      transition: all 0.2s ease;

      &:hover {
        opacity: 1;
        color: #4a90e2;
      }
    }
  }
`;

const ExtractListSegment = styled(Segment)`
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  background: white !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 0 0 12px 12px !important;
  padding: 1rem !important;

  &::-webkit-scrollbar {
    width: 4px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.15);
    border-radius: 2px;

    &:hover {
      background: rgba(74, 144, 226, 0.25);
    }
  }
`;

const EmptyState = styled(Segment)`
  margin: 2rem 0 !important;
  padding: 2.5rem !important;
  text-align: center !important;
  background: linear-gradient(165deg, #f8fafc, #fff) !important;
  border: 1px dashed #e2e8f0 !important;
  border-radius: 16px !important;
  box-shadow: none !important;

  h4 {
    color: #1e293b;
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  p {
    color: #64748b;
    font-size: 0.875rem;
    line-height: 1.5;
    max-width: 24rem;
    margin: 0 auto;
  }
`;

/**
 * A vertical tray selector for extracts.
 *
 * Provides fuzzy search and lists available extracts.
 */
const ExtractTraySelector: React.FC<ExtractTraySelectorProps> = ({
  read_only,
  extracts,
}) => {
  const { width } = useWindowDimensions();
  const { selectedCorpus } = useCorpusState();
  const { selectedExtract, setSelectedExtract } = useAnalysisSelection();
  const { onSelectExtract } = useAnalysisManager();

  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fuse configuration options for fuzzy matching.
  const fuseOptions = useMemo(
    () => ({
      keys: ["name", "description"],
      threshold: 0.4,
    }),
    []
  );

  const extractsFuse = useMemo(
    () => new Fuse(extracts, fuseOptions),
    [extracts, fuseOptions]
  );

  const filteredItems = useMemo((): ExtractType[] => {
    if (!searchTerm) return extracts;
    return extractsFuse.search(searchTerm).map((result) => result.item);
  }, [extracts, searchTerm, extractsFuse]);

  const handleSearchChange = (value: string) => setSearchTerm(value);

  const mountedRef = useRef<boolean>(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const renderItems = useCallback(() => {
    if (filteredItems.length === 0) {
      return (
        <EmptyState key="no_extracts_placeholder">
          <h4>No Extracts Available</h4>
          <p>
            If you have sufficient privileges, try creating a new extract from
            the corpus page.
          </p>
        </EmptyState>
      );
    }
    return filteredItems.map((item) => (
      <ExtractItem
        key={item.id}
        corpus={selectedCorpus}
        compact={width <= 768}
        extract={item}
        selected={Boolean(selectedExtract && item.id === selectedExtract.id)}
        read_only={read_only}
        onSelect={() => {
          onSelectExtract(
            selectedExtract && item.id === selectedExtract.id ? null : item
          );
        }}
      />
    ));
  }, [
    filteredItems,
    width,
    read_only,
    selectedExtract,
    selectedCorpus,
    onSelectExtract,
  ]);

  return (
    <TrayContainer>
      <SearchSegment>
        <Form>
          <Form.Input
            icon={{
              name: searchTerm ? "cancel" : "search",
              link: true,
              onClick: searchTerm ? () => handleSearchChange("") : undefined,
            }}
            placeholder="Search for extracts..."
            onChange={(e) => handleSearchChange(e.target.value)}
            value={searchTerm}
          />
        </Form>
      </SearchSegment>
      <ExtractListSegment>
        {mountedRef.current && renderItems()}
      </ExtractListSegment>
    </TrayContainer>
  );
};

export default ExtractTraySelector;
