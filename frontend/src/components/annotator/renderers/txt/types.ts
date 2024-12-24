import { v4 as uuidv4 } from "uuid";
import { AnnotationLabelType } from "../../../../types/graphql-api";

export interface MultipageAnnotationJson {
  start: number;
  end: number;
  // Other properties can be added as needed
}
