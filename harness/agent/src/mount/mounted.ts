import { mountFromEnv } from "./deployment.js";

// Mounted once, when this module first loads; shared by the agent, the API and the evals.
export const packages = await mountFromEnv(process.env);
