import { atom, useAtom } from "jotai";
import { useEffect } from "react";
import { CorpusType, AnnotationLabelType } from "../../../types/graphql-api";
import { getPermissions } from "../../../utils/transform";
import { PermissionTypes } from "../../types";

// Atoms for core corpus data
export const selectedCorpusAtom = atom<CorpusType | null | undefined>(null);

// Atoms for permissions
export const permissionsAtom = atom<PermissionTypes[]>([]);
export const canUpdateCorpusAtom = atom((get) =>
  get(permissionsAtom).includes(PermissionTypes.CAN_UPDATE)
);
export const canDeleteCorpusAtom = atom((get) =>
  get(permissionsAtom).includes(PermissionTypes.CAN_REMOVE)
);
export const canManageCorpusAtom = atom((get) =>
  get(permissionsAtom).includes(PermissionTypes.CAN_PERMISSION)
);
export const hasCorpusPermissionAtom = atom(
  (get) => (permission: PermissionTypes) =>
    get(permissionsAtom).includes(permission)
);

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

// Custom hooks to use atoms
export function useSelectedCorpus() {
  const [selectedCorpus] = useAtom(selectedCorpusAtom);
  return selectedCorpus;
}

export function usePermissions() {
  const [permissions] = useAtom(permissionsAtom);
  return permissions;
}

export function useCanUpdateCorpus() {
  const [canUpdate] = useAtom(canUpdateCorpusAtom);
  return canUpdate;
}

export function useCanDeleteCorpus() {
  const [canDelete] = useAtom(canDeleteCorpusAtom);
  return canDelete;
}

export function useCanManageCorpus() {
  const [canManage] = useAtom(canManageCorpusAtom);
  return canManage;
}

export function useHasCorpusPermission() {
  const [hasPermission] = useAtom(hasCorpusPermissionAtom);
  return hasPermission;
}

export function useSpanLabels() {
  const [spanLabels, setSpanLabels] = useAtom(spanLabelsAtom);
  return { spanLabels, setSpanLabels };
}

export function useHumanSpanLabels() {
  const [humanSpanLabels, setHumanSpanLabels] = useAtom(humanSpanLabelsAtom);
  return { humanSpanLabels, setHumanSpanLabels };
}

export function useRelationLabels() {
  const [relationLabels, setRelationLabels] = useAtom(relationLabelsAtom);
  return { relationLabels, setRelationLabels };
}

export function useDocTypeLabels() {
  const [docTypeLabels, setDocTypeLabels] = useAtom(docTypeLabelsAtom);
  return { docTypeLabels, setDocTypeLabels };
}

export function useAllowComments() {
  const [allowComments] = useAtom(allowCommentsAtom);
  return allowComments;
}

export function useIsLoading() {
  const [isLoading] = useAtom(isLoadingAtom);
  return isLoading;
}

export function useHumanTokenLabels() {
  const [humanTokenLabels, setHumanTokenLabels] = useAtom(humanTokenLabelsAtom);
  return { humanTokenLabels, setHumanTokenLabels };
}
