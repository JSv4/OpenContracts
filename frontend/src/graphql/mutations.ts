import { gql } from "@apollo/client";
import { SemanticICONS } from "semantic-ui-react/dist/commonjs/generic";
import { ExportTypes, MultipageAnnotationJson } from "../components/types";
import {
  AnalysisType,
  AnnotationLabelType,
  CorpusType,
  LabelSetType,
  LabelType,
  Maybe,
  UserExportType,
} from "./types";

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///
/// LOGIN-RELATED MUTATIONS
///
/// Only used if USE_AUTH0 is set to false
///
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export interface LoginInputs {
  username: string;
  password: string;
}

export interface LoginOutputs {
  tokenAuth: {
    token: string;
    refreshExpiresIn: number;
    payload: string;
    user: {
      id: string;
      email: string;
      name: string;
    };
  };
}

export const LOGIN_MUTATION = gql`
  mutation ($username: String!, $password: String!) {
    tokenAuth(username: $username, password: $password) {
      token
      refreshExpiresIn
      payload
      user {
        id
        email
        name
        username
      }
    }
  }
`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// CORPUS-RELATED MUTATIONS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface DeleteCorpusInputs {
  id: string;
}

export interface DeleteCorpusOutputs {
  deleteCorpus: {
    ok?: boolean;
    message?: string;
  };
}

export const DELETE_CORPUS = gql`
  mutation ($id: String!) {
    deleteCorpus(id: $id) {
      ok
      message
    }
  }
`;

export interface UpdateCorpusInputs {
  title?: string;
  description?: string;
  icon?: string;
  filename?: string;
}

export interface UpdateCorpusOutputs {
  updateCorpus: {
    ok?: boolean;
    message?: string;
  };
}

export const UPDATE_CORPUS = gql`
  mutation (
    $id: String!
    $icon: String
    $description: String
    $labelSet: String
    $title: String
  ) {
    updateCorpus(
      id: $id
      icon: $icon
      description: $description
      labelSet: $labelSet
      title: $title
    ) {
      ok
      message
    }
  }
`;

export interface CreateCorpusInputs {
  title?: string;
  description?: string;
  icon?: string;
  filename?: string;
  labelSet?: string;
}

export interface CreateCorpusOutputs {
  createCorpus: {
    ok?: boolean;
    message?: string;
  };
}

export const CREATE_CORPUS = gql`
  mutation (
    $description: String
    $icon: String
    $labelSet: String
    $title: String
  ) {
    createCorpus(
      description: $description
      icon: $icon
      labelSet: $labelSet
      title: $title
    ) {
      ok
      message
    }
  }
`;

export interface StartExportCorpusInputs {
  corpusId: string;
  exportFormat: ExportTypes;
}

export interface StartExportCorpusOutputs {
  exportCorpus: {
    ok?: boolean;
    message?: string;
    export?: Maybe<UserExportType>;
  };
}

export const START_EXPORT_CORPUS = gql`
  mutation ($corpusId: String!, $exportFormat:ExportType!) {
    exportCorpus(corpusId: $corpusId, exportFormat: $exportFormat) {
      ok
      message
      export {
        id
      }
    }
  }
`;

export interface StartImportCorpusInputs {
  base64FileString: string;
}

export interface StartImportCorpusExport {
  ok: boolean;
  message: string;
  corpus: CorpusType;
}

export const START_IMPORT_CORPUS = gql`
  mutation ($base64FileString: String!) {
    importOpenContractsZip(base64FileString: $base64FileString) {
      ok
      message
      corpus {
        id
        icon
        description
        title
        backendLock
      }
    }
  }
`;

export interface StartForkCorpusInput {
  corpusId: string;
}

export interface StartForkCorpusOutput {
  ok: boolean;
  message: string;
  newCorpus: CorpusType;
}

