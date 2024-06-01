import { SemanticICONS } from "semantic-ui-react";
import { TokenId } from "../components/annotator/context";
import { ExportTypes, MultipageAnnotationJson } from "../components/types";

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};

/** Auto-generated built-in and custom scalars, mapped to their actual values, for GraphQL API */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  DateTime: any;
  GenericScalar: any;
  JSONString: any;
  UUID: any;
};

export type AddAnnotation = {
  __typename?: "AddAnnotation";
  ok?: Maybe<Scalars["Boolean"]>;
  annotation?: Maybe<ServerAnnotationType>;
};

export type AddDocTypeAnnotation = {
  __typename?: "AddDocTypeAnnotation";
  ok?: Maybe<Scalars["Boolean"]>;
  annotation?: Maybe<ServerAnnotationType>;
};

export type AddRelationship = {
  __typename?: "AddRelationship";
  ok?: Maybe<Scalars["Boolean"]>;
  relationship?: Maybe<RelationshipType>;
};

export type AnnotationLabelType = Node & {
  __typename?: "AnnotationLabelType";
  id: Scalars["ID"];
  labelType?: LabelType;
  analyzer?: Maybe<AnalyzerType>;
  color?: Scalars["String"];
  description?: Scalars["String"];
  icon?: SemanticICONS;
  text?: Scalars["String"];
  creator?: UserType;
  needed_by_analyzer_id?: Scalars["String"];
  used_by_analyses: AnalysisTypeConnection;
  created?: Scalars["DateTime"];
  modified?: Scalars["DateTime"];
  isPublic?: Scalars["Boolean"];
  readonly?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
  relationshipSet?: RelationshipTypeConnection;
  annotationSet?: AnnotationTypeConnection;
  labelsetSet?: LabelSetTypeConnection;
};

export type AnnotationLabelTypeRelationshipSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationLabelTypeAnnotationSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationLabelTypeLabelsetSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationLabelTypeConnection = {
  __typename?: "AnnotationLabelTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<AnnotationLabelTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type AnnotationLabelTypeEdge = {
  __typename?: "AnnotationLabelTypeEdge";
  node?: Maybe<AnnotationLabelType>;
  cursor: Scalars["String"];
};

export type ServerAnnotationType = Node & {
  __typename?: "AnnotationType";
  id: Scalars["ID"];
  page: Scalars["Int"];
  annotation_type?: AnnotationTypeEnum;
  created_by_analyses: AnalysisTypeConnection;
  rawText?: Maybe<Scalars["String"]>;
  json?: MultipageAnnotationJson;
  annotationLabel: AnnotationLabelType;
  document: DocumentType;
  corpus?: Maybe<CorpusType>;
  creator: UserType;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
  analysis?: Maybe<AnalysisType>;
  assignmentSet: AssignmentTypeConnection;
  sourceNodeInRelationships: RelationshipTypeConnection;
  targetNodeInRelationships: RelationshipTypeConnection;
};

export type AnnotationTypeAssignmentSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationTypeSourceNodeInRelationshipsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationTypeTargetNodeInRelationshipsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnnotationTypeConnection = {
  __typename?: "AnnotationTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<AnnotationTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type AnnotationTypeEdge = {
  __typename?: "AnnotationTypeEdge";
  node?: Maybe<ServerAnnotationType>;
  cursor: Scalars["String"];
};

