import { atom, useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { CorpusType, AnnotationLabelType } from "../../../types/graphql-api";
import { getPermissions } from "../../../utils/transform";
import { PermissionTypes } from "../../types";

// Atoms for core corpus data
export const selectedCorpusAtom = atom<CorpusType | null | undefined>(null);

// Atoms for permissions
export const permissionsAtom = atom<PermissionTypes[]>([]);

// Atoms for label sets
export const spanLabelsAtom = atom<AnnotationLabelType[]>([]);
export const humanSpanLabelsAtom = atom<AnnotationLabelType[]>([]);
export const relationLabelsAtom = atom<AnnotationLabelType[]>([]);
export const docTypeLabelsAtom = atom<AnnotationLabelType[]>([]);
export const humanTokenLabelsAtom = atom<AnnotationLabelType[]>([]);

// Atoms for corpus features
export const allowCommentsAtom = atom<boolean>(true);

// Atom for loading state
export const isLoadingAtom = atom<boolean>(false);

// Custom hook to initialize corpus-related atoms
export function useInitializeCorpusAtoms(params: {
  selectedCorpus: CorpusType | null | undefined;
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  humanTokenLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];
  isLoading: boolean;
}) {
  const {
    selectedCorpus,
    spanLabels,
    humanSpanLabels,
    humanTokenLabels,
    relationLabels,
    docTypeLabels,
    isLoading,
  } = params;

  const [, setSelectedCorpus] = useAtom(selectedCorpusAtom);
  const [, setPermissions] = useAtom(permissionsAtom);
  const [, setSpanLabelsAtom] = useAtom(spanLabelsAtom);
  const [, setHumanSpanLabelsAtom] = useAtom(humanSpanLabelsAtom);
  const [, setRelationLabelsAtom] = useAtom(relationLabelsAtom);
  const [, setDocTypeLabelsAtom] = useAtom(docTypeLabelsAtom);
  const [, setAllowComments] = useAtom(allowCommentsAtom);
  const [, setIsLoadingAtom] = useAtom(isLoadingAtom);
  const [, setHumanTokenLabelsAtom] = useAtom(humanTokenLabelsAtom);

  useEffect(() => {
    // Update corpus and permissions
    setSelectedCorpus(selectedCorpus);
    const rawPermissions = selectedCorpus?.myPermissions ?? ["READ"];
    setPermissions(getPermissions(rawPermissions));
    setAllowComments(selectedCorpus?.allowComments ?? true);

    // Update label sets
    setSpanLabelsAtom(spanLabels);
    setHumanSpanLabelsAtom(humanSpanLabels);
    setRelationLabelsAtom(relationLabels);
    setDocTypeLabelsAtom(docTypeLabels);
    setHumanTokenLabelsAtom(humanTokenLabels);

    // Update loading state
    setIsLoadingAtom(isLoading);
  }, [
    selectedCorpus,
    spanLabels,
    humanSpanLabels,
    humanTokenLabels,
    relationLabels,
    docTypeLabels,
    isLoading,
  ]);
}

// Comprehensive hook for corpus state
export function useCorpusState() {
  const [selectedCorpus, setSelectedCorpus] = useAtom(selectedCorpusAtom);
  const [permissions, setPermissions] = useAtom(permissionsAtom);
  const [spanLabels, setSpanLabels] = useAtom(spanLabelsAtom);
  const [humanSpanLabels, setHumanSpanLabels] = useAtom(humanSpanLabelsAtom);
  const [relationLabels, setRelationLabels] = useAtom(relationLabelsAtom);
  const [docTypeLabels, setDocTypeLabels] = useAtom(docTypeLabelsAtom);
  const [humanTokenLabels, setHumanTokenLabels] = useAtom(humanTokenLabelsAtom);
  const [allowComments, setAllowComments] = useAtom(allowCommentsAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  // Initialize labels from corpus if available and labels are empty
  useEffect(() => {
    if (
      selectedCorpus?.labelSet?.allAnnotationLabels &&
      humanSpanLabels.length === 0 &&
      humanTokenLabels.length === 0
    ) {
      const allLabels = selectedCorpus.labelSet.allAnnotationLabels;
      const filteredTokenLabels = allLabels.filter(
        (label) => label.labelType === "TOKEN_LABEL"
      );
      const filteredSpanLabels = allLabels.filter(
        (label) => label.labelType === "SPAN_LABEL"
      );
      setHumanSpanLabels(filteredSpanLabels);
      setHumanTokenLabels(filteredTokenLabels);
    }
  }, [
    selectedCorpus?.labelSet?.allAnnotationLabels,
    humanSpanLabels.length,
    humanTokenLabels.length,
  ]);

  // Permission checks
  const canUpdateCorpus = permissions.includes(PermissionTypes.CAN_UPDATE);
  const canDeleteCorpus = permissions.includes(PermissionTypes.CAN_REMOVE);
  const canManageCorpus = permissions.includes(PermissionTypes.CAN_PERMISSION);
  const hasCorpusPermission = (permission: PermissionTypes) =>
    permissions.includes(permission);

  return useMemo(
    () => ({
      // Corpus
      selectedCorpus,
      setSelectedCorpus,

      // Permissions
      permissions,
      setPermissions,
      canUpdateCorpus,
      canDeleteCorpus,
      canManageCorpus,
      hasCorpusPermission,

      // Labels
      spanLabels,
      setSpanLabels,
      humanSpanLabels,
      setHumanSpanLabels,
      relationLabels,
      setRelationLabels,
      docTypeLabels,
      setDocTypeLabels,
      humanTokenLabels,
      setHumanTokenLabels,

      // Features
      allowComments,
      setAllowComments,

      // Loading state
      isLoading,
      setIsLoading,
    }),
    [
      selectedCorpus,
      permissions,
      spanLabels,
      humanSpanLabels,
      relationLabels,
      docTypeLabels,
      humanTokenLabels,
      allowComments,
      isLoading,
      canUpdateCorpus,
      canDeleteCorpus,
      canManageCorpus,
    ]
  );
}
