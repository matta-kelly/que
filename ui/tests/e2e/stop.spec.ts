import { test, expect, type Page } from "@playwright/test";
import { openApp, openChats } from "./helpers";

// A stop is a call of its own to que's server: Stop on a running reply is
// POST /threads/:id/stop, and the thread says it was stopped, also after a
// reload, until its next message has run. A chat that is left while its reply
// goes is not stopped. Each run is a call to the real model, as each @live
// test's is.

const LONG =
  "Write the numbers from 1 to 3000, one per line, as digits. No other text.";

const items = (page: Page) =>
  page.locator('[data-slot="aui_thread-list-item"]');
const stopButton = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const mark = (page: Page) => page.locator('[data-slot="stopped-run"]');

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

/**
 * Open the chat whose first message is `text`. A chat has no title of its own
 * yet (F3), so each chat at the top of the list is opened until one is it.
 */
async function openChatWith(page: Page, text: string) {
  await openChats(page);
  const sent = page.locator('[data-role="user"]', { hasText: text });
  const count = Math.min(await items(page).count(), 10);
  for (let i = 0; i < count; i++) {
    await items(page)
      .nth(i)
      .locator('[data-slot="aui_thread-list-item-trigger"]')
      .click();
    // isVisible does not wait: the chat's messages load after the click.
    const loaded = await expect(sent.first())
      .toBeVisible({ timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (loaded) return;
  }
  throw new Error(`no chat near the top of the list holds "${text}"`);
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

test("stop: a chat left for a new chat while its reply goes is not stopped @live", async ({
  page,
}) => {
  const posts = watchPosts(page);
  await openApp(page);
  const thread = await start(page, `${LONG} (${Date.now()})`);
  await partWay(page);

  // The chat is left: its runtime is torn down, which cancels the run in the page.
  await page.locator("header").click();
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "New chat", exact: true }).click();
  await expect(page.getByPlaceholder("Send a message...")).toBeEmpty();
  await expect(replies(page)).toHaveCount(0);

  // It is not stopped on que's server: the page sent no stop, and the thread is not stopped.
  await page.waitForTimeout(2_000);
  expect(posts.stops()).toEqual([]);
  expect(await stoppedOf(page, thread)).toBe(false);
});
