import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as z from "zod";
import { definePlugin, OpFailed } from "@mku1tra/que-plugin";
import { storeOn } from "@que/credentials";
import { accessOn } from "./access.js";

process.env.QUE_CREDENTIALS_KEY = randomBytes(32).toString("base64");

const { plugin: shop } = definePlugin({
  name: "shop",
  type: "plugin",
  title: "Shop",
  description: "The shop's order system.",
  credential: z.object({ key: z.string() }),
  connect: async ({ key }) => `conn:${key}`,
  ops: [],
});

test("given a store that holds a credential for two users and not a third, when each asks for a connection, then each gets the one its own credential makes, and the third an OpFailed", async () => {
  const store = storeOn(new PGlite());
  await store.set("ana", "shop", { key: "a1" });
  await store.set("carl", "shop", { key: "c1" });
  const access = accessOn(store);

  assert.equal(await access.getConnection(shop, undefined, "ana"), "conn:a1");
  assert.equal(await access.getConnection(shop, undefined, "carl"), "conn:c1");
  await assert.rejects(
    () => access.getConnection(shop, undefined, "bo"),
    OpFailed,
  );
});
