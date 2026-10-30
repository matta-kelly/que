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

async function send(page: Page, text: string) {
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
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
    if (
      await sent
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    )
      return;
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
