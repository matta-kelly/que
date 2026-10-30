/**
 * The thread's own changes, through que's server: a user renames, archives and deletes their thread with
 * PATCH /threads/:id and DELETE /threads/:id, and picks the agent config and the model its runs take, on
 * PATCH /threads/:id or, before the thread exists, on POST /threads. Each change is on the thread's record, so a
 * later GET (a reload) gives it. Another user's thread gets the same 404 as one that is not there.
 *
 * On a database of its own (PGlite, served on a local port) and the fixture deployment "picks": its first agent,
 * "clerk", uses the till on the model "small" (`fireworks:small-model`); its second, "lean", has no plugin and runs
 * on "big" (`fireworks:big-model`). In the place of Fireworks, pi-ai's scripted provider (`faux`) answers under
 * Fireworks' provider id, and each answer records the model it was asked on and the tools it was offered.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 100 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "picks",
);
delete process.env.DEV_USER_EMAIL;
delete process.env.DEV_USER_NAME;

const { app } = await import("../serve.js");
const { models } = await import("../runner/pi/harness.js");

const faux = fauxProvider({
  provider: "fireworks",
  models: [
    { id: "small-model", contextWindow: 64_000 },
    { id: "big-model", contextWindow: 1_000_000 },
  ],
});
models.setProvider(faux.provider);

after(async () => {
  await database.stop();
  await db.close();
});

const ANA = "ana@example.com";
const BEN = "ben@example.com";

/** A request as the user with this email. */
const as = (email: string, path: string, init?: RequestInit) => {
  process.env.DEV_USER_EMAIL = email;
  return app.request(path, init);
};

// Ana reaches the till: her catalog holds it once she has given its key.
{
  const saved = await as(ANA, "/que/connections/till", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { key: "ana-key" } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

type Thread = {
  id: string;
  title: string | null;
  archived: boolean;
  agent: string | null;
  model: string | null;
};

/** A thread of this user's, made through POST /threads, with the picks made before it, if any. */
const make = async (
  email: string,
  pick?: { agent?: string; model?: string },
) => {
  const made = await as(
    email,
    "/threads",
    pick ? json("POST", pick) : { method: "POST" },
  );
  assert.equal(made.status, 201);
  return (await made.json()) as Thread;
};

/** The thread as GET /threads/:id gives it: what a reload reads. */
const opened = async (email: string, id: string) => {
  const got = await as(email, `/threads/${id}`);
  assert.equal(got.status, 200, `GET /threads/${id}`);
  return (await got.json()) as Thread;
};

/** The thread as GET /threads lists it, if it does. */
const listed = async (email: string, id: string) =>
  ((await (await as(email, "/threads")).json()) as Thread[]).find(
    (t) => t.id === id,
  );

const patch = (email: string, id: string, changes: unknown) =>
  as(email, `/threads/${id}`, json("PATCH", changes));

/** The fields a user changes. */
const own = (t: Thread | undefined) =>
  t && {
    title: t.title,
    archived: t.archived,
    agent: t.agent,
    model: t.model,
  };

test("given a thread, when its owner renames it through PATCH /threads/:id, then the answer, GET /threads/:id and GET /threads give the title, and a second rename replaces it", async () => {
  for (const [first, second] of [
    ["Plums", "Ripe plums"],
    ["Pears", "Green pears"],
  ]) {
    const { id } = await make(ANA);
    const renamed = await patch(ANA, id, { title: first });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as Thread).title, first);
    await patch(ANA, id, { title: second });
    assert.deepEqual(
      {
        opened: (await opened(ANA, id)).title,
        listed: (await listed(ANA, id))?.title,
      },
      { opened: second, listed: second },
    );
  }
});

test("given a thread, when its owner archives it and then unarchives it, then GET /threads/:id and GET /threads say so each time, and the thread stays listed", async () => {
  const { id } = await make(ANA);
  const other = await make(ANA);
  assert.equal((await opened(ANA, id)).archived, false);
  assert.equal((await patch(ANA, id, { archived: true })).status, 200);
  assert.deepEqual(
    {
      opened: (await opened(ANA, id)).archived,
      listed: (await listed(ANA, id))?.archived,
      other: (await listed(ANA, other.id))?.archived,
    },
    { opened: true, listed: true, other: false },
  );
  await patch(ANA, id, { archived: false });
  assert.deepEqual(
    {
      opened: (await opened(ANA, id)).archived,
      listed: (await listed(ANA, id))?.archived,
    },
    { opened: false, listed: false },
  );
});

