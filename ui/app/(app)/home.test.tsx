// @vitest-environment jsdom
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import HomePage from "@/app/(app)/page";
import { RuntimeProvider } from "@/components/runtime/runtime-provider";
import AppLayout from "@/app/(app)/layout";
import { useRunPicks } from "@/components/chat/run-pickers/pick-store";

// jsdom has no layout: the composer's size observer has nothing to observe.
class NoLayout implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoLayout;

// jsdom has no scrolling: the palette scrolls its picked option into view.
Element.prototype.scrollIntoView ??= function () {};

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {} }),
  usePathname: () => "/",
}));

/** que's server, as the UI fetches it: the deployment says `chat`, or fails, and every request is recorded. */
function queServer(chat: boolean | undefined | "fails") {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "/api/que/deployment" && chat === "fails")
        return Response.json({ error: "down" }, { status: 500 });
      if (url === "/api/que/deployment")
        return Response.json({
          agents: [{ name: "zoe", model: "big" }],
          models: [{ name: "big", window: 1000, maxTokens: 100 }],
          ...(typeof chat === "boolean" ? { chat } : {}),
        });
      if (url === "/api/threads") return Response.json([]);
      return Response.json({ error: `${url} has no stub` }, { status: 404 });
    }),
  );
  return urls;
}

/** Home in the app's shell (the sidebar, settings and the palette), on a fresh SWR cache. */
function renderHome() {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RuntimeProvider>
        <AppLayout>
          <HomePage />
        </AppLayout>
      </RuntimeProvider>
    </SWRConfig>,
  );
}

/** The palette's options, opened with Ctrl+K. */
async function paletteOptions() {
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  await screen.findByPlaceholderText("Search everything…");
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useRunPicks.setState({ deployment: undefined });
});

test("given a deployment with the chat off, then home says chat isn't enabled, shows no composer and no chats, the brand goes home, and no thread is fetched", async () => {
  const urls = queServer(false);
  renderHome();

  await screen.findByText("Chat isn't enabled for Lotus and Luna's deployment");
  assert.equal(screen.queryByRole("textbox", { name: "Message input" }), null);
  assert.equal(screen.queryAllByText("Chats").length, 0);
  assert.ok(screen.getByRole("button", { name: "Lotus and Luna: home" }));
  const options = await paletteOptions();
  assert.ok(
    !options.some((o) => /new chat/i.test(o)),
    `the palette offers a new chat: ${options.join(", ")}`,
  );
  // The thread list asks the deployment first, and fetches no thread when the chat is off.
  await waitFor(() => assert.ok(urls.includes("/api/que/deployment")));
  assert.ok(
    !urls.some((url) => url.startsWith("/api/threads")),
    `a thread route was fetched: ${urls.join(", ")}`,
  );
});

test("given a deployment that serves the chat, an older one that does not say, or one that fails to load, then home is the chat, with its composer and its chats", async () => {
  for (const chat of [true, undefined, "fails"] as const) {
    queServer(chat);
    renderHome();
    await screen.findByRole("textbox", { name: "Message input" });
    assert.ok(screen.getAllByText("Chats").length > 0);
    assert.ok(screen.getByRole("button", { name: "Lotus and Luna: new chat" }));
    assert.ok((await paletteOptions()).some((o) => /new chat/i.test(o)));
    assert.equal(
      screen.queryByText("Chat isn't enabled for Lotus and Luna's deployment"),
      null,
    );
    cleanup();
    useRunPicks.setState({ deployment: undefined });
  }
});
