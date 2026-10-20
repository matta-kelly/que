/**
 * The command, through its real entry point, against a local server that
 * replays que's answers.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import {
  PUBLIC_KEY,
  SECRET_KEY,
  standIn,
} from "../fixtures/langfuse-stand-in.js";
import { KEY, provider } from "../fixtures/provider-stand-in.js";
import { replay } from "../fixtures/replay.js";

const cli = join(import.meta.dirname, "cli.ts");
const shop = join(import.meta.dirname, "../fixtures/deployments/shop");

const command = (url: string, ...args: string[]) =>
  new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cli, ...args],
      { env: { ...process.env, QUE_URL: url }, timeout: 20_000 },
      (error, out, err) =>
        resolve({
          code: error ? ((error.code as number | undefined) ?? 1) : 0,
          out,
          err,
        }),
    );
  });

/** The command, with the settings a deployment's `.env` gives it, and the commit as `just eval` gives it. */
const commandWith = (
  langfuse: Record<string, string>,
  url: string,
  ...args: string[]
) =>
  new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", cli, ...args],
      {
        env: { ...process.env, QUE_URL: url, ...langfuse },
        timeout: 20_000,
      },
      (error, out, err) =>
        resolve({
          code: error ? ((error.code as number | undefined) ?? 1) : 0,
          out,
          err,
        }),
    );
  });

const threads = (sent: { method: string; path: string }[]) =>
  sent.filter(({ method, path }) => method === "POST" && path === "/threads");

test("the command runs each case of a deployment under each of its agents, prints the report, and ends with a fault when a run did not finish", async () => {
  // que does not finish the runs under lean.
  const server = await replay(
    (body) => body.config?.configurable?.agent === "lean",
  );
  try {
    const { code, out } = await command(server.url, shop);
    assert.equal(code, 1);
    assert.ok(out.includes("shop / find-order / find-order-by-customer\n"));
    assert.ok(out.includes("shop / find-order / find-order-not-asked\n"));
    assert.ok(
      out.includes('  [chat]\n    call     open_package {"package":"shop"}\n'),
    );
    assert.ok(
      out.includes('  [lean]\n    error    no agent "nope". Agents: chat\n'),
    );
    assert.ok(
      out.includes(
        "  [notes-only]\n    skipped  notes-only does not have shop\n",
      ),
    );
    assert.ok(out.trimEnd().endsWith("4 runs, 2 did not finish, 2 skipped"));
  } finally {
    await server.close();
  }
});

test("the command runs only the agents named, and ends with no fault when each run finished", async () => {
  const server = await replay();
  try {
    const { code, out } = await command(server.url, shop, "--agent", "chat");
    assert.equal(code, 0);
    assert.ok(!out.includes("[lean]"));
    assert.ok(out.trimEnd().endsWith("2 runs, 0 did not finish, 0 skipped"));
  } finally {
    await server.close();
  }
});

test("the command stops, and says que is not up, when nothing answers", async () => {
  const { code, out, err } = await command("http://127.0.0.1:9", shop);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, /eval: que is not up at http:\/\/127\.0\.0\.1:9/);
});

