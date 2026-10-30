import { test, expect, type Locator, type Page } from "@playwright/test";
import { newChat, openApp, openChatWith } from "./helpers";

// A run of the chat outlives the page that started it. A chat opened while its
// reply goes after a reload shows its messages and the reply so far, joins the
// run on que's server (GET /threads/:id/join), and gets the rest of the reply
// live, once. After a switch to another chat and back, the page still holds
// the chat and the stream of its run, and the reply goes on over it. Each run
// is a call to the real model, as each @live test's is.

const LONG =
  "Write the numbers from 1 to 3000, one per line, as digits. No other text.";
const TOOL_THEN_LONG =
  "Open one of your packages, and read nothing else. Then write the numbers from 1 to 3000, one per line, as digits, and no other text.";

const stopButton = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const reply = (page: Page) => replies(page).last();

/** How many times each of 57, 777, 1234 and 2999 is in a reply's text. */
const onceEach = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? "";
  return [57, 777, 1234, 2999].map(
    (n) => (text.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length,
  );
};

const isRun = (path: string) => /^\/api\/threads\/[^/]+\/runs$/.test(path);
const isJoin = (path: string) => /^\/api\/threads\/[^/]+\/join$/.test(path);

/** Each request the page sends to que's server, through the UI's proxy, as method and path, in the order it sent them. */
function watchRequests(page: Page) {
  const sent: string[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/")) sent.push(`${req.method()} ${path}`);
  });
  const paths = (method: string, is: (path: string) => boolean) =>
    sent
      .filter((s) => s.startsWith(`${method} `))
      .map((s) => s.slice(method.length + 1))
      .filter(is);
  return {
    said: () => sent.join(", "),
    runs: () => paths("POST", isRun),
    joins: () => paths("GET", isJoin),
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
  await expect(reply(page)).toContainText(/\b12\b/, { timeout: 60_000 });
  await expect(stopButton(page)).toBeVisible();
}

const lengthOf = async (page: Page) =>
  ((await reply(page).textContent()) ?? "").length;

/**
 * The chat just opened has joined its run: at once it shows the reply so far
 * and that the reply goes, and then the reply grows, live.
 */
async function joined(page: Page) {
  await expect(reply(page)).toContainText(/\b12\b/, { timeout: 5_000 });
  await expect(stopButton(page)).toBeVisible({ timeout: 5_000 });
  const before = await lengthOf(page);
  await expect
    .poll(() => lengthOf(page), {
      message: "the reply did not grow after the chat was opened",
      timeout: 15_000,
    })
    .toBeGreaterThan(before);
  await expect(stopButton(page)).toBeVisible();
}

/** The reply ends, and the chat has the whole of it, with no part of it twice, as one reply. */
async function wholeOnce(page: Page) {
  await expect(sendButton(page)).toBeVisible({ timeout: 150_000 });
  await expect(replies(page)).toHaveCount(1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  // The text can come a moment after the run ends, so it is read until it holds each number once.
  await expect.poll(() => onceEach(reply(page))).toEqual([1, 1, 1, 1]);
}

test("survive: a reload while a reply goes shows the chat and the reply so far, joins its run, and the rest comes live, the whole reply one time @live", async ({
  page,
}) => {
  const requests = watchRequests(page);
  const asked = `${LONG} (${Date.now()})`;
  await openApp(page);
  const thread = await start(page, asked);
  await partWay(page);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChatWith(page, asked);

  // The chat joined its run on que's server, once, and the reload sent no run of its own.
  await expect
    .poll(() => requests.joins(), {
      message: `the page did not join the run: ${requests.said()}`,
    })
    .toEqual([`/api/threads/${thread}/join`]);
  await joined(page);
  await wholeOnce(page);
  expect(requests.runs()).toEqual([`/api/threads/${thread}/runs`]);
  expect(requests.joins()).toEqual([`/api/threads/${thread}/join`]);
});

test("survive: a switch to a new chat and back while a reply with a tool call goes shows the chat, and the reply goes on to the whole of it over its one run: the tool call shows, not waiting on the client @live", async ({
  page,
}) => {
  const requests = watchRequests(page);
  const asked = `${TOOL_THEN_LONG} (${Date.now()})`;
  const steps = (p: Page) => reply(p).locator('[data-slot="marker"]');
  await openApp(page);
  const thread = await start(page, asked);
  await expect(steps(page).first()).toBeVisible({ timeout: 60_000 });
  await partWay(page);

  await newChat(page);
  await expect(page.getByPlaceholder("Send a message...")).toBeEmpty();
  await expect(replies(page)).toHaveCount(0);
  await openChatWith(page, asked);

  // The tool call is in the chat. A chat that held it as waiting on the client would be idle, with Send and not
  // Stop, and its reply would not grow: joined() sees the run go on.
  await expect(steps(page).first()).toBeVisible();
  await joined(page);
  await wholeOnce(page);
  await expect(steps(page).first()).toBeVisible();
  // The page kept the chat's runtime and the stream of its run: the switch sent no run of its own, and no join.
  expect(requests.runs()).toEqual([`/api/threads/${thread}/runs`]);
  expect(requests.joins()).toEqual([]);
});
