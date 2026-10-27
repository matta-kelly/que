/**
 * The one file that talks to Langfuse, against a local server that stands in
 * for it. No test here needs a live Langfuse.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DATASET,
  PUBLIC_KEY,
  SECRET_KEY,
  standIn,
} from "../fixtures/langfuse-stand-in.js";
import { langfuse, settings } from "./langfuse.js";

const byCustomer = {
  id: "shop.shop.find-order-by-customer",
  input: "Where is the order of Ada?",
  expected: "The answer gives the state of the order of Ada.",
  metadata: {
    plugin: "shop",
    capability: "find-order",
    case: "find-order-by-customer",
    start: "Ada has one open order.",
  },
};
const notAsked = {
  id: "shop.shop.find-order-not-asked",
  input: "What can you do?",
  expected: "No operation is called.",
  metadata: {
    plugin: "shop",
    capability: "find-order",
    case: "find-order-not-asked",
    start: "Any.",
  },
};
const dataset = { name: "shop", items: [byCustomer, notAsked] };

/** The two items, as Langfuse holds them when it has the cases as they are. */
const held = [
  {
    id: byCustomer.id,
    status: "ACTIVE" as const,
    input: byCustomer.input,
    expectedOutput: byCustomer.expected,
    metadata: byCustomer.metadata,
  },
  {
    id: notAsked.id,
    status: "ACTIVE" as const,
    input: notAsked.input,
    expectedOutput: notAsked.expected,
    metadata: notAsked.metadata,
  },
];

const open = {
  steps: [
    {
      kind: "call" as const,
      name: "shop-find-orders",
      args: { customer: "Ada" },
    },
    {
      kind: "result" as const,
      name: "shop-find-orders",
      text: '[{"id":12,"state":"open"}]',
    },
  ],
  answer: "Order 12 of Ada is open.",
};

const chat = {
  agent: "chat",
  name: "chat@abc1234",
  run: "chat@abc1234 2026-10-13T07:47:11Z",
  metadata: {
    agent: "chat",
    config: { name: "chat", plugins: [], model: "small", loop: "long-chat" },
    commit: "abc1234",
    deployment: "shop",
  },
  outputs: [
    { item: byCustomer.id, output: open },
    { item: notAsked.id, output: { error: "it stopped" } },
  ],
};
const lean = {
  agent: "lean",
  name: "lean@abc1234",
  run: "lean@abc1234 2026-10-13T07:47:11Z",
  metadata: {
    agent: "lean",
    config: { name: "lean", plugins: [], model: "small", loop: "long-chat" },
    commit: "abc1234",
    deployment: "shop",
  },
  outputs: [{ item: byCustomer.id, output: open }],
};

const to = (url: string) =>
  langfuse({ url, publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });

test("with no Langfuse setting, there is nothing to send to", () => {
  assert.equal(settings({ QUE_COMMIT: "abc1234" }), undefined);
});

test("with the three Langfuse settings and the commit, gives them", () => {
  assert.deepEqual(
    settings({
      LANGFUSE_BASE_URL: "https://langfuse.example.com",
      LANGFUSE_PUBLIC_KEY: "pk-lf-1",
      LANGFUSE_SECRET_KEY: "sk-lf-1",
      QUE_COMMIT: "abc1234",
    }),
    {
      url: "https://langfuse.example.com",
      publicKey: "pk-lf-1",
      secretKey: "sk-lf-1",
      commit: "abc1234",
    },
  );
});

test("stops, naming each setting that is missing, when only some are set", () => {
  assert.throws(
    () => settings({ LANGFUSE_BASE_URL: "https://langfuse.example.com" }),
    {
      message:
        "eval: Langfuse is set in part. Missing: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, QUE_COMMIT",
    },
  );
});

test("says Langfuse is up when it answers, and not up when nothing does", async () => {
  const server = await standIn();
  try {
    assert.equal(await to(server.url).up(), true);
  } finally {
    await server.close();
  }
  assert.equal(await to(server.url).up(), false);
});

