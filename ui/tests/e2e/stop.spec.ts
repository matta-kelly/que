import { test, expect, type Locator, type Page } from "@playwright/test";
import { newChat, openApp, openChatWith } from "./helpers";

// A stop is a call of its own to que's server: Stop on a running reply is
// POST /threads/:id/stop, and the thread says it was stopped, also after a
// reload, until its next message has run. Continue on a stopped reply writes
// a new one from the same message. A chat that is left while its reply goes is
// not stopped. A message sent while a reply goes waits its turn. Each run is a call to the real model, as each @live
// test's is.

const LONG =
  "Write the numbers from 1 to 3000, one per line, as digits. No other text.";

const stopButton = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const mark = (page: Page) => page.locator('[data-slot="stopped-run"]');

/** How many times each of 57, 777, 1234 and 2999 is in a reply's text. */
const onceEach = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? "";
  return [57, 777, 1234, 2999].map(
    (n) => (text.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length,
  );
};

const isRun = (path: string) => /^\/api\/threads\/[^/]+\/runs$/.test(path);
const isStop = (path: string) => /^\/api\/threads\/[^/]+\/stop$/.test(path);

/** The paths of each POST the page sends to que's server, through the UI's proxy, in the order it sent them. */
function watchPosts(page: Page) {
  const posts: string[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST" && path.startsWith("/api/")) posts.push(path);
  });
  return {
    said: () => posts.join(", "),
    runs: () => posts.filter(isRun),
    stops: () => posts.filter(isStop),
  };
}

/** Send a message, and hand back the thread its run was posted on. */
async function start(page: Page, text: string) {
  const posted = page.waitForRequest(
    (req) => req.method() === "POST" && isRun(new URL(req.url()).pathname),
  );
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  return new URL((await posted).url()).pathname.split("/")[3];
}

/** The reply is on its way: some of it is in the chat, and the run is not done. */
async function partWay(page: Page) {
  await expect(stopButton(page)).toBeVisible();
  await expect(replies(page).last()).toContainText(/\b12\b/, {
    timeout: 60_000,
  });
  await expect(stopButton(page)).toBeVisible();
}

/** What que's server says of the thread: whether its run was stopped. */
async function stoppedOf(page: Page, thread: string) {
  const res = await page.request.get(`/api/threads/${thread}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { stopped?: unknown }).stopped;
}

test("stop: Stop on a running reply stops its run on que's server, the chat says Stopped, also after a reload, and the next message runs @live", async ({
  page,
}) => {
  const posts = watchPosts(page);
  const asked = `${LONG} (${Date.now()})`;
  await openApp(page);
  const thread = await start(page, asked);
  await partWay(page);

  await stopButton(page).click();
  // The stop is a call of its own, for the chat's thread.
  await expect
    .poll(() => posts.stops(), {
      message: `the page posted no stop to que's server: ${posts.said()}`,
    })
    .toEqual([`/api/threads/${thread}/stop`]);
  await expect(sendButton(page)).toBeVisible();
  await expect(mark(page)).toContainText("Stopped");
  expect(await stoppedOf(page, thread)).toBe(true);

  // After a reload, the chat loaded from que's server says it was stopped.
  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChatWith(page, asked);
  await expect(mark(page)).toContainText("Stopped");

  // The next message runs, and the chat is no longer stopped.
  const before = await replies(page).count();
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Say only: after");
  await input.press("Enter");
  await expect.poll(() => posts.runs().length).toBe(2);
  await expect(replies(page)).toHaveCount(before + 1, { timeout: 60_000 });
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  await expect(mark(page)).toHaveCount(0);
  expect(await stoppedOf(page, thread)).toBe(false);
  // One stop, the user's.
  expect(posts.stops()).toHaveLength(1);
});

test("stop: Escape in the composer while a reply goes stops its run on que's server, and the chat says Stopped @live", async ({
  page,
}) => {
  const posts = watchPosts(page);
  await openApp(page);
  const thread = await start(page, `${LONG} (${Date.now()})`);
  await partWay(page);

  // Escape cancels the run in the composer (assistant-ui's cancelOnEscape); it is a stop too.
  await page.getByPlaceholder("Send a message...").press("Escape");
  await expect
    .poll(() => posts.stops(), {
      message: `the page posted no stop to que's server: ${posts.said()}`,
    })
    .toEqual([`/api/threads/${thread}/stop`]);
  await expect(sendButton(page)).toBeVisible();
  await expect(mark(page)).toContainText("Stopped");
  expect(await stoppedOf(page, thread)).toBe(true);
});

