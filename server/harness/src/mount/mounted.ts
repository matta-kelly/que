import { mountFromEnv } from "./deployment.js";

// Mounted once, when this module first loads; shared by the agent and the API.
export const packages = await mountFromEnv(process.env);
