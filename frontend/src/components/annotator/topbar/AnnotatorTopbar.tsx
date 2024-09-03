import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Image, Icon, Header, Segment, Sidebar, Card } from "semantic-ui-react";
import { FileChartColumnIncreasing } from "lucide-react";

import manual_annotation_icon from "../../../assets/icons/noun-quill-31093.png";
import analyzer_lens_icon from "../../../assets/icons/noun-goggles-4650061.png";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import {
  AnalysisType,
  CorpusType,
  DocumentType,
  ExtractType,
} from "../../../graphql/types";
import { ExtractAndAnalysisHorizontalSelector } from "../../analyses/AnalysisSelectorForCorpus";

interface AnnotatorTopbarProps {
  opened_corpus: CorpusType | null | undefined;
  opened_document: DocumentType | null | undefined;
  analyses: AnalysisType[];
  extracts: ExtractType[];
  selected_analysis: AnalysisType | null | undefined;
  selected_extract: ExtractType | null | undefined;
  onSelectAnalysis: (analysis: AnalysisType | null) => undefined | null | void;
  onSelectExtract: (extract: ExtractType | null) => undefined | null | void;
  children?: ReactNode;
}

let expanded_toolbar_width = 120;
let icon_toolbar_width = 120;

export const AnnotatorTopbar = ({
  opened_corpus,
  opened_document,
  analyses,
  extracts,
  selected_analysis,
  selected_extract,
  onSelectAnalysis,
  onSelectExtract,
  children,
}: AnnotatorTopbarProps) => {
  console.log("Annotator topbar - extracts", extracts);
  console.log("Annotator topbar - analyses", analyses);

  const { width } = useWindowDimensions();
  const banish_sidebar = width <= 1000;

  const container_ref = useRef<HTMLDivElement>(null);
  const topbar_ref = useRef<HTMLDivElement>(null);
  const analyticsLabelRef = useRef<HTMLSpanElement>(null);

  const [container_width, setContainerWidth] = useState(0);
  const [topbar_height, setTopbarHeight] = useState(0);
  const [analyticsLabelWidth, setAnalyticsLabelWidth] = useState(0);

  if (container_width <= 400) {
    expanded_toolbar_width = 100;
    icon_toolbar_width = 100;
  } else if (container_width <= 1000) {
    expanded_toolbar_width = 100;
    icon_toolbar_width = 100;
  } else {
    expanded_toolbar_width = 0.1 * container_width;
    icon_toolbar_width = 0.05 * container_width;
  }

  // console.log("Expanded toolbar width", expanded_toolbar_width);
  // console.log("Icon toolbar width", icon_toolbar_width);

  const [topbarVisible, setTopbarVisible] = useState<boolean>(false);

  useLayoutEffect(() => {
    if (container_ref.current) {
      setContainerWidth(container_ref.current.offsetWidth);
    }
  }, [container_ref.current?.offsetWidth]);

  useLayoutEffect(() => {
    if (topbar_ref.current) {
      setTopbarHeight(topbar_ref.current.offsetHeight);
      // console.log("Topbar height is", topbar_ref.current.offsetWidth);
    }
  }, [topbar_ref.current?.offsetHeight]);

  useLayoutEffect(() => {
    // console.log("Pusher offset change", container_ref.current?.offsetLeft);
  }, [container_ref.current?.offsetLeft]);

  useLayoutEffect(() => {
    if (analyticsLabelRef.current) {
      const labelWidth = analyticsLabelRef.current.offsetWidth;
      console.log("Label width", labelWidth);
      setAnalyticsLabelWidth(labelWidth);
    }
  }, [analyticsLabelRef.current?.clientWidth]);

  const collapseButtonHiddenStyle = {
    cursor: "pointer",
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    zIndex: 1000,
    position: "absolute",
    right: `calc(30% - ${
      (expanded_toolbar_width + analyticsLabelWidth) / 2
    }px)`,
    borderRadius: "0px 0px 1em 1em",
    width: `${expanded_toolbar_width + analyticsLabelWidth + 20}px`, // Add 20px for padding
    height: "6vh",
    minHeight: "66px",
    backgroundColor: "#f3f4f5",
    transition: "all 500ms ease",
    border: "2px solid #ccc",
    borderTop: "none",
    paddingLeft: "10px",
    paddingRight: "10px",
  };

  const collapseButtonShownStyle = {
    cursor: "pointer",
    display: "flex",
    flexDirection: "center",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    position: "absolute",
    right: `calc(50% - ${icon_toolbar_width / 2}px)`,
    borderRadius: "0px 0px 1em 1em",
    width: `${icon_toolbar_width}px`,
    height: "7vh",
    minHeight: "40px",
    backgroundColor: "#f3f4f5",
    transition: "all 500ms ease",
    transform: `translate3d(0, ${topbar_height}px, 0)`,
  };

  return (
    <Sidebar.Pushable
      as={Segment}
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-start",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        className="SidebarCloser"
        onClick={() => setTopbarVisible(!topbarVisible)}
        style={
          topbarVisible
            ? (collapseButtonShownStyle as React.CSSProperties)
            : (collapseButtonHiddenStyle as React.CSSProperties)
        }
      >
        <div
          style={{
            ...(!topbarVisible ? { width: "100%" } : {}),
            height: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            ...(topbarVisible
              ? {
                  marginLeft: "auto",
                  marginRight: "auto",
                }
              : {}),
          }}
        >
          <div>
            {topbarVisible ? (
              <Icon
                name={topbarVisible ? "angle double up" : "angle double down"}
                color={topbarVisible ? "red" : "green"}
                size="big"
              />
            ) : (
              <FileChartColumnIncreasing size={36} />
            )}
          </div>
          {!topbarVisible && (
            <span style={{ fontSize: "14px", fontWeight: "bold" }}>
              Analytics
            </span>
          )}
        </div>
      </div>
      <Sidebar
        as={Segment}
        animation={"overlay"}
        direction={"top"}
        icon="labeled"
        inverted
        vertical
        visible={topbarVisible}
        width="thin"
        style={{
          padding: "0px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          className="TopBarDimension_Listener"
          ref={topbar_ref}
          style={{ width: "100%", height: "100%" }}
        >
          {opened_corpus ? (
            <ExtractAndAnalysisHorizontalSelector
              read_only={false}
              corpus={opened_corpus}
              analyses={analyses}
              extracts={extracts}
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              onSelectAnalysis={onSelectAnalysis}
              onSelectExtract={onSelectExtract}
            />
          ) : (
            <></>
          )}
        </div>
      </Sidebar>

      <Sidebar.Pusher
        style={
          banish_sidebar
            ? {
                overflowX: "scroll",
                overflowY: "hidden",
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
              }
            : {
                overflow: "hidden",
                height: "100%",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
              }
        }
      >
        <div
          ref={container_ref}
          style={{
            width: "100%",
            position: "absolute",
            top: "0px",
            left: "0px",
          }}
        ></div>

        {children}
      </Sidebar.Pusher>
    </Sidebar.Pushable>
  );
};
