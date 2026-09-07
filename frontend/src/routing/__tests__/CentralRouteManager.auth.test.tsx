import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  ApolloClient,
  ApolloProvider,
  ApolloLink,
  InMemoryCache,
  Observable,
} from "@apollo/client";
import { renderHook, cleanup, act, waitFor } from "../../test-utils/renderHook";
import { CentralRouteManager } from "../CentralRouteManager";
import {
  authStatusVar,
  authInitCompleteVar,
  openedCorpus,
} from "../../graphql/cache";
import { beginAuthSession, clearAuthSession } from "../../utils/authSession";
import { navigationCircuitBreaker } from "../../utils/navigationCircuitBreaker";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useNavigate: () => navigate,
}));
afterEach(cleanup);

describe("route identity changes", () => {
  it("clears the previous viewer's corpus and resolves the same URL again on logout", async () => {
    navigate.mockClear();
    navigationCircuitBreaker.reset();
    beginAuthSession("jwt");
    authStatusVar("AUTHENTICATED");
    authInitCompleteVar(true);
    let anonymous = false;
    const requested = vi.fn();
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        () =>
          new Observable((observer) => {
            requested();
            const timer = setTimeout(() => {
              observer.next({
                data: {
                  corpusBySlugs: anonymous
                    ? null
                    : {
                        id: "private",
                        slug: "private",
                        title: "Private corpus",
                        description: "",
                        isPublic: false,
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
                        creator: {
                          id: "alice",
                          slug: "alice",
                          username: "alice",
                          email: "alice@example.test",
                        },
                      },
                },
              });
              observer.complete();
            }, 10);
            return () => clearTimeout(timer);
          })
      ),
    });
    renderHook(() => null, {
      wrapper: () => (
        <ApolloProvider client={client}>
          <MemoryRouter initialEntries={["/c/alice/private"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </ApolloProvider>
      ),
    });
    await waitFor(() => expect(openedCorpus()?.id).toBe("private"));
    anonymous = true;
    await act(async () => {
      await client.clearStore();
      clearAuthSession();
    });
    expect(openedCorpus()).toBeNull();
    // AuthGate owns reopening the route gate after session cleanup. This
    // isolated route-manager test supplies that completion explicitly.
    act(() => authInitCompleteVar(true));
    await waitFor(() => expect(requested).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/404", { replace: true })
    );
    expect(openedCorpus()).toBeNull();
  });
});
