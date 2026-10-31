// @vitest-environment jsdom
/**
 * The Connections settings name the signed-in user's domains, and the connectors each one needs. The list below stays
 * one row per connector the user reaches, so a connector two domains name is one row with one Connect form. A
 * connector with no credential has no row (`api.ts:35`), so its domain lists it by name only.
 *
 * The fetches are stubbed as the server answers: `/api/que/domains` gives each domain with its connectors and roles,
 * and `/api/que/connections` gives one entry per reached connector that needs a credential.
 */
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConnectionsList } from "@/components/settings/connections";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Stub fetch with each URL's answer, and fail loudly on a URL the screen should not ask for. */
const stubFetch = (answers: Record<string, unknown>) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
    String(input) in answers
      ? Response.json(answers[String(input)])
      : Response.json({ error: `unexpected GET ${String(input)}` }, { status: 404 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

test("given two domains that name one connector, when the Connections settings load, then both domains list it and it is one row with its Connect form, and a connector with no credential has no row", async () => {
  const fetch = stubFetch({
    "/api/que/domains": [
      {
        name: "shop-domain",
        connectors: ["source", "till"],
        roles: [],
      },
      { name: "till-domain", connectors: ["till"], roles: [] },
    ],
    "/api/que/connections": [
      {
        name: "till",
        title: "Till",
        description: "The till.",
        fields: [{ name: "key", secret: true }],
        connectedAt: null,
      },
    ],
  });

  render(<ConnectionsList />);

  const shop = await screen.findByTestId("domain-shop-domain");
  const till = await screen.findByTestId("domain-till-domain");
  assert.ok(fetch.mock.calls.some(([url]) => String(url) === "/api/que/domains"));

  // The connector both domains name is listed by name under each domain.
  assert.ok(within(shop).getByText("till"), "shop-domain lists the shared till");
  assert.ok(
    within(till).getByText("till"),
    "till-domain lists the shared till",
  );

  // It is one row below, with one Connect form: the form appears on its Connect.
  const rows = await screen.findAllByTestId("connection-till");
  assert.equal(rows.length, 1, "the shared connector is one row");
  const row = rows[0]!;
  assert.equal(within(row).queryAllByLabelText("Key").length, 0);
  fireEvent.click(within(row).getByRole("button", { name: "Connect" }));
  assert.ok(
    await within(row).findByLabelText("Key"),
    "the row opens the till's Connect form",
  );

  // The connector with no credential has no row, so its domain lists it by name, with no form and no Connect.
  assert.ok(
    within(shop).getByText("source"),
    "shop-domain lists the credential-less source by name",
  );
  assert.equal(
    screen.queryAllByTestId("connection-source").length,
    0,
    "a connector with no credential has no row",
  );
  assert.equal(
    within(shop).queryAllByRole("button", { name: "Connect" }).length,
    0,
    "the credential-less connector has no Connect",
  );
  assert.equal(
    within(shop).queryAllByRole("textbox").length,
    0,
    "the credential-less connector has no form",
  );
});

test("given a user with no domain, when the Connections settings load, then it says so and names no connector", async () => {
  stubFetch({ "/api/que/domains": [], "/api/que/connections": [] });

  render(<ConnectionsList />);

  assert.ok(
    await screen.findByText(/no domains/i),
    "the screen says the user has no domains",
  );
  await waitFor(() =>
    assert.equal(
      screen.queryAllByTestId(/^domain-/).length,
      0,
      "no domain is named",
    ),
  );
  assert.equal(
    screen.queryAllByTestId(/^connection-/).length,
    0,
    "no connector is named",
  );
});