export const START_FORK_CORPUS = gql`
  mutation ($corpusId: String!) {
    forkCorpus(corpusId: $corpusId) {
      ok
      message
      newCorpus {
        id
        icon
        title
        description
        backendLock
        labelSet {
          id
        }
      }
    }
  }
`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// LABELSET-RELATED MUTATIONS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface DeleteLabelsetInputs {
  id: string;
}

export interface DeleteLabelsetOutputs {
  ok?: boolean;
  message?: string;
}

export const DELETE_LABELSET = gql`
  mutation ($id: String!) {
    deleteLabelset(id: $id) {
      ok
      message
    }
  }
`;

export interface CreateLabelsetInputs {
  title?: string;
  description?: string;
  base64IconString?: string;
  filename?: string;
}

export interface CreateLabelsetOutputs {
  ok?: boolean;
  message?: string;
  obj?: LabelSetType;
}

export const CREATE_LABELSET = gql`
  mutation (
    $title: String!
    $description: String
    $icon: String
    $filename: String!
  ) {
    createLabelset(
      title: $title
      description: $description
      base64IconString: $icon
      filename: $filename
    ) {
      ok
      message
      obj {
        id
        title
        description
        icon
      }
    }
  }
`;

export interface UpdateLabelsetInputs {
  id: string;
  title?: string;
  description?: string;
  icon?: string;
}

export interface UpdateLabelsetOutputs {
  ok?: boolean;
  message?: string;
}

export const UPDATE_LABELSET = gql`
  mutation ($id: String!, $title: String, $description: String, $icon: String) {
    updateLabelset(
      id: $id
      title: $title
      description: $description
      icon: $icon
    ) {
      ok
      message
    }
  }
`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// ANNOTATION LABEL-RELATED MUTATIONS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface UpdateAnnotationLabelInputs {
  id: string;
  color?: string;
  description?: string;
  icon?: SemanticICONS;
  text?: string;
  labelType?: LabelType;
}

export interface UpdateAnnotationLabelOutputs {
  ok?: boolean;
  message?: string;
}

export const UPDATE_ANNOTATION_LABEL = gql`
  mutation (
    $id: String!
    $color: String
    $description: String
    $icon: String
    $text: String
    $labelType: String
  ) {
    updateAnnotationLabel(
      color: $color
      description: $description
      icon: $icon
      id: $id
      text: $text
      labelType: $labelType
    ) {
      ok
      message
    }
  }
`;

export interface CreateAnnotationLabelInputs {
  color?: string;
  description?: string;
  icon?: SemanticICONS;
  title?: string;
  type?: LabelType;
}

export interface CreateAnnotationLabelOutputs {
  ok?: boolean;
  message?: string;
}

export const CREATE_ANNOTATION_LABEL = gql`
  mutation (
    $color: String
    $description: String
    $icon: String
    $title: String
    $type: String
  ) {
    createLabel(
      color: $color
      description: $description
      icon: $icon
      title: $title
      type: $type
    ) {
      ok
      message
    }
  }
`;

export interface CreateAnnotationLabelForLabelsetInputs {
  color?: string;
  description?: string;
  icon?: SemanticICONS;
  text?: string;
  labelType?: LabelType;
  labelsetId: string;
}

export interface CreateAnnotationLabelForLabelsetOutputs {
  ok?: boolean;
  message?: string;
}

export const CREATE_ANNOTATION_LABEL_FOR_LABELSET = gql`
  mutation (
    $color: String
    $description: String
    $icon: String
    $text: String
    $labelType: String
    $labelsetId: String!
  ) {
    createAnnotationLabelForLabelset(
      color: $color
      description: $description
      icon: $icon
      text: $text
      labelType: $labelType
      labelsetId: $labelsetId
    ) {
      ok
      message
    }
  }
`;

export interface RemoveAnnotationLabelsFromLabelsetInputs {
  label_ids: string[];
  labelset_id: string;
}

export interface RemoveAnnotationLabelsFromLabelsetOutputs {
  ok?: boolean;
  message?: string;
}

