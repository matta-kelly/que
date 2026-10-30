import { test, expect, type Page, type Request } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";

// A run of the chat outlives its connection. Each test makes a reply long
// enough to be cut part way, and reads the run on the server.

const LONG =
  "Write the numbers from 1 to 3000, one per line, as digits. No other text.";

const isRun = (req: Request) =>
  req.method() === "POST" && /\/threads\/[^/]+\/runs\/stream$/.test(req.url());
const stop = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" });
const reply = (page: Page) => page.locator('[data-role="assistant"]').last();

// F2: stop and a reload while a run goes come back on que's server (F1's stop, F2's join).
const F2 = {
  annotation: {
    type: "fixme",
    description: "F2: stop and reload on que's server",
  },
};

/** Send a message, and hand back the thread of its run. */
async function start(page: Page, text: string) {
  const request = page.waitForRequest(isRun);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  const req = await request;
  return { thread: req.url().match(/threads\/([^/]+)\/runs/)![1] };
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
  await expect(sendButton(page)).toBeVisible({ timeout: 150_000 });
  const text = (await reply(page).textContent())!;
  // Not the last one: the line under the reply comes right after it in the text.
  for (const n of [57, 777, 1234, 2999])
    expect(text.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).toHaveLength(1);
}

test.fixme(
  "survive: stop cancels the run, the chat says so, Continue goes on, and a message sent in a run waits its turn @live",
  F2,
  async ({ page }) => {
    await openApp(page);
    const { thread } = await start(page, LONG);
    await partWay(page);

    // A message sent while the run is going waits above the composer, and can be taken back.
    const input = page.getByPlaceholder("Send a message...");
    const queue = page.locator('[data-slot="message-queue"]');
    await input.fill("Say only: taken back");
    await input.press("Enter");
    await expect(queue).toContainText("Say only: taken back");
    await queue.getByRole("button", { name: "Take back" }).click();
    await expect(queue).toHaveCount(0);

    await stop(page).click();
    await expect(sendButton(page)).toBeVisible();

    // The run is stopped by a call, and the thread can be used: `interrupted`, and no error state.
    await expect
      .poll(async () => (await runsOf(page, thread)).map((run) => run.status))
      .toEqual(["interrupted"]);
    expect((await threadOf(page, thread)).status).not.toBe("error");

    // The chat says the reply was stopped, and gives the way on.
    const mark = page.locator('[data-slot="stopped-run"]');
    await expect(mark).toContainText("Stopped");
    await mark.getByRole("button", { name: "Continue" }).click();
    await expect(mark).toHaveCount(0);
    // A message sent while that run is going is sent when it ends.
    await expect(stop(page)).toBeVisible({ timeout: 15_000 });
    await input.fill("Say only: after");
    await input.press("Enter");
    await expect(queue).toContainText("Say only: after");
    const replies = page.locator('[data-role="assistant"]');
    await expect(replies).toHaveCount(2, { timeout: 180_000 });
    await expect(sendButton(page)).toBeVisible({ timeout: 60_000 });
    await expect(queue).toHaveCount(0);
    await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
    await expect(page.locator('[data-role="user"]')).toHaveCount(2);
    // The reply was written again from the saved step, and the part that came in before the stop is not above it.
    const text = (await replies.first().textContent())!;
    for (const n of [57, 777, 1234, 2999])
      expect(text.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).toHaveLength(1);
    // The run that was stopped, the one that went on, and the one of the message that waited.
    expect(
      (await runsOf(page, thread)).map((run) => run.status).sort(),
    ).toEqual(["interrupted", "success", "success"]);
  },
);

test.fixme(
  "survive: a reload in the middle of a run, and the chat has the whole reply one time @live",
  F2,
  async ({ page }) => {
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
    // The chat says it is picking its run up.
    await expect(page.locator('[data-slot="connection-state"]')).toContainText(
      "Reconnecting",
      { timeout: 15_000 },
    );
    await wholeOnce(page);
    const runs = await runsOf(page, thread);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
  },
);