test("makes the dataset when Langfuse has none, with one item for each case", async () => {
  const server = await standIn();
  try {
    await to(server.url).send({ dataset, experiments: [] });
    assert.deepEqual(
      server.sent
        .filter(
          ({ method, path }) =>
            method === "POST" && path === "/api/public/v2/datasets",
        )
        .map(({ body }) => (body as { name: string }).name),
      ["shop"],
    );
    assert.deepEqual(
      server
        .upserts()
        .map(({ datasetName, id, input, expectedOutput, metadata }) => ({
          datasetName,
          id,
          input,
          expectedOutput,
          metadata,
        })),
      [
        {
          datasetName: "shop",
          id: "shop.shop.find-order-by-customer",
          input: "Where is the order of Ada?",
          expectedOutput: "The answer gives the state of the order of Ada.",
          metadata: {
            plugin: "shop",
            capability: "find-order",
            case: "find-order-by-customer",
            start: "Ada has one open order.",
          },
        },
        {
          datasetName: "shop",
          id: "shop.shop.find-order-not-asked",
          input: "What can you do?",
          expectedOutput: "No operation is called.",
          metadata: {
            plugin: "shop",
            capability: "find-order",
            case: "find-order-not-asked",
            start: "Any.",
          },
        },
      ],
    );
  } finally {
    await server.close();
  }
});

test("changes nothing in the dataset when Langfuse has the cases as they are", async () => {
  const server = await standIn({ dataset: "shop", items: held });
  try {
    await to(server.url).send({ dataset, experiments: [] });
    assert.deepEqual(
      server.sent.filter(
        ({ method, path }) =>
          method === "POST" &&
          (path === "/api/public/v2/datasets" ||
            path === "/api/public/dataset-items"),
      ),
      [],
    );
  } finally {
    await server.close();
  }
});

test("sends again the item of a case that changed, and no other", async () => {
  const server = await standIn({
    dataset: "shop",
    items: [{ ...held[0], expectedOutput: "The answer names Ada." }, held[1]],
  });
  try {
    await to(server.url).send({ dataset, experiments: [] });
    assert.deepEqual(
      server
        .upserts()
        .map(({ id, expectedOutput }) => ({ id, expectedOutput })),
      [
        {
          id: "shop.shop.find-order-by-customer",
          expectedOutput: "The answer gives the state of the order of Ada.",
        },
      ],
    );
  } finally {
    await server.close();
  }
});

test("archives the item of a case that is gone, and no other", async () => {
  const server = await standIn({
    dataset: "shop",
    items: [
      ...held,
      {
        id: "shop.shop.find-order-by-date",
        status: "ACTIVE",
        input: "Which orders came in today?",
        expectedOutput: "The answer lists the orders of today.",
        metadata: {
          plugin: "shop",
          capability: "find-order",
          case: "find-order-by-date",
          start: "Any.",
        },
      },
    ],
  });
  try {
    await to(server.url).send({ dataset, experiments: [] });
    assert.deepEqual(
      server.upserts().map(({ id, status }) => ({ id, status })),
      [{ id: "shop.shop.find-order-by-date", status: "ARCHIVED" }],
    );
  } finally {
    await server.close();
  }
});

test("makes active again the item of a case that came back", async () => {
  const server = await standIn({
    dataset: "shop",
    items: [{ ...held[0], status: "ARCHIVED" }, held[1]],
  });
  try {
    await to(server.url).send({ dataset, experiments: [] });
    assert.deepEqual(
      server.upserts().map(({ id, status }) => ({ id, status })),
      [{ id: "shop.shop.find-order-by-customer", status: "ACTIVE" }],
    );
  } finally {
    await server.close();
  }
});

test("sends one trace for each run of an experiment, on its item of the dataset, with the input, what good looks like, the output and the metadata", async () => {
  const server = await standIn();
  try {
    await to(server.url).send({ dataset, experiments: [chat] });
    assert.deepEqual(server.traces(), [
      {
        experiment: "chat@abc1234 2026-10-13T07:47:11Z",
        dataset: DATASET,
        item: "shop.shop.find-order-by-customer",
        input: "Where is the order of Ada?",
        expected: "The answer gives the state of the order of Ada.",
        output: open,
        metadata: {
          plugin: "shop",
          capability: "find-order",
          case: "find-order-by-customer",
          start: "Ada has one open order.",
          agent: "chat",
          config: {
            name: "chat",
            plugins: [],
            model: "small",
            loop: "long-chat",
          },
          commit: "abc1234",
          deployment: "shop",
        },
      },
      {
        experiment: "chat@abc1234 2026-10-13T07:47:11Z",
        dataset: DATASET,
        item: "shop.shop.find-order-not-asked",
        input: "What can you do?",
        expected: "No operation is called.",
        output: { error: "it stopped" },
        metadata: {
          plugin: "shop",
          capability: "find-order",
          case: "find-order-not-asked",
          start: "Any.",
          agent: "chat",
          config: {
            name: "chat",
            plugins: [],
            model: "small",
            loop: "long-chat",
          },
          commit: "abc1234",
          deployment: "shop",
        },
        level: "ERROR",
        status: "it stopped",
      },
    ]);
  } finally {
    await server.close();
  }
});

