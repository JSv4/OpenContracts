import { IdGetter, InMemoryCache, makeVar } from "@apollo/client";
import {
  FieldPolicy,
  KeySpecifier,
} from "@apollo/client/cache/inmemory/policies";
import { Reference, relayStylePagination } from "@apollo/client/utilities";
import { User } from "@auth0/auth0-react";
import { FieldNode } from "graphql";
import _ from "lodash";
import {
  ServerAnnotationType,
  CorpusType,
  DocumentType,
  LabelSetType,
  LabelDisplayBehavior,
  AnalysisType,
  ExtractType,
  FieldsetType,
  ColumnType,
  CorpusQueryType,
} from "./types";
import { ViewState } from "../components/types";

export const mergeArrayByIdFieldPolicy: FieldPolicy<Reference[]> = {
  // eslint-disable-next-line @typescript-eslint/default-param-last
  merge: (existing = [], incoming = [], { readField, mergeObjects }) => {
    const merged = [...incoming];
    const existingIds = existing.map((item) => readField<string>("id", item));

    merged.forEach((item, index) => {
      const itemId = readField<string>("id", item);
      const existingIndex = existingIds.findIndex((id) => id === itemId);
      if (existingIndex !== -1) {
        merged[index] = mergeObjects(existing[existingIndex], merged[index]);
      }
    });
    return merged;
  },
};

/**
 * Apollo Client is magical, but it's not all-knowing. When you use aliases for the same (or similar) queries,
 * apollo isn't smart enough to keep separate caches with separate lists of edges and, most crucially, pageInfo objs.
 * This messes up infinite scroll for batched, aliased queries. One workaround is to use an @connection directive (
 * which doesn't appear to be supported by Graphene?), another is to use a keyArgs (https://www.apollographql.com/docs/react/pagination/key-args/).
 * which tells Apollo to maintain separate caches based on certain filter vars. Finally, where we don't have a keyArgs
 * to filter by (or don't want to use one), it's possible to use a KeyArgsFunc that is capable of creating different caches
 * for aliased fields: https://github.com/apollographql/apollo-client/issues/7540
 * @param args
 * @param context
 * @returns
 */
const ContextAwareRelayStylePaginationKeyArgsFunction = (
  args: Record<string, any> | null,
  context: {
    typename: string;
    fieldName: string;
    field: FieldNode | null;
    variables?: Record<string, any>;
  }
): KeySpecifier | false | ReturnType<IdGetter> => {
  return `${context.field?.alias || context.fieldName}`;
};

// See proper setup here:
// https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/
export const cache = new InMemoryCache({
  typePolicies: {
    PageAwareAnnotationType: {
      fields: {
        pageAnnotations: {
          keyArgs: ["documentId", "corpusId", "forAnalysisIds", "labelType"],
        },
      },
    },
    DocumentType: {
      fields: {
        // Field policy map for the Document type
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedDocumentIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedDocument() && openedDocument()?.id === readField("id");
          },
        },
      },
    },
    CorpusType: {
      fields: {
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedCorpusIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedCorpus() && openedCorpus()?.id === readField("id");
          },
        },
      },
    },
    LabelSetType: {
      fields: {
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedLabelsetIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedLabelset() && openedLabelset()?.id === readField("id");
          },
        },
      },
    },
    Query: {
      fields: {
        annotations: relayStylePagination(
          ContextAwareRelayStylePaginationKeyArgsFunction
        ),
        pageAnnotations: {
          keyArgs: [
            "pdfPageInfo",
            ["labelType", "documentId", "corpusId", "forAnalysisIds"],
          ],
          merge: true,
        },
        documents: relayStylePagination(),
        corpuses: relayStylePagination(),
        userexports: relayStylePagination(),
        labelsets: relayStylePagination(),
        annotationLabels: relayStylePagination(),
        relationshipLabels: relayStylePagination(),
        extracts: relayStylePagination(),
        columns: relayStylePagination(),
      },
    },
  },
});

/**
 * Global GUI State / Variables
 */
export const showCookieAcceptModal = makeVar<boolean>(true);
export const showAddDocsToCorpusModal = makeVar<boolean>(false);
export const showRemoveDocsFromCorpusModal = makeVar<boolean>(false);
export const showUploadNewDocumentsModal = makeVar<boolean>(false);
export const showDeleteDocumentsModal = makeVar<boolean>(false);
export const showNewLabelsetModal = makeVar<boolean>(false);
export const showExportModal = makeVar<boolean>(false);
// if this is true, only render the currently selected annotation.
export const showSelectedAnnotationOnly = makeVar<boolean>(true);
// if this is false, don't render <SelectionBoundary> elements so you only see tokens. Cleaner for complex annotations.
export const showAnnotationBoundingBoxes = makeVar<boolean>(false);
// Show Labels toggle (if false, don't show labels)
export const showAnnotationLabels = makeVar<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);
export const pagesVisible = makeVar<Record<number, string>>({});
export const showEditExtractModal = makeVar<boolean>(false);
export const showDeleteExtractModal = makeVar<boolean>(false);
export const showCreateExtractModal = makeVar<boolean>(false);
export const showQueryViewState = makeVar<"ASK" | "VIEW" | "DETAILS">("ASK");
export const showSelectCorpusAnalyzerOrFieldsetModal = makeVar<boolean>(false);

