/**
 * A fixture deployment as a deployment is on disk: a root of its own, whose basis.config.ts gives deploymentSchema,
 * holding each plugin its index.ts names under plugins/, linked into its node_modules by name as npm links one, with
 * que's packages and zod linked beside them. The repo's fixtures keep one copy of each plugin, under plugins/ beside
 * deployments/, which the deployments share; a deployment's root holds the real folder of each plugin it names, so each
 * is made here, in a folder of the system's temp folder, as deployments/<name>, and removed when the process ends.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = join(import.meta.dirname, "..");
const made = new Map<string, string>();
let temp: string | undefined;

/** The config of a deployment that is its own root. */
export const deploymentConfig = (name: string) =>
  `import { deploymentSchema } from "@mku1tra/que-harness";

export default {
  schema: deploymentSchema({
    name: ${JSON.stringify(name)},
    description: "The deployment ${name} of a fixture, as a root of its own.",
    root: new URL("./", import.meta.url),
  }),
};
`;

/**
 * The fixture deployment `name`, from the folder `fixtures`, which holds deployments/ and plugins/, as a root of its
 * own: its folder.
 */
export function deploymentRoot(fixtures: string, name: string): string {
  const key = join(fixtures, name);
  const done = made.get(key);
  if (done) return done;
  if (!temp) {
    temp = mkdtempSync(join(tmpdir(), "que-deployment-roots-"));
    const folder = temp;
    process.on("exit", () => rmSync(folder, { recursive: true, force: true }));
  }
  const dir = join(mkdtempSync(join(temp, "fixture-")), "deployments", name);
  cpSync(join(fixtures, "deployments", name), dir, { recursive: true });
  const modules = join(dir, "node_modules");
  mkdirSync(join(modules), { recursive: true });
  // que's packages and zod, as a deployment that installs them has them.
  symlinkSync(join(server, "node_modules/@mku1tra"), join(modules, "@mku1tra"));
  symlinkSync(join(server, "node_modules/zod"), join(modules, "zod"));
  // Each plugin its index.ts names that the fixtures hold.
  const named = /plugins:\s*\[([^\]]*)\]/.exec(
    readFileSync(join(dir, "index.ts"), "utf8"),
  );
  for (const plugin of named?.[1].match(/[\w-]+/g) ?? []) {
    const from = join(fixtures, "plugins", plugin);
    if (!existsSync(from)) continue;
    cpSync(from, join(dir, "plugins", plugin), { recursive: true });
    symlinkSync(join("..", "plugins", plugin), join(modules, plugin));
  }
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  writeFileSync(join(dir, "basis.config.ts"), deploymentConfig(name));
  made.set(key, dir);
  return dir;
}