test("an experiment has a trace for the items of its own runs only", async () => {
  const server = await standIn();
  try {
    await to(server.url).send({ dataset, experiments: [chat, lean] });
    assert.deepEqual(
      server.traces().map(({ experiment, item }) => ({ experiment, item })),
      [
        {
          experiment: "chat@abc1234 2026-10-13T07:47:11Z",
          item: "shop.shop.find-order-by-customer",
        },
        {
          experiment: "chat@abc1234 2026-10-13T07:47:11Z",
          item: "shop.shop.find-order-not-asked",
        },
        {
          experiment: "lean@abc1234 2026-10-13T07:47:11Z",
          item: "shop.shop.find-order-by-customer",
        },
      ],
    );
  } finally {
    await server.close();
  }
});

test("sends one score for each run with a pass or a fail, on its trace, and none for a run with no verdict", async () => {
  const server = await standIn();
  try {
    await to(server.url).send({
      dataset,
      experiments: [
        {
          ...chat,
          outputs: [
            {
              item: byCustomer.id,
              output: open,
              verdict: { pass: true, reason: "The answer gives the state." },
            },
            {
              item: notAsked.id,
              output: { steps: [], answer: "I can find the shop's orders." },
              verdict: { pass: false, reason: "The answer names no order." },
            },
          ],
        },
        {
          ...lean,
          outputs: [
            {
              item: byCustomer.id,
              output: open,
              verdict: { none: "the reply has no VERDICT line" },
            },
          ],
        },
      ],
    });
    assert.deepEqual(server.scores(), [
      {
        experiment: "chat@abc1234 2026-10-13T07:47:11Z",
        item: "shop.shop.find-order-by-customer",
        name: "good",
        dataType: "BOOLEAN",
        value: 1,
        comment: "The answer gives the state.",
      },
      {
        experiment: "chat@abc1234 2026-10-13T07:47:11Z",
        item: "shop.shop.find-order-not-asked",
        name: "good",
        dataType: "BOOLEAN",
        value: 0,
        comment: "The answer names no order.",
      },
    ]);
  } finally {
    await server.close();
  }
});

test("gives back, for each experiment, the link Langfuse gives to its run", async () => {
  const server = await standIn();
  try {
    assert.deepEqual(
      await to(server.url).send({ dataset, experiments: [chat, lean] }),
      [
        {
          agent: "chat",
          run: "chat@abc1234 2026-10-13T07:47:11Z",
          url: server.run(1),
        },
        {
          agent: "lean",
          run: "lean@abc1234 2026-10-13T07:47:11Z",
          url: server.run(2),
        },
      ],
    );
  } finally {
    await server.close();
  }
});

test("gives back no link, and still sends the traces, when Langfuse gives no run", async () => {
  const server = await standIn({ runs: false });
  try {
    assert.deepEqual(
      await to(server.url).send({ dataset, experiments: [lean] }),
      [{ agent: "lean", run: "lean@abc1234 2026-10-13T07:47:11Z" }],
    );
    assert.deepEqual(
      server.traces().map(({ experiment, item }) => ({ experiment, item })),
      [
        {
          experiment: "lean@abc1234 2026-10-13T07:47:11Z",
          item: "shop.shop.find-order-by-customer",
        },
      ],
    );
  } finally {
    await server.close();
  }
});

test("stops, and says Langfuse did not take the runs, when the key is refused", async () => {
  const server = await standIn();
  try {
    await assert.rejects(
      langfuse({
        url: server.url,
        publicKey: PUBLIC_KEY,
        secretKey: "sk-lf-wrong",
      }).send({ dataset, experiments: [chat] }),
      (error: Error) => {
        assert.match(error.message, /^Langfuse did not take the runs: /);
        return true;
      },
    );
    assert.deepEqual(server.traces(), []);
  } finally {
    await server.close();
  }
});
