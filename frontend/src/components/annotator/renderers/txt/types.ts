import { v4 as uuidv4 } from "uuid";
import { AnnotationLabelType } from "../../../../graphql/types";

export interface MultipageAnnotationJson {
  start: number;
  end: number;
  // Other properties can be added as needed
}