export const REMOVE_ANNOTATION_LABELS_FROM_LABELSET = gql`
  mutation ($labelIds: [String]!, $labelsetId: String!) {
    removeAnnotationLabelsFromLabelset(
      labelIds: $labelIds
      labelsetId: $labelsetId
    ) {
      ok
      message
    }
  }
`;

export interface DeleteAnnotationLabelInputs {
  id: string;
}

export interface DeleteAnnotationLabelOutputs {
  ok?: boolean;
  message?: string;
}

export const DELETE_ANNOTATION_LABEL = gql`
  mutation ($id: String!) {
    deleteLabel(id: $id) {
      ok
      message
    }
  }
`;

export interface DeleteMultipleAnnotationLabelInputs {
  labelIdsToDelete: string[];
}

export interface DeleteMultipleAnnotationLabelOutputs {
  ok?: boolean;
  message?: string;
}

export const DELETE_MULTIPLE_ANNOTATION_LABELS = gql`
  mutation ($labelIdsToDelete: [String]!) {
    deleteMultipleLabels(labelIdsToDelete: $labelIdsToDelete) {
      ok
      message
    }
  }
`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// DOCUMENT-RELATED MUTATIONS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export interface LinkDocumentsToCorpusInputs {
  corpusId: string;
  documentIds: string[];
}

export interface LinkDocumentsToCorpusOutputs {
  ok?: boolean;
  message?: string;
}

export const LINK_DOCUMENTS_TO_CORPUS = gql`
  mutation ($corpusId: String!, $documentIds: [String]!) {
    linkDocumentsToCorpus(corpusId: $corpusId, documentIds: $documentIds) {
      ok
      message
    }
  }
`;

export interface RemoveDocumentsFromCorpusInputs {
  corpusId: string;
  documentIdsToRemove: string[];
}

export interface RemoveDocumentsFromCorpusOutputs {
  ok?: boolean;
  message?: string;
}

export const REMOVE_DOCUMENTS_FROM_CORPUS = gql`
  mutation ($corpusId: String!, $documentIdsToRemove: [String]!) {
    removeDocumentsFromCorpus(
      corpusId: $corpusId
      documentIdsToRemove: $documentIdsToRemove
    ) {
      ok
      message
    }
  }
`;

export interface UploadDocumentInputProps {
  base64FileString: string;
  filename: string;
  customMeta: Record<string, any>;
  description?: string;
  title?: string;
}

export interface UploadDocumentOutputProps {
  data: {
    document: {
      id: string;
      icon: string;
      pdfFile: string;
      title: string;
      description: string;
      backendLock: boolean;
      docAnnotations: {
        edges: {
          node: {
            id: string;
          };
        };
      }[];
    };
  };
}

export const UPLOAD_DOCUMENT = gql`
  mutation (
    $base64FileString: String!
    $filename: String!
    $customMeta: GenericScalar!
    $description: String!
    $title: String!
  ) {
    uploadDocument(
      base64FileString: $base64FileString
      filename: $filename
      customMeta: $customMeta
      description: $description
      title: $title
    ) {
      document {
        id
        icon
        pdfFile
        title
        description
        backendLock
        docAnnotations {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  }
`;

export interface UpdateDocumentInputs {
  id: string;
  title?: string;
  description?: string;
  pdfFile?: string;
  customMeta?: Record<string, any>;
}

export interface UpdateDocumentOutputs {
  ok?: boolean;
  message?: string;
}

export const UPDATE_DOCUMENT = gql`
  mutation (
    $id: String!
    $pdfFile: String
    $customMeta: GenericScalar
    $description: String
    $title: String
  ) {
    updateDocument(
      id: $id
      pdfFile: $pdfFile
      customMeta: $customMeta
      description: $description
      title: $title
    ) {
      ok
      message
    }
  }
`;

export interface DeleteDocumenInputs {
  id: string;
}

export interface DeleteDocumentOutputs {
  ok?: boolean;
  message?: string;
}

export const DELETE_DOCUMENT = gql`
  mutation ($id: String!) {
    deleteDocument(id: $id) {
      ok
      message
    }
  }
`;

