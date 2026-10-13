import { defineDeployment } from "@que/core";

export default defineDeployment({
  name: "outside",
  packages: ["./packages/notes"],
});
