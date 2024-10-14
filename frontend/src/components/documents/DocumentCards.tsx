import { useState, useCallback } from "react";
import { Card, Dimmer, Loader } from "semantic-ui-react";
import { useDropzone } from "react-dropzone";

import _ from "lodash";

import { DocumentItem } from "./DocumentItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { DocumentType, PageInfo } from "../../graphql/types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

interface DocumentCardProps {
  style?: Record<string, any>;
  items: DocumentType[];
  pageInfo: PageInfo | undefined;
  loading: boolean;
  loading_message: string;
  onShiftClick?: (document: DocumentType) => void;
  onClick?: (document: DocumentType) => void;
  removeFromCorpus?: (doc_ids: string[]) => void | any;
  fetchMore: (args?: any) => void | any;
  onDrop: (acceptedFiles: File[]) => void;
  corpusId: string | null;
}

export const DocumentCards = ({
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  onShiftClick,
  onClick,
  removeFromCorpus,
  fetchMore,
  onDrop,
  corpusId,
}: DocumentCardProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
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
          onClick={onClick}
          onShiftClick={onShiftClick}
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
  // This is causing oddness may need separate things
  // if (style) {
  //   comp_style = { ...comp_style, ...style };
  // }
  /**
   * Return DocumentItems
   */

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "20px",
              backgroundColor: "white",
              borderRadius: "5px",
            }}
          >
            Drop files here to upload
          </div>
        </div>
      )}
      <Dimmer active={loading}>
        <Loader content={loading_message} />
      </Dimmer>
      <div
        className="DocumentCards"
        style={{
          flex: 1,
          width: "100%",
          overflowY: "scroll",
          ...style,
        }}
      >
        <Card.Group stackable itemsPerRow={card_cols} style={comp_style}>
          {cards}
        </Card.Group>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </div>
    </div>
  );
};
