/**
 * A loop policy is one way of handling a chat as it grows: what of it the
 * model is sent with each request. It declares only its middleware; assemble
 * puts that beside what every agent shares.
 */

import type { AgentMiddleware } from "langchain";

export type Policy = {
  name: string;
  /** `base` holds the names of the tools whose results the agent finds its way by. */
  middleware: (base: string[]) => AgentMiddleware[];
};
