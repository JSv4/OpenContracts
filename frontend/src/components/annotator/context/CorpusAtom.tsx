import { atom, useAtom } from "jotai";
import { useMemo, useCallback } from "react";
import { CorpusType, AnnotationLabelType } from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";

/**
 * Represents the entire corpus state stored in a single atom.
 */
export interface CorpusState {
  selectedCorpus: CorpusType | null | undefined;
  myPermissions: PermissionTypes[];
  spanLabels: AnnotationLabelType[];
  humanSpanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];
  humanTokenLabels: AnnotationLabelType[];
  allowComments: boolean;
  isLoading: boolean;
}

export const corpusStateAtom = atom<CorpusState>({
  selectedCorpus: null,
  myPermissions: [],
  spanLabels: [],
  humanSpanLabels: [],
  relationLabels: [],
  docTypeLabels: [],
  humanTokenLabels: [],
  allowComments: true,
  isLoading: false,
});

/**
 * A hook that returns the entire corpus state, plus methods to perform
 * batch updates and derived permission checks.
 */
export function useCorpusState() {
  const [corpusState, setCorpusState] = useAtom(corpusStateAtom);

  /**
   * Batch-update the corpus state to avoid multiple, separate set calls.
   *
   * @param partial partial object to merge into the CorpusState
   */
  function setCorpus(partial: Partial<CorpusState>) {
    console.log("[setCorpus] Setting corpus state with:", partial);
    setCorpusState((prev) => {
      const newState = { ...prev, ...partial };
      console.log("[setCorpus] New corpus state:", newState);
      return newState;
    });
  }

  /**
   * Helper to check for a given permission type in the corpus permissions.
   *
   * @param permission a specific PermissionTypes value to be checked
   * @returns boolean indicating if the user has the specified permission
   */
  const hasCorpusPermission = useCallback(
    (permission: PermissionTypes): boolean => {
      return corpusState.myPermissions?.includes(permission) || false;
    },
    [corpusState.myPermissions]
  );

  // Compute permission checks as derived state
  const canUpdateCorpus = hasCorpusPermission(PermissionTypes.CAN_UPDATE);
  const canDeleteCorpus = hasCorpusPermission(PermissionTypes.CAN_REMOVE);
  const canManageCorpus = hasCorpusPermission(PermissionTypes.CAN_PERMISSION);

  // Memoize for performance, so consumers don't re-render unnecessarily
  return useMemo(
    () => ({
      // State
      ...corpusState,

      // Batch set
      setCorpus,

      // Derived permission checks
      canUpdateCorpus,
      canDeleteCorpus,
      canManageCorpus,
      hasCorpusPermission,
    }),
    [corpusState, hasCorpusPermission] // Only depend on corpusState and the memoized function
  );
}
