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

/**
 * Props for ExtractTraySelector.
 */
interface ExtractTraySelectorProps {
  /** Determines if the selector should be read-only */
  read_only: boolean;
  /** The list of available extracts */
  extracts: ExtractType[];
}

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
        <Segment padded textAlign="center" key="no_extracts_placeholder">
          <h4>No Extracts Available...</h4>
          <p>
            If you have sufficient privileges, try creating a new extract from
            the corpus page.
          </p>
        </Segment>
      );
    }
    return filteredItems.map((item) => (
      <ExtractItem
        corpus={selectedCorpus}
        compact={width <= 768}
        key={item.id}
        extract={item}
        selected={Boolean(selectedExtract && item.id === selectedExtract.id)}
        read_only={read_only}
        onSelect={() => {
          console.log(
            `Selected extract: ${item.id}, previously selected: ${selectedExtract?.id}`
          );
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
    <Segment.Group
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Segment attached="top" style={{ padding: "1rem" }}>
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
      </Segment>
      <Segment
        attached="bottom"
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          padding: "0.5rem",
        }}
      >
        {mountedRef.current && renderItems()}
      </Segment>
    </Segment.Group>
  );
};

export default ExtractTraySelector;
