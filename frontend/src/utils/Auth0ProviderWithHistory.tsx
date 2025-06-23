import { Auth0Provider, Auth0ProviderOptions } from "@auth0/auth0-react";
import React from "react";
import { useNavigate } from "react-router-dom";

interface Props extends Omit<Auth0ProviderOptions, "onRedirectCallback"> {
  children: React.ReactNode;
}

export const Auth0ProviderWithHistory: React.FC<Props> = ({
  children,
  ...rest
}) => {
  const navigate = useNavigate();

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    navigate(
      appState?.returnTo || window.location.pathname + window.location.search,
      {
        replace: true,
      }
    );
  };

  return (
    <Auth0Provider
      {...(rest as Auth0ProviderOptions)}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
    >
      {children}
    </Auth0Provider>
  );
};
