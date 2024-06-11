import { createContext } from "react";
import { v4 as uuidv4 } from "uuid";

import { AnnotationLabelType } from "../../../graphql/types";
import { PDFPageInfo } from ".";
import {
  BoundingBox,
  MultipageAnnotationJson,
  PermissionTypes,
} from "../../types";
import { TextSearchResult } from "../../types";

export interface TokenId {
  pageIndex: number;
  tokenIndex: number;
}

export class RelationGroup {
  constructor(
    public sourceIds: string[],
    public targetIds: string[],
    public label: AnnotationLabelType,
    public id: string | string = uuidv4()
  ) {
    this.id = id;
  }

  // TODO - need to find a way to integrate this into current application log, which does NOT account for this.
  updateForAnnotationDeletion(a: ServerAnnotation): RelationGroup | undefined {
    const sourceEmpty = this.sourceIds.length === 0;
    const targetEmpty = this.targetIds.length === 0;

    const newSourceIds = this.sourceIds.filter((id) => id !== a.id);
    const newTargetIds = this.targetIds.filter((id) => id !== a.id);

    const nowSourceEmpty = this.sourceIds.length === 0;
    const nowTargetEmpty = this.targetIds.length === 0;

    // Only target had any annotations, now it has none,
    // so delete.
    if (sourceEmpty && nowTargetEmpty) {
      return undefined;
    }
    // Only source had any annotations, now it has none,
    // so delete.
    if (targetEmpty && nowSourceEmpty) {
      return undefined;
    }
    // Source was not empty, but now it is, so delete.
    if (!sourceEmpty && nowSourceEmpty) {
      return undefined;
    }
    // Target was not empty, but now it is, so delete.
    if (!targetEmpty && nowTargetEmpty) {
      return undefined;
    }

    return new RelationGroup(newSourceIds, newTargetIds, this.label);
  }

  static fromObject(obj: RelationGroup) {
    return new RelationGroup(obj.sourceIds, obj.targetIds, obj.label);
  }
}

export class ServerAnnotation {
  public readonly id: string;

  constructor(
    public readonly page: number,
    public readonly annotationLabel: AnnotationLabelType,
    public readonly rawText: string,
    public readonly json: MultipageAnnotationJson,
    public readonly myPermissions: PermissionTypes[],
    id: string | undefined = undefined
  ) {
    this.id = id || uuidv4();
  }

  toString() {
    return this.id;
  }

  /**
   * Returns a deep copy of the provided Annotation with the applied
   * changes.
   */
  update(delta: Partial<ServerAnnotation> = {}) {
    return new ServerAnnotation(
      delta.page ?? this.page,
      delta.annotationLabel ?? Object.assign({}, this.annotationLabel),
      delta.rawText ?? this.rawText,
      delta.json ?? this.json,
      delta.myPermissions ?? this.myPermissions,
      this.id
    );
  }

  static fromObject(obj: ServerAnnotation) {
    return new ServerAnnotation(
      obj.page,
      obj.annotationLabel,
      obj.rawText,
      obj.json,
      obj.myPermissions,
      obj.id
    );
  }
}

export class RenderedSpanAnnotation {
  public readonly id: string;

  constructor(
    public bounds: BoundingBox,
    public readonly page: number,
    public readonly annotationLabel: AnnotationLabelType,
    public readonly tokens: TokenId[] | null = null,
    public readonly rawText: string,
    id: string | undefined = undefined
  ) {
    this.id = id || uuidv4();
  }

  toString() {
    return this.id;
  }

  /**
   * Returns a deep copy of the provided Annotation with the applied
   * changes.
   */
  update(delta: Partial<RenderedSpanAnnotation> = {}) {
    return new RenderedSpanAnnotation(
      delta.bounds ?? Object.assign({}, this.bounds),
      delta.page ?? this.page,
      delta.annotationLabel ?? Object.assign({}, this.annotationLabel),
      delta.tokens ?? this.tokens?.map((t) => Object.assign({}, t)),
      delta.rawText ?? this.rawText,
      this.id
    );
  }

  static fromObject(obj: RenderedSpanAnnotation) {
    return new RenderedSpanAnnotation(
      obj.bounds,
      obj.page,
      obj.annotationLabel,
      obj.tokens,
      obj.rawText,
      obj.id
    );
  }
}

export class DocTypeAnnotation {
  public readonly id: string;

  constructor(
    public readonly annotationLabel: AnnotationLabelType,
    public readonly myPermissions: PermissionTypes[],
    id: string | undefined = undefined
  ) {
    this.id = id || uuidv4();
  }

  toString() {
    return this.id;
  }

  static fromObject(obj: DocTypeAnnotation) {
    return new DocTypeAnnotation(
      obj.annotationLabel,
      obj.myPermissions,
      obj.id
    );
  }
}