test("given a thread, when its owner deletes it through DELETE /threads/:id, then it is gone: GET /threads/:id, its runs and a second delete get 404, and GET /threads lists it no more, while the owner's other thread stays", async () => {
  const gone = await make(ANA);
  const kept = await make(ANA);
  const deleted = await as(ANA, `/threads/${gone.id}`, { method: "DELETE" });
  assert.deepEqual(
    {
      deleted: deleted.status,
      opened: (await as(ANA, `/threads/${gone.id}`)).status,
      run: (
        await as(
          ANA,
          `/threads/${gone.id}/runs`,
          json("POST", {
            threadId: gone.id,
            runId: randomUUID(),
            messages: [{ id: randomUUID(), role: "user", content: "Hi" }],
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          }),
        )
      ).status,
      again: (await as(ANA, `/threads/${gone.id}`, { method: "DELETE" }))
        .status,
      listed: (await listed(ANA, gone.id)) !== undefined,
      other: (await opened(ANA, kept.id)).id,
    },
    {
      deleted: 204,
      opened: 404,
      run: 404,
      again: 404,
      listed: false,
      other: kept.id,
    },
  );
});

test("given another user's thread, when a user changes or deletes it, then each gets 404, and its owner has it as it was", async () => {
  const anas = await make(ANA);
  assert.equal((await patch(ANA, anas.id, { title: "Ana's" })).status, 200);
  const changed = await patch(BEN, anas.id, {
    title: "Ben's",
    archived: true,
    agent: "lean",
  });
  const deleted = await as(BEN, `/threads/${anas.id}`, { method: "DELETE" });
  const missing = await patch(BEN, randomUUID(), { title: "Nobody's" });
  assert.deepEqual(
    {
      changed: changed.status,
      deleted: deleted.status,
      missing: missing.status,
      owner: own(await opened(ANA, anas.id)),
    },
    {
      changed: 404,
      deleted: 404,
      missing: 404,
      owner: { title: "Ana's", archived: false, agent: null, model: null },
    },
  );
});

test("given a pick the deployment does not list, when it is sent through PATCH /threads/:id or POST /threads, then it gets 400, the record keeps its pick, and no thread is made", async () => {
  const { id } = await make(ANA, { agent: "lean", model: "small" });
  const before = ((await (await as(ANA, "/threads")).json()) as Thread[])
    .length;
  const patched = await Promise.all(
    [
      { agent: "gone" },
      { model: "huge" },
      { agent: "clerk", model: "huge" },
    ].map(async (body) => (await patch(ANA, id, body)).status),
  );
  const posted = await Promise.all(
    [{ agent: "gone" }, { model: "huge" }].map(
      async (body) => (await as(ANA, "/threads", json("POST", body))).status,
    ),
  );
  assert.deepEqual(
    {
      patched,
      posted,
      kept: own(await opened(ANA, id)),
      threads: ((await (await as(ANA, "/threads")).json()) as Thread[]).length,
    },
    {
      patched: [400, 400, 400],
      posted: [400, 400],
      kept: { title: null, archived: false, agent: "lean", model: "small" },
      threads: before,
    },
  );
});

test("given a change that is not one, when it is sent through PATCH /threads/:id, then it gets 400 and the thread is as it was", async () => {
  const { id } = await make(ANA);
  await patch(ANA, id, { title: "Kept" });
  const bad = await Promise.all(
    [{ title: 3 }, { archived: "yes" }, { agent: 7 }, "a title"].map(
      async (body) => (await patch(ANA, id, body)).status,
    ),
  );
  assert.deepEqual(
    { bad, kept: own(await opened(ANA, id)) },
    {
      bad: [400, 400, 400, 400],
      kept: { title: "Kept", archived: false, agent: null, model: null },
    },
  );
});

/** Each request the model got: the model it was asked on, and whether it was offered the till. */
const asked: { model: string; till: boolean }[] = [];
const answer: FauxResponseStep = (context, _options, _state, model) => {
  // The tools offered are declared in the transcript's system messages.
  asked.push({
    model: model.id,
    till: JSON.stringify(context.messages).includes("till-count"),
  });
  return fauxAssistantMessage("Done.");
};

