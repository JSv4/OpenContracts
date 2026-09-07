import React, { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useApolloClient, useReactiveVar } from "@apollo/client";
import { toast } from "react-toastify";
import { authStatusVar, authInitCompleteVar } from "../../graphql/cache";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { loadLocalAuthSession } from "../../utils/localAuthSession";
import {
  clearAuthSession,
  beginAuthSession,
  getAuthSessionEpoch,
  isAuth0SessionError,
  registerAuthCleanup,
} from "../../utils/authSession";
import { useBackendSession } from "../../hooks/useBackendSession";
import { registerAccessTokenProvider } from "../../graphql/authLink";

interface AuthGateProps {
  children: React.ReactNode;
  useAuth0: boolean;
  audience?: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  children,
  useAuth0: enabled,
  audience,
}) => {
  const client = useApolloClient();
  const {
    isLoading,
    isAuthenticated,
    getAccessTokenSilently,
    logout,
    error: sdkError,
  } = useAuth0();
  const [credentialsReady, setCredentialsReady] = useState(false);
  const status = useReactiveVar(authStatusVar);
  const { error, retry } = useBackendSession(credentialsReady);

  useEffect(
    () =>
      registerAuthCleanup(async (reason) => {
        // State is already anonymous before either asynchronous cleanup starts.
        await Promise.all([
          client.clearStore(),
          ...(enabled && reason !== "logout"
            ? [logout({ openUrl: false })]
            : []),
        ]);
      }),
    [client, enabled, logout]
  );

  useEffect(() => {
    if (!enabled) return;
    return registerAccessTokenProvider(() =>
      getAccessTokenSilently({
        authorizationParams: {
          audience: audience || undefined,
          scope: "openid profile email",
        },
        timeoutInSeconds: 10,
      })
    );
  }, [enabled, getAccessTokenSilently, audience]);

  useEffect(() => {
    if (enabled && isLoading) return;
    let cancelled = false;
    const epoch = getAuthSessionEpoch();
    const isCurrent = () => !cancelled && epoch === getAuthSessionEpoch();
    setCredentialsReady(false);
    authInitCompleteVar(false);

    const initialize = async () => {
      try {
        // The SDK owns callback processing and session restoration. Waiting
        // for isLoading avoids the old parallel silent-login flow and latch.
        const token = enabled
          ? isAuthenticated && !sdkError
            ? await getAccessTokenSilently({
                authorizationParams: {
                  audience: audience || undefined,
                  scope: "openid profile email",
                },
                timeoutInSeconds: 10,
              })
            : ""
          : loadLocalAuthSession() || "";
        if (!isCurrent()) return;
        await client.clearStore();
        if (!isCurrent()) return;
        beginAuthSession(token);
        if (!token) authStatusVar("ANONYMOUS");
        if (sdkError)
          toast.error("Sign-in could not be completed. Please try again.", {
            toastId: "auth-sign-in",
          });
      } catch (error) {
        if (!isCurrent()) return;
        clearAuthSession();
        if (isAuth0SessionError(error)) {
          toast.info("Your session has expired. Please log in again.");
        } else {
          toast.error("Sign-in could not be completed. Please try again.", {
            toastId: "auth-sign-in",
          });
        }
      } finally {
        if (!cancelled) setCredentialsReady(true);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    enabled,
    isLoading,
    isAuthenticated,
    getAccessTokenSilently,
    audience,
    sdkError,
  ]);

  if (!credentialsReady || status === "LOADING") {
    return (
      <ModernLoadingDisplay
        type="auth"
        message="Initializing OpenContracts"
        size="large"
      />
    );
  }
  return (
    <>
      {error && (
        <div role="alert" style={{ padding: "2rem", textAlign: "center" }}>
          <p>
            We couldn’t verify your session. Check your connection and try
            again.
          </p>
          <button onClick={retry}>Retry</button>{" "}
          <button onClick={() => clearAuthSession()}>
            Continue signed out
          </button>
        </div>
      )}
      {(!error || status === "AUTHENTICATED") && children}
    </>
  );
};
