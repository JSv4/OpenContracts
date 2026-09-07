import { ApolloLink, Observable } from "@apollo/client";
import { authToken } from "./cache";
import {
  clearAuthSession,
  getAuthSessionEpoch,
  isAuth0SessionError,
} from "../utils/authSession";

let accessTokenProvider: (() => Promise<string>) | undefined;
export function registerAccessTokenProvider(provider: () => Promise<string>) {
  accessTokenProvider = provider;
  return () => {
    if (accessTokenProvider === provider) accessTokenProvider = undefined;
  };
}

/** The SDK decides whether its cached access token needs renewal. */
export function getAccessTokenForRequest(): Promise<string> {
  const token = authToken();
  return token && accessTokenProvider
    ? accessTokenProvider()
    : Promise.resolve(token);
}

/** Ask the SDK for a fresh token before requests; it owns expiry and renewal. */
export const authLink = new ApolloLink(
  (operation, forward) =>
    new Observable((observer) => {
      let cancelled = false;
      let subscription: { unsubscribe: () => void } | undefined;
      const epoch = getAuthSessionEpoch();
      const initialToken = authToken();
      const validationToken = operation.getContext().sessionValidationToken;
      const getToken = async () =>
        validationToken ?? (await getAccessTokenForRequest());
      void getToken()
        .then((token) => {
          if (cancelled) return;
          if (
            epoch !== getAuthSessionEpoch() ||
            (authToken() !== initialToken && authToken() !== token)
          ) {
            observer.error(
              new Error("Session changed before the request was sent")
            );
            return;
          }
          if (token !== initialToken) authToken(token);
          const headers = { ...operation.getContext().headers };
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === "authorization") delete headers[key];
          }
          if (token) headers.Authorization = `Bearer ${token}`;
          operation.setContext({
            headers,
            authSessionToken: token,
            authSessionEpoch: epoch,
          });
          subscription = forward(operation).subscribe({
            next: (result) => {
              if (epoch === getAuthSessionEpoch()) observer.next(result);
              else
                observer.error(
                  new Error("Session changed while the request was in progress")
                );
            },
            error: (error) => observer.error(error),
            complete: () => observer.complete(),
          });
        })
        .catch((error) => {
          if (cancelled) return;
          if (epoch === getAuthSessionEpoch() && isAuth0SessionError(error))
            clearAuthSession(initialToken);
          observer.error(error);
        });
      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    })
);
