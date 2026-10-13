import { createUsers } from "@que/users";
import { deploymentFolder } from "../mount/deployment-folder.js";
import { fileNamed, instructionsOf } from "./instructions.js";

// One users store for the harness (auth hook, API, CLI).
export const users = createUsers();

/** The file this deployment names for the user's instructions, if it names one. */
export const instructionsFile = fileNamed(
  process.env,
  deploymentFolder(process.env),
);

/** A user's own instructions, and where they are from. */
export const userInstructions = (userId: string) =>
  instructionsOf(instructionsFile, () => users.instructionsOf(userId));