export type AssignmentType = Node & {
  __typename?: "AssignmentType";
  id: Scalars["ID"];
  name?: Maybe<Scalars["String"]>;
  document: DocumentType;
  corpus?: Maybe<CorpusType>;
  resultingAnnotations: AnnotationTypeConnection;
  resultingRelationships: RelationshipTypeConnection;
  comments: Scalars["String"];
  assignor: UserType;
  assignee?: Maybe<UserType>;
  completedAt?: Maybe<Scalars["DateTime"]>;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type AssignmentTypeResultingAnnotationsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AssignmentTypeResultingRelationshipsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AssignmentTypeConnection = {
  __typename?: "AssignmentTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<AssignmentTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type AssignmentTypeEdge = {
  __typename?: "AssignmentTypeEdge";
  node?: Maybe<AssignmentType>;
  cursor: Scalars["String"];
};

export type CorpusType = Node & {
  __typename?: "CorpusType";
  id: Scalars["ID"];
  title?: Scalars["String"];
  appliedAnalyzerIds?: string[];
  is_selected?: boolean;
  is_opened?: boolean;
  description?: Scalars["String"];
  icon?: Maybe<Scalars["String"]>;
  documents?: DocumentTypeConnection;
  labelSet?: Maybe<LabelSetType>;
  creator?: UserType;
  parent?: CorpusType;
  backendLock?: Scalars["Boolean"];
  userLock?: Maybe<UserType>;
  error?: Scalars["Boolean"];
  created?: Scalars["DateTime"];
  modified?: Scalars["DateTime"];
  assignmentSet?: AssignmentTypeConnection;
  relationshipSet?: RelationshipTypeConnection;
  annotationSet?: AnnotationTypeConnection;
  allAnnotationSummaries?: ServerAnnotationType[];
  analyses: AnalysisTypeConnection;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type CorpusTypeDocumentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type CorpusTypeAssignmentSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type CorpusTypeRelationshipSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type CorpusTypeAnnotationSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type CorpusTypeConnection = {
  __typename?: "CorpusTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<CorpusTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type CorpusTypeEdge = {
  __typename?: "CorpusTypeEdge";
  node?: Maybe<CorpusType>;
  cursor: Scalars["String"];
};

export type DocumentType = Node & {
  __typename?: "DocumentType";
  id: Scalars["ID"];
  title?: Maybe<Scalars["String"]>;
  description?: Maybe<Scalars["String"]>;
  customMeta?: Maybe<Scalars["JSONString"]>;
  icon?: Scalars["String"];
  pdfFile?: Scalars["String"];
  is_open?: boolean;
  is_selected?: boolean;
  pageCount?: Maybe<Scalars["Int"]>;
  txtExtractFile?: Maybe<Scalars["String"]>;
  pawlsParseFile?: Maybe<Scalars["String"]>;
  backendLock?: Scalars["Boolean"];
  userLock?: Maybe<UserType>;
  creator?: UserType;
  created?: Scalars["DateTime"];
  modified?: Scalars["DateTime"];
  assignmentSet?: AssignmentTypeConnection;
  corpusSet?: CorpusTypeConnection;
  annotationSet?: AnnotationTypeConnection;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
  doc_label_annotations?: Maybe<AnnotationTypeConnection>;
  metadata_annotations?: Maybe<AnnotationTypeConnection>;
};

export type DocumentTypeAssignmentSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type DocumentTypeCorpusSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type DocumentTypeAnnotationSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type DocumentTypeConnection = {
  __typename?: "DocumentTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<DocumentTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type DocumentTypeEdge = {
  __typename?: "DocumentTypeEdge";
  node?: Maybe<DocumentType>;
  cursor: Scalars["String"];
};

export type LabelSetType = Node & {
  __typename?: "LabelSetType";
  id?: Scalars["ID"];
  used_by_analyzer_id?: Scalars["String"];
  title?: Scalars["String"];
  description?: Scalars["String"];
  icon?: Scalars["String"];
  annotationLabels?: AnnotationLabelTypeConnection;
  allAnnotationLabels?: AnnotationLabelType[];
  creator?: UserType;
  created?: Scalars["DateTime"];
  modified?: Scalars["DateTime"];
  corpusSet?: CorpusTypeConnection;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type LabelSetTypeLabelsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
  type?: InputMaybe<Scalars["String"]>;
};

export type LabelSetTypeCorpusSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type LabelSetTypeConnection = {
  __typename?: "LabelSetTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<LabelSetTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type LabelSetTypeEdge = {
  __typename?: "LabelSetTypeEdge";
  node?: Maybe<LabelSetType>;
  cursor: Scalars["String"];
};

export enum LabelType {
  RelationshipLabel = "RELATIONSHIP_LABEL",
  DocTypeLabel = "DOC_TYPE_LABEL",
  TokenLabel = "TOKEN_LABEL",
  MetadataLabel = "METADATA_LABEL",
}

export enum AnnotationTypeEnum {
  HUMAN_ANNOTATION = "HUMAN_ANNOTATION",
  MACHINE_ANNOTATION = "MACHINE_ANNOTATION",
}

export enum LabelDisplayBehavior {
  ALWAYS = "ALWAYS",
  ON_HOVER = "ON_HOVER",
  HIDE = "HIDE",
}

export type Mutation = {
  __typename?: "Mutation";
  tokenAuth?: Maybe<ObtainJsonWebToken>;
  verifyToken?: Maybe<Verify>;
  refreshToken?: Maybe<Refresh>;
  addAnnotation?: Maybe<AddAnnotation>;
  removeAnnotation?: Maybe<RemoveAnnotation>;
  addRelationship?: Maybe<AddRelationship>;
  removeRelationship?: Maybe<RemoveRelationship>;
  removeRelationships?: Maybe<RemoveRelationships>;
  addDocTypeAnnotation?: Maybe<AddDocTypeAnnotation>;
  removeDocTypeAnnotation?: Maybe<RemoveAnnotation>;
  updateRelationships?: Maybe<UpdateRelations>;
};

export type MutationTokenAuthArgs = {
  username: Scalars["String"];
  password: Scalars["String"];
};

export type MutationVerifyTokenArgs = {
  token?: InputMaybe<Scalars["String"]>;
};

export type MutationRefreshTokenArgs = {
  refreshToken?: InputMaybe<Scalars["String"]>;
};

export interface TextSearchResultsProps {
  start: TokenId;
  end: TokenId;
}

export type MutationAddAnnotationArgs = {
  boundingBox: Scalars["GenericScalar"];
  corpusId: Scalars["String"];
  documentId: Scalars["String"];
  labelId: Scalars["String"];
  page: Scalars["Int"];
  rawText: Scalars["String"];
  tokensJsons: Scalars["GenericScalar"];
};

export type MutationRemoveAnnotationArgs = {
  annotationId: Scalars["String"];
};

export type MutationAddRelationshipArgs = {
  corpusId: Scalars["String"];
  labelId: Scalars["String"];
  sourceIds: Array<InputMaybe<Scalars["String"]>>;
  targetIds: Array<InputMaybe<Scalars["String"]>>;
};

export type MutationRemoveRelationshipArgs = {
  relationshipId: Scalars["String"];
};

export type MutationRemoveRelationshipsArgs = {
  relationshipIds?: InputMaybe<Array<InputMaybe<Scalars["String"]>>>;
};

export type MutationAddDocTypeAnnotationArgs = {
  corpusId: Scalars["String"];
  documentId: Scalars["String"];
  labelId: Scalars["String"];
};

export type MutationRemoveDocTypeAnnotationArgs = {
  annotationId: Scalars["String"];
};

export type MutationUpdateRelationshipsArgs = {
  relationships?: InputMaybe<Array<InputMaybe<RelationInputType>>>;
};

export type Node = {
  id: Scalars["ID"];
};

export type ObtainJsonWebToken = {
  __typename?: "ObtainJSONWebToken";
  payload: Scalars["GenericScalar"];
  refreshExpiresIn: Scalars["Int"];
  token: Scalars["String"];
  refreshToken: Scalars["String"];
};

export type PageInfo = {
  __typename?: "PageInfo";
  hasNextPage: Scalars["Boolean"];
  hasPreviousPage: Scalars["Boolean"];
  startCursor?: Maybe<Scalars["String"]>;
  endCursor?: Maybe<Scalars["String"]>;
};

export type Query = {
  __typename?: "Query";
  annotations?: Maybe<AnnotationTypeConnection>;
  annotation?: Maybe<ServerAnnotationType>;
  relationships?: Maybe<RelationshipTypeConnection>;
  relationship?: Maybe<RelationshipType>;
  assignments?: Maybe<AssignmentTypeConnection>;
  assignment?: Maybe<AssignmentType>;
  labels?: Maybe<AnnotationLabelTypeConnection>;
  label?: Maybe<AnnotationLabelType>;
  labelsets?: Maybe<LabelSetTypeConnection>;
  labelset?: Maybe<LabelSetType>;
  corpuses?: Maybe<CorpusTypeConnection>;
  corpus?: Maybe<CorpusType>;
  documents?: Maybe<DocumentTypeConnection>;
  document?: Maybe<DocumentType>;
  userimports?: Maybe<UserImportTypeConnection>;
  userimport?: Maybe<UserImportType>;
  userexports?: Maybe<UserExportTypeConnection>;
  userexport?: Maybe<UserExportType>;
};

export type QueryAnnotationsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryAnnotationArgs = {
  id: Scalars["ID"];
};

export type QueryRelationshipsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryRelationshipArgs = {
  id: Scalars["ID"];
};

export type QueryAssignmentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
  assignor_Email?: InputMaybe<Scalars["String"]>;
  assignee_Email?: InputMaybe<Scalars["String"]>;
  documentId?: InputMaybe<Scalars["String"]>;
};

export type QueryAssignmentArgs = {
  id: Scalars["ID"];
};

export type QueryLabelsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
  type?: InputMaybe<Scalars["String"]>;
};

