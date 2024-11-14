import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Segment, Form, Button, Popup, Icon } from "semantic-ui-react";
import Fuse from "fuse.js";
import { AnalysisType, CorpusType, ExtractType } from "../../types/graphql-api";
import { AnalysisItem } from "./AnalysisItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { ExtractItem } from "../extracts/ExtractItem";
import { setTopbarVisible } from "../../graphql/cache";
import { useReactiveVar } from "@apollo/client";
import { X } from "lucide-react";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

interface HorizontalSelectorForCorpusProps {
  corpus: CorpusType;
  read_only: boolean;
  analyses: AnalysisType[];
  extracts: ExtractType[];
  selected_analysis: AnalysisType | null | undefined;
  selected_extract: ExtractType | null | undefined;
  onSelectAnalysis: (analysis: AnalysisType | null) => void | null | undefined;
  onSelectExtract: (extract: ExtractType | null) => void | null | undefined;
}

export const ExtractAndAnalysisHorizontalSelector: React.FC<
  HorizontalSelectorForCorpusProps
> = ({
  corpus,
  read_only,
  analyses,
  extracts,
  selected_analysis,
  selected_extract,
  onSelectAnalysis,
  onSelectExtract,
}) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const topbarVisible = useReactiveVar(setTopbarVisible);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"analyses" | "extracts">(
    "analyses"
  );

  const fuseOptions = {
    keys: ["name", "description"], // Adjust these based on your data structure
    threshold: 0.4,
  };

  const analysesFuse = useMemo(
    () => new Fuse(analyses, fuseOptions),
    [analyses]
  );
  const extractsFuse = useMemo(
    () => new Fuse(extracts, fuseOptions),
    [extracts]
  );

  const filteredItems = useMemo(() => {
    if (!searchTerm) return activeTab === "analyses" ? analyses : extracts;

    const fuse = activeTab === "analyses" ? analysesFuse : extractsFuse;
    return fuse.search(searchTerm).map((result) => result.item);
  }, [activeTab, searchTerm, analyses, extracts, analysesFuse, extractsFuse]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    console.log("Topbar visibility changed:", {
      topbarVisible,
      isMobile: use_mobile_layout,
      shouldShowCloseButton: use_mobile_layout && topbarVisible,
    });
  }, [topbarVisible, use_mobile_layout]);

  const renderItems = useCallback(() => {
    if (filteredItems.length === 0) {
      return (
        <PlaceholderCard
          style={{
            padding: ".5em",
            margin: ".75em",
            minWidth: use_mobile_layout ? "250px" : "300px",
          }}
          key={`no_${activeTab}_available_placeholder`}
          title={`No ${
            activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
          } Available...`}
          description={`If you have sufficient privileges, try creating a new ${
            activeTab === "analyses" ? "analysis" : "extract"
          } from the corpus page.`}
        />
      );
    }

    return filteredItems.map((item) =>
      activeTab === "analyses" ? (
        <AnalysisItem
          compact={use_mobile_layout}
          key={item.id}
          analysis={item as AnalysisType}
          corpus={corpus}
          selected={Boolean(
            selected_analysis && item.id === selected_analysis.id
          )}
          read_only={read_only}
          onSelect={() =>
            onSelectAnalysis(
              selected_analysis && item.id === selected_analysis.id
                ? null
                : (item as AnalysisType)
            )
          }
        />
      ) : (
        <ExtractItem
          compact={use_mobile_layout}
          key={item.id}
          extract={item as ExtractType}
          corpus={corpus}
          selected={Boolean(
            selected_extract && item.id === selected_extract.id
          )}
          read_only={read_only}
          onSelect={() =>
            onSelectExtract(
              selected_extract && item.id === selected_extract.id
                ? null
                : (item as ExtractType)
            )
          }
        />
      )
    );
  }, [
    filteredItems,
    use_mobile_layout,
    read_only,
    selected_analysis,
    selected_extract,
    onSelectAnalysis,
    onSelectExtract,
  ]);

  return (
    <Segment.Group
      id="HorizontalSelectorForCorpus"
      style={{
        height: "300px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Segment
        id="HorizontalSelectorForCorpus_Menu"
        attached="top"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          borderRadius: "0px",
          height: "60px",
        }}
      >
        <div style={{ marginRight: "10px" }}>
          <Button.Group>
            <Button
              active={activeTab === "analyses"}
              onClick={() => setActiveTab("analyses")}
            >
              Analyses
            </Button>
            <Button
              active={activeTab === "extracts"}
              onClick={() => setActiveTab("extracts")}
            >
              Extracts
            </Button>
          </Button.Group>
        </div>
        <div
          style={{
            width: use_mobile_layout ? "200px" : "50%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Form>
            <Form.Input
              icon={
                <Icon
                  name={searchTerm ? "cancel" : "search"}
                  link
                  onClick={searchTerm ? () => handleSearchChange("") : () => {}}
                />
              }
              placeholder={`Search for ${activeTab}...`}
              onChange={(e) => handleSearchChange(e.target.value)}
              value={searchTerm}
            />
          </Form>
        </div>
      </Segment>
      <Segment
        id="HorizontalSelectorForCorpus_CardSegment"
        attached="bottom"
        style={{
          maxHeight: "240px",
          overflow: "auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderRadius: "0px",
        }}
      >
        {use_mobile_layout && topbarVisible && (
          <div
            onClick={() => {
              console.log("Closing topbar");
              setTopbarVisible(false);
            }}
            style={{
              position: "absolute",
              bottom: "10px",
              right: "10px",
              cursor: "pointer",
              backgroundColor: "#DB2828",
              color: "#fff",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            <X size={24} color="#333" />
          </div>
        )}
        <div
          id="HorizontalSelectorForCorpus_CardTrack"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            overflowX: "auto",
            flex: 1,
          }}
        >
          {mountedRef.current && renderItems()}
        </div>
      </Segment>
    </Segment.Group>
  );
};
