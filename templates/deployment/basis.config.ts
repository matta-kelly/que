// This deployment's root: que's mount and `just check` lint the deployment from here, as one graph of its code and of
// each plugin it names. A plugin of the deployment sits in this folder, so the root holds its real folder.
import { deploymentSchema } from "@mku1tra/que-harness";

export default {
  schema: deploymentSchema({
    name: "my-deployment",
    description: "My deployment of que.",
    root: new URL("./", import.meta.url),
  }),
};
