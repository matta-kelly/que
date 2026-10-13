import { test, expect, type Page, type Request } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";

// A run of the chat outlives its connection. Each test makes a reply long
// enough to be cut part way, and reads the run on the server.

const LONG =
  "Write the numbers from 1 to 1500, one per line, as digits. No other text.";

const isRun = (req: Request) =>
  req.method() === "POST" && /\/threads\/[^/]+\/runs\/stream$/.test(req.url());
const stop = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });
const reply = (page: Page) => page.locator('[data-role="assistant"]').last();

/** Send a message, and hand back the thread of its run and what the run was sent. */
async function start(page: Page, text: string) {
  const request = page.waitForRequest(isRun);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  const req = await request;
  return {
    thread: req.url().match(/threads\/([^/]+)\/runs/)![1],
    body: req.postDataJSON() as Record<string, unknown>,
  };
}

/** The runs of a thread, as the server has them. */
async function runsOf(page: Page, thread: string) {
  const res = await page.request.get(`/api/threads/${thread}/runs`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as { run_id: string; status: string }[];
}

const threadOf = async (page: Page, thread: string) =>
  (await (await page.request.get(`/api/threads/${thread}`)).json()) as {
    status: string;
  };

/** The reply is on its way: some of it is in the chat, and the run is not done. */
async function partWay(page: Page) {
  await expect(stop(page)).toBeVisible();
  await expect(reply(page)).toContainText(/\b12\b/, { timeout: 60_000 });
  await expect(stop(page)).toBeVisible();
}

/** The chat joins its run, and then has the whole reply, with no part of it twice. */
async function wholeOnce(page: Page) {
  // It shows as running first: the send button is there for a moment before the chat has looked.
  await expect(stop(page)).toBeVisible({ timeout: 15_000 });
  await expect(sendButton(page)).toBeVisible({ timeout: 110_000 });
  const text = (await reply(page).textContent())!;
  // Not the last one: the line under the reply comes right after it in the text.
  for (const n of [57, 777, 1234, 1499])
    expect(text.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).toHaveLength(1);
}

test("survive: a run is sent to go on when its stream ends", async ({
  page,
}) => {
  await openApp(page);
  const { body } = await start(page, "Say hi in one word.");
  expect(body.stream_resumable).toBe(true);
  expect(body.on_disconnect).toBe("continue");
  // And with what a run was sent before.
  expect(body.assistant_id).toBe("agent");
  expect(body.stream_mode).toEqual(["messages", "updates", "custom"]);
  expect(body.input).toMatchObject({ messages: [{ type: "human" }] });
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
});

test("survive: stop cancels the run on the server, and the chat goes on", async ({
  page,
}) => {
  await openApp(page);
  const { thread } = await start(page, LONG);
  await partWay(page);
  await stop(page).click();
  await expect(sendButton(page)).toBeVisible();

  // The run is stopped by a call, and the thread can be used: `interrupted`, and no error state.
  await expect
    .poll(async () => (await runsOf(page, thread)).map((run) => run.status))
    .toEqual(["interrupted"]);
  expect((await threadOf(page, thread)).status).not.toBe("error");

  await start(page, "Say hi in one word.");
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  await expect(reply(page)).not.toBeEmpty();
  // The run that was stopped, and the one after it.
  expect((await runsOf(page, thread)).map((run) => run.status).sort()).toEqual([
    "interrupted",
    "success",
  ]);
});

test("survive: a reload in the middle of a run, and the chat has the whole reply one time", async ({
  page,
}) => {
  await openApp(page);
  const title = `Survive ${Date.now()}`;
  const { thread } = await start(page, LONG);
  await partWay(page);
  await nameNewestChat(page, title);
  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();

  // The reload did not end the run.
  expect(["pending", "running", "success"]).toContain(
    (await runsOf(page, thread))[0].status,
  );
  await openChat(page, title);
  await wholeOnce(page);
  const runs = await runsOf(page, thread);
  expect(runs).toHaveLength(1);
  expect(runs[0].status).toBe("success");
});

test("survive: a look at another chat and back in the middle of a run", async ({
  page,
}) => {
  await openApp(page);
  const title = `Survive ${Date.now()}`;
  const { thread } = await start(page, LONG);
  await partWay(page);
  await nameNewestChat(page, title);

  // "Chats" in the sidebar opens a fresh chat.
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(page.locator('[data-slot="page-title"]')).toHaveText("New chat");
  await openChat(page, title);
  await wholeOnce(page);
  const runs = await runsOf(page, thread);
  expect(runs).toHaveLength(1);
  expect(runs[0].status).toBe("success");
});

test("survive: a chat opened after its run has ended makes no run", async ({
  page,
}) => {
  await openApp(page);
  const title = `Survive ${Date.now()}`;
  const { thread } = await start(page, "Say hi in one word.");
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
  await nameNewestChat(page, title);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  const streams: string[] = [];
  page.on("request", (req) => {
    if (/\/runs\/.*stream|\/runs\/stream/.test(req.url()))
      streams.push(req.url());
  });
  await openChat(page, title);
  await expect(reply(page)).not.toBeEmpty();
  await expect(sendButton(page)).toBeVisible();
  expect(streams).toEqual([]);
  expect(await runsOf(page, thread)).toHaveLength(1);
});
