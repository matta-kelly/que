/**
 * The customer ontology, defined once: what a Company, an Address and a Buyer
 * are, how each is found in Odoo, and how an Odoo row becomes one. Every op
 * returns these types.
 *
 * All three are res.partner records. A company has is_company set; its
 * addresses and buyers are its child records, told apart by `type`: "contact"
 * is a person (a buyer), anything else (invoice, delivery, other, followup) is
 * an address. People without a parent company are buyers with no company.
 */

import * as z from "zod";
import type { OdooConnection } from "./client.js";

const Ref = z.object({ id: z.number(), name: z.string() });

const Place = {
  street: z.string().nullable(),
  city: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().nullable(),
};

export const Company = z.object({
  kind: z.literal("company"),
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  ...Place,
  salesperson: Ref.nullable(),
});

export const Address = z.object({
  kind: z.literal("address"),
  id: z.number(),
  type: z.enum(["invoice", "delivery", "other", "followup"]),
  name: z.string().nullable(),
  company: Ref.nullable(),
  ...Place,
});

export const Buyer = z.object({
  kind: z.literal("buyer"),
  id: z.number(),
  name: z.string(),
  company: Ref.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export type Company = z.infer<typeof Company>;
export type Address = z.infer<typeof Address>;
export type Buyer = z.infer<typeof Buyer>;
export type Partner = Company | Address | Buyer;
export type Kind = Partner["kind"];

// The Odoo domain for each kind. Together they cover every partner exactly once,
// matching kindOf below: is_company wins, then type splits people from addresses.
export const KIND_DOMAIN: Record<Kind, unknown[]> = {
  company: [["is_company", "=", true]],
  buyer: [
    ["is_company", "=", false],
    ["type", "=", "contact"],
  ],
  address: [
    ["is_company", "=", false],
    ["type", "!=", "contact"],
  ],
};

/** A res.partner row as search_read returns it for FIELDS. */
export type Row = {
  id: number;
  name: string | false;
  is_company: boolean;
  type: string;
  parent_id: [number, string] | false;
  user_id: [number, string] | false;
  email: string | false;
  phone: string | false;
  street: string | false;
  city: string | false;
  zip: string | false;
  country_id: [number, string] | false;
};

export const FIELDS = [
  "id",
  "name",
  "is_company",
  "type",
  "parent_id",
  "user_id",
  "email",
  "phone",
  "street",
  "city",
  "zip",
  "country_id",
];

// Odoo returns false for empty fields and [id, name] pairs for relations; flatten both.
const text = (v: string | false) => v || null;
const ref = (v: [number, string] | false) =>
  v ? { id: v[0], name: v[1] } : null;
const place = (r: Row) => ({
  street: text(r.street),
  city: text(r.city),
  zip: text(r.zip),
  country: r.country_id ? r.country_id[1] : null,
});

export const kindOf = (r: Row): Kind =>
  r.is_company ? "company" : r.type === "contact" ? "buyer" : "address";

export function toPartner(r: Row): Partner {
  switch (kindOf(r)) {
    case "company":
      return {
        kind: "company",
        id: r.id,
        name: text(r.name) ?? "",
        email: text(r.email),
        phone: text(r.phone),
        ...place(r),
        salesperson: ref(r.user_id),
      };
    case "buyer":
      return {
        kind: "buyer",
        id: r.id,
        name: text(r.name) ?? "",
        company: ref(r.parent_id),
        email: text(r.email),
        phone: text(r.phone),
      };
    case "address":
      return {
        kind: "address",
        id: r.id,
        type: r.type as Address["type"],
        name: text(r.name),
        company: ref(r.parent_id),
        ...place(r),
      };
  }
}

/** One page of partners matching a domain, and how many match in all. */
export async function searchPartners(
  conn: OdooConnection,
  domain: unknown[],
  { limit, offset = 0 }: { limit: number; offset?: number },
) {
  const [total, rows] = await Promise.all([
    conn.call("res.partner", "search_count", [domain]) as Promise<number>,
    conn.call("res.partner", "search_read", [domain], {
      fields: FIELDS,
      limit,
      offset,
      order: "name, id",
    }) as Promise<Row[]>,
  ]);
  return { total, partners: rows.map(toPartner) };
}
