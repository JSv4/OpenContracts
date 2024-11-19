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
} from "../types/annotations";
import { GetDocumentAnnotationsAndRelationshipsOutput } from "../../../graphql/queries";
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

  // Label sets - now with processing functions
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];

  // Label processing functions
  processLabels: (
    data: GetDocumentAnnotationsAndRelationshipsOutput | null | undefined,
    documentType: string
  ) => void;
  processAnnotations: (
    data: GetDocumentAnnotationsAndRelationshipsOutput | null | undefined
  ) => {
    annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[];
    relationships: RelationGroup[];
  };

  // Corpus features
  allowComments: boolean;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

interface CorpusProviderProps {
  children: React.ReactNode;
  selectedCorpus: CorpusType | null | undefined;
  onLabelsProcessed?: (
    spanLabels: AnnotationLabelType[],
    humanLabels: AnnotationLabelType[],
    relationLabels: AnnotationLabelType[],
    docLabels: AnnotationLabelType[]
  ) => void;
  onAnnotationsProcessed?: (
    annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[],
    relationships: RelationGroup[]
  ) => void;
}

export function CorpusProvider({
  children,
  selectedCorpus,
  onLabelsProcessed,
  onAnnotationsProcessed,
}: CorpusProviderProps) {
  const [spanLabels, setSpanLabels] = useState<AnnotationLabelType[]>([]);
  const [humanSpanLabels, setHumanSpanLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [relationLabels, setRelationLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [docTypeLabels, setDocTypeLabels] = useState<AnnotationLabelType[]>([]);

  // Process permissions
  const permissions = useMemo(() => {
    const rawPermissions = selectedCorpus?.myPermissions ?? ["READ"];
    return getPermissions(rawPermissions);
  }, [selectedCorpus?.myPermissions]);

  const processLabels = useCallback(
    (
      data: GetDocumentAnnotationsAndRelationshipsOutput | null | undefined,
      documentType: string
    ) => {
      if (!data?.corpus?.labelSet?.allAnnotationLabels) return;

      const allLabels = data.corpus.labelSet.allAnnotationLabels;

      // Filter labels based on document type
      const relevantLabelType =
        documentType === "application/pdf"
          ? LabelType.TokenLabel
          : LabelType.SpanLabel;

      const relevantLabels = allLabels.filter(
        (label) => label.labelType === relevantLabelType
      );

      // Set span and human span labels
      setSpanLabels(relevantLabels);
      setHumanSpanLabels(relevantLabels);

      // Filter and set relation labels
      const newRelationLabels = allLabels.filter(
        (label) => label.labelType === LabelType.RelationshipLabel
      );
      setRelationLabels(newRelationLabels);

      // Filter and set document labels
      const newDocLabels = allLabels.filter(
        (label) => label.labelType === LabelType.DocTypeLabel
      );
      setDocTypeLabels(newDocLabels);

      // Notify parent if callback provided
      onLabelsProcessed?.(
        relevantLabels,
        relevantLabels,
        newRelationLabels,
        newDocLabels
      );
    },
    [onLabelsProcessed]
  );

  const processAnnotations = useCallback(
    (data: GetDocumentAnnotationsAndRelationshipsOutput | null | undefined) => {
      if (!data?.document) {
        return { annotations: [], relationships: [] };
      }

      // Process annotations
      const processedAnnotations =
        data.document.allAnnotations?.map((annotation) =>
          convertToServerAnnotation(annotation)
        ) ?? [];

      // Process relationships
      const processedRelationships =
        data.document.allRelationships?.map(
          (relationship) =>
            new RelationGroup(
              relationship.sourceAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.targetAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.relationshipLabel,
              relationship.id
            )
        ) ?? [];

      // Notify parent if callback provided
      onAnnotationsProcessed?.(processedAnnotations, processedRelationships);

      return {
        annotations: processedAnnotations,
        relationships: processedRelationships,
      };
    },
    [onAnnotationsProcessed]
  );

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
      processLabels,
      processAnnotations,
      allowComments: selectedCorpus?.allowComments ?? true,
    }),
    [
      selectedCorpus,
      permissions,
      spanLabels,
      humanSpanLabels,
      relationLabels,
      docTypeLabels,
      processLabels,
      processAnnotations,
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
