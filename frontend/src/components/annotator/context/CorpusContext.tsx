import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  CorpusType,
  AnnotationLabelType,
  LabelType,
} from "../../../types/graphql-api";
import {
  convertToServerAnnotation,
  getPermissions,
} from "../../../utils/transform";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
  RelationGroup,
  DocTypeAnnotation,
} from "../types/annotations";
import {
  GetDocumentAnnotationsAndRelationshipsOutput,
  GetDocumentAnnotationsAndRelationshipsInput,
} from "../../../graphql/queries";
import { PermissionTypes } from "../../types";

interface CorpusContextValue {
  // Core corpus data
  selectedCorpus: CorpusType | null | undefined;

  // Permissions
  permissions: PermissionTypes[];
  canUpdateCorpus: boolean;
  canDeleteCorpus: boolean;
  canManageCorpus: boolean;
  hasCorpusPermission: (permission: PermissionTypes) => boolean;

  // Label sets
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];

  // Corpus features
  allowComments: boolean;

  // Document annotations and relationships
  annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[];
  relationships: RelationGroup[];
  structuralAnnotations: ServerTokenAnnotation[];
  docTypeAnnotations: DocTypeAnnotation[];

  // Loading states
  isLoading: boolean;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

interface CorpusProviderProps {
  children: React.ReactNode;
  selectedCorpus: CorpusType | null | undefined;
  annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[];
  relationships: RelationGroup[];
  structuralAnnotations: ServerTokenAnnotation[];
  docTypeAnnotations: DocTypeAnnotation[];
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];
  isLoading: boolean;
}

export function CorpusProvider({
  children,
  selectedCorpus,
  annotations,
  relationships,
  structuralAnnotations,
  docTypeAnnotations,
  spanLabels,
  humanSpanLabels,
  relationLabels,
  docTypeLabels,
  isLoading,
}: CorpusProviderProps) {
  // Process permissions
  const permissions = useMemo(() => {
    const rawPermissions = selectedCorpus?.myPermissions ?? ["READ"];
    return getPermissions(rawPermissions);
  }, [selectedCorpus?.myPermissions]);

  const value = useMemo(
    () => ({
      selectedCorpus,
      permissions,
      canUpdateCorpus: permissions.includes(PermissionTypes.CAN_UPDATE),
      canDeleteCorpus: permissions.includes(PermissionTypes.CAN_REMOVE),
      canManageCorpus: permissions.includes(PermissionTypes.CAN_PERMISSION),
      hasCorpusPermission: (permission: PermissionTypes) =>
        permissions.includes(permission),
      annotations,
      relationships,
      structuralAnnotations,
      docTypeAnnotations,
      spanLabels,
      humanSpanLabels,
      relationLabels,
      docTypeLabels,
      isLoading,
      allowComments: selectedCorpus?.allowComments ?? true,
    }),
    [
      selectedCorpus,
      permissions,
      annotations,
      relationships,
      structuralAnnotations,
      docTypeAnnotations,
      spanLabels,
      humanSpanLabels,
      relationLabels,
      docTypeLabels,
      isLoading,
    ]
  );

  return (
    <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>
  );
}

export function useCorpusContext() {
  const context = useContext(CorpusContext);
  if (!context) {
    throw new Error("useCorpusContext must be used within a CorpusProvider");
  }
  return context;
}
