import React, { useContext } from "react";
import _ from "lodash";

import { AnnotationStore, PDFPageInfo, ServerAnnotation } from "../context";
import { Selection } from "./Selection";
import { LabelDisplayBehavior } from "../../../graphql/types";

export const AnnotationLayer = React.memo(
  ({
    pageInfo,
    annotations,
    showBoundingBox,
    showLabels,
    labelBehavior,
    selectedAnnotations,
    setJumpedToAnnotationOnLoad,
  }: {
    pageInfo: PDFPageInfo;
    annotations: ServerAnnotation[];
    showBoundingBox: boolean;
    showLabels: boolean;
    labelBehavior: LabelDisplayBehavior;
    selectedAnnotations: string[];
    setJumpedToAnnotationOnLoad: (id: string) => void;
  }) => {
    const annotationStore = useContext(AnnotationStore);

    const { selectionElementRefs } = annotationStore;

    return (
      <>
        {annotations.map((annotation) => (
          <Selection
            key={annotation.id}
            hidden={!showLabels}
            showBoundingBox={showBoundingBox}
            scrollIntoView={selectedAnnotations.includes(annotation.id)}
            labelBehavior={labelBehavior}
            pageInfo={pageInfo}
            annotation={annotation}
            selectionRef={selectionElementRefs}
            setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
          />
        ))}
      </>
    );
  }
);
