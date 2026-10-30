// @vitest-environment jsdom
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ThreadFiles } from "@/components/chat/attachment/thread-files";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a reloaded thread's file list shows the files que's server lists, and no image or empty attachment box", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([
      { id: "f1", name: "order.csv", mimeType: "text/csv", size: 21 },
      { id: "f2", name: "prices.pdf", mimeType: "application/pdf", size: 4 },
    ]),
  );
  vi.stubGlobal("fetch", fetch);

  render(<ThreadFiles threadId="T1" />);

  const list = await screen.findByRole("list", { name: "Files in this thread" });
  assert.equal(String(fetch.mock.calls[0]?.[0]), "/api/threads/T1/files");
  assert.ok(within(list).getByText("order.csv"));
  assert.ok(within(list).getByText("prices.pdf"));
  assert.equal(within(list).queryAllByRole("img").length, 0);
  assert.equal(within(list).queryAllByRole("figure").length, 0);
});
