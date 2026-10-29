/**
 * The plugin check of `just check-plugin`: the folder it is given is a plugin, and it mounts on its own, with its
 * definition, its cases and its skills, linted from its root (mountPlugin). What a domain uses is checked by a
 * deployment that lists it (`just check-deployment`), as only a deployment gives it. Prints nothing when the plugin
 * mounts, and mount's error when it does not.
 *
 * `tsx check-plugin.ts <plugin folder>`
 */

import { mountPlugin } from "./plugins.js";

try {
  await mountPlugin(process.argv[2]);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
