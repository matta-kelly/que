/**
 * The control plane: which domains each user gets, and what each user reaches and logs in as, worked out from the
 * plugins' cards alone. It keeps one row per user and granted domain. It never handles a credential's values: a login
 * is a `rep` whose credential another module reads.
 *
 * A grant is of a domain, and only of a domain. A user reaches the domains granted, and each connector that holds an
 * op the domain's `usesOps` names, or a skill its `usesSkills` names. An internal connector (one with roles) is
 * reached with the roles of the ops a granted domain uses; any other connector is reached on the user's own login.
 * A role comes from a domain grant, never a separate table.
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

/** The grants table, made when it is not there: one row per user and domain. */
export const SETUP = "";

/** The control plane, on a database it sets up first (`SETUP`), reading the plugin cards it is given. */
export function controlOn(db: Queryable, cards: Card[]): ControlPlane {
  // STUB: the interface only. Every answer is empty until da-hammer writes the logic.
  void db;
  void cards;
  return {
    async domains() {
      return [];
    },
    async roles() {
      return [];
    },
    async grant() {},
    async revoke() {},
    async grantsOf() {
      return [];
    },
    async reachOf() {
      return { domains: [], connectors: [] };
    },
    async loginOf() {
      return undefined;
    },
  };
}