export type QueryLabelArgs = {
  id: Scalars["ID"];
};

export type QueryLabelsetsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryLabelsetArgs = {
  id: Scalars["ID"];
};

export type QueryCorpusesArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryCorpusArgs = {
  id: Scalars["ID"];
};

export type QueryDocumentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryDocumentArgs = {
  id: Scalars["ID"];
};

export type QueryUserimportsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryUserimportArgs = {
  id: Scalars["ID"];
};

export type QueryUserexportsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type QueryUserexportArgs = {
  id: Scalars["ID"];
};

export type Refresh = {
  __typename?: "Refresh";
  payload: Scalars["GenericScalar"];
  refreshExpiresIn: Scalars["Int"];
  token: Scalars["String"];
  refreshToken: Scalars["String"];
};

export type RelationInputType = {
  id?: InputMaybe<Scalars["String"]>;
  sourceIds?: InputMaybe<Array<InputMaybe<Scalars["String"]>>>;
  targetIds?: InputMaybe<Array<InputMaybe<Scalars["String"]>>>;
  labelId?: InputMaybe<Scalars["String"]>;
  corpusId?: InputMaybe<Scalars["String"]>;
  documentId?: InputMaybe<Scalars["String"]>;
};

export type RelationshipType = Node & {
  __typename?: "RelationshipType";
  id: Scalars["ID"];
  relationshipLabel: AnnotationLabelType;
  corpus: CorpusType;
  document: DocumentType;
  sourceAnnotations: AnnotationTypeConnection;
  targetAnnotations: AnnotationTypeConnection;
  creator: UserType;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  assignmentSet: AssignmentTypeConnection;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type RelationshipTypeSourceAnnotationsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type RelationshipTypeTargetAnnotationsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type RelationshipTypeAssignmentSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type RelationshipTypeConnection = {
  __typename?: "RelationshipTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<RelationshipTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type RelationshipTypeEdge = {
  __typename?: "RelationshipTypeEdge";
  node: RelationshipType;
  cursor: Scalars["String"];
};

export type RemoveAnnotation = {
  __typename?: "RemoveAnnotation";
  ok?: Maybe<Scalars["Boolean"]>;
};

export type RemoveRelationship = {
  __typename?: "RemoveRelationship";
  ok?: Maybe<Scalars["Boolean"]>;
};

export type RemoveRelationships = {
  __typename?: "RemoveRelationships";
  ok?: Maybe<Scalars["Boolean"]>;
};

export type UpdateRelations = {
  __typename?: "UpdateRelations";
  ok?: Maybe<Scalars["Boolean"]>;
};

export type UserExportType = Node & {
  __typename?: "UserExportType";
  id: Scalars["ID"];
  file: Scalars["String"];
  backendLock?: Scalars["Boolean"];
  name?: Maybe<Scalars["String"]>;
  created: Scalars["DateTime"];
  started?: Maybe<Scalars["DateTime"]>;
  finished?: Maybe<Scalars["DateTime"]>;
  format?: ExportTypes;
  errors: Scalars["String"];
  creator: UserType;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type UserExportTypeConnection = {
  __typename?: "UserExportTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<UserExportTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type UserExportTypeEdge = {
  __typename?: "UserExportTypeEdge";
  node?: Maybe<UserExportType>;
  cursor: Scalars["String"];
};

export type UserImportType = Node & {
  __typename?: "UserImportType";
  id: Scalars["ID"];
  zip: Scalars["String"];
  name?: Maybe<Scalars["String"]>;
  created: Scalars["DateTime"];
  started?: Maybe<Scalars["DateTime"]>;
  finished?: Maybe<Scalars["DateTime"]>;
  errors: Scalars["String"];
  creator: UserType;
  isPublic?: Scalars["Boolean"];
  myPermissions?: Scalars["String"][];
};

export type UserImportTypeConnection = {
  __typename?: "UserImportTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<UserImportTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type UserImportTypeEdge = {
  __typename?: "UserImportTypeEdge";
  node?: Maybe<UserImportType>;
  cursor: Scalars["String"];
};

export type UserType = Node & {
  __typename?: "UserType";
  id: Scalars["ID"];
  password: Scalars["String"];
  lastLogin?: Maybe<Scalars["DateTime"]>;
  isSuperuser: Scalars["Boolean"];
  username: Scalars["String"];
  email: Scalars["String"];
  isStaff: Scalars["Boolean"];
  isActive: Scalars["Boolean"];
  dateJoined: Scalars["DateTime"];
  name: Scalars["String"];
  createdAssignments: AssignmentTypeConnection;
  myAssignments: AssignmentTypeConnection;
  userexportSet: UserExportTypeConnection;
  userimportSet: UserImportTypeConnection;
  editingDocuments: DocumentTypeConnection;
  documentSet: DocumentTypeConnection;
  corpusSet: CorpusTypeConnection;
  editingCorpuses: CorpusTypeConnection;
  labelSet: AnnotationLabelTypeConnection;
  relationshipSet: RelationshipTypeConnection;
  annotationSet: AnnotationTypeConnection;
  labelsetSet: LabelSetTypeConnection;
};

export type UserTypeCreatedAssignmentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeMyAssignmentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeUserexportSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeUserimportSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeEditingDocumentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeDocumentSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeCorpusSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeEditingCorpusesArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeLabelSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
  type?: InputMaybe<Scalars["String"]>;
};

export type UserTypeRelationshipSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeAnnotationSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type UserTypeLabelsetSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type Verify = {
  __typename?: "Verify";
  payload: Scalars["GenericScalar"];
};

/**
 *  Analyzer Types
 */
export enum AnalysisStatus {
  Created = "CREATED",
  Queued = "QUEUED",
  Running = "RUNNING",
  Completed = "COMPLETED",
  Failed = "FAILED",
}

export type AnalysisType = Node & {
  __typename?: "AnalysisType";
  id: Scalars["ID"];
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  isPublic: Scalars["Boolean"];
  creator: UserType;
  analyzer: AnalyzerType;
  callbackToken: Scalars["UUID"];
  receivedCallbackFile?: Maybe<Scalars["String"]>;
  analyzedCorpus: CorpusType;
  importLog?: Maybe<Scalars["String"]>;
  analyzedDocuments: DocumentTypeConnection;
  analysisStarted?: Maybe<Scalars["DateTime"]>;
  analysisCompleted?: Maybe<Scalars["DateTime"]>;
  status: AnalysisStatus;
  annotations: AnnotationTypeConnection;
  myPermissions?: Maybe<Scalars["GenericScalar"]>;
  isPublished?: Maybe<Scalars["Boolean"]>;
  objectSharedWith?: Maybe<Scalars["GenericScalar"]>;
};

export type AnalysisTypeAnalyzedDocumentsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnalysisTypeAnnotationsArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
  rawText_Contains?: InputMaybe<Scalars["String"]>;
  annotationLabelId?: InputMaybe<Scalars["ID"]>;
  annotationLabel_Text?: InputMaybe<Scalars["String"]>;
  annotationLabel_Text_Contains?: InputMaybe<Scalars["String"]>;
  annotationLabel_Description_Contains?: InputMaybe<Scalars["String"]>;
  annotationLabel_LabelType?: InputMaybe<Scalars["String"]>;
  documentId?: InputMaybe<Scalars["ID"]>;
  corpusId?: InputMaybe<Scalars["ID"]>;
  usesLabelFromLabelsetId?: InputMaybe<Scalars["String"]>;
};

