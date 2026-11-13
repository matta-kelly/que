// @vitest-environment jsdom
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import HomePage from "@/app/(app)/page";
import AppLayout from "@/app/(app)/layout";

// jsdom has no scrolling: the palette scrolls its picked option into view.
Element.prototype.scrollIntoView ??= function () {};

// jsdom has no layout: cmdk's list observes its size.
class NoLayout implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayout;

// jsdom has no matchMedia: the sidebar asks it whether the screen is a phone's.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof matchMedia;

// next/font runs only in Next's build: a test gets a font with no class.
vi.mock("next/font/google", () => ({
  Inria_Sans: () => ({ className: "" }),
  Source_Code_Pro: () => ({ className: "" }),
}));

const ADA = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada",
  avatarUrl: null,
  role: "member",
  createdAt: "2026-01-01T00:00:00Z",
};

/** que's server, as the UI fetches it: the signed-in user, and empty lists. Every request is recorded. */
function queServer() {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "/api/que/me") return Response.json(ADA);
      if (
        ["/api/que/users", "/api/que/connections", "/api/que/domains"].includes(
          url,
        )
      )
        return Response.json([]);
      return Response.json({ error: `${url} has no stub` }, { status: 404 });
    }),
  );
  return urls;
}

/** Home in the app's shell (the sidebar and the palette), on a fresh SWR cache. */
function renderHome() {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <AppLayout>
        <HomePage />
      </AppLayout>
    </SWRConfig>,
  );
}

const pageTitle = () =>
  document.querySelector('[data-slot="page-title"]')?.textContent;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("home is the settings: a tile per section, and the sidebar lists Home and each section", async () => {
  const urls = queServer();
  renderHome();

  await screen.findByRole("searchbox", { name: "Search settings" });
  assert.equal(pageTitle(), "Settings");
  for (const id of ["account", "connections", "users"])
    assert.ok(screen.getByTestId(`settings-tile-${id}`));
  for (const name of ["Home", "Account", "Connections", "Users"])
    assert.ok(screen.getByRole("button", { name }));
  // The UI asks que's server for settings only.
  assert.ok(
    urls.every((url) => url.startsWith("/api/que/")),
    `a route outside /api/que was fetched: ${urls.join(", ")}`,
  );
});

test("a sidebar entry, the user at its foot, a tile and the brand each open their section", async () => {
  queServer();
  renderHome();
  await screen.findByRole("searchbox", { name: "Search settings" });

  fireEvent.click(screen.getByRole("button", { name: "Connections" }));
  assert.equal(pageTitle(), "Connections");

  fireEvent.click(await screen.findByText("ada@example.com"));
  assert.equal(pageTitle(), "Account");
  assert.ok(await screen.findByLabelText("Name"));
  assert.equal(screen.queryByLabelText("Instructions"), null);

  fireEvent.click(screen.getByRole("button", { name: "Lotus and Luna: home" }));
  assert.equal(pageTitle(), "Settings");

  fireEvent.click(screen.getByTestId("settings-tile-users"));
  assert.equal(pageTitle(), "Users");
});

test("the palette offers the sections and the theme, and opens a section", async () => {
  queServer();
  renderHome();
  await screen.findByRole("searchbox", { name: "Search settings" });

  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  const palette = await screen.findByRole("dialog");
  const options = within(palette)
    .getAllByRole("option")
    .map((o) => (o.textContent ?? "").trim());
  for (const name of ["Account", "Connections", "Users"])
    assert.ok(options.includes(name), `no ${name}: ${options.join(", ")}`);
  assert.ok(options.some((o) => /theme/.test(o)));

  fireEvent.click(within(palette).getByRole("option", { name: "Users" }));
  assert.equal(pageTitle(), "Users");
});
