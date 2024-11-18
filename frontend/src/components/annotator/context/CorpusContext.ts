import { createContext, useContext } from "react";
import { CorpusType } from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";
import { getPermissions } from "../../../utils/transform";

interface CorpusContextType {
  selectedCorpus: CorpusType | null | undefined;
  permissions: PermissionTypes[];
  canUpdateCorpus: boolean;
  canDeleteCorpus: boolean;
  canManageCorpus: boolean;
  hasCorpusPermission: (permission: PermissionTypes) => boolean;
}

export const CorpusContext = createContext<CorpusContextType | null>(null);

export const useCorpusContext = () => {
  const context = useContext(CorpusContext);
  if (!context) {
    throw new Error("useCorpusContext must be used within a CorpusProvider");
  }
  return context;
};

export const createCorpusContextValue = (
  selectedCorpus: CorpusType | null | undefined
): CorpusContextType => {
  let permissions: PermissionTypes[] = [];
  let rawPermissions = selectedCorpus ? selectedCorpus.myPermissions : ["READ"];

  if (selectedCorpus && rawPermissions !== undefined) {
    permissions = getPermissions(rawPermissions);
  }

  return {
    selectedCorpus,
    permissions,
    canUpdateCorpus: permissions.includes(PermissionTypes.CAN_UPDATE),
    canDeleteCorpus: permissions.includes(PermissionTypes.CAN_REMOVE),
    canManageCorpus: permissions.includes(PermissionTypes.CAN_PERMISSION),
    hasCorpusPermission: (permission: PermissionTypes) =>
      permissions.includes(permission),
  };
};
