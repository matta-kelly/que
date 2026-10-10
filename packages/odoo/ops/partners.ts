import * as z from "zod";
import type { Operation } from "@que/core";
import type { OdooConnection } from "../client.js";
import { KIND_DOMAIN, searchPartners } from "../ontology.js";

const schema = z.object({
  name: z.string().optional().describe('Part of the name to match, case-insensitive ("acme" matches "ACME Corp")'),
  salespersonId: z
    .number()
    .int()
    .optional()
    .describe('Odoo user id of the salesperson. For "me"/"my"/"mine", pass your own Odoo user id from the system prompt. Preferred over salesperson when known'),
  salesperson: z
    .string()
    .optional()
    .describe("Part of the salesperson's name, when you don't have their Odoo user id. Ignored if salespersonId is given"),
  companyId: z.number().int().optional().describe("Only records belonging to this company (its Odoo id): its addresses, buyers, or child companies"),
  kind: z
    .enum(["company", "buyer", "address", "any"])
    .default("company")
    .describe("company (default): customer companies. buyer: people who order, at a company or on their own. address: invoice, delivery or other addresses. any: all of them"),
  limit: z.number().int().min(1).max(50).default(20).describe("Most records to return (1-50, default 20)"),
  offset: z.number().int().min(0).default(0).describe("How many matches to skip, to page through results (default 0)"),
});

// A salesperson is an internal Odoo user; an exact (case-insensitive) name wins
// over partial matches, and several partial matches are reported back.
async function resolveSalesperson(conn: OdooConnection, name: string) {
  const users = (await conn.call("res.users", "search_read", [[["share", "=", false], ["name", "ilike", name]]], {
    fields: ["id", "name"],
    limit: 10,
  })) as { id: number; name: string }[];
  const exact = users.filter((u) => u.name.toLowerCase() === name.trim().toLowerCase());
  return exact.length === 1 ? exact : users;
}

export const findPartners: Operation<OdooConnection, typeof schema> = {
  name: "findPartners",
  title: "Find customers",
  description:
    "Search Odoo customers: companies (default), buyers (the people who order), or addresses. " +
    "Filter by part of a name (case-insensitive), by salesperson, and/or by the company they belong to; with no filters it lists everything of that kind. " +
    "A salesperson is the Odoo user who handles a company; buyers and addresses match on their company's salesperson. " +
    'For "my"/"mine", pass salespersonId = your own Odoo user id from the system prompt; for someone else, pass salespersonId if you know it, otherwise their name as salesperson. ' +
    "Returns short records with ids, ordered by name, plus the total number of matches. At most 50 per call (default 20); when there are more, a note gives the offset for the next page. " +
    "For one company's full details, addresses and buyers, use getCompany with its id instead.",
  schema,
  async run({ conn }, { name, salespersonId, salesperson, companyId, kind, limit, offset }) {
    const domain: unknown[] = kind === "any" ? [] : [...KIND_DOMAIN[kind]];
    if (name) domain.push(["name", "ilike", name]);
    if (companyId !== undefined) domain.push(["parent_id", "=", companyId]);

    let userId = salespersonId;
    if (userId === undefined && salesperson) {
      const matches = await resolveSalesperson(conn, salesperson);
      if (!matches.length) return { total: 0, partners: [], note: `No salesperson matches "${salesperson}".` };
      if (matches.length > 1) {
        return { total: 0, partners: [], note: `Several salespeople match "${salesperson}". Ask which one.`, salespeople: matches };
      }
      userId = matches[0].id;
    }
    // The company's salesperson: commercial_partner_id is the top-level company (itself, for a company).
    if (userId !== undefined) domain.push(["commercial_partner_id.user_id", "=", userId]);

    const { total, partners } = await searchPartners(conn, domain, { limit, offset });
    const shown = offset + partners.length;
    const note =
      shown < total
        ? `Showing ${offset + 1}-${shown} of ${total}; pass offset=${shown} for the next page, or narrow the search.`
        : undefined;
    return { total, partners, ...(note ? { note } : {}) };
  },
};
