import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import { cardOf } from "./card.ts";
import { definePlugin, type Uses } from "./contract.ts";
import { checkPlugins, piecesOf } from "./lint.ts";

// A plugin with one op, `find`, and one skill, `guide`, that uses what `uses` names: its pieces, at its folder.
const pieces = (name: string, uses: Partial<Uses> = {}) =>
  piecesOf(
    cardOf({
      definition: definePlugin({
        name,
        title: name,
        description: "A plugin.",
        ops: [
          {
            name: "find",
            title: "Find",
            description: "Finds a thing.",
            schema: z.object({}),
            run: async () => ({}),
          },
        ],
        uses,
      }),
      cases: [],
    }),
    [
      {
        id: `${name}-guide`,
        title: "Guide",
        description: "How to find.",
        body: "Find it.",
      },
    ],
    name,
  );

const said = (problems: ReturnType<typeof checkPlugins>) =>
  problems.map(({ path, rule, field }) => [path, rule, field]);

test("checkPlugins finds a name a card's ops use that is a skill", () => {
  assert.deepEqual(
    said(
      checkPlugins([
        ...pieces("odoo"),
        ...pieces("pim", { ops: ["odoo-guide"] }),
      ]),
    ),
    [["pim/plugin.json", "basis/link", "/usesOps"]],
  );
});

test("checkPlugins finds a plugin that uses an op of a plugin that uses others, naming both", () => {
  const problems = checkPlugins([
    ...pieces("odoo"),
    ...pieces("pim", { ops: ["odoo-find"] }),
    ...pieces("sales", { ops: ["pim-find"] }),
  ]);
  assert.deepEqual(said(problems), [
    ["sales/plugin.json", "plugin/connector-use", "/usesOps"],
  ]);
  assert.match(
    problems[0]?.message ?? "",
    /^pim-find is pim's, and pim uses other plugins' ops and skills/,
  );
});
