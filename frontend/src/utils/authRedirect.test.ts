import { describe, it, expect, afterEach, vi } from "vitest";
import { safeReturnTo, removeLegacyAuth0Cache } from "./authRedirect";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("Auth0 redirects", () => {
  it.each([
    undefined,
    {},
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "javascript:alert(1)",
  ])("rejects an unsafe target %s", (target) =>
    expect(safeReturnTo(target)).toBe("/")
  );
  it("preserves the application route, query, and hash", () => {
    expect(safeReturnTo("/d/alice/doc?view=notes#page-2")).toBe(
      "/d/alice/doc?view=notes#page-2"
    );
  });
  it("removes callback parameters", () => {
    expect(
      safeReturnTo(
        "/?code=secret&state=nonce&error=denied&error_description=details&view=list"
      )
    ).toBe("/?view=list");
  });
  it("removes only the current client's legacy SDK cache", () => {
    localStorage.setItem("@@auth0spajs@@::client::audience::scope", "token");
    localStorage.setItem("@@auth0spajs@@::another::audience::scope", "other");
    localStorage.setItem("oc_cookieAccepted", "true");
    removeLegacyAuth0Cache("client");
    expect(localStorage.length).toBe(2);
    expect(localStorage.getItem("oc_cookieAccepted")).toBe("true");
  });
  it("tolerates blocked storage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => removeLegacyAuth0Cache("client")).not.toThrow();
  });
});
