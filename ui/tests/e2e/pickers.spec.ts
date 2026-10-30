import { test, expect, type Page, type Request } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";

// Needs a deployment that lists two agents and two models or more. The names
// are read from the server, so the tests hold for any such deployment.

type Price = { input: number; output: number; cachedInput?: number };
type Deployment = {
  agents: { name: string; model: string }[];
  models: { name: string; price: Price }[];
};

async function deploymentOf(page: Page): Promise<Deployment> {
  const res = await page.request.get("/api/que/deployment");
  expect(res.ok()).toBe(true);
  return res.json();
}

const agentPicker = (page: Page) => page.getByRole("button", { name: "Agent" });
const modelPicker = (page: Page) => page.getByRole("button", { name: "Model" });

// Send a message, and hand back the picks its thread's record on que's server
// holds once the run has given its reply: what the run went on. The run has to
// give a reply: a pick the server cannot run on is a failed test.
async function send(page: Page, text: string) {
  const replies = page.locator('[data-role="assistant"]');
  const before = await replies.count();
  const isRun = (req: Request) =>
    req.method() === "POST" &&
    /^\/api\/threads\/[^/]+\/runs$/.test(new URL(req.url()).pathname);
  const request = page.waitForRequest(isRun);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  const thread = new URL((await request).url()).pathname.split("/")[3];
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(replies).toHaveCount(before + 1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  await expect(replies.last()).not.toBeEmpty();
  const res = await page.request.get(`/api/threads/${thread}`);
  expect(res.ok()).toBe(true);
  const { agent, model } = (await res.json()) as {
    agent?: string | null;
    model?: string | null;
  };
  return { agent, model };
}

async function pick(page: Page, picker: "Agent" | "Model", name: string) {
  await page.getByRole("button", { name: picker }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}

// A price as the UI writes it, for one million tokens: each digit the server gave, and
// two decimals at the least. Written here apart from the UI's own code, from the number as JSON has it.
const rate = (dollars: number) => {
  const [whole, decimals = ""] = String(dollars).split(".");
  return `$${whole}.${decimals.padEnd(2, "0")}`;
};
const priced = ({ input, output }: Price) =>
  `${rate(input)} in · ${rate(output)} out`;

// Needs a deployment that lists two models of two prices, on a server that
// gives each model's price.
test("pickers: each model in the picker shows its price", async ({ page }) => {
  await openApp(page);
  const { models } = await deploymentOf(page);
  expect(models.length, "the deployment lists two models").toBeGreaterThan(1);
  await modelPicker(page).click();
  for (const model of models)
    // The row is still found by the model's name alone.
    await expect(
      page.getByRole("menuitemradio", { name: model.name, exact: true }),
    ).toContainText(priced(model.price));
});

test("pickers: a picked agent is kept on the thread its first message makes, and sets the model @live", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const second = agents[1];
  const other = models.find((m) => m.name !== second.model)!.name;

  await pick(page, "Model", other);
  await pick(page, "Agent", second.name);
  await expect(agentPicker(page)).toHaveText(second.name);
  await expect(modelPicker(page)).toHaveText(second.model);

  // Picked before the thread was made, and kept on it: the model follows the agent.
  const kept = await send(page, "Say hi in one word.");
  expect(kept.agent).toBe(second.name);
  expect(kept.model).toBeNull();
});

test("pickers: the agent picker does not open in a chat with a message @live", async ({
  page,
}) => {
  await openApp(page);
  await expect(agentPicker(page)).toBeEnabled();
  await send(page, "Say hi in one word.");
  await expect(agentPicker(page)).toBeDisabled();
  await expect(modelPicker(page)).toBeEnabled();
});

// A reload lands on a new chat, so the chat is opened again from the list.
test("pickers: the pick holds after a reload, and after a move to another chat and back @live", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const agent = agents[1];
  const model = models.find((m) => m.name !== agent.model)!.name;

  await pick(page, "Agent", agent.name);
  await send(page, "Say hi in one word.");
  // Picked once the thread exists: the change goes to its record on que's server.
  const patched = page.waitForResponse(
    (res) =>
      res.request().method() === "PATCH" &&
      /^\/api\/threads\/[^/]+$/.test(new URL(res.url()).pathname),
  );
  await pick(page, "Model", model);
  expect((await patched).ok()).toBe(true);
  const title = `Pick ${Date.now()}`;
  await nameNewestChat(page, title);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  // A new chat is on the deployment's own choices.
  await expect(agentPicker(page)).toHaveText(agents[0].name);
  await expect(modelPicker(page)).toHaveText(agents[0].model);

  await openChat(page, title);
  await expect(agentPicker(page)).toHaveText(agent.name);
  await expect(modelPicker(page)).toHaveText(model);

  // "Chats" in the sidebar opens a fresh chat.
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(page.locator('[data-slot="page-title"]')).toHaveText("New chat");
  await expect(agentPicker(page)).toHaveText(agents[0].name);

  await openChat(page, title);
  await expect(agentPicker(page)).toHaveText(agent.name);
  await expect(modelPicker(page)).toHaveText(model);
  const kept = await send(page, "Say bye in one word.");
  expect(kept.agent).toBe(agent.name);
  expect(kept.model).toBe(model);
});
