declare global {
  interface Window {
    _env_: {
      REACT_APP_APPLICATION_DOMAIN: string;
      REACT_APP_APPLICATION_CLIENT_ID: string;
      REACT_APP_AUDIENCE: string;
      REACT_APP_API_ROOT_URL: string;
      REACT_APP_USE_AUTH0: string;
      REACT_APP_USE_ANALYZERS: string;
      REACT_APP_ALLOW_IMPORTS: string;
      [key: string]: string;
    };
  }
}

export {}; // This empty export is necessary to make this a module