/** One run on the thread, its body read whole: what the model was asked on. */
const runOn = async (id: string) => {
  faux.setResponses([answer]);
  asked.length = 0;
  const ran = await as(
    ANA,
    `/threads/${id}/runs`,
    json("POST", {
      threadId: id,
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: "Hi" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
  assert.equal(ran.status, 200);
  await ran.text();
  return [...asked];
};

test("given picks made before the thread exists, when POST /threads makes it with them, then the record holds them, and its run goes on the picked agent and model", async () => {
  const lean = await make(ANA, { agent: "lean" });
  const clerkOnBig = await make(ANA, { agent: "clerk", model: "big" });
  const none = await make(ANA);
  assert.deepEqual(
    {
      made: [lean, clerkOnBig, none].map((t) => [t.agent, t.model]),
      opened: await Promise.all(
        [lean, clerkOnBig, none].map(async (t) => {
          const got = await opened(ANA, t.id);
          return [got.agent, got.model];
        }),
      ),
    },
    {
      made: [
        ["lean", null],
        ["clerk", "big"],
        [null, null],
      ],
      opened: [
        ["lean", null],
        ["clerk", "big"],
        [null, null],
      ],
    },
  );
  assert.deepEqual(
    {
      lean: await runOn(lean.id),
      clerkOnBig: await runOn(clerkOnBig.id),
      none: await runOn(none.id),
    },
    {
      // lean has no plugin, and its own model.
      lean: [{ model: "big-model", till: false }],
      // The picked model, on clerk's tools.
      clerkOnBig: [{ model: "big-model", till: true }],
      // The deployment's first agent, on its model.
      none: [{ model: "small-model", till: true }],
    },
  );
});

test("given a thread, when its owner picks the agent and the model through PATCH /threads/:id, then GET /threads/:id gives the picks, and the next run goes on them; a model picked back to none follows the agent", async () => {
  const { id } = await make(ANA);
  assert.equal(
    (await patch(ANA, id, { agent: "lean", model: "small" })).status,
    200,
  );
  const picked = own(await opened(ANA, id));
  const first = await runOn(id);
  await patch(ANA, id, { model: null });
  const followed = own(await opened(ANA, id));
  const second = await runOn(id);
  assert.deepEqual(
    { picked, first, followed, second },
    {
      picked: { title: null, archived: false, agent: "lean", model: "small" },
      first: [{ model: "small-model", till: false }],
      followed: { title: null, archived: false, agent: "lean", model: null },
      second: [{ model: "big-model", till: false }],
    },
  );
});

type Message = { id: string; role: string; content?: unknown };

/** A run on the thread with these messages, its body read whole: the messages GET then gives, and what the model was asked on. */
const runWith = async (id: string, messages: Message[]) => {
  faux.setResponses([answer]);
  asked.length = 0;
  const ran = await as(
    ANA,
    `/threads/${id}/runs`,
    json("POST", {
      threadId: id,
      runId: randomUUID(),
      messages,
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  );
  assert.equal(ran.status, 200);
  await ran.text();
  const got = await as(ANA, `/threads/${id}`);
  return {
    asked: [...asked],
    held: ((await got.json()) as { messages: Message[] }).messages,
  };
};

const userMessage = (content: string): Message => ({
  id: randomUUID(),
  role: "user",
  content,
});

test("given a thread with two exchanges, when its owner picks another model and then edits the second message, then the fork runs on the picked model, and so does the next send on it; a model picked back to none follows the agent on the next edit", async () => {
  const { id } = await make(ANA);
  const u1 = userMessage("apples");
  const first = await runWith(id, [u1]);
  const a1 = first.held.at(-1)!;
  const u2 = userMessage("pears");
  const second = await runWith(id, [u1, a1, u2]);
  await patch(ANA, id, { model: "big" });
  const u2edit = userMessage("plums");
  const edited = await runWith(id, [u1, a1, u2edit]);
  const a2edit = edited.held.at(-1)!;
  const next = await runWith(id, [u1, a1, u2edit, a2edit, userMessage("and?")]);
  await patch(ANA, id, { model: null });
  const back = await runWith(id, [u1, a1, userMessage("figs")]);
  assert.deepEqual(
    {
      first: first.asked,
      second: second.asked,
      edited: edited.asked,
      next: next.asked,
      back: back.asked,
      // The edit forked: the thread holds the edited message, not the old one.
      forked: edited.held.map((m) => m.content).includes("pears"),
    },
    {
      first: [{ model: "small-model", till: true }],
      second: [{ model: "small-model", till: true }],
      edited: [{ model: "big-model", till: true }],
      next: [{ model: "big-model", till: true }],
      back: [{ model: "small-model", till: true }],
      forked: false,
    },
  );
});

test("given a thread whose run goes, when its owner deletes it, then the run is stopped first: its model call is aborted, its stream ends, and the thread is gone", async () => {
  for (const agent of ["clerk", "lean"]) {
    const { id } = await make(ANA, { agent });
    let called!: () => void;
    const calling = new Promise<void>((r) => (called = r));
    let aborted = false;
    // A model call that answers only once it is aborted.
    faux.setResponses([
      async (_context, options) => {
        called();
        await new Promise((r) => options?.signal?.addEventListener("abort", r));
        aborted = true;
        return fauxAssistantMessage("Never.");
      },
    ]);
    const ran = await as(
      ANA,
      `/threads/${id}/runs`,
      json("POST", {
        threadId: id,
        runId: randomUUID(),
        messages: [userMessage("Count slowly.")],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      }),
    );
    const body = ran.text();
    await calling;
    const deleted = await as(ANA, `/threads/${id}`, { method: "DELETE" });
    // The stream ends once the run has; a run that goes on keeps it open.
    const ended = await Promise.race([
      body.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 5_000)),
    ]);
    assert.deepEqual(
      {
        deleted: deleted.status,
        aborted,
        ended,
        opened: (await as(ANA, `/threads/${id}`)).status,
        listed: (await listed(ANA, id)) !== undefined,
      },
      { deleted: 204, aborted: true, ended: true, opened: 404, listed: false },
    );
  }
});
