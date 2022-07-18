import { useState } from "react";
import { Card, Dimmer, Loader } from "semantic-ui-react";

import _ from "lodash";

import { DocumentItem } from "./DocumentItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { DocumentType, PageInfo } from "../../graphql/types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";

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
  const [contextMenuOpen, setContextMenuOpen] = useState<string | null>(null);

  /**
   * Setup updates to request more docs if user reaches end of card scroll component.
   */

  const handleUpdate = () => {
    console.log("Load more docs");
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
  let cards = [<PlaceholderCard key="PlaceholderCard" />];
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
    padding: "1rem",
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
        style={{
          flex: 1,
          width: "100%",
          overflow: "hidden",
          ...style,
        }}
      >
        <Card.Group itemsPerRow={5} style={comp_style}>
          {cards}
        </Card.Group>
        <FetchMoreOnVisible fetchMore={handleUpdate} />
      </div>
    </>
  );
};
