import { gql } from "@apollo/client";

export const GET_DOCUMENT_SUMMARY_VERSIONS = gql`
  query GetDocumentSummaryVersions($documentId: String!, $corpusId: ID!) {
    document(id: $documentId) {
      id
      summaryContent(corpusId: $corpusId)
      currentSummaryVersion(corpusId: $corpusId)
      summaryRevisions(corpusId: $corpusId) {
        id
        version
        created
        snapshot
        diff
        author {
          id
          username
          email
        }
      }
    }
  }
`;

export const UPDATE_DOCUMENT_SUMMARY = gql`
  mutation UpdateDocumentSummary(
    $documentId: ID!
    $corpusId: ID!
    $newContent: String!
  ) {
    updateDocumentSummary(
      documentId: $documentId
      corpusId: $corpusId
      newContent: $newContent
    ) {
      ok
      message
      version
      obj {
        id
        summaryContent(corpusId: $corpusId)
        currentSummaryVersion(corpusId: $corpusId)
        summaryRevisions(corpusId: $corpusId) {
          id
          version
          created
          snapshot
          diff
          author {
            id
            username
            email
          }
        }
      }
    }
  }
`;

// Types for the GraphQL queries
export interface SummaryAuthor {
  id: string;
  username: string;
  email: string;
}

export interface DocumentSummaryRevision {
  id: string;
  version: number;
  created: string;
  snapshot: string;
  diff: string;
  author: SummaryAuthor;
}

export interface DocumentSummaryData {
  id: string;
  summaryContent: string;
  currentSummaryVersion: number;
  summaryRevisions: DocumentSummaryRevision[];
}

export interface GetDocumentSummaryVersionsResponse {
  document: DocumentSummaryData;
}

export interface GetDocumentSummaryVersionsVariables {
  documentId: string;
  corpusId: string;
}

export interface UpdateDocumentSummaryResponse {
  updateDocumentSummary: {
    ok: boolean;
    message: string;
    version: number | null;
    obj: DocumentSummaryData | null;
  };
}

export interface UpdateDocumentSummaryVariables {
  documentId: string;
  corpusId: string;
  newContent: string;
}
