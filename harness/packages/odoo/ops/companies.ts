import * as z from "zod";
import type { Operation } from "@que/core";
import type { OdooConnection } from "../client.js";
import {
  FIELDS,
  KIND_DOMAIN,
  searchPartners,
  toPartner,
  type Row,
} from "../ontology.js";

/** Most addresses, and most buyers, returned with a company; findPartners pages through the rest. */
export const CHILD_LIMIT = 50;

const schema = z.object({
  id: z
    .number()
    .int()
    .describe(
      "Odoo id of the company (res.partner id), e.g. from findPartners",
    ),
});

export const getCompany: Operation<OdooConnection, typeof schema> = {
  name: "getCompany",
  title: "Get a customer company",
  description:
    "Get one customer company by its Odoo id: contact details, salesperson, its addresses (invoice/delivery/other) and its buyers (the people who order), " +
    "plus issues where the record breaks the expected structure (e.g. has a parent company, or no address). " +
    "Use it once you have an id, from findPartners or the user. To search by name or salesperson, use findPartners instead. " +
    `Returns up to ${CHILD_LIMIT} addresses and ${CHILD_LIMIT} buyers; a note says how to page through the rest with findPartners. ` +
    "If the id isn't a company, returns found: false with a note (e.g. pointing a buyer's id to their company).",
  schema,
  async run({ conn }, { id }) {
    // `read` on an id that doesn't exist returns [] (checked against our Odoo), so not-found isn't an error.
    const [row] = (await conn.call("res.partner", "read", [[id]], {
      fields: FIELDS,
    })) as Row[];
    if (!row)
      return { found: false, id, note: `No partner has Odoo id ${id}.` };
    const partner = toPartner(row);
    if (partner.kind !== "company") {
      const at = partner.company
        ? ` of ${partner.company.name}; call getCompany with id ${partner.company.id}`
        : " with no company";
      return {
        found: false,
        id,
        note: `Odoo id ${id} is not a company: it's ${partner.kind === "buyer" ? "a buyer" : "an address"}${at}.`,
        partner,
      };
    }

    const children = (kind: "address" | "buyer") =>
      searchPartners(conn, [["parent_id", "=", id], ...KIND_DOMAIN[kind]], {
        limit: CHILD_LIMIT,
      });
    const [addresses, buyers, childCompanies] = await Promise.all([
      children("address"),
      children("buyer"),
      conn.call("res.partner", "search_count", [
        [["parent_id", "=", id], ...KIND_DOMAIN.company],
      ]) as Promise<number>,
    ]);

    const issues: string[] = [];
    if (row.parent_id)
      issues.push(
        `has a parent company (${row.parent_id[1]}, id ${row.parent_id[0]}); may not be the top-level company`,
      );
    if (childCompanies)
      issues.push(
        `has ${childCompanies} child compan${childCompanies === 1 ? "y" : "ies"} (find them with findPartners, companyId ${id}, kind company)`,
      );
    if (!addresses.total) issues.push("no invoice, delivery, or other address");

    const more = [
      addresses.total > CHILD_LIMIT &&
        `Showing ${CHILD_LIMIT} of ${addresses.total} addresses; call findPartners with companyId=${id}, kind="address", offset=${CHILD_LIMIT} for the rest.`,
      buyers.total > CHILD_LIMIT &&
        `Showing ${CHILD_LIMIT} of ${buyers.total} buyers; call findPartners with companyId=${id}, kind="buyer", offset=${CHILD_LIMIT} for the rest.`,
    ].filter(Boolean);

    return {
      found: true,
      company: partner,
      addresses: addresses.partners,
      buyers: buyers.partners,
      issues,
      ...(more.length ? { note: more.join(" ") } : {}),
    };
  },
};
