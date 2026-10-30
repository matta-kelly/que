import { test, expect, type Page } from "@playwright/test";
import { openApp } from "./helpers";

// A chat runs on que's server: a run is POST /threads/:id/runs, with AG-UI's
// RunAgentInput, and its answer streams back as AG-UI events over SSE.
// Needs a deployment whose agent has a skill or an op it can call. Each run
// is a call to the real model, as each @live test's is.

type Message = { id: string; role: string; content?: unknown };
type Run = { path: string; body: { messages: Message[] } };

const isRun = (path: string) => /^\/api\/threads\/[^/]+\/runs$/.test(path);
const threadOf = (run: Run) => run.path.split("/")[3];
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });

/** Each request the page sends to que's server, through the UI's proxy. */
function watchRequests(page: Page) {
  const all: { method: string; path: string; body: string }[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/"))
      all.push({ method: req.method(), path, body: req.postData() ?? "" });
  });
  return {
    /** What the page sent, for a failure's message. */
    said: () => all.map((r) => `${r.method} ${r.path}`).join(", "),
    /** The runs the page posted, in the order it posted them. */
    runs: (): Run[] =>
      all
        .filter((r) => r.method === "POST" && isRun(r.path))
        .map((r) => ({ path: r.path, body: JSON.parse(r.body) })),
  };
}

/**
 * The type of each AG-UI event the page reads from a run's stream: SSE bodies
 * are not seen by Playwright's network API, so the page's fetch tees them.
 */
async function watchEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __events: string[] };
    w.__events = [];
    const orig = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args);
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!/\/threads\/[^/]+\/runs(\?|$)/.test(url) || !res.body) return res;
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
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = frame.match(/^data: ?(.*)$/m)?.[1];
            if (!data) continue;
            try {
              w.__events.push(String(JSON.parse(data).type));
            } catch {
              w.__events.push("?");
            }
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
  return () =>
    page.evaluate(() => (window as unknown as { __events: string[] }).__events);
}

type Requests = ReturnType<typeof watchRequests>;

/** Send a message: its run is posted to que's server, and ends with a reply and no error. */
async function send(page: Page, requests: Requests, text: string) {
  const before = await replies(page).count();
  const posted = requests.runs().length;
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  await expect
    .poll(() => requests.runs().length, {
      message: `the page posted no run to que's server: ${requests.said()}`,
    })
    .toBe(posted + 1);
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(replies(page)).toHaveCount(before + 1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
}

/** The thread's messages, as que's server has them. */
async function messagesOf(page: Page, thread: string): Promise<Message[]> {
  const res = await page.request.get(`/api/threads/${thread}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { messages: Message[] }).messages;
}

const text = (message: Message) =>
  typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

test("chat: a message that needs a tool gets its answer streamed from que's server, with the tool call @live", async ({
  page,
}) => {
  const requests = watchRequests(page);
  const events = await watchEvents(page);
  await openApp(page);
  await send(
    page,
    requests,
    "Open one of your packages, and tell me its title. Read nothing else.",
  );

  // The run is que's: one POST /threads/:id/runs, whose last message is the user's.
  const [run] = requests.runs();
  expect(run.body.messages.at(-1)?.role).toBe("user");

  // The answer came as a stream: the tool's call and result, then the text in more than one part.
  const seen = await events();
  expect(seen).toContain("TOOL_CALL_START");
  expect(seen).toContain("TOOL_CALL_RESULT");
  expect(
    seen.filter((type) => type === "TEXT_MESSAGE_CONTENT").length,
  ).toBeGreaterThan(1);
  expect(seen.at(-1)).toBe("RUN_FINISHED");

  // The reply shows the tool call as a step, and an answer after it.
  const reply = replies(page).last();
  await expect(reply.locator('[data-slot="marker"]').first()).toBeVisible();
  await expect(reply).not.toHaveText("");

  // The server has the same chat: the user's message, the tool round, and the answer.
  const kept = await messagesOf(page, threadOf(run));
  expect(kept.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "tool",
    "assistant",
  ]);
  expect(kept[0].id).toBe(run.body.messages.at(-1)?.id);
});

test("chat: Refresh on a reply runs its turn again from the message before it @live", async ({
  page,
}) => {
  const requests = watchRequests(page);
  await openApp(page);
  await send(page, requests, "Reply with one random word.");
  const thread = threadOf(requests.runs()[0]);
  const [asked, answered] = await messagesOf(page, thread);

  const reply = replies(page).last();
  await reply.hover();
  await reply.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => requests.runs().length).toBe(2);
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });

  // The run again is on the same thread, and ends at the same message of the user's.
  const again = requests.runs()[1];
  expect(threadOf(again)).toBe(thread);
  expect(again.body.messages.map((m) => m.id)).toEqual([asked.id]);

  // The chat has one reply, a new one, in the place of the old.
  await expect(replies(page)).toHaveCount(1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  const kept = await messagesOf(page, thread);
  expect(kept.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(kept[0].id).toBe(asked.id);
  expect(kept[1].id).not.toBe(answered.id);
});

test("chat: an edit of a sent message runs on from it, and the turns after it are gone @live", async ({
  page,
}) => {
  const requests = watchRequests(page);
  await openApp(page);
  await send(page, requests, "Say only: first");
  await send(page, requests, "Say only: second");
  const thread = threadOf(requests.runs()[0]);

  const sent = page.locator('[data-role="user"]').first();
  await sent.hover();
  await sent.getByRole("button", { name: "Edit" }).click();
  const editor = page.locator(
    '[data-slot="aui_edit-composer-wrapper"] textarea',
  );
  await editor.fill("Say only: edited");
  await page.getByRole("button", { name: "Update" }).click();
  await expect.poll(() => requests.runs().length).toBe(3);
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });

  // The edit is of the first message, so its run sends it and nothing before it.
  const edit = requests.runs()[2];
  expect(threadOf(edit)).toBe(thread);
  expect(edit.body.messages).toHaveLength(1);
  expect(text(edit.body.messages[0])).toContain("Say only: edited");

  // The chat goes on from the edit: one message of the user's, and one reply.
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(page.locator('[data-role="user"]')).toContainText("edited");
  await expect(replies(page)).toHaveCount(1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  const kept = await messagesOf(page, thread);
  expect(kept.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(text(kept[0])).toContain("Say only: edited");
});
