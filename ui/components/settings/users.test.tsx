// @vitest-environment jsdom
/**
 * The Users settings, as an admin sees it: every user's row lists every domain, with a toggle that is on for the
 * domains the user holds, and the roles and connectors the domain gives. A toggle writes a grant, the role control
 * writes a role, and a refusal is shown on the row. A member sees the list as it was, with no admin call.
 */
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import { UsersList } from "@/components/settings/users";

const ME = "/api/que/me";
const USERS = "/api/que/users";
const ADMIN_USERS = "/api/que/admin/users";
const ADMIN_DOMAINS = "/api/que/admin/domains";

const ADA = {
  id: "u-ada",
  email: "ada@example.com",
  name: "Ada",
  avatarUrl: null,
  role: "admin" as const,
  createdAt: "2025-01-02T03:04:05.000Z",
};
const BOB = {
  id: "u-bob",
  email: "bob@example.com",
  name: "Bob",
  avatarUrl: null,
  role: "member" as const,
  createdAt: "2025-02-03T04:05:06.000Z",
};

/** What GET /que/admin/domains gives: two domains, each with its own connector and role. */
const DOMAINS = [
  { name: "sales", connectors: ["crm"], roles: ["sales-rep"] },
  { name: "support", connectors: ["helpdesk"], roles: ["support-agent"] },
];

/** One row per admin read and write, keyed "METHOD path"; a call no row answers throws, so a test's paths are its own. */
type Answer = (init?: RequestInit) => Response;

