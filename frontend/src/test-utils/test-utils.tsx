import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { ApolloClient, ApolloProvider, InMemoryCache } from "@apollo/client";
import { MemoryRouter, MemoryRouterProps } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

// Create a mock Apollo Client for tests
export const createMockClient = () => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: "no-cache",
      },
      watchQuery: {
        fetchPolicy: "no-cache",
      },
    },
  });
};

// Mock Auth0 provider for tests
const MockAuth0Provider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const mockAuth0 = {
    isAuthenticated: false,
    isLoading: false,
    user: undefined,
    loginWithRedirect: async () => {},
    logout: () => {},
    getAccessTokenSilently: async () => "",
  };

  return (
    <Auth0Provider
      domain="test.auth0.com"
      clientId="test-client-id"
      authorizationParams={{
        redirect_uri: "http://localhost:3000",
      }}
    >
      {children}
    </Auth0Provider>
  );
};

interface AllProvidersProps {
  children: React.ReactNode;
  routerProps?: MemoryRouterProps;
  apolloClient?: ApolloClient<any>;
  includeAuth0?: boolean;
}

// All providers wrapper for tests
export const AllProviders: React.FC<AllProvidersProps> = ({
  children,
  routerProps = {},
  apolloClient,
  includeAuth0 = true,
}) => {
  const client = apolloClient || createMockClient();

  let content = (
    <ApolloProvider client={client}>
      <MemoryRouter {...routerProps}>{children}</MemoryRouter>
    </ApolloProvider>
  );

  if (includeAuth0) {
    content = <MockAuth0Provider>{content}</MockAuth0Provider>;
  }

  return content;
};

// Custom render method that includes all providers
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & {
    routerProps?: MemoryRouterProps;
    apolloClient?: ApolloClient<any>;
    includeAuth0?: boolean;
  }
) => {
  const { routerProps, apolloClient, includeAuth0, ...renderOptions } =
    options || {};

  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders
        routerProps={routerProps}
        apolloClient={apolloClient}
        includeAuth0={includeAuth0}
      >
        {children}
      </AllProviders>
    ),
    ...renderOptions,
  });
};

// Export everything from @testing-library/react
export * from "@testing-library/react";
