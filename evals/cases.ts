/**
 * Eval cases: what a rep asks, and which tool the agent should call (with a
 * check on its inputs), or null when it shouldn't call any. Prompts are built
 * from a real sample company picked at run time, so cases don't hard-code data.
 */

export type Sample = {
  company: { id: number; name: string };
  salesperson: string;
  /** The rep's own Odoo user, as the prompt tells the model ("You're connected as …"). */
  me: { id: number; name: string };
};

export type Case = {
  id: string;
  ask: (s: Sample) => string;
  expect: { tool: string | null; args?: (args: Record<string, unknown>, s: Sample) => boolean };
};

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

// "Me" resolved: by Odoo user id (preferred), or by the rep's exact name.
const isMe = (a: Record<string, unknown>, s: Sample) => a.salespersonId === s.me.id || lower(a.salesperson) === lower(s.me.name);

export const CASES: Case[] = [
  {
    id: "company by id",
    ask: (s) => `What's the company with Odoo id ${s.company.id}?`,
    expect: { tool: "odoo_getCompany", args: (a, s) => a.id === s.company.id },
  },
  {
    id: "company by name",
    ask: (s) => `Find the company called ${s.company.name}.`,
    expect: { tool: "odoo_findPartners", args: (a, s) => !!a.name && lower(s.company.name).includes(lower(a.name)) },
  },
  {
    id: "companies by salesperson",
    ask: (s) => `Which companies does ${s.salesperson} handle?`,
    expect: { tool: "odoo_findPartners", args: (a, s) => !!a.salesperson && lower(s.salesperson).includes(lower(a.salesperson)) },
  },
  {
    id: "my companies",
    ask: () => "What companies in Odoo are mine?",
    expect: { tool: "odoo_findPartners", args: (a, s) => isMe(a, s) && (a.kind ?? "company") === "company" },
  },
  {
    id: "my buyers",
    ask: () => "List the buyers at the companies I handle.",
    expect: { tool: "odoo_findPartners", args: (a, s) => isMe(a, s) && a.kind === "buyer" },
  },
  {
    id: "what can you do",
    ask: () => "What can you help me with?",
    expect: { tool: null },
  },
  {
    id: "out of scope",
    ask: () => "What's the weather in Paris today?",
    expect: { tool: null },
  },
];
