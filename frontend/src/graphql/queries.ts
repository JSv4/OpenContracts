import { gql } from "@apollo/client";
import { LabelSet } from "../components/types";
import {
  AnnotationLabelTypeEdge,
  ServerAnnotationType,
  CorpusType,
  CorpusTypeEdge,
  DocumentTypeEdge,
  LabelSetType,
  PageInfo,
  RelationshipType,
  Scalars,
} from "./types";

export interface RequestDocumentsInputs {
  textSearch?: string;
  corpusId?: string;
  annotateDocLabels?: boolean;
  hasLabelWithId?: string;
}

export interface RequestDocumentsOutputs {
  documents: {
    edges: DocumentTypeEdge[];
    pageInfo: PageInfo;
  };
}

export const REQUEST_DOCUMENTS = gql`
  query (
    $inCorpusWithId: String
    $cursor: String
    $limit: Int
    $textSearch: String
    $hasLabelWithId: String
    $annotateDocLabels: Boolean!
  ) {
    documents(
      inCorpusWithId: $inCorpusWithId
      textSearch: $textSearch
      hasLabelWithId: $hasLabelWithId
      first: $limit
      after: $cursor
    ) {
      edges {
        node {
          id
          title
          description
          backendLock
          pdfFile
          pawlsParseFile
          icon
          isPublic
          myPermissions
          is_selected @client
          is_open @client
          doc_label_annotations: docAnnotations(
            annotationLabel_LabelType: "DOC_TYPE_LABEL"
          ) @include(if: $annotateDocLabels) {
            edges {
              node {
                id
                annotationLabel {
                  labelType
                  text
                }
                corpus {
                  title
                  icon
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export interface GetCorpusLabelsetAndLabelsInputs {
  labelId?: string;
  corpusId?: string;
  text_Contains?: string;
  label_description_search_string?: string;
  label_title_search_string?: string;
  label_Type?: string;
}

export interface GetCorpusLabelsetAndLabelsOutputs {
  corpus: CorpusType;
}

// TODO - revise this query to permit filtering described above in its inputs.
export const GET_CORPUS_LABELSET_AND_LABELS = gql`
  query ($corpusId: ID!) {
    corpus(id: $corpusId) {
      id
      icon
      title
      description
      backendLock
      isPublic
      myPermissions
      labelSet {
        id
        icon
        title
        description
        isPublic
        myPermissions
        annotationLabels {
          edges {
            node {
              id
              icon
              labelType
              text
              description
              color
              isPublic
              myPermissions
            }
          }
        }
      }
    }
  }
`;

export interface GetCorpusesInputs {
  textSearch?: string;
}

export interface GetCorpusesOutputs {
  corpuses: {
    edges: CorpusTypeEdge[];
    pageInfo: PageInfo;
  };
}

export const GET_CORPUSES = gql`
  query (
    $textSearch: String
    $usesLabelsetId: String
    $cursor: String
    $limit: Int
  ) {
    corpuses(
      textSearch: $textSearch
      usesLabelsetId: $usesLabelsetId
      first: $limit
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          icon
          title
          description
          isPublic
          is_selected @client
          is_open @client
          myPermissions
          parent {
            id
            icon
            title
            description
          }
          documents {
            edges {
              node {
                id
                backendLock
                description
              }
            }
          }
          labelSet {
            id
            title
            description
          }
        }
      }
    }
  }
`;

export interface GetLabelsetInputs {
  description?: string;
  title?: string;
}

export interface GetLabelsetOutputs {
  labelsets: {
    pageInfo: PageInfo;
    edges: {
      node: LabelSetType;
    }[];
  };
}

export const GET_LABELSETS = gql`
  query (
    $description: String
    $title: String
    $labelsetId: String
    $cursor: String
    $limit: Int
  ) {
    labelsets(
      description_Contains: $description
      title_Contains: $title
      labelsetId: $labelsetId
      first: $limit
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          icon
          title
          description
          created
          is_selected @client
          is_open @client
          isPublic
          myPermissions
        }
      }
    }
  }
