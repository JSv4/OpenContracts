import { Card, Dimmer, Loader } from "semantic-ui-react";
import { ExtractItem } from "./ExtractItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { ExtractType, CorpusType, PageInfo } from "../../types/graphql-api";
import { useReactiveVar } from "@apollo/client";
import { openedExtract, selectedExtractIds } from "../../graphql/cache";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

interface ExtractCardsProps {
  style?: Record<string, any>;
  read_only?: boolean;
  extracts: ExtractType[];
  opened_corpus: CorpusType | null;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  loading_message: string;
  fetchMore: (args?: any) => void | any;
}

export const ExtractCards = ({
  style,
  read_only,
  extracts,
  opened_corpus,
  loading_message,
  loading,
  fetchMore,
}: ExtractCardsProps) => {
  const { width } = useWindowDimensions();
  const card_cols = determineCardColCount(width);
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  //   const selected_extract_ids = useReactiveVar(selectedExtractIds);
  const opened_extract = useReactiveVar(openedExtract);

  //   const toggleExtract = (selected_extract: ExtractType) => {
  //     if (selected_extract_ids.includes(selected_extract.id)) {
  //       const cleaned_extracts = selected_extract_ids.filter(
  //         (extract) => extract !== selected_extract.id
  //       );
  //       selectedExtractIds(cleaned_extracts);
  //     } else {
  //       selectedExtractIds([...selected_extract_ids, selected_extract.id]);
  //     }
  //   };

  const extract_items =
    extracts.length > 0 && opened_corpus ? (
      extracts.map((extract) => (
        <ExtractItem
          key={extract.id}
          extract={extract}
          corpus={opened_corpus}
          selected={opened_extract?.id === extract.id}
          read_only={read_only}
          onSelect={() => openedExtract(extract)}
        />
      ))
    ) : (
      <PlaceholderCard
        style={{
          padding: ".5em",
          margin: ".75em",
          minWidth: "300px",
        }}
        key="no_extracts_available_placeholder"
        title="No Extracts Available..."
        description="If you have sufficient privileges, try creating a new extract from the corpus page (right click on the corpus)."
      />
    );

  const comp_style = {
    width: "100%",
    padding: "1rem",
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
        className="ExtractCards"
        style={{
          width: "100%",
          height: "100%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          padding: "1rem",
          paddingBottom: "6rem",
          ...style,
        }}
      >
        <Card.Group stackable itemsPerRow={card_cols} style={comp_style}>
          {extract_items}
        </Card.Group>
        <FetchMoreOnVisible fetchNextPage={fetchMore} />
      </div>
    </>
  );
};
