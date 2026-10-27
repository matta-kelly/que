/**
 * Prints the tsconfig that type checks the folders given, with que's copy of
 * each package it supplies (`supplied.ts`). `just check-folder`,
 * `just check-plugin` and `just check-deployment` write it, and run the
 * compiler on it.
 *
 * `tsx check-config.ts <folder>...`
 */

import { checkConfig } from "./supplied.js";

console.log(JSON.stringify(checkConfig(process.argv.slice(2)), null, 2));
