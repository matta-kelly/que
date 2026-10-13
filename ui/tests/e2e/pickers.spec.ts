import { test, expect, type Page, type Request } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";

// Needs a deployment that lists two agents and two models or more. The names
// are read from the server, so the tests hold for any such deployment.

type Deployment = {
  agents: { name: string; model: string }[];
  models: { name: string }[];
};

async function deploymentOf(page: Page): Promise<Deployment> {
  const res = await page.request.get("/api/que/deployment");
  expect(res.ok()).toBe(true);
  return res.json();
}

const agentPicker = (page: Page) => page.getByRole("button", { name: "Agent" });
const modelPicker = (page: Page) => page.getByRole("button", { name: "Model" });

// Send a message, and hand back the `configurable` its run was sent. The run
// has to give a reply: a pick the server cannot run on is a failed test.
async function send(page: Page, text: string) {
  const replies = page.locator('[data-role="assistant"]');
  const before = await replies.count();
  const isRun = (req: Request) =>
    req.method() === "POST" &&
    /\/threads\/[^/]+\/runs\/stream$/.test(req.url());
  const request = page.waitForRequest(isRun);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  const body = (await request).postDataJSON() as {
    config?: { configurable?: Record<string, unknown> };
  };
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(replies).toHaveCount(before + 1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
  await expect(replies.last()).not.toBeEmpty();
  return body.config?.configurable ?? {};
}

async function pick(page: Page, picker: "Agent" | "Model", name: string) {
  await page.getByRole("button", { name: picker }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}

test("pickers: a new chat shows the first agent and its model, and its run is sent no pick", async ({
  page,
}) => {
  await openApp(page);
  const { agents } = await deploymentOf(page);
  await expect(agentPicker(page)).toHaveText(agents[0].name);
  await expect(modelPicker(page)).toHaveText(agents[0].model);

  const sent = await send(page, "Say hi in one word.");
  expect(sent.agent).toBeUndefined();
  expect(sent.model).toBeUndefined();
});

test("pickers: a picked model is sent with the next run", async ({ page }) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const other = models.find((m) => m.name !== agents[0].model)!.name;

  await pick(page, "Model", other);
  await expect(modelPicker(page)).toHaveText(other);
  const first = await send(page, "Say hi in one word.");
  expect(first.model).toBe(other);
  expect(first.agent).toBeUndefined();

  // The model can change at any message of a chat.
  await pick(page, "Model", agents[0].model);
  const second = await send(page, "Say bye in one word.");
  expect(second.model).toBe(agents[0].model);
});

test("pickers: a picked agent is sent with the first run, and sets the model", async ({
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

  const sent = await send(page, "Say hi in one word.");
  expect(sent.agent).toBe(second.name);
  expect(sent.model).toBeUndefined();
});

test("pickers: the agent picker does not open in a chat with a message", async ({
  page,
}) => {
  await openApp(page);
  await expect(agentPicker(page)).toBeEnabled();
  await send(page, "Say hi in one word.");
  await expect(agentPicker(page)).toBeDisabled();
  await expect(modelPicker(page)).toBeEnabled();
});

// A reload lands on a new chat, so the chat is opened again from the list.
test("pickers: the pick holds after a reload, and after a move to another chat and back", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const agent = agents[1];
  const model = models.find((m) => m.name !== agent.model)!.name;

  await pick(page, "Agent", agent.name);
  await pick(page, "Model", model);
  await send(page, "Say hi in one word.");
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
  const sent = await send(page, "Say bye in one word.");
  expect(sent.agent).toBe(agent.name);
  expect(sent.model).toBe(model);
});