export class PdfAnnotations {
  constructor(
    public readonly annotations: ServerAnnotation[],
    public readonly relations: RelationGroup[],
    public readonly docTypes: DocTypeAnnotation[],
    public readonly unsavedChanges: boolean = false
  ) {}

  saved(): PdfAnnotations {
    return new PdfAnnotations(
      this.annotations,
      this.relations,
      this.docTypes,
      false
    );
  }

  // TODO - what is this for?
  undoAnnotation(): PdfAnnotations {
    const popped = this.annotations.pop();
    if (!popped) {
      // No annotations, nothing to update
      return this;
    }
    const newRelations = this.relations
      .map((r) => r.updateForAnnotationDeletion(popped))
      .filter((r) => r !== undefined);

    return new PdfAnnotations(
      this.annotations,
      newRelations as RelationGroup[],
      this.docTypes,
      true
    );
  }
}

interface _AnnotationStore {
  spanLabels: AnnotationLabelType[];
  humanSpanLabelChoices: AnnotationLabelType[];
  showStructuralLabels?: boolean;
  activeSpanLabel?: AnnotationLabelType | undefined;
  showOnlySpanLabels?: AnnotationLabelType[];
  setActiveLabel: (label: AnnotationLabelType) => void;

  scrollContainerRef: React.RefObject<HTMLDivElement> | undefined;
  setScrollContainerRef: (
    ref: React.RefObject<HTMLDivElement> | undefined
  ) => void;

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

  docText: string | undefined;
  textSearchMatches: TextSearchResult[];
  selectedTextSearchMatchIndex: number;
  searchText: string | undefined;
  toggleShowStructuralLabels: () => void;
  searchForText: (searchText: string) => void;
  advanceTextSearchMatch: () => void;
  reverseTextSearchMatch: () => void;
  setSelectedTextSearchMatchIndex: (index: number) => void;

  pdfAnnotations: PdfAnnotations;
  pageSelection: { pageNumber: number; bounds: BoundingBox } | undefined;
  pageSelectionQueue: Record<number, BoundingBox[]>;
  setPdfAnnotations: (t: PdfAnnotations) => void;
  setSelection: (
    b: { pageNumber: number; bounds: BoundingBox } | undefined
  ) => void;
  setMultiSelections: (b: Record<number, BoundingBox[]>) => void;

  pdfPageInfoObjs: Record<number, PDFPageInfo>;
  setPdfPageInfoObjs: (b: Record<number, PDFPageInfo>) => void;
  createMultiPageAnnotation: () => void;

  createAnnotation: (a: ServerAnnotation) => void;
  deleteAnnotation: (annotation_id: string) => void;
  updateAnnotation: (a: ServerAnnotation) => void;

  clearViewLabels: () => void;
  setViewLabels: (ls: AnnotationLabelType[]) => void;
  addLabelsToView: (ls: AnnotationLabelType[]) => void;
  removeLabelsToView: (ls: AnnotationLabelType[]) => void;

  createDocTypeAnnotation: (dt: DocTypeAnnotation) => void;
  deleteDocTypeAnnotation: (doc_annotation_id: string) => void;

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
}

export const AnnotationStore = createContext<_AnnotationStore>({
  pdfAnnotations: new PdfAnnotations([], [], []),
  pageSelection: undefined,
  pageSelectionQueue: [],
  spanLabels: [],
  humanSpanLabelChoices: [],
  showStructuralLabels: true,
  activeSpanLabel: undefined,
  showOnlySpanLabels: [],
  docText: undefined,
  textSearchMatches: [],
  selectedTextSearchMatchIndex: 1,
  searchText: undefined,
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
  scrollContainerRef: undefined,
  setScrollContainerRef: (ref: React.RefObject<HTMLDivElement> | undefined) => {
    throw new Error("setScrollContainerRef is not implemented");
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
  createAnnotation: (_?: ServerAnnotation) => {
    throw new Error("createAnnotation() - Unimplemented");
  },
  deleteAnnotation: (_?: string) => {
    throw new Error("deleteAnnotation() - Unimplemented");
  },
  updateAnnotation: (_?: ServerAnnotation) => {
    throw new Error("updateAnnotation() - Unimplemented");
  },
  createDocTypeAnnotation: (_?: DocTypeAnnotation) => {
    throw new Error("createDocTypeAnnotation() - Unimplemented");
  },
  deleteDocTypeAnnotation: (_?: string) => {
    throw new Error("deleteDocTypeAnnotation() - Unimplemented");
  },
  pdfPageInfoObjs: [],
  setPdfPageInfoObjs: (_?: Record<number, PDFPageInfo>) => {
    throw new Error(
      "setPdfPageInfoObjs is unimplemented. This is needed for multi-page annotations."
    );
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
});
