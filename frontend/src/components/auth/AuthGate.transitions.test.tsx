import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  ApolloClient,
  ApolloProvider,
  ApolloLink,
  InMemoryCache,
  Observable,
  gql,
} from "@apollo/client";
import { renderHook, act, cleanup, waitFor } from "../../test-utils/renderHook";
import { AuthGate } from "./AuthGate";
import UserSettingsModal from "../modals/UserSettingsModal";
import { CentralRouteManager } from "../../routing/CentralRouteManager";
import {
  authToken,
  authStatusVar,
  authInitCompleteVar,
  backendUserObj,
  userObj,
  openedCorpus,
  showUserSettingsModal,
} from "../../graphql/cache";
import { clearAuthSession, getAuthSessionEpoch } from "../../utils/authSession";
import { authLink } from "../../graphql/authLink";
import { navigationCircuitBreaker } from "../../utils/navigationCircuitBreaker";

const sdk = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  getAccessTokenSilently: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => sdk }));
vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("../widgets/ModernLoadingDisplay", () => ({
  ModernLoadingDisplay: () => <div>Initializing OpenContracts</div>,
}));
vi.mock("../badges/UserBadges", () => ({ UserBadges: () => null }));

const alice = {
  id: "alice",
  username: "alice",
  email: "alice@example.test",
  name: "Alice",
  isSuperuser: false,
};
const bob = { ...alice, id: "bob", username: "bob", name: "Bob" };
const publicCorpus = {
  id: "public",
  slug: "public",
  title: "Public corpus",
  description: "",
  isPublic: true,
  icon: null,
  isPersonal: false,
  allowComments: false,
  preferredEmbedder: null,
  preferredLlm: null,
  created: "2026-01-01T00:00:00Z",
  modified: "2026-01-01T00:00:00Z",
  license: null,
  licenseLink: null,
  myPermissions: ["read"],
  labelSet: null,
  documentCount: 1,
  annotationCount: 0,
  creator: { ...alice, slug: "alice" },
};
const privateQuery = gql`
  query PrivateData {
    privateData
  }
`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function setup() {
  let respond!: (user: typeof alice | null) => void;
  let reject!: () => void;
  const requested = vi.fn();
  const corpusRequested = vi.fn();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([
      authLink,
      new ApolloLink(
        (operation) =>
          new Observable((observer) => {
            if (operation.operationName === "GetMe") {
              requested(operation.getContext().headers?.Authorization);
              respond = (user) => {
                observer.next({ data: { me: user } });
                observer.complete();
              };
              reject = () => observer.error(new Error("Offline"));
            } else {
              corpusRequested(operation.getContext().headers?.Authorization);
              const timer = setTimeout(() => {
                observer.next({ data: { corpusBySlugs: publicCorpus } });
                observer.complete();
              }, 0);
              return () => clearTimeout(timer);
            }
          })
      ),
    ]),
  });
  renderHook(() => null, {
    wrapper: () => (
      <ApolloProvider client={client}>
        <MemoryRouter initialEntries={["/c/alice/public"]}>
          <CentralRouteManager />
          <Location />
          <AuthGate useAuth0>
            <div>Application</div>
            <UserSettingsModal />
          </AuthGate>
        </MemoryRouter>
      </ApolloProvider>
    ),
  });
  return {
    client,
    requested,
    corpusRequested,
    respond: (user: typeof alice | null) => act(() => respond(user)),
    reject: () => act(reject),
  };
}

async function signIn(app: ReturnType<typeof setup>) {
  await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(1));
  app.respond(alice);
  await waitFor(() => expect(openedCorpus()?.id).toBe("public"));
}

