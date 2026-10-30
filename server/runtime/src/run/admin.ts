/**
 * The admin API: `/que/admin/*` is for an admin alone, and reads the runtime's control plane. A request with no
 * identity gets 401; one from a member gets 403, on every admin path.
 */

import { Hono } from "hono";
import { control } from "../access/control.js";
import { signedIn, type SignedIn } from "./signed-in.js";

export const admin = new Hono<SignedIn>();

admin.use("/que/admin/*", signedIn, async (c, next) => {
  if (c.get("user").role !== "admin")
    return c.json({ error: "Only an admin can do this" }, 403);
  return next();
});

admin.get("/que/admin/domains", async (c) => c.json(await control.domains()));
