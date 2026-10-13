import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Send a message in a new thread and expect the agent's reply on screen.
// Always prints a diagnostic report: requests to the LangGraph server, the
// stream events the browser actually received, and browser console output.
test("chat: a message gets a reply", async ({ page }) => {
  const consoleLog: string[] = [];
  const requests: string[] = [];
  page.on("console", (msg) => consoleLog.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLog.push(`[pageerror] ${err.message}`));
  page.on("requestfinished", async (req) => {
    if (!req.url().includes("/api/")) return;
    const res = await req.response();
    requests.push(
      `${req.method()} ${new URL(req.url()).pathname} → ${res?.status()}`,
    );
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/"))
      requests.push(
        `${req.method()} ${new URL(req.url()).pathname} → FAILED ${req.failure()?.errorText}`,
      );
  });

  // Tee every streaming response (runs/stream, stream/events) in the page so we can see which events
  // reach the browser (SSE bodies aren't visible to Playwright's network API).
  await page.addInitScript(() => {
    const w = window as unknown as { __events: string[] };
    w.__events = [];
    const orig = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args);
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!/\/stream(\/events)?(\?|$)/.test(url) || !res.body) return res;
      const [forPage, forUs] = res.body.tee();
      void (async () => {
        const reader = forUs.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = chunk.match(/^event: (.*)$/m)?.[1] ?? "?";
            const data = chunk.match(/^data: (.*)$/m)?.[1] ?? "";
            const inner = data.match(/"event":"([^"]+)"/)?.[1];
            w.__events.push(inner ? `${ev}:${inner}` : ev);
          }
        }
      })();
      return new Response(forPage, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    };
  });

  await openApp(page);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Reply with exactly: pineapple");
  await input.press("Enter");

  try {
    // The prompt itself contains "pineapple"; a second match is the reply.
    await expect
      .poll(() => page.getByText(/pineapple/i).count(), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2);
  } finally {
    const events = await page.evaluate(
      () => (window as unknown as { __events: string[] }).__events,
    );
    const counts = events.reduce<Record<string, number>>(
      (acc, e) => ({ ...acc, [e]: (acc[e] ?? 0) + 1 }),
      {},
    );
    const running = await page
      .getByRole("button", { name: "Send message" })
      .isDisabled()
      .catch(() => null);
    console.log(
      [
        "===== diagnostic report =====",
        "requests to /api:",
        ...requests.map((r) => "  " + r),
        `stream events received by browser (${events.length}):`,
        ...Object.entries(counts).map(([e, n]) => `  ${e} × ${n}`),
        `send button disabled (still running?): ${running}`,
        "browser console:",
        ...(consoleLog.length
          ? consoleLog.map((l) => "  " + l.slice(0, 300))
          : ["  (none)"]),
      ].join("\n"),
    );
  }
});

// Needs a deployment whose first agent takes the user's instructions, and no
// DEV_USER_INSTRUCTIONS.
test("chat: a reply follows the instructions saved in Account", async ({
  page,
}) => {
  await openApp(page);
  try {
    const saved = await page.request.patch("/api/que/me", {
      data: { instructions: "End every reply with the word KUMQUAT." },
    });
    expect(saved.ok()).toBe(true);

    const input = page.getByPlaceholder("Send a message...");
    await input.fill("Say hello.");
    await input.press("Enter");
    await expect(page.locator('[data-role="assistant"]').last()).toContainText(
      /kumquat/i,
      { timeout: 60_000 },
    );
  } finally {
    await page.request.patch("/api/que/me", { data: { instructions: "" } });
  }
});

test("chat: Refresh on a reply runs its turn again from the checkpoint before it", async ({
  page,
}) => {
  await openApp(page);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Reply with one random word.");
  await input.press("Enter");
  const send = page.getByRole("button", { name: "Send message" });
  await expect(send).toBeVisible({ timeout: 60_000 });

  const rerun = page.waitForRequest(
    (request) =>
      /\/runs\/stream/.test(request.url()) &&
      (request.postData() ?? "").includes('"checkpoint_id"'),
    { timeout: 30_000 },
  );
  const reply = page.locator('[data-role="assistant"]').last();
  await reply.hover();
  await reply.getByRole("button", { name: "Refresh" }).click();
  await rerun;
  await expect(send).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
});
