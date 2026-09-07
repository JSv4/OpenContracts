import { useCallback, useEffect, useState } from "react";
import { useApolloClient, useReactiveVar } from "@apollo/client";
import isEqual from "lodash/isEqual";
import {
  authToken,
  authStatusVar,
  authInitCompleteVar,
  backendUserObj,
  userObj,
} from "../graphql/cache";
import { GET_ME, GetMeOutputs } from "../graphql/queries";
import {
  clearAuthSession,
  replaceAuthSession,
  getAuthSessionEpoch,
  authSessionEpochVar,
  authSessionCleanupPendingVar,
  isAuth0SessionError,
} from "../utils/authSession";
import { getAccessTokenForRequest } from "../graphql/authLink";

export const SESSION_CHECK_TIMEOUT_MS = 15000;

/** Validate credentials against the unchanged backend, including 200/me:null. */
export function useBackendSession(credentialsReady: boolean) {
  const client = useApolloClient();
  const token = useReactiveVar(authToken);
  const epoch = useReactiveVar(authSessionEpochVar);
  const cleanupPending = useReactiveVar(authSessionCleanupPendingVar);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!credentialsReady || cleanupPending) return;
    setError(false);
    if (!token) {
      backendUserObj(null);
      userObj(null);
      authStatusVar("ANONYMOUS");
      authInitCompleteVar(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const isCurrent = () =>
      !cancelled && authToken() === token && getAuthSessionEpoch() === epoch;
    const previouslyValidated =
      authStatusVar() === "AUTHENTICATED" && Boolean(backendUserObj());
    // A background recheck must not unmount editors or discard unsaved work.
    if (!previouslyValidated) {
      authStatusVar("LOADING");
      authInitCompleteVar(false);
      backendUserObj(null);
      userObj(null);
    }

    const fail = () => {
      if (!isCurrent()) return;
      cancelled = true;
      controller.abort();
      if (!previouslyValidated) authStatusVar("ANONYMOUS");
      authInitCompleteVar(true);
      setError(true);
    };
    const timeout = window.setTimeout(fail, SESSION_CHECK_TIMEOUT_MS);
    const verify = async () => {
      // On tab resume, renew an expired Auth0 access token before asking the
      // backend to validate it. Local credentials pass through unchanged.
      const freshToken = await getAccessTokenForRequest();
      if (!isCurrent()) return;
      if (freshToken !== token) {
        authToken(freshToken);
        return; // The token change starts a check bound to the new credential.
      }
      const { data } = await client.query<GetMeOutputs>({
        query: GET_ME,
        fetchPolicy: "no-cache",
        // Pin this check to its credential, bypassing automatic token renewal.
        // Deduplication must not join a previous user's still-pending GET_ME.
        context: {
          sessionValidationToken: token,
          queryDeduplication: false,
          fetchOptions: { signal: controller.signal },
        },
      });
      if (!isCurrent()) return;
      if (data?.me === null) {
        clearAuthSession(token);
        return;
      } else if (data?.me?.id) {
        const currentUser = backendUserObj();
        if (currentUser && currentUser.id !== data.me.id) {
          // Invalidate the old viewer's requests, cache and route entities.
          // A new epoch validates this credential after cleanup has settled.
          replaceAuthSession(token);
          return;
        }
        // No-cache checks return new objects even for an unchanged profile.
        // Preserve references so open forms retain their unsaved edits.
        if (!isEqual(currentUser, data.me)) backendUserObj(data.me);
        if (!isEqual(userObj(), data.me)) userObj(data.me);
        authStatusVar("AUTHENTICATED");
      } else {
        fail();
      }
      authInitCompleteVar(true);
    };
    void verify()
      .catch((error) => {
        if (isCurrent() && isAuth0SessionError(error)) clearAuthSession(token);
        else fail();
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [client, token, epoch, credentialsReady, cleanupPending, attempt]);

  // Recheck revoked/deactivated sessions when returning to the application.
  useEffect(() => {
    if (!token || !credentialsReady) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, credentialsReady, retry]);

  return { error, retry };
}