export type AnalysisTypeConnection = {
  __typename?: "AnalysisTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<AnalysisTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type AnalysisTypeEdge = {
  __typename?: "AnalysisTypeEdge";
  node?: Maybe<AnalysisType>;
  cursor: Scalars["String"];
};

export type AnalyzerType = Node & {
  __typename?: "AnalyzerType";
  creator: UserType;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  id: Scalars["ID"];
  manifest?: Maybe<AnalyzerManifestType>;
  description: Scalars["String"];
  hostGremlin: GremlinEngineType_Write;
  disabled: Scalars["Boolean"];
  isPublic: Scalars["Boolean"];
  fullLabelList: Maybe<AnnotationLabelType[]>;
  annotationlabelSet: AnnotationLabelTypeConnection;
  relationshipSet: RelationshipTypeConnection;
  labelsetSet: LabelSetTypeConnection;
  analysisSet: AnalysisTypeConnection;
  myPermissions?: Maybe<Scalars["GenericScalar"]>;
  isPublished?: Maybe<Scalars["Boolean"]>;
  objectSharedWith?: Maybe<Scalars["GenericScalar"]>;
  analyzerId?: Maybe<Scalars["String"]>;
};

export type AnalyzerTypeAnnotationlabelSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnalyzerTypeRelationshipSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnalyzerTypeLabelsetSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnalyzerTypeAnalysisSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type AnalyzerTypeConnection = {
  __typename?: "AnalyzerTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<AnalyzerTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type AnalyzerTypeEdge = {
  __typename?: "AnalyzerTypeEdge";
  node?: Maybe<AnalyzerType>;
  cursor: Scalars["String"];
};

