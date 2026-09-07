import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import {
  ApolloClient,
  ApolloProvider,
  ApolloLink,
  InMemoryCache,
  Observable,
} from "@apollo/client";
import { renderHook, act, cleanup, waitFor } from "../../test-utils/renderHook";
import { AuthGate } from "./AuthGate";
import {
  authToken,
  authStatusVar,
  userObj,
  backendUserObj,
  authInitCompleteVar,
} from "../../graphql/cache";
import {
  saveLocalAuthSession,
  loadLocalAuthSession,
} from "../../utils/localAuthSession";
import { clearAuthSession } from "../../utils/authSession";
import { authLink } from "../../graphql/authLink";
import { errorLink } from "../../graphql/errorLink";
import { SESSION_CHECK_TIMEOUT_MS } from "../../hooks/useBackendSession";
import { useAuthenticated } from "../../hooks/useAuthenticated";

const sdk = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  getAccessTokenSilently: vi.fn(),
  logout: vi.fn(),
  error: undefined as Error | undefined,
}));
vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => sdk }));
vi.mock("react-toastify", () => ({
  toast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("../widgets/ModernLoadingDisplay", () => ({
  ModernLoadingDisplay: () => <div>Initializing OpenContracts</div>,
}));

const me = {
  id: "1",
  username: "alice",
  email: "alice@example.test",
  name: "Alice",
  isSuperuser: false,
};
function Content() {
  const authenticated = useAuthenticated();
  return <div>{authenticated ? "Signed in" : "Public content"}</div>;
}
function setup(enabled = false, strict = false) {
  let respond: (value: typeof me | null) => void = () => {
    throw new Error("No request");
  };
  let reject: () => void = () => {
    throw new Error("No request");
  };
  const requested = vi.fn();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([
      errorLink,
      authLink,
      new ApolloLink(
        (operation) =>
          new Observable((observer) => {
            requested(operation.getContext().headers?.Authorization);
            respond = (user) => {
              observer.next({ data: { me: user } });
              observer.complete();
            };
            reject = () => observer.error(new Error("Offline"));
          })
      ),
    ]),
  });
  const element = () => (
    <ApolloProvider client={client}>
      <AuthGate useAuth0={enabled}>
        <Content />
      </AuthGate>
    </ApolloProvider>
  );
  const view = renderHook(() => null, {
    wrapper: () =>
      strict ? <React.StrictMode>{element()}</React.StrictMode> : element(),
  });
  return {
    requested,
    respond: (user: typeof me | null) => act(() => respond(user)),
    reject: () => act(reject),
    ...view,
    rerender: () => view.rerender(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthSession();
  sessionStorage.clear();
  authStatusVar("LOADING");
  authInitCompleteVar(false);
  sdk.isLoading = false;
  sdk.isAuthenticated = false;
  sdk.error = undefined;
  sdk.logout.mockResolvedValue(undefined);
  sdk.getAccessTokenSilently.mockResolvedValue("auth0-token");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AuthGate backend validation", () => {
  it("renders public content without touching the disabled SDK", async () => {
    sdk.isLoading = true;
    const app = setup();
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(app.requested).not.toHaveBeenCalled();
    expect(sdk.getAccessTokenSilently).not.toHaveBeenCalled();
  });
  it("validates restored credentials before showing signed-in controls", async () => {
    saveLocalAuthSession("local-jwt");
    const app = setup();
    await waitFor(() =>
      expect(app.requested).toHaveBeenCalledWith("Bearer local-jwt")
    );
    expect(screen.queryByText("Signed in")).not.toBeInTheDocument();
    expect(backendUserObj()).toBeNull();
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
    expect(userObj()).toEqual(me);
    expect(backendUserObj()).toEqual(me);
    expect(authInitCompleteVar()).toBe(true);
  });
  it("revokes a restored token when the backend returns 200/me:null", async () => {
    saveLocalAuthSession("revoked");
    const app = setup();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(null);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authToken()).toBe("");
    expect(loadLocalAuthSession()).toBeNull();
    expect(userObj()).toBeNull();
    expect(backendUserObj()).toBeNull();
  });
  it("keeps credentials on an outage and offers a working retry", async () => {
    saveLocalAuthSession("local-jwt");
    const app = setup();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.reject();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(authToken()).toBe("local-jwt");
    expect(authStatusVar()).toBe("ANONYMOUS");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
  });
  it("times out a hung identity check and allows sign-out", async () => {
    vi.useFakeTimers();
    saveLocalAuthSession("local-jwt");
    const app = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(app.requested).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue signed out" })
    );
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authToken()).toBe("");
  });
  it("does not restore identity from a response arriving after logout", async () => {
    saveLocalAuthSession("old-jwt");
    const app = setup();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    act(() => {
      clearAuthSession();
    });
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(backendUserObj()).toBeNull();
    expect(authToken()).toBe("");
  });
  it("survives corrupt storage with blocked cleanup", async () => {
    sessionStorage.setItem("oc_local_auth_session", "{");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup();
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authInitCompleteVar()).toBe(true);
  });
  it("keeps editors mounted during background checks and transient failures", async () => {
    saveLocalAuthSession("local-jwt");
    const app = setup();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
    const content = screen.getByText("Signed in");
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Signed in")).toBe(content);
    app.reject();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Signed in")).toBe(content);
    expect(authToken()).toBe("local-jwt");
  });

  it("revokes an active session when a background identity check returns null", async () => {
    saveLocalAuthSession("local-jwt");
    const app = setup();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(app.requested).toHaveBeenCalledTimes(2));
    app.respond(null);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authToken()).toBe("");
  });

  it("finishes initialization under StrictMode", async () => {
    saveLocalAuthSession("local-jwt");
    const app = setup(false, true);
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
  });
});

