import { test, expect, type Page } from "@playwright/test";
import { openApp, openChats } from "./helpers";

// Chats live on que's server: each is a thread of the signed-in user's, made
// by POST /threads, listed by GET /threads, and opened by GET /threads/:id.

type Thread = { id: string };

const items = (page: Page) =>
  page.locator('[data-slot="aui_thread-list-item"]');
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });

/** The threads the page made, as que's server answered each POST /threads. */
function watchMade(page: Page) {
  const made: { status: number; body: Promise<unknown> }[] = [];
  page.on("response", (res) => {
    const req = res.request();
    if (
      req.method() === "POST" &&
      new URL(res.url()).pathname === "/api/threads"
    )
      made.push({ status: res.status(), body: res.json().catch(() => null) });
  });
  return async () =>
    Promise.all(
      made.map(async ({ status, body }) => ({ status, body: await body })),
    );
}

/** The signed-in user's threads, as que's server lists them. */
async function listed(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/threads");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as Thread[]).map((t) => t.id);
}

const isRun = (path: string) => /^\/api\/threads\/[^/]+\/runs$/.test(path);

type Message = { role: string; content?: unknown };

/** The thread's messages, as que's server has them. */
async function messagesOf(page: Page, thread: string): Promise<Message[]> {
  const res = await page.request.get(`/api/threads/${thread}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { messages: Message[] }).messages;
}

/** The text of the thread's last message, when it is an answer of the assistant's. */
async function answerOf(page: Page, thread: string) {
  const last = (await messagesOf(page, thread)).at(-1);
  return last?.role === "assistant" && typeof last.content === "string"
    ? last.content
    : "";
}

/**
 * Send a message, and wait for its run to end: the run is posted to que's
 * server once its thread is made, and it ends with an answer on the server and
 * in the chat. The send button shows before that, as soon as the message is
 * sent. Hands back the thread and the answer.
 */
async function send(page: Page, text: string) {
  const posted = page.waitForRequest(
    (req) => req.method() === "POST" && isRun(new URL(req.url()).pathname),
  );
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  const thread = new URL((await posted).url()).pathname.split("/")[3];
  await expect
    .poll(() => answerOf(page, thread), { timeout: 60_000 })
    .not.toBe("");
  const answer = await answerOf(page, thread);
  await expect(page.locator('[data-role="assistant"]').last()).toContainText(
    answer,
  );
  await expect(sendButton(page)).toBeVisible();
  return { thread, answer };
}

async function newChat(page: Page) {
  await page.locator("header").click();
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "New chat", exact: true }).click();
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

test("threads: a new chat makes a thread of the user's on que's server, and the list shows the user's threads @live", async ({
  page,
}) => {
  const made = watchMade(page);
  await openApp(page);
  await send(page, "Say hi.");

  // The first message made one thread, with que's 201 and its id.
  const answers = await made();
  expect(answers.map((a) => a.status)).toEqual([201]);
  const { id } = answers[0].body as Thread;
  expect(typeof id).toBe("string");
  expect(await listed(page)).toContain(id);

  // After a reload, the list shows each of the user's threads, and no other.
  await page.reload();
  await openChats(page);
  await expect
    .poll(async () => (await items(page).count()) - (await listed(page)).length)
    .toBe(0);
});

test("threads: switching to a thread loads its messages @live", async ({
  page,
}) => {
  const stamp = Date.now();
  const alpha = `Say only: alpha ${stamp}`;
  const beta = `Say only: beta ${stamp}`;
  await openApp(page);
  await send(page, alpha);
  await newChat(page);
  await send(page, beta);

  // A reload lands on a new chat, so each chat is loaded from que's server.
  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  for (const [shown, other] of [
    [alpha, beta],
    [beta, alpha],
  ]) {
    await openChatWith(page, shown);
    await expect(page.locator('[data-role="user"]')).toHaveCount(1);
    await expect(page.locator('[data-role="user"]')).toContainText(shown);
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(1);
    await expect(page.locator('[data-role="assistant"]')).not.toHaveText("");
    await expect(page.getByText(other)).toHaveCount(0);
    await expect(sendButton(page)).toBeVisible();
  }
});

test("threads: a tool turn shows as one reply, live and after a reload @live", async ({
  page,
}) => {
  const asked = `Open one of your packages, and tell me its title. Read nothing else. (${Date.now()})`;
  const replies = page.locator('[data-role="assistant"]');
  const steps = replies.locator('[data-slot="marker"]');
  await openApp(page);

  // Live: the tool call and the answer after it are one reply.
  const { answer } = await send(page, asked);
  await expect(replies).toHaveCount(1);
  await expect(steps.first()).toBeVisible();
  await expect(replies.first()).toContainText(answer);
  const live = await steps.count();

  // After a reload, the chat loaded from que's server shows the same one reply.
  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChatWith(page, asked);
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(replies).toHaveCount(1);
  await expect(steps.first()).toBeVisible();
  await expect(replies.first()).toContainText(answer);
  expect(await steps.count()).toBe(live);
});

// F3: a chat's own changes (rename, archive, delete) come back on que's routes.
const F3 = {
  annotation: {
    type: "fixme",
    description: "F3: rename, archive and delete on que's routes",
  },
};

// A renamed chat keeps its title after a reload.
test.fixme(
  "threads: rename persists across reload @live",
  F3,
  async ({ page }) => {
    const title = `Renamed ${Date.now()}`;
    await openApp(page);
    const input = page.getByPlaceholder("Send a message...");
    await input.fill("Say hi.");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toBeVisible({
      timeout: 60_000,
    });

    await openChats(page);
    const items = page.locator('[data-slot="aui_thread-list-items"]');
    await items.getByRole("button", { name: "More options" }).first().click();
    await page.getByRole("menuitem", { name: /rename/i }).click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    // Shows right away (saved in the background), no gap while the server saves.
    await expect(items).toContainText(title, { timeout: 500 });
    // The chat page's header shows the current chat's title.
    await expect(page.locator('[data-slot="page-title"]')).toHaveText(title);

    await page.reload();
    await openChats(page);
    await expect(
      page.locator('[data-slot="aui_thread-list-items"]'),
    ).toContainText(title, { timeout: 15_000 });
  },
);

// Make a chat with a unique title: new chat (palette), send a message, rename.
async function createChat(page: Page, title: string) {
  await page.locator("header").click();
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "New chat", exact: true }).click();
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Say hi.");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  await openChats(page);
  const items = page.locator('[data-slot="aui_thread-list-items"]');
  await items.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("menuitem", { name: /rename/i }).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(items).toContainText(title);
}

for (const action of ["archive", "delete"] as const) {
  test.fixme(
    `chats: select several and ${action} them @live`,
    F3,
    async ({ page }) => {
      page.on("dialog", (d) => d.accept());
      const stamp = Date.now();
      const a = `Bulk ${action} A ${stamp}`;
      const b = `Bulk ${action} B ${stamp}`;
      await openApp(page);
      await createChat(page, a);
      await createChat(page, b);

      const items = page.locator('[data-slot="aui_thread-list-items"]');
      const row = (t: string) =>
        page.locator('[data-slot="aui_thread-list-item"]', { hasText: t });
      await row(a).hover();
      await row(a).getByRole("button", { name: "More options" }).click();
      await page.getByRole("menuitem", { name: "Select" }).click();
      await expect(page.getByText("1 selected")).toBeVisible();
      await row(b).getByRole("checkbox").click();
      await expect(page.getByText("2 selected")).toBeVisible();

      await page
        .getByRole("button", {
          name: action === "archive" ? "Archive selected" : "Delete selected",
        })
        .click();
      await expect(items).not.toContainText(a);
      await expect(items).not.toContainText(b);
      await expect(page.getByText(/selected$/)).toHaveCount(0);

      await page.reload();
      await openChats(page);
      await expect(items).not.toContainText(a);
      await expect(items).not.toContainText(b);
    },
  );
}

// "Chats", the collapsed-rail chats icon, and the Lotus and Luna brand all open
// a fresh chat on the chat page.
