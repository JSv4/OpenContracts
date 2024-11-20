import React, { createContext, useContext, useMemo, useState } from "react";
import { CorpusType, AnnotationLabelType } from "../../../types/graphql-api";
import { getPermissions } from "../../../utils/transform";
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

  // Loading states
  isLoading: boolean;

  // Label management
  setSpanLabels: (labels: AnnotationLabelType[]) => void;
  setHumanSpanLabels: (labels: AnnotationLabelType[]) => void;
  setRelationLabels: (labels: AnnotationLabelType[]) => void;
  setDocTypeLabels: (labels: AnnotationLabelType[]) => void;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

interface CorpusProviderProps {
  children: React.ReactNode;
  selectedCorpus: CorpusType | null | undefined;
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];
  isLoading: boolean;
}

export function CorpusProvider({
  children,
  selectedCorpus,
  spanLabels: initialSpanLabels,
  humanSpanLabels: initialHumanSpanLabels,
  relationLabels: initialRelationLabels,
  docTypeLabels: initialDocTypeLabels,
  isLoading,
}: CorpusProviderProps) {
  // Add state management for labels
  const [spanLabels, setSpanLabels] = useState(initialSpanLabels);
  const [humanSpanLabels, setHumanSpanLabels] = useState(
    initialHumanSpanLabels
  );
  const [relationLabels, setRelationLabels] = useState(initialRelationLabels);
  const [docTypeLabels, setDocTypeLabels] = useState(initialDocTypeLabels);

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
      spanLabels,
      humanSpanLabels,
      relationLabels,
      docTypeLabels,
      setSpanLabels,
      setHumanSpanLabels,
      setRelationLabels,
      setDocTypeLabels,
      isLoading,
      allowComments: selectedCorpus?.allowComments ?? true,
    }),
    [
      selectedCorpus,
      permissions,
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
