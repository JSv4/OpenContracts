import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Fuse from "fuse.js";
import { Form, Segment } from "semantic-ui-react";
import { AnalysisType } from "../../types/graphql-api";

import useWindowDimensions from "../hooks/WindowDimensionHook";
import { useCorpusState } from "../annotator/context/CorpusAtom";
import {
  useAnalysisManager,
  useAnalysisSelection,
} from "../annotator/hooks/AnalysisHooks";
import { AnalysisItem } from "./AnalysisItem";

/**
 * Props for AnalysisTraySelector
 */
interface AnalysisTraySelectorProps {
  /** Determines if the selector should be read-only */
  read_only: boolean;
  /** The list of available analyses */
  analyses: AnalysisType[];
}

/**
 * A vertical tray selector for analyses.
 *
 * It supports fuzzy search and displays filtered analyses.
 */
const AnalysisTraySelector: React.FC<AnalysisTraySelectorProps> = ({
  read_only,
  analyses,
}) => {
  const { width } = useWindowDimensions();
  const { selectedCorpus } = useCorpusState();
  const { selectedAnalysis } = useAnalysisSelection();
  const { onSelectAnalysis } = useAnalysisManager();

  const [searchTerm, setSearchTerm] = useState<string>("");

  // Fuse configuration for fuzzy searching the analyses.
  const fuseOptions = useMemo(
    () => ({
      keys: ["name", "description"],
      threshold: 0.4,
    }),
    []
  );

  const analysesFuse = useMemo(
    () => new Fuse(analyses, fuseOptions),
    [analyses, fuseOptions]
  );

  const filteredItems = useMemo((): AnalysisType[] => {
    if (!searchTerm) return analyses;
    return fuseOptions
      ? analysesFuse.search(searchTerm).map((result) => result.item)
      : analyses;
  }, [analyses, searchTerm, analysesFuse, fuseOptions]);

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
        <Segment padded textAlign="center" key="no_analyses_placeholder">
          <h4>No Analyses Available...</h4>
          <p>
            If you have sufficient privileges, try creating a new analysis from
            the corpus page.
          </p>
        </Segment>
      );
    }
    return filteredItems.map((item) => (
      <AnalysisItem
        corpus={selectedCorpus}
        compact={width <= 768}
        key={item.id}
        analysis={item}
        selected={Boolean(selectedAnalysis && item.id === selectedAnalysis.id)}
        read_only={read_only}
        onSelect={() =>
          onSelectAnalysis(
            selectedAnalysis && item.id === selectedAnalysis.id ? null : item
          )
        }
      />
    ));
  }, [
    filteredItems,
    width,
    read_only,
    selectedAnalysis,
    selectedCorpus,
    onSelectAnalysis,
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
            placeholder="Search for analyses..."
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

export default AnalysisTraySelector;