export interface DeleteMultipleDocumentsInputs {
  documentIdsToDelete: string[];
}

export interface DeleteMultipleDocumentsOutputs {
  ok?: boolean;
  message?: string;
}

export const DELETE_MULTIPLE_DOCUMENTS = gql`
  mutation ($documentIdsToDelete: [String]!) {
    deleteMultipleDocuments(documentIdsToDelete: $documentIdsToDelete) {
      ok
      message
    }
  }
`;

export interface NewAnnotationOutputType {
  addAnnotation: {
    ok: boolean;
    annotation: {
      id: string;
      page: number;
      rawText: string;
      json: MultipageAnnotationJson;
      annotationLabel: AnnotationLabelType;
      myPermissions: string[];
      isPublic: boolean;
      sourceNodeInRelationships: {
        edges: [
          {
            node: {
              id: string;
            };
          }
        ];
      };
    };
  };
}

export interface NewAnnotationInputType {
  page: number;
  json: MultipageAnnotationJson;
  rawText: string;
  corpusId: string;
  documentId: string;
  annotationLabelId: string;
}

export const REQUEST_ADD_ANNOTATION = gql`
  mutation (
    $json: GenericScalar!
    $page: Int!
    $rawText: String!
    $corpusId: String!
    $documentId: String!
    $annotationLabelId: String!
  ) {
    addAnnotation(
      json: $json
      page: $page
      rawText: $rawText
      corpusId: $corpusId
      documentId: $documentId
      annotationLabelId: $annotationLabelId
    ) {
      ok
      annotation {
        id
        page
        bounds: boundingBox
        rawText
        json
        isPublic
        myPermissions
        annotationLabel {
          id
          icon
          description
          color
          text
          labelType
        }
        sourceNodeInRelationships {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  }
`;

export interface NewDocTypeAnnotationOutputType {
  addDocTypeAnnotation: {
    ok: boolean;
    annotation: {
      id: string;
      myPermissions?: string[];
      isPublic?: boolean;
      annotationLabel: AnnotationLabelType;
    };
  };
}

export interface NewDocTypeAnnotationInputType {
  corpusId: string;
  documentId: string;
  annotationLabelId: string;
}

export const REQUEST_ADD_DOC_TYPE_ANNOTATION = gql`
  mutation (
    $corpusId: String!
    $documentId: String!
    $annotationLabelId: String!
  ) {
    addDocTypeAnnotation(
      corpusId: $corpusId
      documentId: $documentId
      annotationLabelId: $annotationLabelId
    ) {
      ok
      annotation {
        id
        isPublic
        myPermissions
        annotationLabel {
          id
          icon
          description
          color
          text
          labelType
        }
      }
    }
  }
`;

export interface RemoveDocTypeAnnotationOutputType {
  removeDocTypeAnnotation: {
    ok: boolean;
  };
}

export interface RemoveDocTypeAnnotationInputType {
  annotationId: string;
}

export const REQUEST_DELETE_DOC_TYPE_ANNOTATION = gql`
  mutation ($annotationId: String!) {
    removeDocTypeAnnotation(annotationId: $annotationId) {
      ok
    }
  }
`;

export interface RemoveAnnotationOutputType {
  removeAnnotation: {
    ok: boolean;
  };
}

export interface RemoveAnnotationInputType {
  annotationId: string;
}

export const REQUEST_DELETE_ANNOTATION = gql`
  mutation ($annotationId: String!) {
    removeAnnotation(annotationId: $annotationId) {
      ok
    }
  }
`;

export interface NewRelationshipInputType {
  relationshipLabelId: string;
  documentId: string;
  corpusId: string;
  sourceIds: string[];
  targetIds: string[];
}

export interface NewRelationshipOutputType {
  addRelationship: {
    ok: boolean;
    relationship: {
      id: string;
      relationshipLabel: AnnotationLabelType;
      sourceAnnotations: {
        edges: [
          {
            node: {
              id: string;
            };
          }
        ];
      };
      targetAnnotations: {
        edges: [
          {
            node: {
              id: string;
            };
          }
        ];
      };
    };
  };
}