export const viewStateVar = makeVar<ViewState>(ViewState.LOADING);
export const editMode = makeVar<"ANNOTATE" | "ANALYZE">("ANNOTATE");
export const allowUserInput = makeVar<boolean>(false);
export const pdfZoomFactor = makeVar<number>(1.5);

/**
 *  Document-related global variables.
 */
export const documentSearchTerm = makeVar<string>("");
export const openedDocument = makeVar<DocumentType | null>(null);
export const selectedDocumentIds = makeVar<string[]>([]);
export const viewingDocument = makeVar<DocumentType | null>(null);
export const editingDocument = makeVar<DocumentType | null>(null);

/**
 * Extract-related global variables
 */
export const selectedExtractIds = makeVar<string[]>([]);
export const selectedExtract = makeVar<ExtractType | null>(null);
export const openedExtract = makeVar<ExtractType | null>(null);
export const extractSearchTerm = makeVar<string>("");

/**
 * Corpus-related global variables
 */
export const corpusSearchTerm = makeVar<string>("");
export const filterToCorpus = makeVar<CorpusType | null>(null);
export const selectedCorpus = makeVar<CorpusType | null>(null);
export const openedCorpus = makeVar<CorpusType | null>(null);
export const viewingCorpus = makeVar<CorpusType | null>(null);
export const deletingCorpus = makeVar<CorpusType | null>(null);
export const editingCorpus = makeVar<CorpusType | null>(null);
export const exportingCorpus = makeVar<CorpusType | null>(null);
export const selectedCorpusIds = makeVar<string[]>([]);
export const showAnalyzerSelectionForCorpus = makeVar<CorpusType | null>(null);
export const showCorpusActionOutputs = makeVar<boolean>(true);

/**
 * LabelSet-related global variables
 */
export const labelsetSearchTerm = makeVar<string>("");
export const filterToLabelsetId = makeVar<string | null>(null);
export const openedLabelset = makeVar<LabelSetType | null>(null);
export const deletingLabelset = makeVar<LabelSetType | null>(null);
export const editingLabelset = makeVar<LabelSetType | null>(null); // Not used elsewhere. Maybe should be?
export const selectedLabelsetIds = makeVar<string[]>([]);

/**
 * Annotation-related global variables
 */
export const filterToLabelId = makeVar<string>("");
export const filterToAnnotationLabelId = makeVar<string>(""); // Not used elsewhere. Maybe should be?
export const selectedAnnotation = makeVar<ServerAnnotationType | null>(null);
export const showStructuralAnnotations = makeVar<boolean>(false);
export const filterToStructuralAnnotations = makeVar<
  "ONLY" | "EXCLUDE" | "INCLUDE"
>("EXCLUDE");
export const displayAnnotationOnAnnotatorLoad = makeVar<
  ServerAnnotationType | undefined
>(undefined);
export const onlyDisplayTheseAnnotations = makeVar<
  ServerAnnotationType[] | undefined
>(undefined);
export const annotationContentSearchTerm = makeVar<string>("");
export const selectedMetaAnnotationId = makeVar<string>("");
export const includeStructuralAnnotations = makeVar<boolean>(false); // These are weird as they don't have a labelset and user probably doesn't want to see them.

/**
 * Analyzer-related global variables
 */
export const analyzerSearchTerm = makeVar<string | null>(null);

/**
 * Analysis-related global variables
 */
export const selectedAnalysis = makeVar<AnalysisType | null>(null);
export const selectedAnalyses = makeVar<AnalysisType[]>([]);
export const selectedAnalysesIds = makeVar<(string | number)[]>([]);
export const analysisSearchTerm = makeVar<string>("");

/**
 * Export-related global variables
 */
export const exportSearchTerm = makeVar<string>("");
export const selectedFieldset = makeVar<FieldsetType | null>(null);
export const editingExtract = makeVar<ExtractType | null>(null);
export const addingColumnToExtract = makeVar<ExtractType | null>(null);
export const editingColumnForExtract = makeVar<ColumnType | null>(null);

/**
 * Query-related global variables
 */
export const selectedQueryIds = makeVar<string[]>([]);
export const openedQueryObj = makeVar<CorpusQueryType | null>(null);

/**
 * Auth-related global variables
 */
export const userObj = makeVar<User | null>(null);
export const authToken = makeVar<string>("");
