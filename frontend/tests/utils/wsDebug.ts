import type { Page, WebSocket } from "@playwright/test";

/**
 * Attach verbose WebSocket logging to the given Playwright page.
 * Logs:
 *  - when any WS is opened
 *  - frames sent / received
 *  - socket errors
 */
export async function attachWsDebug(page: Page): Promise<void> {
  page.on("websocket", (ws: WebSocket) => {
    console.log("[WS-OPEN]", ws.url());
    ws.on("framesent", (data) => console.log("[WS ⇠]", ws.url(), data));
    ws.on("framereceived", (data) => console.log("[WS ⇢]", ws.url(), data));
    ws.on("socketerror", (err) => console.log("[WS-ERR]", ws.url(), err));
  });
}