test("with Langfuse set, the command prints the report, sends each agent's runs as one experiment, and prints a link to each", async () => {
  // que does not finish the runs under lean.
  const server = await replay(
    (body) => body.config?.configurable?.agent === "lean",
  );
  const langfuse = await standIn();
  try {
    const { code, out } = await commandWith(
      {
        LANGFUSE_BASE_URL: langfuse.url,
        LANGFUSE_PUBLIC_KEY: PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: SECRET_KEY,
        QUE_COMMIT: "abc1234",
      },
      server.url,
      shop,
    );
    assert.equal(code, 1);
    assert.ok(
      out
        .trimEnd()
        .endsWith(
          `4 runs, 2 did not finish, 2 skipped\n\nLangfuse\n  [chat]  ${langfuse.run(1)}\n  [lean]  ${langfuse.run(2)}`,
        ),
    );
    const traces = langfuse.traces();
    assert.deepEqual(
      traces.map(({ item, metadata, level }) => ({
        item,
        agent: metadata.agent,
        commit: metadata.commit,
        level,
      })),
      [
        {
          item: "shop.shop.find-order-by-customer",
          agent: "chat",
          commit: "abc1234",
          level: undefined,
        },
        {
          item: "shop.shop.find-order-not-asked",
          agent: "chat",
          commit: "abc1234",
          level: undefined,
        },
        {
          item: "shop.shop.find-order-by-customer",
          agent: "lean",
          commit: "abc1234",
          level: "ERROR",
        },
        {
          item: "shop.shop.find-order-not-asked",
          agent: "lean",
          commit: "abc1234",
          level: "ERROR",
        },
      ],
    );
    assert.match(
      traces[0].experiment,
      /^chat@abc1234 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
    assert.equal(
      traces[2].experiment,
      traces[0].experiment.replace("chat@", "lean@"),
    );
  } finally {
    await server.close();
    await langfuse.close();
  }
});

test("the command stops before any run, and names what is missing, when Langfuse is set in part", async () => {
  const server = await replay();
  try {
    const { code, out, err } = await commandWith(
      { LANGFUSE_BASE_URL: "http://127.0.0.1:9", QUE_COMMIT: "abc1234" },
      server.url,
      shop,
    );
    assert.equal(code, 1);
    assert.equal(out, "");
    assert.match(
      err,
      /eval: Langfuse is set in part\. Missing: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY/,
    );
    assert.deepEqual(threads(server.sent), []);
  } finally {
    await server.close();
  }
});

test("the command stops before any run, and says Langfuse is not up, when it is set and nothing answers", async () => {
  const server = await replay();
  try {
    const { code, out, err } = await commandWith(
      {
        LANGFUSE_BASE_URL: "http://127.0.0.1:9",
        LANGFUSE_PUBLIC_KEY: PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: SECRET_KEY,
        QUE_COMMIT: "abc1234",
      },
      server.url,
      shop,
    );
    assert.equal(code, 1);
    assert.equal(out, "");
    assert.match(err, /eval: Langfuse is not up at http:\/\/127\.0\.0\.1:9/);
    assert.deepEqual(threads(server.sent), []);
  } finally {
    await server.close();
  }
});

test("the command still prints the report, and ends with a fault, when Langfuse does not take the runs", async () => {
  const server = await replay();
  const langfuse = await standIn();
  try {
    const { code, out, err } = await commandWith(
      {
        LANGFUSE_BASE_URL: langfuse.url,
        LANGFUSE_PUBLIC_KEY: PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: "sk-lf-wrong",
        QUE_COMMIT: "abc1234",
      },
      server.url,
      shop,
      "--agent",
      "chat",
    );
    assert.equal(code, 1);
    assert.ok(out.trimEnd().endsWith("2 runs, 0 did not finish, 0 skipped"));
    assert.match(err, /eval: Langfuse did not take the runs: /);
  } finally {
    await server.close();
    await langfuse.close();
  }
});

test("the command stops before any run, and lists the models, when the judge is not one the deployment lists", async () => {
  const server = await replay();
  try {
    const { code, out, err } = await commandWith(
      { QUE_JUDGE: "nope" },
      server.url,
      shop,
    );
    assert.equal(code, 1);
    assert.equal(out, "");
    assert.match(err, /eval: no model "nope"\. Models: small, big/);
    assert.deepEqual(threads(server.sent), []);
  } finally {
    await server.close();
  }
});

test("with a judge set, the command prints a verdict under each run, and sends each as a score", async () => {
  const server = await replay();
  const langfuse = await standIn();
  // The run of each case is the same replay: it opens a plugin, then answers.
  const model = await provider((question) =>
    question.includes("No operation is called.")
      ? "The agent called open_package.\nVERDICT: no"
      : "The answer says what the agent finds.\nVERDICT: yes",
  );
  try {
    const { code, out } = await commandWith(
      {
        LANGFUSE_BASE_URL: langfuse.url,
        LANGFUSE_PUBLIC_KEY: PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: SECRET_KEY,
        QUE_COMMIT: "abc1234",
        QUE_JUDGE: "small",
        FIREWORKS_BASE_URL: model.url,
        FIREWORKS_API_KEY: KEY,
      },
      server.url,
      shop,
      "--agent",
      "chat",
    );
    // A verdict of fail is no fault.
    assert.equal(code, 0);
    assert.equal(model.asked.length, 2);
    assert.ok(
      out.includes(
        "    answer   I can find the shop's orders by customer name.\n    verdict  pass  The answer says what the agent finds.\n",
      ),
    );
    assert.ok(
      out.includes(
        "    answer   I can find the shop's orders by customer name.\n    verdict  fail  The agent called open_package.\n",
      ),
    );
    assert.ok(
      out.includes(
        "\n\n2 runs, 0 did not finish, 0 skipped\n  [chat]  1 of 2 passed\n\nLangfuse\n",
      ),
    );
    assert.deepEqual(
      langfuse.scores().map(({ item, name, dataType, value, comment }) => ({
        item,
        name,
        dataType,
        value,
        comment,
      })),
      [
        {
          item: "shop.shop.find-order-by-customer",
          name: "good",
          dataType: "BOOLEAN",
          value: 1,
          comment: "The answer says what the agent finds.",
        },
        {
          item: "shop.shop.find-order-not-asked",
          name: "good",
          dataType: "BOOLEAN",
          value: 0,
          comment: "The agent called open_package.",
        },
      ],
    );
    assert.deepEqual(
      langfuse.traces().map(({ metadata }) => metadata.judge),
      ["small", "small"],
    );
  } finally {
    await server.close();
    await langfuse.close();
    await model.close();
  }
});
