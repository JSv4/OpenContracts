// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { docxodusWasmPlugin } from "../../../tooling/docxodusWasm";

describe("WASM asset containment", () => {
  let directory: string;
  let middleware: Function;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "oc-wasm-security-"));
    const root = path.join(directory, "wasm");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(directory, "private.json"), "synthetic secret");
    fs.writeFileSync(path.join(root, "runtime.wasm"), "wasm asset");
    fs.writeFileSync(path.join(root, "runtimeconfig.bin"), "runtime config");
    fs.symlinkSync(
      path.join(directory, "private.json"),
      path.join(root, "link.json")
    );
    const plugin = docxodusWasmPlugin(root);
    (plugin.configureServer as Function)({
      middlewares: {
        use: (handler: Function) => {
          middleware = handler;
        },
      },
    });
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  function request(suffix: string) {
    const response = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware(
      { url: `/node_modules/docxodus/dist/wasm/${suffix}` },
      response,
      next
    );
    return { response, next };
  }
  it.each(["../private.json", "%2e%2e%2fprivate.json", "link.json", "%ZZ"])(
    "rejects %s",
    (suffix) => {
      const { response } = request(suffix);
      expect(response.writeHead).toHaveBeenCalledWith(403);
      expect(response.end).toHaveBeenCalledWith();
    }
  );
  it("never treats query-string traversal as a filesystem path", () => {
    const { response } = request("runtime.wasm?x/../../private.json");
    expect(response.end).toHaveBeenCalledWith(Buffer.from("wasm asset"));
  });
  it("serves the runtime configuration binary", () => {
    const { response } = request("runtimeconfig.bin");
    expect(response.end).toHaveBeenCalledWith(Buffer.from("runtime config"));
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/octet-stream"
    );
  });
  it("serves legitimate assets with query strings without wildcard CORS", () => {
    const { response, next } = request("runtime.wasm?v=1");
    expect(response.end).toHaveBeenCalledWith(Buffer.from("wasm asset"));
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/wasm"
    );
    expect(response.setHeader).not.toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "*"
    );
    expect(next).not.toHaveBeenCalled();
  });
});