/**
 * Gremlin Engine Types
 */
export type GremlinEngineType_Read = Node & {
  __typename?: "GremlinEngineType_READ";
  id: Scalars["ID"];
  creator: UserType;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  url: Scalars["String"];
  lastSynced?: Maybe<Scalars["DateTime"]>;
  installStarted?: Maybe<Scalars["DateTime"]>;
  installCompleted?: Maybe<Scalars["DateTime"]>;
  isPublic: Scalars["Boolean"];
  analyzerSet: AnalyzerTypeConnection;
  myPermissions?: Maybe<Scalars["GenericScalar"]>;
  isPublished?: Maybe<Scalars["Boolean"]>;
  objectSharedWith?: Maybe<Scalars["GenericScalar"]>;
};

export type GremlinEngineType_ReadAnalyzerSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type GremlinEngineType_ReadConnection = {
  __typename?: "GremlinEngineType_READConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<GremlinEngineType_ReadEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type GremlinEngineType_ReadEdge = {
  __typename?: "GremlinEngineType_READEdge";
  node?: Maybe<GremlinEngineType_Read>;
  cursor: Scalars["String"];
};

export type GremlinEngineType_Write = Node & {
  __typename?: "GremlinEngineType_WRITE";
  id: Scalars["ID"];
  creator: UserType;
  created: Scalars["DateTime"];
  modified: Scalars["DateTime"];
  url: Scalars["String"];
  lastSynced?: Maybe<Scalars["DateTime"]>;
  installStarted?: Maybe<Scalars["DateTime"]>;
  installCompleted?: Maybe<Scalars["DateTime"]>;
  isPublic: Scalars["Boolean"];
  analyzerSet: AnalyzerTypeConnection;
  apiKey?: Maybe<Scalars["String"]>;
  myPermissions?: Maybe<Scalars["GenericScalar"]>;
  isPublished?: Maybe<Scalars["Boolean"]>;
  objectSharedWith?: Maybe<Scalars["GenericScalar"]>;
};