export const REQUEST_CREATE_RELATIONSHIP = gql`
  mutation (
    $sourceIds: [String]!
    $targetIds: [String]!
    $relationshipLabelId: String!
    $corpusId: String!
    $documentId: String!
  ) {
    addRelationship(
      sourceIds: $sourceIds
      targetIds: $targetIds
      relationshipLabelId: $relationshipLabelId
      corpusId: $corpusId
      documentId: $documentId
    ) {
      ok
      relationship {
        id
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
          icon
          description
          color
          text
          labelType
        }
      }
    }
  }
`;

export interface RemoveRelationshipOutputType {
  removeRelationship: {
    ok: boolean;
  };
}

export interface RemoveRelationshipInputType {
  relationshipId: string;
}

export const REQUEST_REMOVE_RELATIONSHIP = gql`
  mutation ($relationshipId: String!) {
    removeRelationship(relationshipId: $relationshipId) {
      ok
    }
  }
`;

export interface UpdateRelationOutputType {
  updateRelationships: {
    ok: boolean;
  };
}

export interface UpdateRelationInputType {
  relationships: {
    id: string;
    sourceIds: string[];
    targetIds: string[];
    relationshipLabelId: string;
    corpusId: string;
    documentId: string;
  }[];
}

export const REQUEST_UPDATE_RELATIONS = gql`
  mutation ($relationships: [RelationInputType]) {
    updateRelationships(relationships: $relationships) {
      ok
    }
  }
`;

export interface UpdateAnnotationOutputType {
  updateAnnotation: {
    ok?: boolean;
    message?: string;
  };
}

export interface UpdateAnnotationInputType {
  id: string;
  annotationLabel?: string;
  json?: Record<string, any>;
  page?: number;
  rawText?: string;
}

export const REQUEST_UPDATE_ANNOTATION = gql`
  mutation (
    $id: String!
    $annotationLabel: String
    $json: GenericScalar
    $page: Int
    $rawText: String
  ) {
    updateAnnotation(
      id: $id
      annotationLabel: $annotationLabel
      json: $json
      page: $page
      rawText: $rawText
    ) {
      ok
      message
    }
  }
`;

export interface RemoveRelationshipsOutputType {
  removeRelationships: {
    ok: boolean;
  };
}

export interface RemoveRelationshipsInputType {
  relationshipIds: string[];
}

export const REQUEST_REMOVE_RELATIONSHIPS = gql`
  mutation ($relationshipIds: [String]) {
    removeRelationships(relationshipIds: $relationshipIds) {
      ok
    }
  }
`;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// ANALYZER-RELATED MUTATIONS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export interface StartAnalysisInputType {
  analyzerId: string;
  corpusId: string;
}

export interface StartAnalysisOutputType {
  startAnalysisOnCorpus: {
    ok: boolean;
    message: string;
    obj: AnalysisType;
  };
}

export const START_ANALYSIS_FOR_CORPUS = gql`
  mutation ($analyzerId: ID!, $corpusId: ID!) {
    startAnalysisOnCorpus(corpusId: $corpusId, analyzerId: $analyzerId) {
      ok
      message
      obj {
        id
        analysisStarted
        analysisCompleted
        analyzedDocuments {
          edges {
            node {
              id
            }
          }
        }
        receivedCallbackFile
        annotations {
          totalCount
        }
        analyzer {
          id
          analyzerId
          description
          manifest
          annotationlabelSet {
            totalCount
          }
          hostGremlin {
            id
          }
        }
      }
    }
  }
`;

export interface RequestDeleteAnalysisOutputType {
  deleteAnalysis: {
    ok: boolean;
    message: string;
  };
}

export interface RequestDeleteAnalysisInputType {
  id: string;
}

export const REQUEST_DELETE_ANALYSIS = gql`
  mutation ($id: String!) {
    deleteAnalysis(id: $id) {
      ok
      message
    }
  }
`;
