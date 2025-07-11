import { gql } from "@apollo/client";

export const CREATE_NOTE = gql`
  mutation CreateNote(
    $documentId: ID!
    $corpusId: ID
    $title: String!
    $content: String!
    $parentId: ID
  ) {
    createNote(
      documentId: $documentId
      corpusId: $corpusId
      title: $title
      content: $content
      parentId: $parentId
    ) {
      ok
      message
      obj {
        id
        title
        content
        created
        modified
        creator {
          id
          email
        }
      }
    }
  }
`;

export const UPDATE_NOTE = gql`
  mutation UpdateNote($noteId: ID!, $newContent: String!, $title: String) {
    updateNote(noteId: $noteId, newContent: $newContent, title: $title) {
      ok
      message
      version
      obj {
        id
        title
        content
        modified
        currentVersion
        revisions {
          id
          version
          author {
            id
            email
            username
          }
          created
          diff
          snapshot
        }
      }
    }
  }
`;

export const DELETE_NOTE = gql`
  mutation DeleteNote($id: String!) {
    deleteNote(id: $id) {
      ok
      message
    }
  }
`;

export const GET_NOTE_WITH_HISTORY = gql`
  query GetNoteWithHistory($id: ID!) {
    note(id: $id) {
      id
      title
      content
      created
      modified
      currentVersion
      creator {
        id
        email
        username
      }
      document {
        id
        title
      }
      revisions {
        id
        version
        author {
          id
          email
          username
        }
        created
        diff
        snapshot
        checksumBase
        checksumFull
      }
    }
  }
`;
