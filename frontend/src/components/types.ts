import { ReactElement } from "react";
import { AnnotationLabelType } from "../graphql/types";

/**
 * Type-related functions
 */
export function notEmpty<TValue>(
  value: TValue | null | undefined
): value is TValue {
  if (value === null || value === undefined) return false;
  const testDummy: TValue = value;
  return true;
}

/**
 *  Types
 */
export enum PermissionTypes {
  CAN_PERMISSION = "CAN_PERMISSION",
  CAN_PUBLISH = "CAN_PUBLISH",
  CAN_CREATE = "CAN_CREATE",
  CAN_READ = "CAN_READ",
  CAN_UPDATE = "CAN_UPDATE",
  CAN_REMOVE = "CAN_REMOVE",
}

export interface PaperStatus {
  id: string;
  sha: string;
  name: string;
  annotations: number;
  relations: number;
  comments: string;
  completedAt: Date | null;
}

export interface PaperStatusRequestOutputs {
  id: string;
  sha: string;
  name: string;
  annotations: {
    totalCount: number;
  };
  relations: {
    totalCount: number;
  };
  comments: string;
  completedAt: string;
}

export enum ViewState {
  LOADING,
  LOADED,
  NOT_FOUND,
  ERROR,
}

export type Page = {
  index: number;
  width: number;
  height: number;
};

export type PageTokens = {
  page: Page;
  tokens: Token[];
};

export interface Token {
  x: number;
  y: number;
  height: number;
  width: number;
  text: string;
}

export interface LabelSet {
  id: string;
  title: string;
  icon: string;
  allAnnotationLabels: AnnotationLabelType[];
  description?: string;
}

export interface OCAnnotation {
  id: string;
  page: number;
  tokensJsons: Token[];
  boundingBox: BoundingBox;
  rawText: string;
  annotationLabel: {
    id: string;
  };
  document: {
    id: string;
  };
  corpus: {
    id: string;
  };
  sourceNodeInRelationships?: {
    edges: {
      node: {
        id: string;
      };
    };
  };
  creator?: OCUser;
}

export interface OCUser {
  id: string;
  email?: string;
  username?: string;
}

export interface NewAnnotationInputs {
  boundingBox: BoundingBox;
  tokensJsons: Token[];
  page: number;
  rawText: string;
  corpusId: string;
  documentId: string;
  labelId: string;
}

export interface LooseObject {
  [key: string]: any;
}

export interface LabelOptionProps {
  key: string;
  text: string;
  value: string;
  content: JSX.Element;
}

export interface LabelsetOptionProps {
  key: string;
  title: string;
  value: string;
  content: JSX.Element;
}

export interface ActionDropdownItem {
  key: string;
  title: string;
  icon: string;
  color: string;
  action_function: (props: any) => void;
}

export interface CRUDProps {
  mode: "CREATE" | "EDIT" | "VIEW";
  model_name: string;
  has_file: boolean;
  file_field: string;
  file_label: string;
  file_is_image: boolean;
  accepted_file_types: string;
  ui_schema: Record<string, any>;
  data_schema: Record<string, any>;
}

export type BoundingBox = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TokenId = {
  pageIndex: number;
  tokenIndex: number;
};

export type SinglePageAnnotationJson = {
  bounds: BoundingBox;
  tokensJsons: TokenId[];
  rawText: string;
};

export type TextSearchResult = {
  id: number;
  tokens: Record<number, TokenId[]>;
  bounds: Record<number, BoundingBox>;
  fullContext: ReactElement | null;
  start_page: number;
  end_page: number;
};

export type MultipageAnnotationJson = Record<number, SinglePageAnnotationJson>;
