import { Card, Dimmer, Loader } from "semantic-ui-react";

import _ from "lodash";

import { AnalysisItem } from "./AnalysisItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { AnalysisType, CorpusType, PageInfo } from "../../graphql/types";
import { useReactiveVar } from "@apollo/client";
import { selectedAnalyses, selectedAnalysesIds } from "../../graphql/cache";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";

interface AnalysesCardsProps {
  style?: Record<string, any>;
  read_only?: boolean;
  analyses: AnalysisType[];
  opened_corpus: CorpusType | null;
  pageInfo: PageInfo | undefined | null;
  loading: boolean;
  loading_message: string;
  fetchMore: (args?: any) => void | any;
}

export const AnalysesCards = ({
  style,
  read_only,
  analyses,
  opened_corpus,
  pageInfo,
  loading_message,
  loading,
  fetchMore,
}: AnalysesCardsProps) => {
  console.log("AnalysesCards - ");

  // Let's figure out the viewport so we can size the cards appropriately.
  const { width } = useWindowDimensions();
  const card_cols = determineCardColCount(width);
  const use_mobile_layout = width <= 400;

  //////////////////////////////////////////////////////////////////////
  // Global State Vars in Apollo Cache
  const analyses_to_display = useReactiveVar(selectedAnalyses);
  const analysis_ids_to_display = analyses_to_display.map(
    (analysis) => analysis.id
  );

  //////////////////////////////////////////////////////////////////////
  const toggleAnalysis = (selected_analysis: AnalysisType) => {
    if (analysis_ids_to_display.includes(selected_analysis.id)) {
      let cleaned_analyses = analyses_to_display.filter(
        (analysis) => analysis.id !== selected_analysis.id
      );
      selectedAnalysesIds(cleaned_analyses.map((analysis) => analysis.id));
      selectedAnalyses(cleaned_analyses);
    } else {
      selectedAnalysesIds(
        [...analyses_to_display, selected_analysis].map(
          (analysis) => analysis.id
        )
      );
      selectedAnalyses([...analyses_to_display, selected_analysis]);
    }
  };

  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      console.log("Fetching more annotation cards...");
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  const analysis_items =
    analyses.length > 0 && opened_corpus ? (
      analyses.map((analysis) => (
        <AnalysisItem
          key={analysis.id}
          analysis={analysis}
          corpus={opened_corpus}
          selected={analysis_ids_to_display.includes(analysis.id)}
          read_only={read_only}
          onSelect={() => toggleAnalysis(analysis)}
        />
      ))
    ) : (
      <PlaceholderCard
        style={{
          padding: ".5em",
          margin: ".75em",
          minWidth: "300px",
        }}
        include_image
        image_style={{
          height: "30vh",
          width: "auto",
        }}
        key="no_analyses_available_placeholder"
        title="No Analyses Available..."
        description="If you have sufficient privileges, try running a new analysis from the corpus page (right click on the corpus)."
      />
    );

  let comp_style = {
    padding: "1rem",
    paddingBottom: "6rem",
    ...(use_mobile_layout
      ? {
          paddingLeft: "0px",
          paddingRight: "0px",
        }
      : {}),
  };

  return (
    <>
      <Dimmer active={loading}>
        <Loader content={loading_message} />
      </Dimmer>
      <div
        className="AnalysisCards"
        style={{
          width: "100%",
          height: "100%",
          overflowY: "scroll",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          ...style,
        }}
      >
        <Card.Group stackable itemsPerRow={card_cols} style={comp_style}>
          {analysis_items}
        </Card.Group>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </div>
    </>
  );
};
