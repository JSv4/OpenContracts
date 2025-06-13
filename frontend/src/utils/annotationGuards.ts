import { RawServerAnnotationType, LabelType } from "../types/graphql-api";
import { MultipageAnnotationJson, SpanAnnotationJson } from "../components/types";

/**
 * Runtime type guard that narrows a `RawServerAnnotationType` to one whose
 * `json` field is a `MultipageAnnotationJson`.
 */
export function isTokenAnnotation(
  annotation: RawServerAnnotationType
): annotation is RawServerAnnotationType & {
  json: MultipageAnnotationJson;
  annotationType: LabelType.TokenLabel;
} {
  return (
    annotation.annotationType === LabelType.TokenLabel ||
    annotation.annotationLabel?.labelType === LabelType.TokenLabel
  );
}

/**
 * Runtime type guard that narrows a `RawServerAnnotationType` to one whose
 * `json` field is a `SpanAnnotationJson`.
 */
export function isSpanAnnotation(
  annotation: RawServerAnnotationType
): annotation is RawServerAnnotationType & {
  json: SpanAnnotationJson;
  annotationType: LabelType.SpanLabel;
} {
  return (
    annotation.annotationType === LabelType.SpanLabel ||
    annotation.annotationLabel?.labelType === LabelType.SpanLabel
  );
} 