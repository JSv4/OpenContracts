import { atom } from "jotai";
import {
  AnalysisRowType,
  AnalysisType,
  DatacellType,
  ColumnType,
  ExtractType,
} from "../../../types/graphql-api";
import { LabelDisplayBehavior } from "../../../types/graphql-api";

/**
 * Atom for analysis rows.
 */
export const analysisRowsAtom = atom<AnalysisRowType[]>([]);

/**
 * Atom for data cells.
 */
export const dataCellsAtom = atom<DatacellType[]>([]);

/**
 * Atom for columns.
 */
export const columnsAtom = atom<ColumnType[]>([]);

/**
 * Atom for analyses.
 */
export const analysesAtom = atom<AnalysisType[]>([]);

/**
 * Atom for extracts.
 */
export const extractsAtom = atom<ExtractType[]>([]);

/**
 * Atom for the selected analysis.
 */
export const selectedAnalysisAtom = atom<AnalysisType | null>(null);

/**
 * Atom for the selected extract.
 */
export const selectedExtractAtom = atom<ExtractType | null>(null);

/**
 * Atom to control whether user input is allowed.
 */
export const allowUserInputAtom = atom<boolean>(true);

/**
 * Atom to control the visibility of annotation bounding boxes.
 */
export const showAnnotationBoundingBoxesAtom = atom<boolean>(true);

/**
 * Atom to control the display behavior of annotation labels.
 */
export const showAnnotationLabelsAtom = atom<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);

/**
 * Atom to control whether only the selected annotation is shown.
 */
export const showSelectedAnnotationOnlyAtom = atom<boolean>(false);
