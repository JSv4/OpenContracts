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
  // console.log("AppState", appState);
  history.push(
    appState && appState.returnTo ? appState.returnTo : window.location.pathname
  );
};

const { USE_AUTH0 } = process.env;

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

let api_root_url = process.env.REACT_APP_API_ROOT_URL;
if (process.env.NODE_ENV !== "production") {
  console.log("NOT PROD ENV");
  api_root_url = "http://localhost:8000/";
}

const httpLink = createHttpLink({
  uri: `${api_root_url}graphql/`,
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache,
});

if (USE_AUTH0) {
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
