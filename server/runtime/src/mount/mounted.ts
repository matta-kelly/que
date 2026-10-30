import { homedir } from "node:os";
import { join } from "node:path";
import { deploymentFolder } from "./deployment-folder.js";
import { mountDeployment } from "./deployment.js";

// Mounted once, when this module first loads; shared by the agent and the API.
export const { name, plugins, agents, loops, models } = await mountDeployment(
  deploymentFolder(process.env),
  process.env,
);

// The deployment's data: QUE_DATA_DIR, where a server mounts a volume, or the user's data folder (XDG). Not the
// deployment's folder, which is a checkout of code: in the vault on this machine, replaced at each deploy on a server.
export const dataDir =
  process.env.QUE_DATA_DIR ||
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "que",
    name,
  );
