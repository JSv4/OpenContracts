import { useContext } from "react";
import { PDFStore, AnnotationStore } from "./context";
import { Label, Card } from "semantic-ui-react";
import styled from "styled-components";
import _ from "lodash";
import { TruncatedText } from "../widgets/data-display/TruncatedText";
import {
  RenderedSpanAnnotation,
  ServerTokenAnnotation,
} from "./types/annotations";

interface AnnotationSummaryProps {
  annotation: RenderedSpanAnnotation;
}

export const AnnotationSummary = ({ annotation }: AnnotationSummaryProps) => {
  console.log("AnnotationSummary", annotation);

  const pdfStore = useContext(PDFStore);
  const annotationStore = useContext(AnnotationStore);
  const this_annotation = _.find(annotationStore.pdfAnnotations.annotations, {
    id: annotation,
  }) as ServerTokenAnnotation;

  if (!pdfStore.pages) {
    return null;
  }

  const pageInfo = pdfStore.pages[this_annotation.page];

  const text = this_annotation.rawText;

  return (
    <Card style={{ width: "50vw" }}>
      <Card.Content>
        <Card.Header>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexDirection: "row",
            }}
          >
            <Label
              size="mini"
              style={{
                backgroundColor: `${
                  this_annotation?.annotationLabel?.color
                    ? this_annotation.annotationLabel.color
                    : "gray"
                }`,
              }}
            >
              {this_annotation?.annotationLabel?.text
                ? this_annotation.annotationLabel.text
                : ""}
            </Label>
            <div>
              <b>
                Page{" "}
                {pageInfo?.page?.pageNumber ? pageInfo.page.pageNumber : "-"}
              </b>
            </div>
          </div>
        </Card.Header>
        <Card.Description>
          <TruncatedText text={text} limit={128} />
        </Card.Description>
      </Card.Content>
    </Card>
  );
};

const PaddedRow = styled.div`
  padding: 4px 0;
  border-radius: 2px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) min-content min-content min-content;
`;

const Overflow = styled.span`
  line-height: 1;
  font-size: 0.8rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;
