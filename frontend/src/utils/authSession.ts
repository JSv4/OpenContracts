import {
  authToken,
  authStatusVar,
  backendUserObj,
  userObj,
  cache,
  editingDocument,
  showUserSettingsModal,
} from "../graphql/cache";
import { clearLocalAuthSession } from "./localAuthSession";
import { makeVar } from "@apollo/client";

export const authSessionEpochVar = makeVar(0);
type ClearReason = "logout" | "invalid";
const cleanupHandlers = new Set<(reason: ClearReason) => Promise<unknown>>();
export const getAuthSessionEpoch = () => authSessionEpochVar();

/** A new login is distinct from the SDK renewing the same user's token. */
export function beginAuthSession(token: string): void {
  authSessionEpochVar(authSessionEpochVar() + 1);
  authToken(token);
}

export function registerAuthCleanup(
  handler: (reason: ClearReason) => Promise<unknown>
) {
  cleanupHandlers.add(handler);
  return () => {
    cleanupHandlers.delete(handler);
  };
}

/** Clear identity synchronously; late requests must not revive this session. */
export function clearAuthSession(
  expectedToken?: string,
  reason: ClearReason = "invalid"
): boolean {
  if (expectedToken !== undefined && authToken() !== expectedToken)
    return false;
  authSessionEpochVar(authSessionEpochVar() + 1);
  authToken("");
  userObj(null);
  backendUserObj(null);
  authStatusVar("ANONYMOUS");
  clearLocalAuthSession();
  // Open account/edit dialogs live outside Apollo's cache. The route manager
  // observes the session epoch to clear and re-resolve route entities.
  editingDocument(null);
  showUserSettingsModal(false);
  cache.restore({});
  for (const cleanup of cleanupHandlers) {
    void cleanup(reason).catch(() => {
      console.warn("Unable to finish clearing the authentication cache");
    });
  }
  return true;
}

export function isAuth0SessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { error: code, message } = error as {
    error?: string;
    message?: string;
  };
  return (
    [
      "login_required",
      "consent_required",
      "interaction_required",
      "invalid_grant",
      "missing_refresh_token",
    ].includes(code ?? "") ||
    /^(?:unknown or )?invalid refresh token|^missing refresh token|^login required/i.test(
      message ?? ""
    )
  );
}