function stub(routes: Record<string, Answer>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const answer = routes[key];
    if (!answer) throw new Error(`no answer for ${key}`);
    return answer(init);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Wait for the element, and fail at an assert that says what is missing, not at the query. */
async function waitsFor(
  container: HTMLElement,
  testId: string,
  what: string,
): Promise<HTMLElement> {
  await waitFor(() =>
    assert.ok(container.querySelector(`[data-testid="${testId}"]`), what),
  );
  const found = container.querySelector(`[data-testid="${testId}"]`);
  assert.ok(found instanceof HTMLElement);
  return found;
}

/** The label a domain's toggle sits in: its name and what it gives, and nothing of another domain. */
function labelOf(row: HTMLElement, testId: string): string {
  const toggle = within(row).getByTestId(testId);
  const label = toggle.closest("label");
  assert.ok(label instanceof HTMLElement, `the toggle for ${testId} sits in a label`);
  return (label.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Ada holds sales; Bob holds nothing. */
const adminUsers = (grants: Record<string, string[]>) => [
  { ...ADA, grants: grants[ADA.id] ?? [] },
  { ...BOB, grants: grants[BOB.id] ?? [] },
];

/** A screen with its own SWR cache, so one test's answers never reach another's. */
const renderScreen = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <UsersList />
    </SWRConfig>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("given an admin, when the Users screen loads, then each user's row lists every domain with a toggle that is on for the domains the user holds, and names the roles and connectors the domain gives", async () => {
  const fetch = stub({
    [`GET ${ME}`]: () => json({ ...ADA, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(adminUsers({ [ADA.id]: ["sales"] })),
    [`GET ${ADMIN_DOMAINS}`]: () => json(DOMAINS),
  });

  renderScreen();

  const ada = await screen.findByTestId(`user-${ADA.email}`);
  const bob = await screen.findByTestId(`user-${BOB.email}`);

  await waitFor(() =>
    assert.equal(
      String(fetch.mock.calls[0]?.[0]),
      ME,
      "the screen reads the signed-in role before it asks the admin API",
    ),
  );
  assert.ok(
    fetch.mock.calls.some(([url]) => String(url) === ADMIN_USERS),
    "the admin screen reads /que/admin/users",
  );
  assert.ok(
    fetch.mock.calls.some(([url]) => String(url) === ADMIN_DOMAINS),
    "the admin screen reads /que/admin/domains",
  );

  // Every domain, on every row: Ada holds sales, Bob holds none.
  assert.equal(
    within(ada).getAllByRole("checkbox").length,
    2,
    "Ada's row lists every domain, each with a toggle",
  );
  assert.equal(
    within(bob).getAllByRole("checkbox").length,
    2,
    "Bob's row lists every domain, each with a toggle",
  );
  assert.equal(
    (within(ada).getByTestId(`grant-${ADA.email}-sales`) as HTMLInputElement).checked,
    true,
    "Ada's sales toggle is on: she holds sales",
  );
  assert.equal(
    (within(ada).getByTestId(`grant-${ADA.email}-support`) as HTMLInputElement).checked,
    false,
    "Ada's support toggle is off: she holds only sales",
  );
  assert.equal(
    (within(bob).getByTestId(`grant-${BOB.email}-sales`) as HTMLInputElement).checked,
    false,
    "Bob's sales toggle is off: he holds no domain",
  );

  // Each domain's own label names what that domain gives, and nothing of the other.
  assert.equal(
    labelOf(ada, `grant-${ADA.email}-sales`),
    "sales crm, sales-rep",
    "Ada's sales label names sales with its connectors and roles, and nothing of support",
  );
  assert.equal(
    labelOf(ada, `grant-${ADA.email}-support`),
    "support helpdesk, support-agent",
    "Ada's support label names support with its connectors and roles, and nothing of sales",
  );
  assert.equal(
    labelOf(bob, `grant-${BOB.email}-sales`),
    "sales crm, sales-rep",
    "Bob's sales label names sales with its connectors and roles, and nothing of support",
  );
  assert.equal(
    labelOf(bob, `grant-${BOB.email}-support`),
    "support helpdesk, support-agent",
    "Bob's support label names support with its connectors and roles, and nothing of sales",
  );
});

test("given an admin, when they turn a domain on, then the screen sends PUT /que/admin/users/:id/grants/:domain, and when they turn it off, DELETE of it, and the row follows the server's answer", async () => {
  const grants: Record<string, string[]> = { [ADA.id]: ["sales"], [BOB.id]: [] };
  const fetch = stub({
    [`GET ${ME}`]: () => json({ ...ADA, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(adminUsers(grants)),
    [`GET ${ADMIN_DOMAINS}`]: () => json([DOMAINS[0]]),
    [`PUT ${ADMIN_USERS}/${BOB.id}/grants/sales`]: () => {
      grants[BOB.id] = ["sales"];
      return json({ ok: true });
    },
    [`DELETE ${ADMIN_USERS}/${ADA.id}/grants/sales`]: () => {
      grants[ADA.id] = [];
      return json({ ok: true });
    },
  });

  renderScreen();

  const bob = await screen.findByTestId(`user-${BOB.email}`);
  const ada = await screen.findByTestId(`user-${ADA.email}`);
  const bobSales = (await waitsFor(bob, `grant-${BOB.email}-sales`, "Bob's row has a toggle for sales")) as HTMLInputElement;
  const adaSales = (await waitsFor(ada, `grant-${ADA.email}-sales`, "Ada's row has a toggle for sales")) as HTMLInputElement;
  assert.equal(bobSales.checked, false);
  assert.equal(adaSales.checked, true);

  fireEvent.click(bobSales);

  await waitFor(() =>
    assert.ok(
      fetch.mock.calls.some(
        ([url, init]) =>
          String(url) === `${ADMIN_USERS}/${BOB.id}/grants/sales` &&
          (init as RequestInit | undefined)?.method === "PUT",
      ),
      "turning sales on sends PUT /que/admin/users/u-bob/grants/sales",
    ),
  );
  await waitFor(() =>
    assert.equal(
      (within(bob).getByTestId(`grant-${BOB.email}-sales`) as HTMLInputElement).checked,
      true,
      "Bob's row follows the server's answer, which now holds sales",
    ),
  );

  fireEvent.click(adaSales);

  await waitFor(() =>
    assert.ok(
      fetch.mock.calls.some(
        ([url, init]) =>
          String(url) === `${ADMIN_USERS}/${ADA.id}/grants/sales` &&
          (init as RequestInit | undefined)?.method === "DELETE",
      ),
      "turning sales off sends DELETE /que/admin/users/u-ada/grants/sales",
    ),
  );
  await waitFor(() =>
    assert.equal(
      (within(ada).getByTestId(`grant-${ADA.email}-sales`) as HTMLInputElement).checked,
      false,
      "Ada's row follows the server's answer, which no longer holds sales",
    ),
  );
});

test("given an admin, when they set a member to admin, then the screen sends PATCH /que/admin/users/:id with the role, and the row shows the new role; that user, on their next load, gets the same admin screen", async () => {
  const roles: Record<string, "admin" | "member"> = { [ADA.id]: "admin", [BOB.id]: "member" };
  const userRows = () => [
    { ...ADA, role: roles[ADA.id], grants: ["sales"] },
    { ...BOB, role: roles[BOB.id], grants: [] },
  ];
  const fetch = stub({
    [`GET ${ME}`]: () => json({ ...ADA, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(userRows()),
    [`GET ${ADMIN_DOMAINS}`]: () => json([DOMAINS[0]]),
    [`PATCH ${ADMIN_USERS}/${BOB.id}`]: (init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), { role: "admin" }, "the PATCH carries the role alone");
      roles[BOB.id] = "admin";
      return json({ ok: true });
    },
  });

  renderScreen();

  const bob = await screen.findByTestId(`user-${BOB.email}`);
  const select = (await waitsFor(bob, `role-${BOB.email}`, "Bob's row has a role control")) as HTMLSelectElement;
  assert.equal(select.value, "member");

  fireEvent.change(select, { target: { value: "admin" } });

  await waitFor(() =>
    assert.ok(
      fetch.mock.calls.some(
        ([url, init]) =>
          String(url) === `${ADMIN_USERS}/${BOB.id}` &&
          (init as RequestInit | undefined)?.method === "PATCH",
      ),
      "setting the role sends PATCH /que/admin/users/u-bob",
    ),
  );
  await waitFor(() =>
    assert.equal(
      (within(bob).getByTestId(`role-${BOB.email}`) as HTMLSelectElement).value,
      "admin",
      "Bob's row shows the new role",
    ),
  );

  // Bob's next load: the same screen, now as an admin.
  cleanup();
  const next = stub({
    [`GET ${ME}`]: () => json({ ...BOB, role: "admin", instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(userRows()),
    [`GET ${ADMIN_DOMAINS}`]: () => json([DOMAINS[0]]),
  });

  renderScreen();

  const bobAgain = await screen.findByTestId(`user-${BOB.email}`);
  await waitFor(() =>
    assert.ok(
      within(bobAgain).queryByTestId(`grant-${BOB.email}-sales`),
      "the new admin gets the same admin screen: the domain toggles",
    ),
  );
  assert.ok(
    next.mock.calls.some(([url]) => String(url) === ADMIN_USERS),
    "the new admin reads /que/admin/users",
  );
});

test("given an admin sets themselves to member, then the server's 409 shows on the row, and the role stays", async () => {
  stub({
    [`GET ${ME}`]: () => json({ ...ADA, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(adminUsers({ [ADA.id]: ["sales"] })),
    [`GET ${ADMIN_DOMAINS}`]: () => json([DOMAINS[0]]),
    [`PATCH ${ADMIN_USERS}/${ADA.id}`]: () =>
      json({ error: "You cannot take your own admin role" }, 409),
  });

  renderScreen();

  const ada = await screen.findByTestId(`user-${ADA.email}`);
  const select = (await waitsFor(ada, `role-${ADA.email}`, "Ada's row has a role control")) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "member" } });

  await waitFor(() =>
    assert.ok(
      (ada.textContent ?? "").includes("You cannot take your own admin role"),
      "the server's 409 shows on Ada's row",
    ),
  );
  assert.equal(
    (within(ada).getByTestId(`role-${ADA.email}`) as HTMLSelectElement).value,
    "admin",
    "the role stays admin",
  );
});

test("given the server refuses a change (400, 404), then the row shows its error and the toggle goes back", async () => {
  const grants: Record<string, string[]> = { [ADA.id]: [], [BOB.id]: [] };
  stub({
    [`GET ${ME}`]: () => json({ ...ADA, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
    [`GET ${ADMIN_USERS}`]: () => json(adminUsers(grants)),
    [`GET ${ADMIN_DOMAINS}`]: () => json(DOMAINS),
    [`PUT ${ADMIN_USERS}/${BOB.id}/grants/sales`]: () => json({ error: "sales is no domain" }, 400),
    [`PUT ${ADMIN_USERS}/${BOB.id}/grants/support`]: () => json({ error: "not found" }, 404),
  });

  renderScreen();

  const bob = await screen.findByTestId(`user-${BOB.email}`);
  const sales = (await waitsFor(bob, `grant-${BOB.email}-sales`, "Bob's row has a toggle for sales")) as HTMLInputElement;
  const support = (await waitsFor(bob, `grant-${BOB.email}-support`, "Bob's row has a toggle for support")) as HTMLInputElement;

  fireEvent.click(sales);
  await waitFor(() =>
    assert.ok((bob.textContent ?? "").includes("sales is no domain"), "the 400 shows on Bob's row"),
  );
  assert.equal(
    (within(bob).getByTestId(`grant-${BOB.email}-sales`) as HTMLInputElement).checked,
    false,
    "the sales toggle goes back after the 400",
  );

  fireEvent.click(support);
  await waitFor(() =>
    assert.ok((bob.textContent ?? "").includes("not found"), "the 404 shows on Bob's row"),
  );
  assert.equal(
    (within(bob).getByTestId(`grant-${BOB.email}-support`) as HTMLInputElement).checked,
    false,
    "the support toggle goes back after the 404",
  );
});

test("given a member, when the Users screen loads, then it makes no /que/admin call and shows the list as now, with no toggle", async () => {
  const fetch = stub({
    [`GET ${ME}`]: () => json({ ...BOB, instructions: null, instructionsFrom: "account" }),
    [`GET ${USERS}`]: () => json([ADA, BOB]),
  });

  renderScreen();

  const ada = await screen.findByTestId(`user-${ADA.email}`);
  const bob = await screen.findByTestId(`user-${BOB.email}`);
  await waitFor(() =>
    assert.equal(
      String(fetch.mock.calls[0]?.[0]),
      ME,
      "the screen reads the signed-in role before it shows the list",
    ),
  );
  await waitFor(() =>
    assert.ok(
      fetch.mock.calls.some(([url]) => String(url) === USERS),
      "the member's screen reads /que/users, as now",
    ),
  );
  assert.deepEqual(
    fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/que/admin")),
    [],
    "the member's screen makes no /que/admin call",
  );

  for (const row of [ada, bob])
    assert.equal(within(row).queryAllByRole("checkbox").length, 0, "a member's row has no toggle");
  assert.ok(within(ada).getByText("admin"), "the row still shows each user's role");
  assert.ok(within(bob).getByText("member"), "the row still shows each user's role");
  assert.ok(within(ada).getByText(ADA.email), "the row still shows the user's email");
});
