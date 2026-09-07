import React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "../../test-utils/renderHook";
import { useNavMenu } from "./useNavMenu";
import {
  authStatusVar,
  authToken,
  backendUserObj,
  userObj,
  editingDocument,
} from "../../graphql/cache";
import { UserType } from "../../types/graphql-api";
import { clearAuthSession } from "../../utils/authSession";
import {
  saveLocalAuthSession,
  loadLocalAuthSession,
} from "../../utils/localAuthSession";

const mocks = vi.hoisted(() => ({
  enabled: false,
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    ...mocks,
    isLoading: true,
    user: { name: "Stale SDK user" },
  }),
}));
vi.mock("../hooks/UseEnv", () => ({
  useEnv: () => ({ REACT_APP_USE_AUTH0: mocks.enabled }),
}));
vi.mock("react-toastify", () => ({ toast: { error: vi.fn() } }));
const user = { id: "1", username: "alice", isSuperuser: true } as UserType;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);
beforeEach(() => {
  vi.clearAllMocks();
  clearAuthSession();
  mocks.enabled = false;
  mocks.loginWithRedirect.mockResolvedValue(undefined);
  mocks.logout.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("navigation authentication", () => {
  it("keeps Login available when the SDK is disabled and identity is missing", () => {
    authStatusVar("AUTHENTICATED");
    const { result } = renderHook(useNavMenu, { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });
  it("ignores a stale Auth0 profile after backend revocation", () => {
    mocks.enabled = true;
    const { result } = renderHook(useNavMenu, { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isSuperuser).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
  it("uses the validated backend identity in both auth modes", () => {
    for (const enabled of [false, true]) {
      mocks.enabled = enabled;
      backendUserObj(user);
      authStatusVar("AUTHENTICATED");
      const { result, unmount } = renderHook(useNavMenu, { wrapper });
      expect(result.current.user).toEqual(user);
      expect(result.current.isSuperuser).toBe(true);
      unmount();
    }
  });
  it("clears identity, admin controls and persisted credentials on logout", () => {
    backendUserObj(user);
    userObj(user);
    authToken("jwt");
    authStatusVar("AUTHENTICATED");
    saveLocalAuthSession("jwt");
    editingDocument({ id: "private-document" } as NonNullable<
      ReturnType<typeof editingDocument>
    >);
    const { result } = renderHook(useNavMenu, { wrapper });
    act(() => result.current.requestLogout());
    expect(result.current.user).toBeNull();
    expect(result.current.isSuperuser).toBe(false);
    expect(backendUserObj()).toBeNull();
    expect(loadLocalAuthSession()).toBeNull();
    expect(editingDocument()).toBeNull();
  });
  it("starts a same-tab SDK redirect and allows retry after failure", async () => {
    mocks.enabled = true;
    mocks.loginWithRedirect.mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = renderHook(useNavMenu, { wrapper });
    await act(async () => result.current.doLogin());
    expect(result.current.isLoading).toBe(false);
    await act(async () => result.current.doLogin());
    expect(mocks.loginWithRedirect).toHaveBeenCalledTimes(2);
    expect(mocks.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: "/" },
    });
  });
  it("coalesces repeated login clicks while redirect preparation is pending", async () => {
    let complete = () => {};
    mocks.loginWithRedirect.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      })
    );
    const { result } = renderHook(useNavMenu, { wrapper });
    let pending: Promise<void>;
    act(() => {
      pending = result.current.doLogin();
      void result.current.doLogin();
    });
    expect(mocks.loginWithRedirect).toHaveBeenCalledOnce();
    await act(async () => {
      complete();
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