test("stop: a chat left for a new chat while its reply goes is not stopped @live", async ({
  page,
}) => {
  const posts = watchPosts(page);
  await openApp(page);
  const thread = await start(page, `${LONG} (${Date.now()})`);
  await partWay(page);

  // The chat is left: its runtime is torn down, which cancels the run in the page.
  await newChat(page);
  await expect(page.getByPlaceholder("Send a message...")).toBeEmpty();
  await expect(replies(page)).toHaveCount(0);

  // It is not stopped on que's server: the page sent no stop, and the thread is not stopped.
  await page.waitForTimeout(2_000);
  expect(posts.stops()).toEqual([]);
  expect(await stoppedOf(page, thread)).toBe(false);
});

/** The reply ends, and has the whole of the numbers, with no part of them twice. */
async function wholeOnce(page: Page) {
  await expect(sendButton(page)).toBeVisible({ timeout: 180_000 });
  // The text can come a moment after the run ends, so it is read until it holds each number once.
  await expect.poll(() => onceEach(replies(page).last())).toEqual([1, 1, 1, 1]);
}

test("stop: Continue on a stopped reply writes a new reply in its place, from the same message of the user's, and the chat no longer says Stopped @live", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const posts = watchPosts(page);
  await openApp(page);
  const first = page.waitForRequest(
    (req) => req.method() === "POST" && isRun(new URL(req.url()).pathname),
  );
  const thread = await start(page, `${LONG} (${Date.now()})`);
  const asked = (
    (await first).postDataJSON() as { messages: { id: string }[] }
  ).messages.at(-1)?.id;
  await partWay(page);
  await stopButton(page).click();
  await expect(mark(page)).toContainText("Stopped");

  const again = page.waitForRequest(
    (req) => req.method() === "POST" && isRun(new URL(req.url()).pathname),
  );
  await mark(page).getByRole("button", { name: "Continue" }).click();
  // The run again is on the same thread, and ends at the same message of the user's.
  const body = (await again).postDataJSON() as { messages: { id: string }[] };
  expect(body.messages.map((m) => m.id)).toEqual([asked]);
  expect(posts.runs()).toEqual([
    `/api/threads/${thread}/runs`,
    `/api/threads/${thread}/runs`,
  ]);
  await expect(mark(page)).toHaveCount(0);
  await expect(stopButton(page)).toBeVisible({ timeout: 15_000 });

  // The new reply is the one in the chat, whole, and the stopped one is not above it.
  await wholeOnce(page);
  await expect(replies(page)).toHaveCount(1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  await expect(mark(page)).toHaveCount(0);
  expect(await stoppedOf(page, thread)).toBe(false);
});

test("stop: a message sent while a reply goes waits above the composer and can be taken back, and one left there is sent when the reply ends @live", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const posts = watchPosts(page);
  await openApp(page);
  const thread = await start(page, `${LONG} (${Date.now()})`);
  await partWay(page);

  const input = page.getByPlaceholder("Send a message...");
  const queue = page.locator('[data-slot="message-queue"]');
  await input.fill("Say only: taken back");
  await input.press("Enter");
  await expect(queue).toContainText("Say only: taken back");
  await queue.getByRole("button", { name: "Take back" }).click();
  await expect(queue).toHaveCount(0);

  await input.fill("Say only: after");
  await input.press("Enter");
  await expect(queue).toContainText("Say only: after");
  // It waits: no run of its own while the reply goes.
  expect(posts.runs()).toEqual([`/api/threads/${thread}/runs`]);

  // The reply ends whole, and then the message is sent, and answered.
  await expect(replies(page)).toHaveCount(2, { timeout: 180_000 });
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(queue).toHaveCount(0);
  expect(posts.runs()).toEqual([
    `/api/threads/${thread}/runs`,
    `/api/threads/${thread}/runs`,
  ]);
  const users = page.locator('[data-role="user"]');
  await expect(users).toHaveCount(2);
  await expect(users.last()).toContainText("Say only: after");
  await expect(page.getByText("Say only: taken back")).toHaveCount(0);
  await expect(replies(page).last()).toContainText("after");
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  // The text can come a moment after the run ends, so it is read until it holds each number once.
  await expect
    .poll(() => onceEach(replies(page).first()))
    .toEqual([1, 1, 1, 1]);
});
