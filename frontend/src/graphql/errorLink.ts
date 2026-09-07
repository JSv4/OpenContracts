import { onError } from "@apollo/client/link/error";
import { toast } from "react-toastify";
import { authToken } from "./cache";
import { clearAuthSession, getAuthSessionEpoch } from "../utils/authSession";
import { notifyTransientNetworkError } from "../utils/networkNotifications";

// Django also returns these JWT failures in a 200 GraphQL response, without
// extensions. Keep the fallback narrow: resource authorization is not logout.
export function isAuthenticationError(error: {
  message?: string;
  extensions?: Readonly<Record<string, unknown>>;
}): boolean {
  const codes = [
    error.extensions?.code,
    error.extensions?.status,
    error.extensions?.statusCode,
  ].map(String);
  if (codes.includes("403") || codes.includes("FORBIDDEN")) return false;
  if (codes.includes("401") || codes.includes("UNAUTHENTICATED")) return true;
  return /^(signature has expired|signature verification failed|error decoding signature|invalid token|token expired|jwt expired|user is disabled|user is not authenticated|not authenticated)[.!]?$/i.test(
    error.message ?? ""
  );
}

/** Permission denials and outages preserve credentials. Never reload on expiry. */
export const errorLink = onError(
  ({ graphQLErrors, networkError, operation }) => {
    const statusCode =
      networkError && "statusCode" in networkError
        ? networkError.statusCode
        : undefined;
    if (
      graphQLErrors?.some(isAuthenticationError) ||
      String(statusCode) === "401"
    ) {
      const requestToken = operation.getContext().authSessionToken;
      const requestEpoch = operation.getContext().authSessionEpoch;
      if (requestEpoch !== undefined && requestEpoch !== getAuthSessionEpoch())
        return;
      // A late failure for an old token must not sign out a newer session.
      if (authToken() && clearAuthSession(requestToken)) {
        toast.warning(
          "Your session has expired. Please log in again to access protected content.",
          {
            toastId: "auth-error",
            autoClose: 8000,
          }
        );
      }
      return;
    }
    for (const error of graphQLErrors ?? []) {
      console.error(`[GraphQL Error] ${error.message}`);
    }
    if (networkError) {
      if (String(statusCode) === "403") return;
      notifyTransientNetworkError(
        "Network error. Please check your connection and try again.",
        { toastId: "network-error" }
      );
    }
  }
);
