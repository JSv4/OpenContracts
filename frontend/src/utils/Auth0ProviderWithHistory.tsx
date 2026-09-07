import {
  Auth0Provider,
  Auth0ProviderOptions,
  useAuth0,
} from "@auth0/auth0-react";
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { safeReturnTo } from "./authRedirect";

interface Props extends Omit<Auth0ProviderOptions, "onRedirectCallback"> {
  children: React.ReactNode;
}

function CallbackErrorCleanup() {
  const { error, isLoading } = useAuth0();
  const navigate = useNavigate();
  useEffect(() => {
    if (isLoading || !error) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("state") && (params.has("code") || params.has("error"))) {
      navigate(
        safeReturnTo(
          window.location.pathname +
            window.location.search +
            window.location.hash
        ),
        { replace: true }
      );
    }
  }, [error, isLoading, navigate]);
  return null;
}

export const Auth0ProviderWithHistory: React.FC<Props> = ({
  children,
  ...rest
}) => {
  const navigate = useNavigate();

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    navigate(safeReturnTo(appState?.returnTo ?? "/"), { replace: true });
  };

  return (
    <Auth0Provider
      {...(rest as Auth0ProviderOptions)}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="memory"
    >
      <CallbackErrorCleanup />
      {children}
    </Auth0Provider>
  );
};
