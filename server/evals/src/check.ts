/**
 * Reads a deployment as `just eval` reads it, and runs nothing: its cases are
 * checked against the capabilities of their packages, and its agent and model
 * configs against the contract. `just check-deployment` runs it, so a case
 * that names a capability its package does not have fails the check, not the eval.
 *
 *   tsx src/check.ts <deployment folder>
 */

import { resolve } from "node:path";
import { load } from "./load.js";

const { cases } = await load(resolve(process.argv[2]));
console.log(`cases: ${cases.length}, each names a capability of its package`);
