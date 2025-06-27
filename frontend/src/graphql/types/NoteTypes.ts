export interface NoteRevision {
  id: string;
  version: number;
  author: {
    id: string;
    email: string;
    username: string;
  };
  created: string;
  diff?: string;
  snapshot?: string;
  checksumBase?: string;
  checksumFull?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  created: string;
  modified: string;
  currentVersion?: number;
  creator: {
    id: string;
    email: string;
    username?: string;
  };
  document?: {
    id: string;
    title: string;
  };
  revisions?: NoteRevision[];
}

export interface UpdateNoteMutation {
  updateNote: {
    ok: boolean;
    message: string;
    version?: number;
    obj?: Note;
  };
}

export interface UpdateNoteMutationVariables {
  noteId: string;
  newContent: string;
  title?: string;
}

export interface DeleteNoteMutation {
  deleteNote: {
    ok: boolean;
    message: string;
  };
}

export interface DeleteNoteMutationVariables {
  id: string;
}

export interface GetNoteWithHistoryQuery {
  note: Note;
}

export interface GetNoteWithHistoryQueryVariables {
  id: string;
}

export interface CreateNoteMutation {
  createNote: {
    ok: boolean;
    message: string;
    obj?: {
      id: string;
      title: string;
      content: string;
      created: string;
      modified: string;
      creator: {
        id: string;
        email: string;
      };
    };
  };
}

export interface CreateNoteMutationVariables {
  documentId: string;
  corpusId?: string;
  title: string;
  content: string;
  parentId?: string;
}
