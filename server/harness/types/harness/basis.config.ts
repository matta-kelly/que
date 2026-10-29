// The config of `basis lint server/harness/types/harness`: the root of the harness schema, whose folder of type notes
// this is.
import type { Config } from "@mku1tra/basis";
import { harness } from "../../src/schema.ts";

export default { schema: harness } satisfies Config;
