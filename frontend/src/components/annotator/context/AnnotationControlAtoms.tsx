import { atom } from "jotai";
import { AnnotationLabelType } from "../../../types/graphql-api";

/**
 * Atoms for annotation control state
 */
export const activeSpanLabelAtom = atom<AnnotationLabelType | undefined>(
  undefined
);

export const spanLabelsToViewAtom = atom<AnnotationLabelType[] | null>(null);

export const activeRelationLabelAtom = atom<AnnotationLabelType | undefined>(
  undefined
);

export const useFreeFormAnnotationsAtom = atom<boolean>(false);

export const relationModalVisibleAtom = atom<boolean>(false);