export type GremlinEngineType_WriteAnalyzerSetArgs = {
  offset?: InputMaybe<Scalars["Int"]>;
  before?: InputMaybe<Scalars["String"]>;
  after?: InputMaybe<Scalars["String"]>;
  first?: InputMaybe<Scalars["Int"]>;
  last?: InputMaybe<Scalars["Int"]>;
};

export type GremlinEngineType_WriteConnection = {
  __typename?: "GremlinEngineType_WRITEConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<GremlinEngineType_WriteEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type GremlinEngineType_WriteEdge = {
  __typename?: "GremlinEngineType_WRITEEdge";
  node?: Maybe<GremlinEngineType_Write>;
  cursor: Scalars["String"];
};

/**
 * Gremlin Engine Manifest Types
 */
export type AnalyzerMetadataType = {
  id: string;
  description: string;
  title: string;
  dependencies: string[];
  author_name: string;
  author_email: string;
  more_details_url: string;
};

export type AnnotationLabelPythonType = {
  id: string;
  color: string;
  description: string;
  icon: string;
  text: string;
  label_type: LabelType;
};

export type OpenContractsLabelSetType = {
  id: number | string;
  title: string;
  description: string;
  icon_data?: string[];
  icon_name?: string;
  creator: string;
};

export type AnalyzerManifestType = {
  metadata: AnalyzerMetadataType;
  doc_labels: AnnotationLabelPythonType[];
  text_labels: AnnotationLabelPythonType[];
  label_set: OpenContractsLabelSetType;
};

