/**
 * A plugin's card on disk: made from its definition (cardOf in @que/core), checked against the standard's own
 * schema (kept in que, never fetched: Agent Plugins §5.2) and against que's part, and written as `plugin.json`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  NAMESPACE,
  cardOf,
  cardText,
  validateCardPart,
  type Card,
} from "@que/core";
import { loadPlugin } from "../mount/plugins.js";

const STANDARD = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "../../../core/standards/agent-plugins-1.0.0/plugin.schema.json",
    ),
    "utf8",
  ),
) as object;

const standard = new Ajv2020({ allErrors: true }).compile(STANDARD);

/** Check a card against the standard's schema and que's part, throwing one error that lists every problem. */
export function validateCard(
  card: unknown,
  what: string,
): asserts card is Card {
  if (!standard(card))
    throw new Error(
      `${what} breaks Agent Plugins 1.0:\n- ${(standard.errors ?? [])
        .map((e) => `${e.instancePath || "(the card)"} ${e.message}`)
        .join("\n- ")}`,
    );
  validateCardPart(
    (card as { extensions?: Record<string, unknown> }).extensions?.[NAMESPACE],
    `${what}'s ${NAMESPACE} part is invalid`,
  );
}

// The version its package.json gives, when it has one.
function versionIn(dir: string): string | undefined {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { version?: string })
    .version;
}

/** The card the plugin in `dir` should have, from its definition, checked. */
export async function makeCard(dir: string): Promise<Card> {
  const { definition } = await loadPlugin(dir);
  const card = cardOf(definition, versionIn(dir));
  validateCard(card, `the card of ${definition.name}`);
  return card;
}

/** Write the plugin in `dir` its card, `plugin.json`, from its definition. Returns the file's path. */
export async function writeCard(dir: string): Promise<string> {
  const file = join(dir, "plugin.json");
  writeFileSync(file, cardText(await makeCard(dir)));
  return file;
}
