import "fake-indexeddb/auto";
import axios, { AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentCacheManager } from "../documentCacheManager";
import {
  docxBytesCache,
  invalidateDocumentCacheSession,
} from "../documentCacheState";
import {
  beginAuthSession,
  clearAuthSession,
  authSessionCleanupPendingVar,
} from "../../utils/authSession";
import {
  getDocumentRawText,
  getPawlsLayer,
  getCachedPDFUrl,
  getDocxBytes,
} from "../../components/annotator/api/cachedRest";
import * as rest from "../../components/annotator/api/rest";

vi.mock("../../components/annotator/api/rest", () => ({
  getDocumentRawText: vi.fn(),
  getPawlsLayer: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("document cache isolation at authentication changes", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    clearAuthSession();
    await vi.waitFor(() => expect(authSessionCleanupPendingVar()).toBe(false));
    await documentCacheManager.clearCache();
  });

  it("clears stored content and DOCX bytes on logout/account replacement", async () => {
    beginAuthSession("synthetic-owner-token");
    await documentCacheManager.cacheText("private-doc", "OWNER_PRIVATE_TEXT");
    expect(await documentCacheManager.getCachedText("private-doc")).toBe(
      "OWNER_PRIVATE_TEXT"
    );
    docxBytesCache.set("private.docx", new Uint8Array([1, 2]));
    clearAuthSession(undefined, "logout");
    expect(docxBytesCache.size).toBe(0);
    expect(await documentCacheManager.getCachedText("private-doc")).toBeNull();
    await vi.waitFor(() => expect(authSessionCleanupPendingVar()).toBe(false));
    beginAuthSession("synthetic-stranger-token");
    expect(await documentCacheManager.getCachedText("private-doc")).toBeNull();
  });

  it("isolates old storage even when deletion fails", async () => {
    await documentCacheManager.cacheText("private-doc", "OWNER_PRIVATE_TEXT");
    // Changing the namespace is synchronous; safety never depends on IDB deletion.
    invalidateDocumentCacheSession();
    expect(await documentCacheManager.getCachedText("private-doc")).toBeNull();
  });

  it.each(["text", "pawls", "pdf", "docx"])(
    "rejects late %s responses after logout",
    async (format) => {
      const network = deferred<void>();
      let pending: Promise<unknown>;
      if (format === "text") {
        vi.mocked(rest.getDocumentRawText).mockReturnValueOnce(
          network.promise.then(() => "PRIVATE")
        );
        pending = getDocumentRawText("private.txt", "private-doc");
        await vi.waitFor(() =>
          expect(rest.getDocumentRawText).toHaveBeenCalled()
        );
      } else if (format === "pawls") {
        vi.mocked(rest.getPawlsLayer).mockReturnValueOnce(
          network.promise.then(() => [])
        );
        pending = getPawlsLayer("private.json", "private-doc");
        await vi.waitFor(() => expect(rest.getPawlsLayer).toHaveBeenCalled());
      } else {
        vi.spyOn(axios, "get").mockReturnValueOnce(
          network.promise.then(() => ({
            data: new Uint8Array([1, 2]).buffer,
            status: 200,
            statusText: "OK",
            headers: {},
            config: { headers: new AxiosHeaders() },
          }))
        );
        pending =
          format === "pdf"
            ? getCachedPDFUrl("private.pdf", "private-doc", "hash")
            : getDocxBytes("private.docx");
        await vi.waitFor(() => expect(axios.get).toHaveBeenCalled());
      }
      const rejected = expect(pending).rejects.toThrow(
        "Document session changed"
      );
      clearAuthSession(undefined, "logout");
      network.resolve();
      await rejected;
      expect(
        await documentCacheManager.getCachedText("private-doc")
      ).toBeNull();
      expect(docxBytesCache.size).toBe(0);
    }
  );
});
