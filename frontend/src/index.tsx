import ReactDOM from "react-dom";
import { App } from "./App";
import { BrowserRouter } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";
import {
  ApolloClient,
  ApolloProvider,
  createHttpLink,
  ApolloLink,
} from "@apollo/client";
import { cache, authToken } from "./graphql/cache";
import { LooseObject } from "./components/types";

import "./index.css";
import reportWebVitals from "./reportWebVitals";
import history from "./utils/history";

// Please see https://auth0.github.io/auth0-react/interfaces/auth0_provider.auth0provideroptions.html
// for a full list of the available properties on the provider
const onRedirectCallback = (appState: any) => {
  history.push(
    appState && appState.returnTo ? appState.returnTo : window.location.pathname
  );
};

// const { REACT_APP_USE_AUTH0, REACT_APP_API_ROOT_URL: api_root_url } =
//   process.env;

const { REACT_APP_USE_AUTH0, REACT_APP_ROOT_URL } = process.env;

const api_root_url = REACT_APP_ROOT_URL
  ? REACT_APP_ROOT_URL
  : "http://localhost:8000";

console.log("OpenContracts is using Auth0: ", REACT_APP_USE_AUTH0);
console.log("OpenContracts frontend target api root", api_root_url);

const authLink = new ApolloLink((operation, forward) => {
  const token = authToken();
  operation.setContext(({ headers }: { headers: LooseObject }) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  }));
  return forward(operation);
});

console.log("api_root_url", api_root_url);
const httpLink = createHttpLink({
  uri: `${api_root_url}/graphql/`,
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache,
});

if (REACT_APP_USE_AUTH0 === "true") {
  console.log("Rendering with USE_AUTH0");

  const providerConfig = {
    domain: "dev-7ranai11.auth0.com",
    clientId: "318GitavTaWR7d17h4DKuoCme9VgjYDG",
    audience: "https://opensource.legal/contracts",
    redirectUri: window.location.origin,
    scope: "application:login",
    onRedirectCallback,
  };

  ReactDOM.render(
    <Auth0Provider {...providerConfig}>
      <ApolloProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApolloProvider>
    </Auth0Provider>,
    document.getElementById("root")
  );
} else {
  console.log("Rendering with NO AUTH0");

  ReactDOM.render(
    <ApolloProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApolloProvider>,
    document.getElementById("root")
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
