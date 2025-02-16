import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import Fuse from "fuse.js";
import { Form, Segment, Button } from "semantic-ui-react";
import { AnalysisType } from "../../types/graphql-api";
import styled from "styled-components";
import {
  Tag,
  Edit3,
  PlayCircle,
  CheckCircle,
  Timer,
  ChartNetwork,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileText,
  Eye,
  EyeOff,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import useWindowDimensions from "../hooks/WindowDimensionHook";
import { useCorpusState } from "../annotator/context/CorpusAtom";
import {
  useAnalysisManager,
  useAnalysisSelection,
} from "../annotator/hooks/AnalysisHooks";
import { usePdfAnnotations } from "../annotator/hooks/AnnotationHooks";

/**
 * Import the HighlightItem used in SingleDocumentExtractResults.
 * Adjust the import path to wherever HighlightItem is located in your project.
 */
import { HighlightItem } from "../annotator/sidebar/HighlightItem";
import { AnnotationList } from "../annotator/display/components/AnnotationList";

/**
 * Props for AnalysisTraySelector
 */
interface AnalysisTraySelectorProps {
  /** Determines if the selector should be read-only */
  read_only: boolean;
  /** The list of available analyses */
  analyses: AnalysisType[];
}

const TrayContainer = styled(Segment.Group)`
  height: 100%;
  display: flex !important;
  flex-direction: column !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
`;

const SearchSegment = styled(Segment)`
  padding: 1rem !important;
  background: white !important;
  border: 1px solid #e2e8f0 !important;
  border-bottom: none !important;
  border-radius: 12px 12px 0 0 !important;

  .input {
    width: 100%;

    input {
      border-radius: 8px !important;
      border: 1px solid #e2e8f0 !important;
      padding: 0.6rem 1rem !important;
      transition: all 0.2s ease-in-out !important;

      &:focus {
        border-color: #4a90e2 !important;
        box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.1) !important;
      }
    }

    i.icon {
      opacity: 0.5;
      transition: opacity 0.2s ease-in-out;

      &:hover {
        opacity: 1;
      }
    }
  }
`;

const AnalysisListSegment = styled(Segment)`
  flex: 1 !important;
  overflow-y: auto !important;
  background: white !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 0 0 12px 12px !important;
  padding: 0.75rem !important;

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

const AnalysisCard = styled.div<{ $selected?: boolean }>`
  padding: 1.25rem;
  margin-bottom: 1rem;
  background: ${(props) =>
    props.$selected
      ? "linear-gradient(135deg, rgba(74, 144, 226, 0.08), rgba(74, 144, 226, 0.03))"
      : "linear-gradient(135deg, #ffffff, #fafbff)"};
  border: 1px solid ${(props) => (props.$selected ? "#4a90e2" : "#e2e8f0")};
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: ${(props) =>
    props.$selected
      ? "0 4px 20px rgba(74, 144, 226, 0.12)"
      : "0 2px 8px rgba(0, 0, 0, 0.02)"};

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: ${(props) => (props.$selected ? "#4a90e2" : "transparent")};
    transition: all 0.3s ease;
  }

  .timestamps {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid
      ${(props) =>
        props.$selected
          ? "rgba(74, 144, 226, 0.15)"
          : "rgba(226, 232, 240, 0.6)"};
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;

    .timestamp-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.375rem;
      padding: 0.5rem;
      background: ${(props) =>
        props.$selected
          ? "rgba(74, 144, 226, 0.06)"
          : "rgba(247, 249, 252, 0.8)"};
      border-radius: 8px;
      transition: all 0.2s ease;

      &:hover {
        background: ${(props) =>
          props.$selected
            ? "rgba(74, 144, 226, 0.09)"
            : "rgba(247, 249, 252, 0.95)"};
      }

      .label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;

        svg {
          width: 14px;
          height: 14px;
          color: ${(props) => (props.$selected ? "#4a90e2" : "#94a3b8")};
        }
      }

      .value {
        font-size: 0.875rem;
        color: ${(props) => (props.$selected ? "#1a202c" : "#475569")};
        font-weight: ${(props) => (props.$selected ? "500" : "400")};
        font-feature-settings: "tnum";
        font-variant-numeric: tabular-nums;
      }
    }
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${(props) =>
      props.$selected
        ? "0 8px 30px rgba(74, 144, 226, 0.15)"
        : "0 8px 20px rgba(0, 0, 0, 0.05)"};

    &::before {
      background: ${(props) => (props.$selected ? "#4a90e2" : "#e2e8f0")};
    }
  }

  &:active {
    transform: translateY(0);
  }

  .annotations-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid
      ${(props) => (props.$selected ? "rgba(74, 144, 226, 0.2)" : "#e2e8f0")};
  }

  .annotations-container {
    margin-top: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
    background: #f8fafc;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }
`;

const AnalysisHeader = styled.div<{ $selected?: boolean }>`
  position: relative;
  margin: -1.25rem -1.25rem 1rem -1.25rem;
  padding: 1.25rem;
  background: ${(props) =>
    props.$selected
      ? "linear-gradient(135deg, rgba(74, 144, 226, 0.12), rgba(74, 144, 226, 0.04))"
      : "linear-gradient(135deg, #f8fafc, #f1f5f9)"};
  border-bottom: 1px solid
    ${(props) =>
      props.$selected ? "rgba(74, 144, 226, 0.2)" : "rgba(226, 232, 240, 0.8)"};
`;

const AnalysisTitle = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;

  .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: ${(props) =>
      props.$selected ? "rgba(74, 144, 226, 0.1)" : "white"};
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    svg {
      color: ${(props) => (props.$selected ? "#4a90e2" : "#64748b")};
    }
  }

  .text {
    flex: 1;

    h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #1a202c;
      line-height: 1.3;
    }

    .id {
      font-family: "SF Mono", "Roboto Mono", monospace;
      font-size: 0.75rem;
      color: ${(props) => (props.$selected ? "#4a90e2" : "#64748b")};
      margin-top: 0.25rem;
      letter-spacing: -0.5px;
    }
  }
`;

const MetadataBadges = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Badge = styled.div<{ $variant?: "primary" | "secondary" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: ${(props) =>
    props.$variant === "primary"
      ? "rgba(74, 144, 226, 0.1)"
      : "rgba(255, 255, 255, 0.8)"};
  border: 1px solid
    ${(props) =>
      props.$variant === "primary"
        ? "rgba(74, 144, 226, 0.2)"
        : "rgba(226, 232, 240, 0.8)"};
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${(props) => (props.$variant === "primary" ? "#4a90e2" : "#64748b")};
  transition: all 0.2s ease;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
`;

const NoAnalysesMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border-radius: 12px;
  border: 1px dashed #e2e8f0;

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: #1a202c;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 0.875rem;
    color: #64748b;
    max-width: 280px;
    line-height: 1.5;
  }

  svg {
    color: #94a3b8;
    margin-bottom: 1rem;
  }
`;

const DescriptionContainer = styled.div<{ $expanded?: boolean }>`
  margin-top: 0.5rem;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: ${(props) => (props.$expanded ? "300px" : "100px")};
  overflow-y: ${(props) => (props.$expanded ? "auto" : "hidden")};
  padding: 0.5rem;
  background: #f8fafc;
  border-radius: 6px;

  &::-webkit-scrollbar {
    width: 4px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.2);
    border-radius: 2px;
    &:hover {
      background: rgba(74, 144, 226, 0.3);
    }
  }
`;

const AnalyzerDescriptionHeader = styled.div`
  font-size: 0.8rem;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1rem 0 0.5rem 0;
  padding: 0 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 14px;
    height: 14px;
    color: #94a3b8;
  }
`;

const MarkdownContent = styled(ReactMarkdown)`
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.6;
  height: 100%;

  p {
    margin: 0.5rem 0;
  }

  code {
    background: #f1f5f9;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: "SF Mono", monospace;
  }

  ul,
  ol {
    padding-left: 1.5rem;
    margin: 0.5rem 0;
  }
`;

const ExpandButton = styled.button<{ $visible?: boolean }>`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: linear-gradient(to top, white 40%, transparent);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #4a90e2;
  font-size: 0.8rem;
  font-weight: 500;
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  transition: opacity 0.2s ease;

  &:hover {
    color: #2563eb;
  }

  svg {
    margin-left: 0.25rem;
  }
`;

const EmptyDescription = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #94a3b8;
  font-size: 0.9rem;
  font-style: italic;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #e2e8f0;

  svg {
    color: #cbd5e1;
  }
`;

// Helper function to format timestamps
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

// Helper function to calculate duration
const calculateDuration = (start: string, end: string): string => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const durationSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
  return `${durationSeconds.toFixed(1)}s`;
};

/**
 * A vertical tray selector for analyses, which now also displays
 * annotations for each analysis in a style similar to SingleDocumentExtractResults.
 */
const AnalysisTraySelector: React.FC<AnalysisTraySelectorProps> = ({
  read_only,
  analyses,
}) => {
  const { width } = useWindowDimensions();
  const { selectedCorpus } = useCorpusState();
  const { selectedAnalysis } = useAnalysisSelection();
  const { onSelectAnalysis } = useAnalysisManager();
  const { pdfAnnotations } = usePdfAnnotations();

  const [searchTerm, setSearchTerm] = useState<string>("");
  /**
   * Maintain open/closed state of annotation visibility for each analysis.
   * Keyed by Analysis ID.
   */
  const [annotationVisibility, setAnnotationVisibility] = useState<{
    [analysisId: string]: boolean;
  }>({});

  const toggleAnnotationsVisibility = (analysisId: string) => {
    setAnnotationVisibility((prev) => ({
      ...prev,
      [analysisId]: !prev[analysisId],
    }));
  };

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

  return (
    <TrayContainer>
      <SearchSegment attached="top">
        <Form>
          <Form.Input
            icon={{
              name: searchTerm ? "cancel" : "search",
              link: true,
              onClick: searchTerm ? () => handleSearchChange("") : undefined,
            }}
            placeholder="Search analyses..."
            onChange={(e) => handleSearchChange(e.target.value)}
            value={searchTerm}
          />
        </Form>
      </SearchSegment>

      <AnalysisListSegment attached="bottom">
        {mountedRef.current && filteredItems.length === 0 ? (
          <NoAnalysesMessage>
            <ChartNetwork size={32} />
            <h4>No Analyses Available</h4>
            <p>
              If you have sufficient privileges, try creating a new analysis
              from the corpus page.
            </p>
          </NoAnalysesMessage>
        ) : (
          filteredItems.map((item) => {
            const isSelected = Boolean(
              selectedAnalysis && item.id === selectedAnalysis.id
            );
            const itemId = item.id;

            // Get the annotations from the store that match this analysis (assuming .analysisId is a valid field)
            const relevantAnnotations = pdfAnnotations.annotations.filter(
              (ann) => ann.id === item.id
            );

            const isVisible = annotationVisibility[itemId];

            return (
              <AnalysisCard
                key={itemId}
                $selected={isSelected}
                onClick={(e) => {
                  // Cast e.target as HTMLElement to use closest()
                  if (
                    (e.target as HTMLElement).closest(".annotations-container")
                  ) {
                    e.stopPropagation();
                    return;
                  }
                  // Don't trigger if clicking the show/hide button
                  if ((e.target as HTMLElement).closest("button")) {
                    return;
                  }
                  onSelectAnalysis(isSelected ? null : item);
                }}
              >
                <AnalysisHeader $selected={isSelected}>
                  <AnalysisTitle $selected={isSelected}>
                    <div className="icon-wrapper">
                      <ChartNetwork size={18} />
                    </div>
                    <div className="text">
                      <h4>{item.analyzer.id || "Untitled Analysis"}</h4>
                      <div className="id">{itemId}</div>
                    </div>
                  </AnalysisTitle>
                  <MetadataBadges>
                    <Badge $variant="primary">
                      <Tag size={14} />
                      {item.fullAnnotationList?.reduce(
                        (acc: string[], curr) =>
                          curr.annotationLabel?.text
                            ? [...new Set([...acc, curr.annotationLabel.text])]
                            : acc,
                        []
                      ).length || 0}{" "}
                      Labels
                    </Badge>
                    <Badge>
                      <Edit3 size={14} />
                      {item.annotations?.totalCount || 0} Annotations
                    </Badge>
                    <Badge>
                      <BarChart3 size={14} />
                      Analysis
                    </Badge>
                  </MetadataBadges>
                </AnalysisHeader>
                <div className="timestamps">
                  <div className="timestamp-row">
                    <div className="label">
                      <PlayCircle />
                      Started
                    </div>
                    <div className="value">
                      {formatTimestamp(item.analysisStarted)}
                    </div>
                  </div>
                  <div className="timestamp-row">
                    <div className="label">
                      <CheckCircle />
                      Completed
                    </div>
                    <div className="value">
                      {formatTimestamp(item.analysisCompleted)}
                    </div>
                  </div>
                  {item.analysisStarted && item.analysisCompleted && (
                    <div className="timestamp-row">
                      <div className="label">
                        <Timer />
                        Duration
                      </div>
                      <div className="value">
                        {calculateDuration(
                          item.analysisStarted,
                          item.analysisCompleted
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {item.analyzer.description && (
                  <DescriptionExpander
                    description={item.analyzer.description}
                    selected={isSelected}
                  />
                )}
                <div className="annotations-section">
                  <Button
                    size="tiny"
                    icon
                    labelPosition="left"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAnnotationsVisibility(itemId);
                    }}
                  >
                    {annotationVisibility[itemId] ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                    {annotationVisibility[itemId]
                      ? "Hide Annotations"
                      : "Show Annotations"}
                  </Button>

                  {annotationVisibility[itemId] && (
                    <div className="annotations-container">
                      <AnnotationList read_only={false} />
                    </div>
                  )}
                </div>
              </AnalysisCard>
            );
          })
        )}
      </AnalysisListSegment>
    </TrayContainer>
  );
};

interface DescriptionExpanderProps {
  description: string;
  selected?: boolean;
}

const DescriptionExpander: React.FC<DescriptionExpanderProps> = ({
  description,
  selected,
}) => {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      setNeedsExpansion(contentRef.current.scrollHeight > 100);
    }
  }, [description]);

  return (
    <>
      <AnalyzerDescriptionHeader>
        <FileText size={14} />
        Analyzer Description
      </AnalyzerDescriptionHeader>
      {description?.trim() ? (
        <DescriptionContainer $expanded={expanded} ref={contentRef}>
          <MarkdownContent>{description}</MarkdownContent>
          {needsExpansion && (
            <ExpandButton
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              $visible={needsExpansion}
            >
              {expanded ? (
                <>
                  Show Less <ChevronUp size={14} />
                </>
              ) : (
                <>
                  Show More <ChevronDown size={14} />
                </>
              )}
            </ExpandButton>
          )}
        </DescriptionContainer>
      ) : (
        <EmptyDescription>
          <FileText size={16} />
          No analyzer description provided
        </EmptyDescription>
      )}
    </>
  );
};

export default AnalysisTraySelector;
