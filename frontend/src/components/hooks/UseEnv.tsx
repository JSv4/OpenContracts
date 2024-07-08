import { useMemo } from "react";

interface EnvConfig {
  REACT_APP_APPLICATION_DOMAIN: string;
  REACT_APP_APPLICATION_CLIENT_ID: string;
  REACT_APP_AUDIENCE: string;
  REACT_APP_API_ROOT_URL: string;
  REACT_APP_USE_AUTH0: boolean;
  REACT_APP_USE_ANALYZERS: boolean;
  REACT_APP_ALLOW_IMPORTS: boolean;
}

export const useEnv = (): EnvConfig => {
  return useMemo(
    () => ({
      REACT_APP_APPLICATION_DOMAIN:
        window._env_.REACT_APP_APPLICATION_DOMAIN || "",
      REACT_APP_APPLICATION_CLIENT_ID:
        window._env_.REACT_APP_APPLICATION_CLIENT_ID || "",
      REACT_APP_AUDIENCE:
        window._env_.REACT_APP_AUDIENCE || "http://localhost:3000",
      REACT_APP_API_ROOT_URL:
        window._env_.REACT_APP_API_ROOT_URL || "http://localhost:8000",
      REACT_APP_USE_AUTH0: window._env_.REACT_APP_USE_AUTH0 === "true",
      REACT_APP_USE_ANALYZERS: window._env_.REACT_APP_USE_ANALYZERS === "true",
      REACT_APP_ALLOW_IMPORTS: window._env_.REACT_APP_ALLOW_IMPORTS === "true",
    }),
    []
  );
};
