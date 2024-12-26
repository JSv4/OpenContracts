import { atom, useAtom } from "jotai";
import { useMemo } from "react";
import { CorpusType, AnnotationLabelType } from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";

/**
 * Represents the entire corpus state stored in a single atom.
 */
interface CorpusState {
  selectedCorpus: CorpusType | null | undefined;
  permissions: PermissionTypes[];
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
  permissions: [],
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
    setCorpusState((prev) => ({ ...prev, ...partial }));
  }

  // Compute permission checks as derived state
  const canUpdateCorpus = corpusState.permissions.includes(
    PermissionTypes.CAN_UPDATE
  );
  const canDeleteCorpus = corpusState.permissions.includes(
    PermissionTypes.CAN_REMOVE
  );
  const canManageCorpus = corpusState.permissions.includes(
    PermissionTypes.CAN_PERMISSION
  );

  /**
   * Helper to check for a given permission type in the corpus permissions.
   *
   * @param permission a specific PermissionTypes value to be checked
   */
  function hasCorpusPermission(permission: PermissionTypes): boolean {
    return corpusState.permissions.includes(permission);
  }

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
    [corpusState, canUpdateCorpus, canDeleteCorpus, canManageCorpus]
  );
}