`;

export interface GetLabelsetsWithLabelsInputs {
  textSearch?: string;
  title?: string;
}

export interface GetLabelsetsWithLabelsOutputs {
  labelsets: {
    pageInfo: PageInfo;
    edges: {
      node: LabelSetType;
    }[];
  };
}

export const REQUEST_LABELSETS_WITH_LABELS = gql`
  query ($textSearch: String, $title: String, $cursor: String, $limit: Int) {
    labelsets(
      textSearch: $textSearch
      title_Contains: $title
      first: $limit
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          icon
          title
          description
          created
          isPublic
          myPermissions
          annotationLabels {
            edges {
              node {
                id
                icon
                labelType
                text
                description
                color
              }
            }
          }
        }
      }
    }
  }
`;

export interface GetAnnotationsInputs {
  annotationLabelId?: string;
  corpusId?: string;
  rawText_Contains?: string;
  annotationLabel_description_search_string?: string;
  annotationLabel_title_search_string?: string;
  annotationLabel_Type?: string;
}

export interface GetAnnotationsOutputs {
  annotations: {
    pageInfo: PageInfo;
    edges: {
      node: ServerAnnotationType;
    }[];
  };
}

export const GET_ANNOTATIONS = gql`
  query (
    $annotationLabelId: ID
    $corpusId: ID
    $usesLabelFromLabelsetId: String
    $rawText_Contains: String
    $annotationLabel_description_search_string: String
    $annotationLabel_title_search_string: String
    $annotationLabel_Type: String
    $cursor: String
    $limit: Int
  ) {
    annotations(
      corpusId: $corpusId
      annotationLabelId: $annotationLabelId
      usesLabelFromLabelsetId: $usesLabelFromLabelsetId
      rawText_Contains: $rawText_Contains
      annotationLabel_Text_Contains: $annotationLabel_title_search_string
      annotationLabel_Description_Contains: $annotationLabel_description_search_string
      annotationLabel_LabelType: $annotationLabel_Type
      first: $limit
      after: $cursor
    ) {
      edges {
        node {
          id
          tokensJsons
          json
          page
          corpus {
            id
            icon
            title
            description
          }
          document {
            id
            title
            is_selected @client
            is_open @client
            description
            backendLock
            pdfFile
            pawlsParseFile
            icon
          }
          annotationLabel {
            id
            text
            color
            icon
            description
          }
          rawText
          isPublic
          myPermissions
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export interface GetAnnotationLabelsInput {
  corpusId?: string;
  labelsetId?: string;
  labelType?: string;
}

export interface GetAnnotationLabelsOutput {
  annotationLabels: {
    pageInfo: PageInfo;
    edges: AnnotationLabelTypeEdge[];
  };
}

export const GET_ANNOTATION_LABELS = gql`
  query getAnnotationLabels(
    $corpusId: String
    $labelsetId: String
    $labelType: String
    $cursor: String
    $limit: Int
  ) {
    annotationLabels(
      usedInLabelsetForCorpusId: $corpusId
      usedInLabelsetId: $labelsetId
      labelType: $labelType
      first: $limit
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      edges {
        node {
          id
          icon
          text
          description
          labelType
          isPublic
          myPermissions
        }
      }
    }
  }
`;

export interface GetLabelsetWithLabelsInputs {
  id: string;
}

export interface GetLabelsetWithLabelsOutputs {
  labelset: LabelSetType;
}

export const GET_LABELSET_WITH_LABELS = gql`
  query ($id: ID!) {
    labelset(id: $id) {
      id
      icon
      title
      description
      created
      isPublic
      myPermissions
      annotationLabels {
        edges {
          node {
            id
            icon
            labelType
            text
            description
            color
            myPermissions
            isPublic
          }
        }
      }
    }
  }
`;

export interface RequestAnnotatorDataForDocumentInputs {
  selectedDocumentId: string;
  selectedCorpusId: string;
}

export interface RequestAnnotatorDataForDocumentOutputs {
  existingSpanAnnotations: {
    edges: {
      node: ServerAnnotationType;
    }[];
  };
  existingDocLabelAnnotations: {
    edges: {
      node: ServerAnnotationType;
    }[];
  };
  existingRelationships: {
    edges: {
      node: RelationshipType;
    }[];
  };
  corpus: {
    id: string;
    labelSet: LabelSet;
  };
}

export const REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT = gql`
  query ($selectedDocumentId: ID!, $selectedCorpusId: ID!) {
    existingSpanAnnotations: annotations(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
      annotationLabel_LabelType: "TOKEN_LABEL"
    ) {
      edges {
        node {
          id
          isPublic
          myPermissions
          annotationLabel {
            id
            text
            color
            icon
            description
          }
          boundingBox
          page
          rawText
          tokensJsons
          json
          sourceNodeInRelationships {
            edges {
              node {
                id
              }
            }
          }
          creator {
            id
            email
          }
          isPublic
          myPermissions
        }
      }
    }
    existingDocLabelAnnotations: annotations(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
      annotationLabel_LabelType: "DOC_TYPE_LABEL"
    ) {
      edges {
        node {
          id
          isPublic
          myPermissions
          annotationLabel {
            id
          }
          boundingBox
          page
          rawText
          tokensJsons
          json
          sourceNodeInRelationships {
            edges {
              node {
                id
              }
            }
          }
          creator {
            id
            email
          }
          isPublic
          myPermissions
        }
      }
    }
    existingRelationships: relationships(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
    ) {
      edges {
        node {
          id
          modified
          sourceAnnotations {
            edges {
              node {
                id
              }
            }
          }
          targetAnnotations {
            edges {
              node {
                id
              }
            }
          }
          relationshipLabel {
            id
          }
          creator {
            id
            email
          }
          isPublic
          myPermissions
        }
      }
    }
    corpus(id: $selectedCorpusId) {
      id
      labelSet {
        id
        title
        description
        icon
        isPublic
        myPermissions
        spanLabels: annotationLabels(labelType: "TOKEN_LABEL") {
          totalCount
          edges {
            node {
              id
              icon
              color
              description
              text
              labelType
            }
          }
        }
        relationshipLabels: annotationLabels(labelType: "RELATIONSHIP_LABEL") {
          totalCount
          edges {
            node {
              id
              icon
              color
              description
              text
              labelType
            }
          }
        }
        docTypeLabels: annotationLabels(labelType: "DOC_TYPE_LABEL") {
          totalCount
          edges {
            node {
              id
              icon
              color
              description
              text
              labelType
            }
          }
        }
        isPublic
        myPermissions
      }
    }
  }
`;

export interface GetExportsInputs {
  name_Contains?: string;
  orderByCreated?: string;
  orderByStarted?: string;
  orderByFinished?: string;
}

export interface ExportObect {
  id: string;
  name: string;
  finished: Scalars["DateTime"];
  started: Scalars["DateTime"];
  created: Scalars["DateTime"];
  errors: string;
  backendLock: boolean;
  zip: string;
}

export interface GetExportsOutputs {
  userexports: {
    pageInfo: PageInfo;
    edges: {
      node: ExportObect;
    }[];
  };
}

export const GET_EXPORTS = gql`
  query (
    $name_Contains: String
    $orderByCreated: String
    $orderByStarted: String
    $orderByFinished: String
    $cursor: String
    $limit: Int
  ) {
    userexports(
      first: $limit
      after: $cursor
      name_Contains: $name_Contains
      orderByCreated: $orderByCreated
      orderByStarted: $orderByStarted
      orderByFinished: $orderByFinished
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      edges {
        node {
          id
          name
          finished
          started
          created
          errors
          backendLock
          zip
        }
      }
    }
  }
`;
