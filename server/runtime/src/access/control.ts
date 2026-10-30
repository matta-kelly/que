/**
 * The runtime's control plane: made once, when que starts, on the cards mount made and DATABASE_URL, as access is made
 * once on the credential store (connections.ts). Every caller in the runtime reads grants and reach through it.
 *
 * Stub: the shape K4's tests drive. da-hammer fills it in.
 */

export const control = {
  domains: async () => [],
  roles: async () => [],
  grant: async (...args: unknown[]) => void args,
  revoke: async (...args: unknown[]) => void args,
  grantsOf: async (...args: unknown[]) => void args,
  reachOf: async () => ({ domains: [], connectors: [] }),
  loginOf: async (...args: unknown[]) => void args,
};
