/**
 * Access by op, on the credential store it is given: the login a call gets, by the op's plugin and role and the user.
 */

import type { Op, Plugin } from "@mku1tra/que-plugin";
import type { CredentialStore } from "@que/credentials";

/** The connection for an op's plugin and role, as this user. */
export type Connect = (
  plugin: Plugin,
  role: Op["role"],
  user: string,
) => Promise<unknown>;

export type Access = {
  /** A user with no credential the plugin needs gets an OpFailed that names the plugin. */
  getConnection: Connect;
};

/** Access on its credential store. The runtime makes the store once, with `createStore()`. */
export function accessOn(store: CredentialStore): Access {
  void store;
  return { getConnection: async () => undefined }; // stub: da-hammer builds it
}
