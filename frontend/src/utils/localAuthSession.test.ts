import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalAuthSession,
  loadLocalAuthSession,
  saveLocalAuthSession,
  LOCAL_AUTH_SESSION_TTL_MS,
} from "./localAuthSession";

describe("local session candidates", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("survives refresh in the tab without persisting a profile or localStorage token", () => {
    saveLocalAuthSession("jwt");
    expect(loadLocalAuthSession()).toBe("jwt");
    expect(localStorage.length).toBe(0);
    expect(
      JSON.parse(sessionStorage.getItem("oc_local_auth_session")!)
    ).not.toHaveProperty("user");
  });
  it("expires without extending the deadline on load", () => {
    vi.useFakeTimers();
    saveLocalAuthSession("jwt");
    vi.advanceTimersByTime(LOCAL_AUTH_SESSION_TTL_MS - 1);
    expect(loadLocalAuthSession()).toBe("jwt");
    vi.advanceTimersByTime(1);
    expect(loadLocalAuthSession()).toBeNull();
  });
  it.each([
    "null",
    "{",
    "[]",
    '{"token":"jwt","expiresAt":"forever"}',
    '{"token":"jwt","api":"another-backend","expiresAt":9999999999999}',
  ])("rejects malformed or wrong-backend storage: %s", (raw) => {
    sessionStorage.setItem("oc_local_auth_session", raw);
    expect(loadLocalAuthSession()).toBeNull();
  });
  it("survives corrupt JSON even when cleanup throws", () => {
    sessionStorage.setItem("oc_local_auth_session", "{");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadLocalAuthSession()).toBeNull();
  });
  it("survives blocked storage getters and writes", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveLocalAuthSession("jwt")).not.toThrow();
    expect(loadLocalAuthSession()).toBeNull();
    expect(() => clearLocalAuthSession()).not.toThrow();
  });
  it("discards legacy persistent credentials and clears saved credentials on logout", () => {
    localStorage.setItem("oc_local_auth_session", '{"token":"old"}');
    expect(loadLocalAuthSession()).toBeNull();
    expect(localStorage.getItem("oc_local_auth_session")).toBeNull();
    saveLocalAuthSession("jwt");
    clearLocalAuthSession();
    expect(loadLocalAuthSession()).toBeNull();
  });
});
