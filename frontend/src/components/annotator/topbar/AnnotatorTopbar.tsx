import { useReactiveVar } from "@apollo/client";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Image, Icon, Header, Segment, Sidebar, Card } from "semantic-ui-react";
import { openedCorpus, selectedAnalyses } from "../../../graphql/cache";
import { HorizontalAnalysisSelectorForCorpus } from "../../analyses/AnalysisSelectorForCorpus";

import manual_annotation_icon from "../../../assets/icons/noun-quill-31093.png";
import analyzer_lens_icon from "../../../assets/icons/noun-goggles-4650061.png";
import { Textfit } from "react-textfit";
import useWindowDimensions from "../../hooks/WindowDimensionHook";

interface AnnotatorTopbarProps {
  children?: ReactNode;
}

export const AnnotatorTopbar = ({ children }: AnnotatorTopbarProps) => {
  const { width } = useWindowDimensions();
  const banish_sidebar = width <= 1000;

  const container_ref = useRef<HTMLDivElement>(null);
  const topbar_ref = useRef<HTMLDivElement>(null);

  const [container_width, setContainerWidth] = useState(0);
  const [topbar_height, setTopbarHeight] = useState(0);

  let expanded_toolbar_width = 200;
  let icon_toolbar_width = 40;
  let minified_analysis_summaries = false;

  if (container_width <= 400) {
    expanded_toolbar_width = 200;
    icon_toolbar_width = 40;
    minified_analysis_summaries = true;
  } else if (container_width <= 1000) {
    expanded_toolbar_width = 300;
    icon_toolbar_width = 80;
  } else {
    expanded_toolbar_width = 0.25 * container_width;
    icon_toolbar_width = 0.03 * container_width;
  }

  // console.log("Expanded toolbar width", expanded_toolbar_width);
  // console.log("Icon toolbar width", icon_toolbar_width);

  const selected_analyses = useReactiveVar(selectedAnalyses);
  const opened_corpus = useReactiveVar(openedCorpus);

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

  const collapseButtonHiddenStyle = {
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    position: "absolute",
    right: `calc(50% - ${expanded_toolbar_width / 2}px)`,
    borderRadius: "0px 0px 1em 1em",
    width: `${expanded_toolbar_width}px`,
    height: "6vh",
    minHeight: "66px",
    backgroundColor: "#f3f4f5",
    transition: "all 500ms ease",
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
            <Icon
              name={topbarVisible ? "angle double up" : "angle double down"}
              color={topbarVisible ? "red" : "green"}
              size="big"
            />
          </div>
          {!topbarVisible ? (
            <Card
              style={{
                margin: "auto",
                width: "75%",
              }}
            >
              <Card.Content
                style={{
                  width: "100%",
                  padding: ".5em",
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    flex: 1,
                  }}
                >
                  <div>
                    <Header
                      as="h3"
                      style={
                        container_width <= 400
                          ? {
                              fontSize: ".75rem",
                              wordBreak: "break-all",
                            }
                          : container_width <= 1000
                          ? {
                              fontSize: ".9rem",
                            }
                          : {
                              fontSize: "1rem",
                            }
                      }
                    >
                      {selected_analyses.length > 0
                        ? "Analyzer View Mode"
                        : "Human Annotation Mode"}
                    </Header>
                  </div>
                </div>
                <div>
                  <Image
                    size="mini"
                    src={
                      selected_analyses.length > 0
                        ? analyzer_lens_icon
                        : manual_annotation_icon
                    }
                  />
                </div>
              </Card.Content>
            </Card>
          ) : (
            <></>
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
            <HorizontalAnalysisSelectorForCorpus
              read_only={false}
              corpus={opened_corpus}
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
              }
            : {
                overflow: "hidden",
                height: "100%",
                width: "100%",
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
