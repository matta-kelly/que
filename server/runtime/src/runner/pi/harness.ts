/**
 * The engine's Harness: one for the server, one conversation for each thread.
 *
 * A stub, so the run tests reach their assertions: `models` is the pi-ai
 * models collection the Harness reads at each use, and a test puts a scripted
 * provider on it under a provider's id (pi-ai's `faux`).
 */

import { createModels } from "@earendil-works/pi-ai/models";

export const models = createModels();
