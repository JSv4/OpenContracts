import { atom, useAtom } from "jotai";
import React, { useMemo } from "react";
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

// Atoms for corpus features
export const allowCommentsAtom = atom<boolean>(true);

// Atom for loading state
export const isLoadingAtom = atom<boolean>(false);

// Provider component to initialize atoms
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
  spanLabels,
  humanSpanLabels,
  relationLabels,
  docTypeLabels,
  isLoading,
}: CorpusProviderProps) {
  const [, setSelectedCorpus] = useAtom(selectedCorpusAtom);
  const [, setPermissions] = useAtom(permissionsAtom);
  const [, setSpanLabels] = useAtom(spanLabelsAtom);
  const [, setHumanSpanLabels] = useAtom(humanSpanLabelsAtom);
  const [, setRelationLabels] = useAtom(relationLabelsAtom);
  const [, setDocTypeLabels] = useAtom(docTypeLabelsAtom);
  const [, setAllowComments] = useAtom(allowCommentsAtom);
  const [, setIsLoading] = useAtom(isLoadingAtom);

  // Initialize permissions
  useMemo(() => {
    setSelectedCorpus(selectedCorpus);
    const rawPermissions = selectedCorpus?.myPermissions ?? ["READ"];
    setPermissions(getPermissions(rawPermissions));
    setAllowComments(selectedCorpus?.allowComments ?? true);
  }, [selectedCorpus]);

  // Initialize label sets
  useMemo(() => {
    setSpanLabels(spanLabels);
  }, [spanLabels]);

  useMemo(() => {
    setHumanSpanLabels(humanSpanLabels);
  }, [humanSpanLabels]);

  useMemo(() => {
    setRelationLabels(relationLabels);
  }, [relationLabels]);

  useMemo(() => {
    setDocTypeLabels(docTypeLabels);
  }, [docTypeLabels]);

  // Initialize loading state
  useMemo(() => {
    setIsLoading(isLoading);
  }, [isLoading]);

  return <>{children}</>;
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