function resumeTab() {
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthSession();
  authStatusVar("LOADING");
  authInitCompleteVar(false);
  openedCorpus(null);
  navigationCircuitBreaker.reset();
  sdk.getAccessTokenSilently.mockResolvedValue("alice-token");
  sdk.logout.mockResolvedValue(undefined);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("background session transitions", () => {
  it("clears private cache and route state before accepting a different SSO account", async () => {
    const app = setup();
    await signIn(app);
    const epoch = getAuthSessionEpoch();
    app.client.writeQuery({
      query: privateQuery,
      data: { privateData: "Alice's private data" },
    });
    const pending = deferred();
    const clearStore = app.client.clearStore.bind(app.client);
    const clearing = vi
      .spyOn(app.client, "clearStore")
      .mockImplementationOnce(async () => {
        await pending.promise;
        return clearStore();
      });
    sdk.getAccessTokenSilently.mockResolvedValue("bob-token");
    resumeTab();
    await waitFor(() =>
      expect(app.requested).toHaveBeenLastCalledWith("Bearer bob-token")
    );
    app.respond(bob);
    await waitFor(() => expect(clearing).toHaveBeenCalledTimes(1));
    expect(getAuthSessionEpoch()).toBeGreaterThan(epoch);
    expect(authInitCompleteVar()).toBe(false);
    expect(backendUserObj()).toBeNull();
    expect(userObj()).toBeNull();
    expect(openedCorpus()).toBeNull();
    expect(screen.queryByText("Application")).not.toBeInTheDocument();
    await act(async () => pending.resolve());
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(3));
    app.respond(bob);
    await waitFor(() => expect(backendUserObj()?.id).toBe("bob"));
    expect(app.client.readQuery({ query: privateQuery })).toBeNull();
    expect(authToken()).toBe("bob-token");
    expect(sdk.logout).not.toHaveBeenCalled();
    await waitFor(() => expect(openedCorpus()?.id).toBe("public"));
    expect(app.corpusRequested).toHaveBeenLastCalledWith("Bearer bob-token");
  });

  it("preserves unsaved profile edits and the dirty flag after an unchanged visibility check", async () => {
    const app = setup();
    await signIn(app);
    const identity = backendUserObj();
    act(() => showUserSettingsModal(true));
    const name = screen.getByPlaceholderText("Display name");
    fireEvent.change(name, { target: { value: "Unsaved name" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    resumeTab();
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    await act(async () => app.respond({ ...alice }));
    expect(name).toHaveValue("Unsaved name");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(backendUserObj()).toBe(identity);
  });

  it("resolves a public corpus only after signed-out cleanup settles", async () => {
    const app = setup();
    await signIn(app);
    resumeTab();
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    app.reject();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    const pending = deferred();
    const clearStore = app.client.clearStore.bind(app.client);
    vi.spyOn(app.client, "clearStore").mockImplementationOnce(async () => {
      await pending.promise;
      return clearStore();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue signed out" })
    );
    await act(async () => {});
    expect(authInitCompleteVar()).toBe(false);
    expect(app.corpusRequested).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    await waitFor(() => expect(app.corpusRequested).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(openedCorpus()?.id).toBe("public"));
    expect(app.corpusRequested).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByTestId("location")).toHaveTextContent("/c/alice/public");
    expect(authInitCompleteVar()).toBe(true);
  });

  it("publishes changed profile fields for the same account without clearing its cache", async () => {
    const app = setup();
    await signIn(app);
    const epoch = getAuthSessionEpoch();
    const clearing = vi.spyOn(app.client, "clearStore");
    resumeTab();
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    app.respond({ ...alice, name: "Updated Alice" });
    await waitFor(() => expect(backendUserObj()?.name).toBe("Updated Alice"));
    expect(userObj()?.name).toBe("Updated Alice");
    expect(getAuthSessionEpoch()).toBe(epoch);
    expect(clearing).not.toHaveBeenCalled();
  });

  it("does not accept a replacement account if logout occurs during cleanup", async () => {
    const app = setup();
    await signIn(app);
    const pending = deferred();
    const clearStore = app.client.clearStore.bind(app.client);
    const clearing = vi
      .spyOn(app.client, "clearStore")
      .mockImplementationOnce(async () => {
        await pending.promise;
        return clearStore();
      });
    sdk.getAccessTokenSilently.mockResolvedValue("bob-token");
    resumeTab();
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    app.respond(bob);
    await waitFor(() => expect(clearing).toHaveBeenCalledTimes(1));
    await act(async () => {
      clearAuthSession();
    });
    expect(authInitCompleteVar()).toBe(false);
    expect(app.corpusRequested).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    await waitFor(() => expect(authInitCompleteVar()).toBe(true));
    expect(backendUserObj()).toBeNull();
    expect(authToken()).toBe("");
    expect(app.requested).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(openedCorpus()?.id).toBe("public"));
    expect(app.corpusRequested).toHaveBeenLastCalledWith(undefined);
  });

  it("waits for the cache clear even if SDK cleanup rejects first", async () => {
    const app = setup();
    await signIn(app);
    const pending = deferred();
    const clearStore = app.client.clearStore.bind(app.client);
    vi.spyOn(app.client, "clearStore").mockImplementationOnce(async () => {
      await pending.promise;
      return clearStore();
    });
    sdk.logout.mockRejectedValueOnce(new Error("SDK cleanup failed"));
    await act(async () => {
      clearAuthSession();
    });
    expect(authInitCompleteVar()).toBe(false);
    expect(app.corpusRequested).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    await waitFor(() => expect(openedCorpus()?.id).toBe("public"));
    expect(app.corpusRequested).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("location")).toHaveTextContent("/c/alice/public");
  });
});
