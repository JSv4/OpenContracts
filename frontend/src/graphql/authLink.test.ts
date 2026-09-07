import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  ApolloLink,
  Observable,
  execute,
  gql,
  FetchResult,
} from "@apollo/client";
import { authLink, registerAccessTokenProvider } from "./authLink";
import { authToken } from "./cache";
import { clearAuthSession, beginAuthSession } from "../utils/authSession";

const query = gql`
  query Test {
    noop
  }
`;
let unregister = () => {};
beforeEach(() => {
  clearAuthSession();
  beginAuthSession("old-token");
});
afterEach(() => unregister());
function request(
  ending: ApolloLink,
  context = {}
): Promise<FetchResult | undefined> {
  return new Promise((resolve, reject) =>
    execute(ApolloLink.from([authLink, ending]), { query, context }).subscribe({
      next: resolve,
      error: reject,
      complete: () => resolve(undefined),
    })
  );
}
function endpoint() {
  const headers = vi.fn();
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        headers(operation.getContext().headers);
        observer.next({ data: { noop: true } });
        observer.complete();
      })
  );
  return { headers, link };
}

describe("SDK access tokens on API requests", () => {
  it("asks the SDK to renew and updates the token used by other transports", async () => {
    const provider = vi.fn().mockResolvedValue("new-token");
    unregister = registerAccessTokenProvider(provider);
    const api = endpoint();
    await request(api.link);
    expect(provider).toHaveBeenCalledOnce();
    expect(api.headers).toHaveBeenCalledWith({
      Authorization: "Bearer new-token",
    });
    expect(authToken()).toBe("new-token");
  });
  it("allows concurrent requests that share an SDK token renewal", async () => {
    unregister = registerAccessTokenProvider(async () => "new-token");
    const api = endpoint();
    await Promise.all([request(api.link), request(api.link)]);
    expect(api.headers).toHaveBeenCalledTimes(2);
  });
  it("pins backend validation to the exact candidate credential", async () => {
    const provider = vi.fn();
    unregister = registerAccessTokenProvider(provider);
    const api = endpoint();
    await request(api.link, { sessionValidationToken: "old-token" });
    expect(provider).not.toHaveBeenCalled();
    expect(api.headers).toHaveBeenCalledWith({
      Authorization: "Bearer old-token",
    });
  });
  it("strips stale authorization headers from anonymous requests", async () => {
    clearAuthSession();
    const api = endpoint();
    await request(api.link, {
      headers: { authorization: "Bearer leaked", "X-Test": "kept" },
    });
    expect(api.headers).toHaveBeenCalledWith({ "X-Test": "kept" });
  });
  it("does not send a queued operation or restore a token after logout", async () => {
    let resolve: (value: string) => void = () => {};
    unregister = registerAccessTokenProvider(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const api = endpoint();
    const pending = request(api.link);
    clearAuthSession();
    resolve("late-token");
    await expect(pending).rejects.toThrow("Session changed");
    expect(api.headers).not.toHaveBeenCalled();
    expect(authToken()).toBe("");
  });
  it("drops responses from a previous login before Apollo can cache them", async () => {
    let deliver = () => {};
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const pending = request(
      new ApolloLink(
        () =>
          new Observable((observer) => {
            deliver = () => observer.next({ data: { noop: "private" } });
            markStarted();
          })
      )
    );
    await started;
    beginAuthSession("different-user-token");
    deliver();
    await expect(pending).rejects.toThrow("Session changed");
  });
  it("preserves credentials for transient SDK errors", async () => {
    unregister = registerAccessTokenProvider(async () => {
      throw new Error("Network unavailable");
    });
    await expect(request(endpoint().link)).rejects.toThrow(
      "Network unavailable"
    );
    expect(authToken()).toBe("old-token");
  });
  it("clears credentials for a revoked refresh token without retrying the operation", async () => {
    unregister = registerAccessTokenProvider(async () => {
      throw { error: "invalid_grant" };
    });
    const api = endpoint();
    await expect(request(api.link)).rejects.toMatchObject({
      error: "invalid_grant",
    });
    expect(authToken()).toBe("");
    expect(api.headers).not.toHaveBeenCalled();
  });
});
