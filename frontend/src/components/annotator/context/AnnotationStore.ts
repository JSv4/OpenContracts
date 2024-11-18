import { createContext } from "react";

import {
  AnnotationLabelType,
  LabelDisplayBehavior,
  LabelType,
} from "../../../types/graphql-api";
import { BoundingBox, TextSearchSpanResult } from "../../types";
import { TextSearchTokenResult } from "../../types";
import {
  DocTypeAnnotation,
  PdfAnnotations,
  RelationGroup,
  ServerSpanAnnotation,
  ServerTokenAnnotation,
} from "../types/annotations";
import { PDFPageInfo } from "../types/pdf";

interface _AnnotationStore {
  relationModalVisible: boolean;
  spanLabels: AnnotationLabelType[];
  humanSpanLabelChoices: AnnotationLabelType[];
  showStructuralLabels?: boolean;
  activeSpanLabel?: AnnotationLabelType | undefined;
  showOnlySpanLabels?: AnnotationLabelType[] | null;
  setActiveLabel: (label: AnnotationLabelType) => void;

  // Obj that lets us store the refs to the rendered selections so we can scroll to them
  selectionElementRefs:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  insertSelectionElementRef: (
    id: string,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => void | never;

  // Obj that lets us store the refs to the rendered search results so we can scroll to them
  searchResultElementRefs:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  insertSearchResultElementRefs: (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => void | never;

  // Obj that lets us store the refs to the rendered pages so we can scroll to them
  pageElementRefs: Record<number, React.MutableRefObject<HTMLElement | null>>;
  insertPageRef: (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => void | never;
  removePageRef: (id: number) => void | never;

  relationLabels: AnnotationLabelType[];
  activeRelationLabel?: AnnotationLabelType;
  setActiveRelationLabel: (label: AnnotationLabelType) => void;

  docTypeLabels: AnnotationLabelType[];

  textSearchMatches: (TextSearchTokenResult | TextSearchSpanResult)[];
  selectedTextSearchMatchIndex: number;
  searchText: string | undefined;
  allowComment: boolean;
  toggleShowStructuralLabels: () => void;
  searchForText: (searchText: string) => void;
  advanceTextSearchMatch: () => void;
  reverseTextSearchMatch: () => void;
  setSelectedTextSearchMatchIndex: (index: number) => void;

  pdfAnnotations: PdfAnnotations;
  setPdfAnnotations: (t: PdfAnnotations) => void;
  setSelection: (
    b: { pageNumber: number; bounds: BoundingBox } | undefined
  ) => void;
  setMultiSelections: (b: Record<number, BoundingBox[]>) => void;
  createMultiPageAnnotation: () => void;

  createAnnotation: (a: ServerTokenAnnotation | ServerSpanAnnotation) => void;
  deleteAnnotation: (annotation_id: string) => void;
  updateAnnotation: (a: ServerTokenAnnotation | ServerSpanAnnotation) => void;

  clearViewLabels: () => void;
  setViewLabels: (ls: AnnotationLabelType[]) => void;
  addLabelsToView: (ls: AnnotationLabelType[]) => void;
  removeLabelsToView: (ls: AnnotationLabelType[]) => void;

  createDocTypeAnnotation: (dt: DocTypeAnnotation) => void;
  deleteDocTypeAnnotation: (doc_annotation_id: string) => void;
  approveAnnotation: (annot_id: string, comment?: string) => void;
  rejectAnnotation: (annot_id: string, comment?: string) => void;
  createRelation: (r: RelationGroup) => void;
  deleteRelation: (relation_id: string) => void;
  removeAnnotationFromRelation: (
    annotation_id: string,
    relation_id: string
  ) => void;

  selectedAnnotations: string[];
  setSelectedAnnotations: (annotationIds: string[]) => void;

  selectedRelations: RelationGroup[];
  setSelectedRelations: (t: RelationGroup[]) => void;

  freeFormAnnotations: boolean;
  toggleFreeFormAnnotations: (state: boolean) => void;

  hideLabels: boolean;
  setHideLabels: (state: boolean) => void;

  showAnnotationBoundingBoxes: boolean;
  showAnnotationLabels: LabelDisplayBehavior;
  setJumpedToAnnotationOnLoad: (annot_id: string) => void | null;

  pageSelection?: {
    pageNumber: number;
    bounds: BoundingBox;
  };
  pageSelectionQueue: Record<number, BoundingBox[]>;
}

export const AnnotationStore = createContext<_AnnotationStore>({
  pdfAnnotations: new PdfAnnotations([], [], []),
  spanLabels: [],
  humanSpanLabelChoices: [],
  showStructuralLabels: true,
  activeSpanLabel: undefined,
  showOnlySpanLabels: [],
  textSearchMatches: [],
  selectedTextSearchMatchIndex: 1,
  searchText: undefined,
  allowComment: false,
  relationModalVisible: false,
  approveAnnotation: (annot_id: string, comment?: string) => {
    throw new Error("approveAnnotation- not implemented");
  },
  rejectAnnotation: (annot_id: string, comment?: string) => {
    throw new Error("approveAnnotation- not implemented");
  },
  toggleShowStructuralLabels: () => {
    throw new Error("toggleShowStructuralLabels() - not implemented");
  },
  searchForText: (searchText: string) => {
    throw new Error("searchForText() - not implemented");
  },
  advanceTextSearchMatch: () => {
    throw new Error("advanceTextSearchMatch() - not implemented");
  },
  reverseTextSearchMatch: () => {
    throw new Error("reverseTextSearchMatch() - not implemented");
  },
  setSelectedTextSearchMatchIndex: () => {
    throw new Error("setSelectedTextSearchMatchIndex() - not implemented");
  },
  setSelection: (
    _?: { pageNumber: number; bounds: BoundingBox } | undefined
  ) => {
    throw new Error("Unimplemeneted");
  },
  setMultiSelections: (_?: Record<number, BoundingBox[]>) => {
    throw new Error("Unimplemeneted");
  },
  setActiveLabel: (_?: AnnotationLabelType) => {
    throw new Error("Unimplemented");
  },
  clearViewLabels: () => {
    throw new Error("clearViewLabels is not implemented");
  },
  setViewLabels: () => {
    throw new Error("setViewLabels() is not implemented");
  },
  addLabelsToView: (_?: AnnotationLabelType[]) => {
    throw new Error("addLabelsToView is not implemented");
  },
  removeLabelsToView: (_?: AnnotationLabelType[]) => {
    throw new Error("removeLabelsToViewis not implemented");
  },
  selectionElementRefs: undefined,
  insertSelectionElementRef: (
    id: string,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    throw new Error("insertSelectionElementRef() not implemented");
  },
  searchResultElementRefs: undefined,
  insertSearchResultElementRefs: (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    throw new Error("insertSearchResultElementRefs() not implemented");
  },
  pageElementRefs: {},
  insertPageRef: (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    throw new Error("insertPageRef() not implemented");
  },
  removePageRef: (id: number) => {
    throw new Error("removePageRef() not implemented");
  },
  relationLabels: [],
  activeRelationLabel: undefined,
  setActiveRelationLabel: (_?: AnnotationLabelType) => {
    throw new Error("setActiveRelationLabel() - Unimplemented");
  },
  docTypeLabels: [],
  createAnnotation: (_?: ServerTokenAnnotation | ServerSpanAnnotation) => {
    throw new Error("createAnnotation() - Unimplemented");
  },
  deleteAnnotation: (_?: string) => {
    throw new Error("deleteAnnotation() - Unimplemented");
  },
  updateAnnotation: (_?: ServerTokenAnnotation | ServerSpanAnnotation) => {
    throw new Error("updateAnnotation() - Unimplemented");
  },
  createDocTypeAnnotation: (_?: DocTypeAnnotation) => {
    throw new Error("createDocTypeAnnotation() - Unimplemented");
  },
  deleteDocTypeAnnotation: (_?: string) => {
    throw new Error("deleteDocTypeAnnotation() - Unimplemented");
  },
  createMultiPageAnnotation: () => {
    throw new Error(
      "createMultiPageAnnotation is unimplemented. This is needed for multi-page annotations."
    );
  },
  createRelation: (_?: RelationGroup) => {
    throw new Error("createRelation() - Unimplemented");
  },
  deleteRelation: (_?: string) => {
    throw new Error("deleteRelation() - Unimplemented");
  },
  removeAnnotationFromRelation: (
    annotation_id: string,
    relation_id: string
  ) => {
    throw new Error("removeAnnotationFromRelation() - Unimplemented");
  },
  selectedAnnotations: [],
  setSelectedAnnotations: (_?: string[]) => {
    throw new Error("Unimplemented");
  },
  selectedRelations: [],
  setSelectedRelations: (_?: RelationGroup[]) => {
    throw new Error("Unimplemented");
  },
  setPdfAnnotations: (_: PdfAnnotations) => {
    throw new Error("Unimplemented");
  },
  freeFormAnnotations: false,
  toggleFreeFormAnnotations: (_: boolean) => {
    throw new Error("Unimplemented");
  },
  hideLabels: false,
  setHideLabels: (_: boolean) => {
    throw new Error("Unimplemented");
  },
  showAnnotationBoundingBoxes: false,
  showAnnotationLabels: LabelDisplayBehavior.ALWAYS,
  setJumpedToAnnotationOnLoad: () => {
    throw new Error("setJumpedToAnnotationOnLoad - not implemented");
  },
  pageSelection: undefined,
  pageSelectionQueue: {},
});
