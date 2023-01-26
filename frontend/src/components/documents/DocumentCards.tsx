import { useState } from "react";
import { Card, Dimmer, Loader } from "semantic-ui-react";

import _ from "lodash";

import { DocumentItem } from "./DocumentItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { DocumentType, PageInfo } from "../../graphql/types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";

interface DocumentCardProps {
  style?: Record<string, any>;
  items: DocumentType[];
  pageInfo: PageInfo | undefined;
  loading: boolean;
  loading_message: string;
  removeFromCorpus?: (doc_ids: string[]) => void | any;
  fetchMore: (args?: any) => void | any;
}

export const DocumentCards = ({
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  removeFromCorpus,
  fetchMore,
}: DocumentCardProps) => {
  
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 400;
  const card_cols = determineCardColCount(width);

  const [contextMenuOpen, setContextMenuOpen] = useState<string | null>(null);

  /**
   * Setup updates to request more docs if user reaches end of card scroll component.
   */

  const handleUpdate = () => {
    // console.log("Load more docs");
    if (!loading && pageInfo?.hasNextPage) {
      console.log("cursor", pageInfo.endCursor);
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  /**
   * Build the actual DocumentItem card elements for insertion into component below
   */
  let cards = [
    <PlaceholderCard
      key="PlaceholderCard"
      title="No Matching Documents..."
      include_image
      style={{
        height: "40vh",
      }}
      image_style={{
        height: "30vh",
        width: "auto",
      }}
    />,
  ];
  if (items && items.length > 0) {
    cards = items.map((node, index: number) => {
      return (
        <DocumentItem
          key={node?.id ? node.id : `doc_item_${index}`}
          item={node}
          contextMenuOpen={contextMenuOpen}
          setContextMenuOpen={setContextMenuOpen}
          removeFromCorpus={removeFromCorpus}
        />
      );
    });
  }

  let comp_style = {
    width: "100%",
    paddingTop: "1rem",
    paddingRight: "0px",
    paddingLeft: use_mobile_layout ? "5px" : "1rem",
    ...(use_mobile_layout ? { margin: "0px !important" } : {}),
  };
  if (style) {
    comp_style = { ...comp_style, ...style };
  }
  /**
   * Return DocumentItems
   */
  return (
    <>
      <Dimmer active={loading}>
        <Loader content={loading_message} />
      </Dimmer>
      <div
        className="DocumentCards"
        style={{
          flex: 1,
          width: "100%",
          overflow: "hidden",
          ...style,
        }}
      >
        <Card.Group stackable itemsPerRow={card_cols} style={comp_style}>
          {cards}
        </Card.Group>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </div>
    </>
  );
};
