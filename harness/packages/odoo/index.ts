import { definePackage } from "@que/core";
import { connect, credential, type OdooConnection } from "./client.js";
import { ops } from "./ops/index.js";

export default definePackage({
  name: "odoo",
  title: "Odoo",
  description:
    "Odoo ERP, source of truth for customer companies, their addresses, and their buyers (the people who order).",
  credential,
  connect,
  // The Odoo user the rep's login belongs to (e.g. the salesperson on their customers).
  async whoami(conn: OdooConnection) {
    const [user] = (await conn.call("res.users", "read", [[conn.uid]], {
      fields: ["name", "email", "login"],
    })) as {
      name: string;
      email: string | false;
      login: string;
    }[];
    return { id: conn.uid, name: user.name, email: user.email || user.login };
  },
  ops,
});
