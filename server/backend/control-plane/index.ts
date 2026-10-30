/**
 * The control plane: which domains each user gets, and what each user reaches and logs in as, worked out from the
 * plugins' cards alone. It keeps one row per user and granted domain. It never handles a credential's values: a login
 * is a `rep` whose credential another module reads.
 *
 * A grant is of a domain, and only of a domain. A user reaches the domains granted, and each connector that holds an
 * op the domain's `usesOps` names, or a skill its `usesSkills` names. An internal connector (one with roles) is
 * reached with the roles of the ops a granted domain uses; any other connector is reached on the user's own login.
 * A role comes from a domain grant, never a separate table. A use the deployment does not give, of an op or a skill,
 * is skipped.
 *
 * Each list is sorted by name, and each list within it too, so a caller sees the same order for the same cards.
 */

import type { Card } from "@mku1tra/que-plugin";

/** What the control plane runs its queries on: a pg pool, or anything with the same `query`. */
export type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

/** A domain the cards name: its name, each connector it reaches, and each role of an op it uses. */
export type Domain = {
  name: string;
  /** Each connector its `usesOps` or `usesSkills` reaches, by name. */
  connectors: string[];
  /** Each role of an op it uses on an internal connector, by name. */
  roles: string[];
};

/** An internal connector, and each role it has, by name. */
export type InternalConnector = {
  name: string;
  roles: string[];
};

/** What one user reaches: the domains granted, and each connector, with how the user gets in. */
export type Reach = {
  /** The granted domains the cards still name, by name. */
  domains: string[];
  /** Each connector reached, by name: on the user's own login, or with the roles held. */
  connectors: { name: string; login: "own" | { roles: string[] } }[];
};

export type ControlPlane = {
  /** Each domain the cards name, with the connectors it reaches and the roles it gives. */
  domains(): Promise<Domain[]>;
  /** Each internal connector of the cards, with its roles. */
  roles(): Promise<InternalConnector[]>;
  /** Grants `user` the domain, recorded as granted by `by`; a plugin that is no domain, or no card names, is refused. */
  grant(user: string, domain: string, by: string): Promise<void>;
  /** Takes the domain from the user. */
  revoke(user: string, domain: string): Promise<void>;
  /** Each domain stored for the user, mounted or not: a grant of a domain no longer mounted reaches nothing, and is kept. */
  grantsOf(user: string): Promise<string[]>;
  /** The domains the user reaches, and each connector, with how the user gets in. */
  reachOf(user: string): Promise<Reach>;
  /**
   * The `rep` whose credential an op of `connector` with `role` runs on for the user: the user's own id for a
   * third-party connector, `role:<role>` for a role a granted domain uses, and none for a role no granted domain
   * uses or a connector the user does not reach.
   */
  loginOf(
    user: string,
    connector: string,
    role?: string,
  ): Promise<string | undefined>;
};

const que = (card: Card) => card.extensions["io.github.matta-kelly.que"];

/** The grants table, made when it is not there: one row per user and domain. */
export const SETUP = `
  DO $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('que.grants'));
    CREATE TABLE IF NOT EXISTS grants (
      user_id    text        NOT NULL,
      domain     text        NOT NULL,
      granted_by text        NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, domain)
    );
  END
  $$`;

/** A domain of the cards, and each connector it reaches with the roles it gives there. */
type Descriptor = Domain & { byConnector: Map<string, string[]> };

/** The control plane, on a database it sets up first (`SETUP`), reading the plugin cards it is given. */
export function controlOn(db: Queryable, cards: Card[]): ControlPlane {
  const ready = db.query(SETUP);
  const byName = new Map(cards.map((card) => [card.name, card]));
  const ops = new Map(
    cards.flatMap((card) =>
      que(card).ops.map((op) => [op.name, { card, op }] as const),
    ),
  );
  const skills = new Map(
    cards.flatMap((card) =>
      que(card).skills.map((skill) => [skill.name, { card, skill }] as const),
    ),
  );

  /** Each op a domain uses: those it names, and those of each skill it names. A name no card holds is skipped. */
  const opsUsed = (card: Card): string[] => [
    ...que(card).usesOps,
    ...que(card).usesSkills.flatMap(
      (name) => skills.get(name)?.skill.uses ?? [],
    ),
  ];

  /** Each domain the cards name, with each connector and role it reaches. */
  const described: Descriptor[] = cards
    .filter((card) => que(card).kind === "domain")
    .map((card) => {
      const byConnector = new Map<string, string[]>();
      for (const name of opsUsed(card)) {
        const held = ops.get(name);
        if (held === undefined) continue;
        const { card: holder, op } = held;
        const roles = byConnector.get(holder.name) ?? [];
        if (op.role !== undefined && !roles.includes(op.role))
          roles.push(op.role);
        byConnector.set(holder.name, roles.sort());
      }
      return {
        name: card.name,
        connectors: [...byConnector.keys()].sort(),
        roles: [...byConnector.values()].flat().sort(),
        byConnector,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  /** An internal connector: one with roles, which its ops run with. */
  const internal = (name: string) => {
    const card = byName.get(name);
    return card !== undefined && que(card).roles.length > 0;
  };

  async function grantsOf(user: string): Promise<string[]> {
    await ready;
    const { rows } = await db.query(
      "SELECT domain FROM grants WHERE user_id = $1 ORDER BY domain",
      [user],
    );
    return rows.map((row) => row.domain as string);
  }

  async function reachOf(user: string): Promise<Reach> {
    const granted = new Set(await grantsOf(user));
    const mounted = described.filter((domain) => granted.has(domain.name));
    const roles = new Map<string, string[]>();
    for (const domain of mounted)
      for (const [name, held] of domain.byConnector)
        roles.set(
          name,
          [...new Set([...(roles.get(name) ?? []), ...held])].sort(),
        );
    return {
      domains: mounted.map((domain) => domain.name),
      connectors: [...roles.keys()].sort().map((name) => ({
        name,
        login: internal(name) ? { roles: roles.get(name) ?? [] } : "own",
      })),
    };
  }

  return {
    async domains() {
      return described.map(({ name, connectors, roles }) => ({
        name,
        connectors,
        roles,
      }));
    },
    async roles() {
      return cards
        .filter((card) => que(card).roles.length > 0)
        .map((card) => ({
          name: card.name,
          roles: que(card)
            .roles.map((role) => role.name)
            .sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async grant(user, domain, by) {
      const card = byName.get(domain);
      if (card === undefined || que(card).kind !== "domain")
        throw new Error(`${domain} is no domain`);
      await ready;
      await db.query(
        "INSERT INTO grants (user_id, domain, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [user, domain, by],
      );
    },
    async revoke(user, domain) {
      await ready;
      await db.query("DELETE FROM grants WHERE user_id = $1 AND domain = $2", [
        user,
        domain,
      ]);
    },
    grantsOf,
    reachOf,
    async loginOf(user, connector, role) {
      const reached = (await reachOf(user)).connectors.find(
        (c) => c.name === connector,
      );
      if (reached === undefined) return undefined;
      if (reached.login === "own") return user;
      return role !== undefined && reached.login.roles.includes(role)
        ? `role:${role}`
        : undefined;
    },
  };
}
