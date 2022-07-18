import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { useReactiveVar } from "@apollo/client";
import {
  Card,
  Dimmer,
  Loader,
  Icon,
  Label,
  Header,
  Popup,
} from "semantic-ui-react";
import {
  selectedAnnotation,
  openedDocument,
  openedCorpus,
} from "../../graphql/cache";
import {
  ServerAnnotationType,
  PageInfo,
  CorpusType,
  DocumentType,
} from "../../graphql/types";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";

interface AnnotationToNavigateTo {
  selected_annotation: ServerAnnotationType;
  selected_corpus: CorpusType;
  selected_document: DocumentType;
}

interface AnnotationCardProps {
  style?: Record<string, any>;
  items: ServerAnnotationType[];
  pageInfo: PageInfo | undefined | null;
  loading: boolean;
  loading_message: string;
  fetchMore: (args?: any) => void | any;
}

export const AnnotationCards = ({
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  fetchMore,
}: AnnotationCardProps) => {
  const selected_annotation = useReactiveVar(selectedAnnotation);
  const [targetAnnotation, setTargetAnnotation] =
    useState<AnnotationToNavigateTo>();
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * Setup updates to request more docs if user reaches end of card scroll component.
   */

  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  // Using useEffect to batch updates to cache state. When target annotation changes, send batch updates to cache and,
  // if we're not on the /corpuses page, navigate to that page.
  useEffect(() => {
    if (targetAnnotation) {
      selectedAnnotation(targetAnnotation.selected_annotation);
      openedDocument(targetAnnotation.selected_document);
      openedCorpus(targetAnnotation.selected_corpus);
      setTargetAnnotation(undefined);
      if (location.pathname !== "/") {
        navigate("/");
      }
    }
  }, [targetAnnotation]);

  let cards: JSX.Element[] = [
    <PlaceholderCard key={0} description="No Matching Annotations..." />,
  ];
  if (items && items.length > 0) {
    cards = items.map((item) => {
      return (
        <Card
          key={item.id}
          style={{
            backgroundColor:
              item.id === selected_annotation?.id ? "#e2ffdb" : "",
            minHeight: "10vh",
          }}
          onClick={() => {
            if (item && item.document && item.corpus) {
              setTargetAnnotation({
                selected_annotation: item,
                selected_corpus: item.corpus,
                selected_document: item.document,
              });
            }
          }}
        >
          <Card.Content>
            <Label
              ribbon
              style={{
                color: item.annotationLabel
                  ? item.annotationLabel.color
                  : "grey",
              }}
            >
              <Icon name="tags" />
              {item.annotationLabel ? item.annotationLabel.text : "Unknown"}
            </Label>
            <Header as="h4">Tagged Text:</Header>
            <Popup
              content={item.rawText}
              trigger={<p>{item.rawText?.substring(0, 256)}</p>}
            />
            <Popup
              content={item.document.title}
              trigger={<Label corner="right" icon="file text outline" />}
            />
          </Card.Content>
        </Card>
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
