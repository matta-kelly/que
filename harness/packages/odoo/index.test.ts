/**
 * Package tests: the definition passes the contract, and each op sends the
 * right Odoo domain and maps rows into the ontology. No network: ops run
 * against a fake connection that returns recorded rows and records every call.
 * `npx tsx --test packages/odoo/test.ts` (part of `just check`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePackage } from "@que/core";
import odoo from "./index.js";
import type { OdooConnection } from "./client.js";
import { Address, Buyer, Company, type Row } from "./ontology.js";
import { findPartners } from "./ops/partners.js";
import { CHILD_LIMIT, getCompany } from "./ops/companies.js";

type Call = {
  model: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
};

// Answers each call with `answer` and keeps it in `calls` for the assertions.
function fakeConn(
  answer: (c: Call) => unknown,
): OdooConnection & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    uid: 7,
    calls,
    async call(model, method, args = [], kwargs = {}) {
      const c = { model, method, args, kwargs };
      calls.push(c);
      return answer(c);
    },
  };
}

const blank = {
  email: false,
  phone: false,
  street: false,
  city: false,
  zip: false,
  country_id: false,
  user_id: false,
  parent_id: false,
} as const;
const ACME: Row = {
  ...blank,
  id: 1,
  name: "ACME Corp",
  is_company: true,
  type: "contact",
  email: "shop@acme.test",
  city: "Lyon",
  country_id: [75, "France"],
  user_id: [7, "Rep One"],
};
const BUYER: Row = {
  ...blank,
  id: 2,
  name: "Ann Buyer",
  is_company: false,
  type: "contact",
  parent_id: [1, "ACME Corp"],
  phone: "+33 1",
};
const DELIVERY: Row = {
  ...blank,
  id: 3,
  name: false,
  is_company: false,
  type: "delivery",
  parent_id: [1, "ACME Corp"],
  street: "1 Dock St",
};

// The domain and paging of the (one) res.partner search_read the op made.
function search(conn: { calls: Call[] }) {
  const reads = conn.calls.filter(
    (c) => c.model === "res.partner" && c.method === "search_read",
  );
  assert.equal(reads.length, 1);
  return {
    domain: reads[0].args[0],
    limit: reads[0].kwargs.limit,
    offset: reads[0].kwargs.offset,
  };
}

const find = (
  conn: OdooConnection,
  params: Partial<Parameters<typeof findPartners.run>[1]>,
) =>
  findPartners.run({ conn }, findPartners.schema.parse(params)) as Promise<{
    total: number;
    partners: unknown[];
    note?: string;
    salespeople?: unknown;
  }>;

test("the definition passes the package contract", () => {
  validatePackage(odoo);
});

test("findPartners: each kind has its own domain", async () => {
  const cases = {
    company: [["is_company", "=", true]],
    buyer: [
      ["is_company", "=", false],
      ["type", "=", "contact"],
    ],
    address: [
      ["is_company", "=", false],
      ["type", "!=", "contact"],
    ],
    any: [],
  } as const;
  for (const [kind, domain] of Object.entries(cases)) {
    const conn = fakeConn((c) => (c.method === "search_count" ? 0 : []));
    await find(conn, { kind: kind as keyof typeof cases });
    assert.deepEqual(search(conn).domain, domain, kind);
  }
});

test("findPartners: defaults to companies, 20 at a time from the start", async () => {
  const conn = fakeConn((c) => (c.method === "search_count" ? 0 : []));
  await find(conn, {});
  assert.deepEqual(search(conn), {
    domain: [["is_company", "=", true]],
    limit: 20,
    offset: 0,
  });
});

test("findPartners: name and company filters", async () => {
  const conn = fakeConn((c) => (c.method === "search_count" ? 0 : []));
  await find(conn, { name: "acme", companyId: 1, kind: "buyer" });
  assert.deepEqual(search(conn).domain, [
    ["is_company", "=", false],
    ["type", "=", "contact"],
    ["name", "ilike", "acme"],
    ["parent_id", "=", 1],
  ]);
});

test("findPartners: salespersonId is used as is, without looking up a name", async () => {
  const conn = fakeConn((c) => (c.method === "search_count" ? 0 : []));
  await find(conn, { salespersonId: 7, salesperson: "someone else" });
  assert.ok(!conn.calls.some((c) => c.model === "res.users"));
  assert.deepEqual(search(conn).domain, [
    ["is_company", "=", true],
    ["commercial_partner_id.user_id", "=", 7],
  ]);
});

test("findPartners: a salesperson name resolves to one user", async () => {
  const conn = fakeConn((c) =>
    c.model === "res.users"
      ? [
          { id: 9, name: "Rep Nine" },
          { id: 90, name: "Rep Ninety" },
        ]
      : c.method === "search_count"
        ? 0
        : [],
  );
  await find(conn, { salesperson: "rep nine" });
  const users = conn.calls.find((c) => c.model === "res.users")!;
  assert.deepEqual(users.args[0], [
    ["share", "=", false],
    ["name", "ilike", "rep nine"],
  ]);
  assert.deepEqual(search(conn).domain, [
    ["is_company", "=", true],
    ["commercial_partner_id.user_id", "=", 9],
  ]);
});

test("findPartners: an ambiguous or unknown salesperson is reported, not searched", async () => {
  const two = fakeConn(() => [
    { id: 9, name: "Rep Nine" },
    { id: 90, name: "Rep Ninety" },
  ]);
  const several = await find(two, { salesperson: "rep" });
  assert.equal(several.total, 0);
  assert.match(several.note!, /Several salespeople/);
  assert.deepEqual(several.salespeople, [
    { id: 9, name: "Rep Nine" },
    { id: 90, name: "Rep Ninety" },
  ]);

  const none = await find(
    fakeConn(() => []),
    { salesperson: "nobody" },
  );
  assert.match(none.note!, /No salesperson matches "nobody"/);
});

test("findPartners: maps rows into the ontology", async () => {
  const conn = fakeConn((c) =>
    c.method === "search_count" ? 3 : [ACME, BUYER, DELIVERY],
  );
  const { partners, note } = await find(conn, { kind: "any" });
  assert.equal(note, undefined);
  assert.deepEqual(Company.parse(partners[0]), {
    kind: "company",
    id: 1,
    name: "ACME Corp",
    email: "shop@acme.test",
    phone: null,
    street: null,
    city: "Lyon",
    zip: null,
    country: "France",
    salesperson: { id: 7, name: "Rep One" },
  });
  assert.deepEqual(Buyer.parse(partners[1]), {
    kind: "buyer",
    id: 2,
    name: "Ann Buyer",
    company: { id: 1, name: "ACME Corp" },
    email: null,
    phone: "+33 1",
  });
  assert.deepEqual(Address.parse(partners[2]), {
    kind: "address",
    id: 3,
    type: "delivery",
    name: null,
    company: { id: 1, name: "ACME Corp" },
    street: "1 Dock St",
    city: null,
    zip: null,
    country: null,
  });
});

test("findPartners: says how to get the next page", async () => {
  const conn = fakeConn((c) =>
    c.method === "search_count" ? 143 : Array(20).fill(ACME),
  );
  const first = await find(conn, {});
  assert.equal(
    first.note,
    "Showing 1-20 of 143; pass offset=20 for the next page, or narrow the search.",
  );

  const last = fakeConn((c) =>
    c.method === "search_count" ? 143 : Array(3).fill(ACME),
  );
  const end = await find(last, { offset: 140 });
  assert.equal(search(last).offset, 140);
  assert.equal(end.note, undefined);
});

type CompanyResult = {
  found: boolean;
  note?: string;
  company?: unknown;
  addresses?: unknown[];
  buyers?: unknown[];
  issues?: string[];
};
const get = (conn: OdooConnection, id: number) =>
  getCompany.run({ conn }, { id }) as Promise<CompanyResult>;

// A company whose children are answered per kind (by the type condition in the domain).
function companyConn(
  company: Row,
  children: {
    address: Row[];
    buyer: Row[];
    companies?: number;
    addressTotal?: number;
    buyerTotal?: number;
  },
) {
  return fakeConn((c) => {
    if (c.method === "read") return [company];
    const domain = JSON.stringify(c.args[0]);
    const kind = domain.includes('["is_company","=",true]')
      ? "companies"
      : domain.includes('["type","=","contact"]')
        ? "buyer"
        : "address";
    if (c.method === "search_count") {
      return kind === "companies"
        ? (children.companies ?? 0)
        : kind === "buyer"
          ? (children.buyerTotal ?? children.buyer.length)
          : (children.addressTotal ?? children.address.length);
    }
    return kind === "buyer" ? children.buyer : children.address;
  });
}

test("getCompany: the company, its addresses and buyers", async () => {
  const conn = companyConn(ACME, { address: [DELIVERY], buyer: [BUYER] });
  const result = await get(conn, 1);
  assert.equal(result.found, true);
  assert.equal(Company.parse(result.company).name, "ACME Corp");
  assert.deepEqual(
    result.addresses!.map((a) => Address.parse(a).id),
    [3],
  );
  assert.deepEqual(
    result.buyers!.map((b) => Buyer.parse(b).id),
    [2],
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.note, undefined);

  const reads = conn.calls.filter((c) => c.method === "search_read");
  assert.ok(reads.every((c) => c.kwargs.limit === CHILD_LIMIT));
  assert.deepEqual(reads.map((c) => c.args[0]).sort(), [
    [
      ["parent_id", "=", 1],
      ["is_company", "=", false],
      ["type", "!=", "contact"],
    ],
    [
      ["parent_id", "=", 1],
      ["is_company", "=", false],
      ["type", "=", "contact"],
    ],
  ]);
});

test("getCompany: an unknown id is a normal not-found result", async () => {
  const result = await get(
    fakeConn(() => []),
    404,
  );
  assert.equal(result.found, false);
  assert.match(result.note!, /No partner has Odoo id 404/);
});

test("getCompany: a buyer's id points to their company", async () => {
  const result = await get(
    fakeConn(() => [BUYER]),
    2,
  );
  assert.equal(result.found, false);
  assert.match(result.note!, /a buyer of ACME Corp; call getCompany with id 1/);
});

test("getCompany: flags structure issues", async () => {
  const child: Row = { ...ACME, parent_id: [50, "ACME Group"] };
  const result = await get(
    companyConn(child, { address: [], buyer: [], companies: 2 }),
    1,
  );
  assert.equal(result.issues!.length, 3);
  assert.match(result.issues![0], /has a parent company \(ACME Group, id 50\)/);
  assert.match(result.issues![1], /has 2 child companies/);
  assert.match(result.issues![2], /no invoice, delivery, or other address/);
});

test("getCompany: caps children and says how to see the rest", async () => {
  const result = await get(
    companyConn(ACME, {
      address: [DELIVERY],
      buyer: [BUYER],
      addressTotal: 120,
      buyerTotal: 60,
    }),
    1,
  );
  assert.equal(
    result.note,
    `Showing ${CHILD_LIMIT} of 120 addresses; call findPartners with companyId=1, kind="address", offset=${CHILD_LIMIT} for the rest. ` +
      `Showing ${CHILD_LIMIT} of 60 buyers; call findPartners with companyId=1, kind="buyer", offset=${CHILD_LIMIT} for the rest.`,
  );
});
