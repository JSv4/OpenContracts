import {
  authToken,
  authStatusVar,
  authInitCompleteVar,
  backendUserObj,
  userObj,
  cache,
  editingDocument,
  showUserSettingsModal,
} from "../graphql/cache";
import { clearLocalAuthSession } from "./localAuthSession";
import { makeVar } from "@apollo/client";

export const authSessionEpochVar = makeVar(0);
export const authSessionCleanupPendingVar = makeVar(false);
type ClearReason = "logout" | "invalid" | "identity-change";
const cleanupHandlers = new Set<(reason: ClearReason) => Promise<unknown>>();
let pendingCleanups = 0;
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
  resetAuthSession("", reason);
  clearLocalAuthSession();
  return true;
}

/** Silent SSO may renew credentials for a different account without logging out. */
export function replaceAuthSession(expectedToken: string): void {
  if (authToken() !== expectedToken) return;
  resetAuthSession(expectedToken, "identity-change");
}

function resetAuthSession(token: string, reason: ClearReason): void {
  // Close the routing gate before advancing the epoch or clearing the store.
  // Overlapping invalidations must all settle before requests can restart.
  authInitCompleteVar(false);
  authSessionCleanupPendingVar(true);
  pendingCleanups++;
  authSessionEpochVar(authSessionEpochVar() + 1);
  authToken(token);
  userObj(null);
  backendUserObj(null);
  authStatusVar(token ? "LOADING" : "ANONYMOUS");
  // Open account/edit dialogs live outside Apollo's cache. The route manager
  // observes the session epoch to clear and re-resolve route entities.
  editingDocument(null);
  showUserSettingsModal(false);
  cache.restore({});
  void Promise.allSettled(
    Array.from(cleanupHandlers, async (cleanup) => cleanup(reason))
  ).then((results) => {
    if (results.some((result) => result.status === "rejected")) {
      console.warn("Unable to finish clearing the authentication cache");
    }
    if (--pendingCleanups === 0) authSessionCleanupPendingVar(false);
  });
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
