import { deploymentFolder } from "./deployment-folder.js";
import { mountDeployment } from "./deployment.js";

// Mounted once, when this module first loads; shared by the agent and the API.
export const { packages, agent } = await mountDeployment(
  deploymentFolder(process.env),
);
