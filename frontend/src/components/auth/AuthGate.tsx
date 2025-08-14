import React, { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useReactiveVar } from "@apollo/client";
import { Dimmer, Loader } from "semantic-ui-react";
import { authToken, authStatusVar, userObj } from "../../graphql/cache";
import { toast } from "react-toastify";

interface AuthGateProps {
  children: React.ReactNode;
  useAuth0: boolean;
  audience?: string;
}

/**
 * AuthGate ensures authentication is fully initialized before rendering children.
 * This prevents race conditions where components try to make authenticated requests
 * before the auth token is available.
 */
export const AuthGate: React.FC<AuthGateProps> = ({
  children,
  useAuth0: useAuth0Flag,
  audience,
}) => {
  const [authInitialized, setAuthInitialized] = useState(false);
  const authStatus = useReactiveVar(authStatusVar);

  // Auth0 hooks
  const {
    isLoading: auth0Loading,
    isAuthenticated,
    user,
    getAccessTokenSilently,
  } = useAuth0();

  // Handle Auth0 authentication
  useEffect(() => {
    if (!useAuth0Flag) {
      // Non-Auth0 mode: immediately mark as initialized
      if (authStatusVar() === "LOADING") {
        authStatusVar("ANONYMOUS");
      }
      setAuthInitialized(true);
      return;
    }

    // Auth0 mode
    if (auth0Loading) {
      console.log("[AuthGate] Auth0 is still loading...");
      return;
    }

    // Auth0 has finished loading
    if (isAuthenticated && user) {
      console.log("[AuthGate] User is authenticated, fetching access token...");

      getAccessTokenSilently({
        authorizationParams: {
          audience: audience || undefined,
          scope: "openid profile email",
        },
      })
        .then((token) => {
          if (token) {
            console.log("[AuthGate] Token obtained successfully");
            // Set token first, then user, then status - all synchronously
            authToken(token);
            userObj(user);
            authStatusVar("AUTHENTICATED");

            // Verify the token was set
            const verifyToken = authToken();
            console.log(
              "[AuthGate] Token verified:",
              verifyToken ? "Present" : "Missing"
            );

            setAuthInitialized(true);
          } else {
            console.error("[AuthGate] No token received from Auth0");
            authToken("");
            userObj(null);
            authStatusVar("ANONYMOUS");
            setAuthInitialized(true);
            toast.error("Unable to authenticate: no token received");
          }
        })
        .catch((error) => {
          console.error("[AuthGate] Error getting access token:", error);
          authToken("");
          userObj(null);
          authStatusVar("ANONYMOUS");
          setAuthInitialized(true);
          toast.error("Authentication failed: " + error.message);
        });
    } else {
      // Not authenticated
      console.log("[AuthGate] User is not authenticated");
      authToken("");
      userObj(null);
      authStatusVar("ANONYMOUS");
      setAuthInitialized(true);
    }
  }, [
    useAuth0Flag,
    auth0Loading,
    isAuthenticated,
    user,
    getAccessTokenSilently,
    audience,
  ]);

  // Show loading screen while auth is initializing
  if (!authInitialized || authStatus === "LOADING") {
    return (
      <Dimmer active inverted>
        <Loader size="large">Initializing...</Loader>
      </Dimmer>
    );
  }

  // Auth is ready, render children
  return <>{children}</>;
};
