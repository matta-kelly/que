// The config of `basis lint server/plugin/types`: the root of the plugin schema, whose folder of type notes this is.
import type { Config } from "@mku1tra/basis";
import { plugin } from "../src/schema.ts";

export default { schema: plugin } satisfies Config;
