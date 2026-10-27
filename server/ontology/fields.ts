/** The schemas of the harness's fields, and the messages they give, beside the plugin's (`@mku1tra/que-plugin`). */

import * as z from "zod";

/** Guards for `that`: text that is not blank, and a whole number above zero. */
export const isText = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();
export const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** An error that says what a value must be, and what it got. With `missing`, a value left out says that instead. */
export const must =
  (what: string, missing?: string) =>
  ({ input }: { input?: unknown }) =>
    input === undefined && missing
      ? missing
      : `must be ${what}, got ${JSON.stringify(input)}`;

/**
 * A value that `is` holds for, or `must(what, missing)`. Its issue does not
 * stop the checks of the object it is in, as a wrong type would.
 */
export const that = <T>(
  is: (value: unknown) => value is T,
  what: string,
  missing?: string,
) => z.custom<T>().refine(is, { error: must(what, missing) });
