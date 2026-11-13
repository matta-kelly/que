import { deploymentFolder } from "./deployment-folder.js";
import { mountDeployment } from "./deployment.js";

// Mounted once, when this module first loads; shared by MCP and the settings API.
export const { name, plugins } = await mountDeployment(
  deploymentFolder(process.env),
);
