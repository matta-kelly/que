// @vitest-environment jsdom
/**
 * The Connections settings: one row per connector the user reaches. An internal connector is reached with a role,
 * not a credential of the user's own: its row names the role, and offers neither a form nor a Save.
 */
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ConnectionsList } from "@/components/settings/connections";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("given a role the user holds on an internal connector, when the Connections settings load, then the connector's row names the role, with no form and no Save", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([
      {
        name: "warehouse",
        title: "Warehouse",
        description:
          "An internal connector whose ops run with one of its roles.",
        roles: ["warehouse-reader"],
        fields: [],
        connectedAt: null,
      },
    ]),
  );
  vi.stubGlobal("fetch", fetch);

  render(<ConnectionsList />);

  const row = await screen.findByTestId("connection-warehouse");
  assert.equal(String(fetch.mock.calls[0]?.[0]), "/api/que/connections");
  assert.ok(
    within(row).getByText(/warehouse-reader/),
    "the row names the role the user holds",
  );
  assert.equal(within(row).queryAllByRole("textbox").length, 0);
  assert.equal(within(row).queryByRole("button", { name: "Save" }), null);
  assert.equal(within(row).queryByRole("button", { name: "Connect" }), null);
});