describe("Auth0 SDK coordination", () => {
  it("waits for SDK callback processing and uses backend identity without an SDK profile", async () => {
    sdk.isLoading = true;
    const app = setup(true);
    expect(screen.getByText("Initializing OpenContracts")).toBeInTheDocument();
    expect(sdk.getAccessTokenSilently).not.toHaveBeenCalled();
    sdk.isLoading = false;
    sdk.isAuthenticated = true;
    app.rerender();
    await waitFor(() =>
      expect(app.requested).toHaveBeenCalledWith("Bearer auth0-token")
    );
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
    expect(userObj()).toEqual(me);
  });
  it("handles the SDK becoming authenticated after an anonymous render without a latch", async () => {
    const app = setup(true);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    sdk.isAuthenticated = true;
    app.rerender();
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
  });
  it.each(["invalid_grant", "missing_refresh_token", "login_required"])(
    "recovers from %s through the SDK without auto-redirect",
    async (error) => {
      sdk.isAuthenticated = true;
      sdk.getAccessTokenSilently.mockRejectedValue({ error });
      setup(true);
      await waitFor(() =>
        expect(screen.getByText("Public content")).toBeInTheDocument()
      );
      expect(sdk.logout).toHaveBeenCalledWith({ openUrl: false });
      expect(authToken()).toBe("");
    }
  );
  it("renews an expired access token before the tab-resume identity check", async () => {
    sdk.isAuthenticated = true;
    const app = setup(true);
    await waitFor(() =>
      expect(app.requested).toHaveBeenCalledWith("Bearer auth0-token")
    );
    app.respond(me);
    await waitFor(() =>
      expect(screen.getByText("Signed in")).toBeInTheDocument()
    );
    sdk.getAccessTokenSilently.mockResolvedValue("renewed-token");
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() =>
      expect(app.requested).toHaveBeenLastCalledWith("Bearer renewed-token")
    );
    app.respond(me);
    await waitFor(() => expect(authToken()).toBe("renewed-token"));
    expect(sdk.logout).not.toHaveBeenCalled();
    expect(screen.getByText("Signed in")).toBeInTheDocument();
  });

  it("clears the SDK session when the backend rejects its token with me:null", async () => {
    sdk.isAuthenticated = true;
    const app = setup(true);
    await waitFor(() => expect(app.requested).toHaveBeenCalled());
    app.respond(null);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(sdk.logout).toHaveBeenCalledWith({ openUrl: false });
  });
  it("ignores a token acquired after logout", async () => {
    sdk.isAuthenticated = true;
    let resolve: (token: string) => void = () => {};
    sdk.getAccessTokenSilently.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      })
    );
    setup(true);
    act(() => {
      clearAuthSession();
    });
    await act(async () => resolve("late-token"));
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authToken()).toBe("");
  });
  it("offers sign-in after a callback error", async () => {
    sdk.error = new Error("Invalid state");
    setup(true);
    await waitFor(() =>
      expect(screen.getByText("Public content")).toBeInTheDocument()
    );
    expect(authStatusVar()).toBe("ANONYMOUS");
  });
});
