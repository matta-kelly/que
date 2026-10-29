// The root of the deployment, which holds its own plugin: a deployment is linted, and mounted, from its root.
import { deploymentSchema } from "@mku1tra/que-harness";

export default {
  schema: deploymentSchema({
    name: "outside",
    description: "A deployment outside que, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