export interface LanguageModelType extends Node {
  id: string;
  model: string;
}

export interface FieldsetType extends Node {
  owner: UserType;
  name: string;
  description: string;
  columns: ColumnTypeEdge;
  fullColumnList?: ColumnType[];
}

export interface ColumnType extends Node {
  fieldset: FieldsetType;
  query: string;
  matchText?: Maybe<string>;
  outputType: string;
  limitToLabel?: Maybe<string>;
  instructions?: Maybe<string>;
  languageModel: LanguageModelType;
  agentic: boolean;
}

export interface ColumnTypeEdge {
  __typename?: "ColumnTypeEdge";
  pageInfo?: PageInfo;
  edges: {
    node: ColumnType;
  }[];
}

export type DatacellTypeConnection = {
  __typename?: "DatacellTypeConnection";
  pageInfo: PageInfo;
  edges: Array<Maybe<DatacellTypeEdge>>;
  totalCount?: Maybe<Scalars["Int"]>;
};

export type DatacellTypeEdge = {
  __typename?: "DatacellTypeEdge";
  node?: Maybe<DatacellType>;
  cursor: Scalars["String"];
};

export interface ExtractType extends Node {
  corpus: CorpusType;
  name: string;
  fieldset: FieldsetType;
  owner: UserType;
  created: string;
  started?: Maybe<string>;
  finished?: Maybe<string>;
  stacktrace?: Maybe<string>;
  documents?: DocumentType[];
  extractedDatacells?: DatacellTypeConnection;
  fullDatacellList?: DatacellType[];
}

export interface DatacellType extends Node {
  extract: ExtractType;
  column: ColumnType;
  document: DocumentType;
  data: any;
  dataDefinition: string;
  started?: Maybe<string>;
  completed?: Maybe<string>;
  failed?: Maybe<string>;
}
export interface ExportObject {
  id: string;
  name: string;
  finished: Scalars["DateTime"];
  started: Scalars["DateTime"];
  created: Scalars["DateTime"];
  errors: string;
  backendLock: boolean;
  file: string;
}
export interface PageAwareAnnotationType {
  pdfPageInfo: {
    pageCount: number;
    currentPage: number;
    corpusId: string;
    documentId: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    labelType: LabelType;
    forAnalysisIds: string;
  };
  pageAnnotations: ServerAnnotationType[];
}
