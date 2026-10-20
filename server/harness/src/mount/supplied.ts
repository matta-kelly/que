/**
 * The packages que gives a folder outside que, the one list of them.
 * `supply.ts` hands them over at run time, and `checkConfig` maps them for the
 * type check that `just check-folder` runs. The README and `core/plugin.md`
 * name them too, and `supplied.test.ts` holds them to this list.
 */

import { join } from "node:path";

const SERVER = join(import.meta.dirname, "../../..");

/** Each name, and where in `server/` the compiler finds it. */
export const SUPPLIED: Record<string, string> = {
  "@que/core": "core/index.ts",
  "@que/ontology": "ontology/index.ts",
  zod: "node_modules/zod",
  basis: "node_modules/basis/dist/index.d.ts",
};

/**
 * The tsconfig that type checks the folders with que's copy of each supplied
 * package: the compiler is told where que keeps those names, and finds any
 * other library in the folder's own install.
 */
export function checkConfig(folders: string[]) {
  return {
    extends: join(SERVER, "harness/tsconfig.json"),
    compilerOptions: {
      rootDir: "/",
      typeRoots: [join(SERVER, "node_modules/@types")],
      paths: Object.fromEntries(
        Object.entries(SUPPLIED).map(([name, path]) => [
          name,
          [join(SERVER, path)],
        ]),
      ),
    },
    include: folders.map((folder) => `${folder}/**/*.ts`),
    exclude: folders.map((folder) => `${folder}/**/node_modules`),
  };
}
