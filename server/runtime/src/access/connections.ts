/**
 * The runtime's access: on the one credential store, made once, when que starts (`createStore()`, on DATABASE_URL).
 * Every caller in the runtime reads credentials and connections through it.
 */

import { createStore } from "@que/credentials";
import { accessOn } from "./access.js";

export const access = accessOn(createStore());
