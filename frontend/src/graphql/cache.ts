import { InMemoryCache, makeVar } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { User } from "@auth0/auth0-react";
import _ from "lodash";
import {
  ServerAnnotationType,
  CorpusType,
  DocumentType,
  LabelSetType,
  LabelDisplayBehavior,
} from "./types";

// See proper setup here:
// https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/
export const cache = new InMemoryCache({
  typePolicies: {
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
        annotations: relayStylePagination(),
        documents: relayStylePagination(),
        corpuses: relayStylePagination(),
        userexports: relayStylePagination(),
        labelsets: relayStylePagination(),
        annotationLabels: relayStylePagination(),
        relationshipLabels: relayStylePagination(),
      },
    },
  },
});

/**
 * Global GUI State / Variables
 */
export const showAddDocsToCorpusModal = makeVar<boolean>(false);
export const showRemoveDocsFromCorpusModal = makeVar<boolean>(false);
export const showUploadNewDocumentsModal = makeVar<boolean>(false);
export const showDeleteDocumentsModal = makeVar<boolean>(false);
export const showNewLabelsetModal = makeVar<boolean>(false);
export const showExportModal = makeVar<boolean>(false);
// if this is true, only render the currently selected annotation.
export const showSelectedAnnotationOnly = makeVar<boolean>(false);
// if this is false, don't render <SelectionBoundary> elements so you only see tokens. Cleaner for complex annotations.
export const showAnnotationBoundingBoxes = makeVar<boolean>(true);
// Show Labels toggle (if false, don't show labels)
export const showAnnotationLabels = makeVar<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);

/**
 *  Document-related global variables.
 */
export const documentSearchTerm = makeVar<string>("");
export const openedDocument = makeVar<DocumentType | null>(null);
export const selectedDocumentIds = makeVar<string[]>([]);
export const viewingDocument = makeVar<DocumentType | null>(null);
export const editingDocument = makeVar<DocumentType | null>(null);

/**
 * Corpus-related global variables
 */
export const corpusSearchTerm = makeVar<string>("");
export const filterToCorpus = makeVar<CorpusType | null>(null);
export const openedCorpus = makeVar<CorpusType | null>(null);
export const viewingCorpus = makeVar<CorpusType | null>(null);
export const deletingCorpus = makeVar<CorpusType | null>(null);
export const editingCorpus = makeVar<CorpusType | null>(null);
export const selectedCorpusIds = makeVar<string[]>([]);

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
export const annotationContentSearchTerm = makeVar<string>("");

/**
 * Export-related global variables
 */
export const exportSearchTerm = makeVar<string>("");

/**
 * Auth-related global variables
 */
export const userObj = makeVar<User | null>(null);
export const authToken = makeVar<string>("");
