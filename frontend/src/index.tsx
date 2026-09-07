import { App } from "./App";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { Auth0ProviderWithHistory } from "./utils/Auth0ProviderWithHistory";
import {
  ApolloClient,
  ApolloProvider,
  createHttpLink,
  ApolloLink,
} from "@apollo/client";
import { cache } from "./graphql/cache";
import { authLink } from "./graphql/authLink";
import { errorLink } from "./graphql/errorLink";
import { removeLegacyAuth0Cache } from "./utils/authRedirect";
import { getRuntimeEnv } from "./utils/env";
import { HelmetProvider } from "react-helmet-async";
import { NetworkStatusHandler } from "./components/network";
import { allStyles } from "@os-legal/ui";

import "./index.css";
import reportWebVitals from "./reportWebVitals";

// Can't use useEnv hook here; use the pure utility instead
const {
  REACT_APP_APPLICATION_DOMAIN,
  REACT_APP_APPLICATION_CLIENT_ID,
  REACT_APP_AUDIENCE,
  REACT_APP_API_ROOT_URL,
  REACT_APP_USE_AUTH0,
} = getRuntimeEnv();

const api_root_url = REACT_APP_API_ROOT_URL || "http://localhost:8000";

console.log("OpenContracts is using Auth0: ", REACT_APP_USE_AUTH0);
console.log("OpenContracts frontend target api root", api_root_url);

console.log("api_root_url", api_root_url);
const httpLink = createHttpLink({
  uri: `${api_root_url}/graphql/`,
});

const client = new ApolloClient({
  link: ApolloLink.from([errorLink, authLink, httpLink]),
  cache,
});

// Inject OpenContracts UI component library styles
const styleElement = document.createElement("style");
styleElement.id = "opencontracts-ui-styles";
styleElement.textContent = allStyles;
document.head.appendChild(styleElement);

const container = document.getElementById("root");
const root = createRoot(container!);

if (REACT_APP_USE_AUTH0) {
  removeLegacyAuth0Cache(REACT_APP_APPLICATION_CLIENT_ID);

  const providerConfig = {
    domain: REACT_APP_APPLICATION_DOMAIN,
    clientId: REACT_APP_APPLICATION_CLIENT_ID,
    authorizationParams: {
      audience: REACT_APP_AUDIENCE || undefined,
      scope: "openid profile email",
      redirect_uri: window.location.origin,
    },
    // The SDK owns refresh-token rotation and in-memory storage. After a
    // reload it can restore SSO silently when browser cookie policy permits;
    // otherwise login remains available through a same-tab redirect.
    useRefreshTokens: true,
    useRefreshTokensFallback: true,
    authorizeTimeoutInSeconds: 10,
    httpTimeoutInSeconds: 10,
  };

  console.log("[index.tsx] Auth0 providerConfig:", providerConfig);
  console.log("[index.tsx] window.location.origin:", window.location.origin);

  root.render(
    <HelmetProvider>
      <BrowserRouter>
        <Auth0ProviderWithHistory {...providerConfig}>
          <ApolloProvider client={client}>
            <NetworkStatusHandler />
            <App />
          </ApolloProvider>
        </Auth0ProviderWithHistory>
      </BrowserRouter>
    </HelmetProvider>
  );
} else {
  console.log("Rendering with NO AUTH0");

  root.render(
    <HelmetProvider>
      <ApolloProvider client={client}>
        <NetworkStatusHandler />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApolloProvider>
    </HelmetProvider>
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
