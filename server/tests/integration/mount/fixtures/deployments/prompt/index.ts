import { defineDeployment } from "@mku1tra/que-harness";

export default defineDeployment({
  name: "prompt",
  type: "deployment",
  description:
    "A deployment of a fixture with three connectors and a domain for each: the till (ops), alpha (a skill and no op) and source (an op and a skill).",
  plugins: [
    "till",
    "alpha",
    "source",
    "alpha-domain",
    "till-domain",
    "source-domain",
  ],
});
