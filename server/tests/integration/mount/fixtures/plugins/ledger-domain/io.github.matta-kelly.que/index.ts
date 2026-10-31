import { definePlugin } from "@mku1tra/que-plugin";

export default definePlugin({
  name: "ledger-domain",
  type: "plugin",
  kind: "domain",
  title: "Ledger domain",
  description:
    "The test domain of the ledger: its skill lists the ledger's ops, so reaching the domain reaches the ledger.",
  usesSkills: ["ledger-ops"],
});
