import { Label, Card } from "semantic-ui-react";
import _ from "lodash";
import { TruncatedText } from "../widgets/data-display/TruncatedText";
import { ServerTokenAnnotation } from "./types/annotations";
import { usePages } from "./context/DocumentAtom";
import { usePdfAnnotations } from "./hooks/AnnotationHooks";

interface AnnotationSummaryProps {
  annotationId: string;
}

export const AnnotationSummary = ({ annotationId }: AnnotationSummaryProps) => {
  // console.log("AnnotationSummary received ID:", annotationId);

  const { pages } = usePages();
  const { pdfAnnotations } = usePdfAnnotations();

  const this_annotation = _.find(pdfAnnotations.annotations, {
    id: annotationId,
  }) as ServerTokenAnnotation;

  if (!this_annotation) {
    console.warn(
      `AnnotationSummary: Annotation with ID ${annotationId} not found in context.`
    );
    return (
      <Card style={{ width: "50vw", border: "1px dashed red" }}>
        <Card.Content>
          <Card.Header>Annotation Not Found</Card.Header>
          <Card.Description>ID: {annotationId}</Card.Description>
        </Card.Content>
      </Card>
    );
  }

  if (!pages) {
    return null;
  }

  const pageInfo = pages[this_annotation.page];

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
