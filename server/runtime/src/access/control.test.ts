/**
 * The runtime's one control plane: made from the cards mount made, and DATABASE_URL, as connections.ts makes access
 * from the credential store. Mounted once, when this module first loads: the deployment is the environment's, as
 * serve.test.ts mounts it.
 */

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { deploymentRoot } from "../../../tests/deployment-root.js";

const db = await PGlite.create();
const database = new PGLiteSocketServer({ db, port: 0, maxConnections: 10 });
await database.start();
process.env.DATABASE_URL = `postgresql://postgres@${database.getServerConn()}/postgres`;
process.env.QUE_DEPLOYMENT = deploymentRoot(
  join(import.meta.dirname, "../../../tests/integration/mount/fixtures"),
  "uses-resolve",
);

after(async () => {
  // A connection the runtime opened at load may still be on its way: let it land before the database goes.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await database.stop();
  await db.close();
});

const { control } = await import("./control.js");

test("the runtime makes one control plane on the cards mount made and DATABASE_URL", async () => {
  assert.equal((await import("./control.js")).control, control);
  assert.deepEqual(await control.domains(), [
    { name: "domain", connectors: ["source"], roles: [] },
  ]);
  await control.grant("ana", "domain", "admin");
  assert.deepEqual(await control.grantsOf("ana"), ["domain"]);
});
