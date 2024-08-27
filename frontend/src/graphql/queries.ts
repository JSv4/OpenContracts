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
  AnalyzerType,
  AnalysisType,
  AnnotationLabelType,
  FieldsetType,
  ExtractType,
  CorpusQueryType,
  CorpusQueryTypeConnection,
  CorpusActionType,
} from "./types";
import { ExportObject } from "./types";

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

export const GET_DOCUMENTS = gql`
  query (
    $inCorpusWithId: String
    $cursor: String
    $limit: Int
    $textSearch: String
    $hasLabelWithId: String
    $annotateDocLabels: Boolean!
    $hasAnnotationsWithIds: String
    $includeMetadata: Boolean!
  ) {
    documents(
      inCorpusWithId: $inCorpusWithId
      textSearch: $textSearch
      hasLabelWithId: $hasLabelWithId
      hasAnnotationsWithIds: $hasAnnotationsWithIds
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
            annotationLabel_LabelType: DOC_TYPE_LABEL
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
          metadata_annotations: docAnnotations(
            annotationLabel_LabelType: METADATA_LABEL
          ) @include(if: $includeMetadata) {
            edges {
              node {
                id
                annotationLabel {
                  labelType
                  text
                }
                rawText
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

export const SEARCH_DOCUMENTS = gql`
  query (
    $inCorpusWithId: String
    $cursor: String
    $limit: Int
    $textSearch: String
    $hasLabelWithId: String
    $hasAnnotationsWithIds: String
  ) {
    documents(
      inCorpusWithId: $inCorpusWithId
      textSearch: $textSearch
      hasLabelWithId: $hasLabelWithId
      hasAnnotationsWithIds: $hasAnnotationsWithIds
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

export interface GetCorpusMetadataInputs {
  metadataForCorpusId: string;
}

export interface GetCorpusMetadataOutputs {
  corpus: CorpusType;
}

export const GET_CORPUS_METADATA = gql`
  query ($metadataForCorpusId: ID!) {
    corpus(id: $metadataForCorpusId) {
      id
      allAnnotationSummaries(labelTypes: [METADATA_LABEL]) {
        id
        rawText
        json
        annotationLabel {
          id
          text
        }
      }
    }
  }
`;

export interface GetCorpusQueryDetailsInputType {
  corpusId: string;
}

export interface GetCorpusQueryDetailsOutputType {
  corpusQuery: CorpusQueryType;
}

export const GET_CORPUS_QUERY_DETAILS = gql`
  query CorpusQuery($corpusId: ID!) {
    corpusQuery(id: $corpusId) {
      id
      response
      query
      started
      failed
      completed
      stacktrace
      fullSourceList {
        id
        annotationLabel {
          id
          icon
          color
          description
          text
          labelType
          readOnly
        }
        rawText
        json
        sourceNodeInRelationships {
          edges {
            node {
              id
            }
          }
        }
        targetNodeInRelationships {
          edges {
            node {
              id
            }
          }
        }
        tokensJsons
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
      }
    }
  }
`;

export interface GetCorpusQueriesInput {
  corpusId: string;
}

export interface GetCorpusQueriesOutput {
  corpusQueries: CorpusQueryTypeConnection;
}

export const GET_CORPUS_QUERIES = gql`
  query CorpusQueries($corpusId: ID!) {
    corpusQueries(corpusId: $corpusId) {
      edges {
        node {
          id
          query
          response
          started
          completed
          failed
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
    }
  }
`;

export interface GetCorpusQueryInputType {
  corpusId: string;
}

export interface GetCorpusQueryOutputType {
  corpusQuery: CorpusQueryType;
}

export const GET_CORPUS_QUERY = gql`
  query FullCorpusQuery($corpusId: ID!) {
    corpusQuery(id: $corpusId) {
      id
      query
      response
      fullSourceList {
        id
        isPublic
        myPermissions
        annotationLabel {
          id
          icon
          color
          description
          text
          labelType
          readOnly
        }
        boundingBox
        page
        rawText
        tokensJsons
        json
        creator {
          id
          email
        }
        isPublic
        myPermissions
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
        allAnnotationLabels {
          id
          icon
          labelType
          text
          description
          color
          isPublic
          myPermissions
          analyzer {
            id
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
          appliedAnalyzerIds
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

export const REQUEST_LABELSETS_WITH_ALL_LABELS = gql`
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
          allAnnotationLabels {
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
`;

export interface GetAnnotationsInputs {
  annotationLabelId?: string;
  corpusId?: string;
  rawText_Contains?: string;
  annotationLabel_description_search_string?: string;
  annotationLabel_title_search_string?: string;
  annotationLabel_Type?: string;
  createdWithAnalyzerId?: string;
  createdByAnalysisIds?: string;
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
    $annotationLabel_Type: AnnotationsAnnotationLabelLabelTypeChoices
    $createdWithAnalyzerId: String
    $createdByAnalysisIds: String
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
      createdWithAnalyzerId: $createdWithAnalyzerId
      createdByAnalysisIds: $createdByAnalysisIds
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
          analysis {
            id
            analyzer {
              analyzerId
            }
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
    $labelType: AnnotationsAnnotationLabelLabelTypeChoices
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
          readOnly
          isPublic
          myPermissions
          analyzer {
            id
          }
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

export const GET_LABELSET_WITH_ALL_LABELS = gql`
  query ($id: ID!) {
    labelset(id: $id) {
      id
      icon
      title
      description
      created
      isPublic
      myPermissions
      allAnnotationLabels {
        id
        icon
        labelType
        readOnly
        text
        description
        color
        myPermissions
        isPublic
        analyzer {
          id
        }
      }
    }
  }
`;

export interface GetAnalyzersInputs {
  description_contains?: string;
  analyzer_id_contains?: string;
  usedInAnalysisIds?: string; // should be comma separated list of graphql id values
}

export interface GetAnalyzersOutputs {
  analyzers: {
    pageInfo: PageInfo;
    edges: {
      node: AnalyzerType;
    }[];
  };
}

export const GET_ANALYZERS = gql`
  query ($description_contains: String, $analyzer_id_contains: ID) {
    analyzers(
      description_Contains: $description_contains
      id_Contains: $analyzer_id_contains
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
          analyzerId
          description
          hostGremlin {
            id
          }
          disabled
          isPublic
          manifest
        }
      }
    }
  }
`;

export interface GetAnalysesInputs {
  corpusId?: string;
  docId?: string;
  searchText?: string;
}

export interface GetAnalysesOutputs {
  analyses: {
    pageInfo: PageInfo;
    edges: {
      node: AnalysisType;
    }[];
  };
}

export const GET_ANALYSES = gql`
  query ($corpusId: String, $docId: String, $searchText: String) {
    analyses(
      analyzedCorpusId: $corpusId
      analyzedDocumentId: $docId
      searchText: $searchText
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
          creator {
            id
            email
          }
          isPublic
          myPermissions
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
  }
`;

// Possibly will deprecate these...
export interface RequestAnnotatorDataForDocumentInCorpusInputs {
  selectedDocumentId: string;
  selectedCorpusId: string;
  preloadAnnotations: boolean;
  forAnalysisIds?: string; // value should be comma separated ID strings
}

export interface RequestAnnotatorDataForDocumentInCorpusOutputs {
  existingTextAnnotations: ServerAnnotationType[];
  existingDocLabelAnnotations: ServerAnnotationType[];
  existingRelationships: RelationshipType[];
  selectedAnalyzersWithLabels: {
    edges: {
      node: AnalyzerType;
    }[];
  };
  corpus: {
    id: string;
    labelSet: LabelSet;
  };
}

export const REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT_IN_CORPUS = gql`
  query (
    $selectedDocumentId: ID!
    $selectedCorpusId: ID!
    $forAnalysisIds: String
    $preloadAnnotations: Boolean!
  ) {
    selectedAnalyzersSpanAnnotations: pageAnnotations(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
      forAnalysisIds: $forAnalysisIds
      labelType: TOKEN_LABEL
    ) {
      pdfPageInfo {
        pageCount
        currentPage
        hasNextPage
        corpusId
        documentId
        labelType
        forAnalysisIds
      }
      pageAnnotations {
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
        targetNodeInRelationships {
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
    selectedAnalyzersWithLabels: analyzers(usedInAnalysisIds: $forAnalysisIds) {
      edges {
        node {
          id
          fullLabelList {
            id
            icon
            color
            description
            text
            labelType
            analyzer {
              id
            }
          }
        }
      }
    }
    annotationLabels(
      usedInAnalysisIds: $forAnalysisIds
      labelType: TOKEN_LABEL
    ) @skip(if: $preloadAnnotations) {
      totalCount
      edges {
        node {
          id
          icon
          color
          description
          text
          readOnly
          labelType
          analyzer {
            id
          }
        }
      }
    }
    existingTextAnnotations: bulkDocAnnotationsInCorpus(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
      forAnalysisIds: $forAnalysisIds
      labelType: TOKEN_LABEL
    ) @skip(if: $preloadAnnotations) {
      id
      isPublic
      myPermissions
      annotationLabel {
        id
        icon
        color
        description
        text
        labelType
        readOnly
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
    existingDocLabelAnnotations: bulkDocAnnotationsInCorpus(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
      labelType: DOC_TYPE_LABEL
    ) @skip(if: $preloadAnnotations) {
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
    existingRelationships: bulkDocRelationshipsInCorpus(
      documentId: $selectedDocumentId
      corpusId: $selectedCorpusId
    ) @skip(if: $preloadAnnotations) {
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
    corpus(id: $selectedCorpusId) {
      id
      labelSet {
        id
        title
        description
        icon
        isPublic
        myPermissions
        allAnnotationLabels {
          id
          icon
          color
          description
          text
          labelType
          readOnly
          analyzer {
            id
          }
        }
        isPublic
        myPermissions
      }
    }
  }
`;

export interface RequestPageAnnotationDataInputs {
  selectedDocumentId: string;
}

export interface RequestPageAnnotationDataOutputs {
  existingTextAnnotations: ServerAnnotationType[];
  existingDocLabelAnnotations: ServerAnnotationType[];
  existingRelationships: RelationshipType[];
  selectedAnalyzersWithLabels: {
    edges: {
      node: AnalyzerType;
    }[];
  };
  corpus: {
    id: string;
    labelSet: LabelSet;
  };
}

export const REQUEST_PAGE_ANNOTATION_DATA = gql`
  query ($selectedDocumentId: ID!) {
    selectedAnalyzersSpanAnnotations: pageAnnotations(
      documentId: $selectedDocumentId
      labelType: TOKEN_LABEL
    ) {
      pdfPageInfo {
        pageCount
        currentPage
        hasNextPage
        corpusId
        documentId
        labelType
        forAnalysisIds
      }
      pageAnnotations {
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
        targetNodeInRelationships {
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
`;

export interface GetExportsInputs {
  name_Contains?: string;
  orderByCreated?: string;
  orderByStarted?: string;
  orderByFinished?: string;
}

export interface GetExportsOutputs {
  userexports: {
    pageInfo: PageInfo;
    edges: {
      node: ExportObject;
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
          file
        }
      }
    }
  }
`;

export interface GetExportInputType {
  id: string;
}

export interface GetExportOutputType {
  extract: ExtractType;
}

export const GET_EXPORT = gql`
  query getExtract($id: ID!) {
    extract(id: $id) {
      id
      name
      fullDatacellList {
        id
        isPublic
      }
      fieldset {
        fullColumnList {
          id
          instructions
          extractIsList
          limitToLabel
          taskName
          agentic
          matchText
          query
          outputType
        }
      }
    }
  }
`;

export interface GetFieldsetsInputs {
  searchText?: string;
}

export interface GetFieldsetsOutputs {
  fieldsets: {
    pageInfo: PageInfo;
    edges: {
      node: FieldsetType;
    }[];
  };
}

export const REQUEST_GET_FIELDSETS = gql`
  query GetFieldsets($searchText: String) {
    fieldsets(name_Contains: $searchText) {
      edges {
        node {
          id
          creator {
            id
            username
          }
          name
          description
          columns {
            edges {
              node {
                id
                query
                matchText
                outputType
                limitToLabel
                instructions
                extractIsList
                taskName
                agentic
              }
            }
          }
        }
      }
    }
  }
`;

export interface GetFieldsetOutputs {
  fieldset: FieldsetType;
}

export const GET_FIELDSET = gql`
  query GetFieldset($id: ID!) {
    fieldset(id: $id) {
      id
      creator {
        id
        username
      }
      name
      description
      columns {
        id
        query
        matchText
        outputType
        limitToLabel
        instructions
        extractIsList
        taskName
        agentic
      }
    }
  }
`;

export interface RequestGetExtractInput {
  id: string;
}

export interface RequestGetExtractOutput {
  extract: ExtractType;
}

export const REQUEST_GET_EXTRACT = gql`
  query GetExtract($id: ID!) {
    extract(id: $id) {
      id
      corpus {
        id
        title
      }
      name
      fieldset {
        id
        name
        fullColumnList {
          id
          name
          query
          instructions
          matchText
          limitToLabel
          agentic
          taskName
          outputType
        }
      }
      creator {
        id
        username
      }
      created
      started
      finished
      error
      fullDocumentList {
        id
        title
        description
        pageCount
      }
      fullDatacellList {
        id
        column {
          id
        }
        document {
          id
          title
        }
        fullSourceList {
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
          document {
            id
            pdfFile
            pawlsParseFile
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
          targetNodeInRelationships {
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
        data
        dataDefinition
        started
        completed
        failed
        correctedData
        stacktrace
        rejectedBy {
          email
        }
        approvedBy {
          email
        }
      }
    }
  }
`;

export interface GetExtractsInput {
  searchText?: string;
}

export interface GetExtractsOutput {
  extracts: {
    pageInfo: PageInfo;
    edges: {
      node: ExtractType;
    }[];
  };
}

export const REQUEST_GET_EXTRACTS = gql`
  query GetExtracts($searchText: String) {
    extracts(name_Contains: $searchText) {
      edges {
        node {
          id
          corpus {
            id
            title
          }
          name
          fieldset {
            id
            name
            columns {
              edges {
                node {
                  id
                  query
                }
              }
            }
          }
          creator {
            id
            username
          }
          created
          started
          finished
          error
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

export interface GetRegisteredExtractTasksOutput {
  registeredExtractTasks: Record<string, string>;
}

export const GET_REGISTERED_EXTRACT_TASKS = gql`
  query {
    registeredExtractTasks
  }
`;

export interface GetDocumentAnalysesAndExtractsInput {
  documentId: string;
  corpusId: string;
}

export interface GetDocumentAnalysesAndExtractsOutput {
  documentCorpusActions: {
    corpusActions: Array<
      CorpusActionType & {
        extracts: {
          pageInfo: PageInfo;
          edges: Array<{
            node: ExtractType;
          }>;
        };
        analyses: {
          pageInfo: PageInfo;
          edges: Array<{
            node: AnalysisType;
          }>;
        };
      }
    >;
    extracts: Array<ExtractType>;
    analyses: Array<AnalysisType>;
  };
}

export const GET_DOCUMENT_ANALYSES_AND_EXTRACTS = gql`
  query DocumentData($documentId: ID!, $corpusId: ID!) {
    documentCorpusActions(documentId: $documentId, corpusId: $corpusId) {
      corpusActions {
        id
        name
        trigger
        extracts {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              name
              created
              started
              finished
            }
          }
        }
        analyses {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            node {
              id
              analyzer {
                id
                description
              }
              analysisStarted
              analysisCompleted
              status
            }
          }
        }
      }
      extracts {
        id
        name
        created
        started
        finished
      }
      analyses {
        id
        analyzer {
          id
          description
        }
        analysisStarted
        analysisCompleted
        status
      }
    }
  }
`;

// Input type for the query
export interface GetDatacellsForExtractInput {
  extractId: string;
}

// Output types for the query
export interface GetDatacellsForExtractOutput {
  extract: ExtractType;
}

export const GET_DATACELLS_FOR_EXTRACT = gql`
  query GetDatacellsForExtract($extractId: ID!) {
    extract(id: $extractId) {
      id
      name
      fieldset {
        id
        name
        fullColumnList {
          id
          name
          query
          outputType
          limitToLabel
          instructions
          extractIsList
          taskName
          agentic
        }
      }
      fullDatacellList {
        id
        column {
          id
          name
        }
        document {
          id
          title
        }
        data
        dataDefinition
        started
        completed
        failed
        correctedData
        stacktrace
        approvedBy {
          email
        }
        rejectedBy {
          email
        }
        fullSourceList {
          id
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
        }
      }
    }
  }
`;

export interface GetAnnotationsForAnalysisInput {
  analysisId: string;
}

export interface GetAnnotationsForAnalysisOutput {
  analysis: AnalysisType;
}

export const GET_ANNOTATIONS_FOR_ANALYSIS = gql`
  query GetAnnotationsForAnalysis($analysisId: ID!) {
    analysis(id: $analysisId) {
      id
      analyzer {
        id
        analyzerId
        description
        fullLabelList {
          id
          text
          color
          icon
          description
          labelType
        }
      }
      fullAnnotationList {
        id
        annotationLabel {
          id
          text
          color
          icon
          description
          labelType
        }
        boundingBox
        page
        rawText
        tokensJsons
        json
        allSourceNodeInRelationship {
          id
          relationshipLabel {
            id
            text
            color
            icon
            description
          }
          targetAnnotations {
            edges {
              node {
                id
              }
            }
          }
        }
        allTargetNodeInRelationship {
          id
          relationshipLabel {
            id
            text
            color
            icon
            description
          }
          sourceAnnotations {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    }
  }
`;
