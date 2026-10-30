/**
 * pi's compaction for a loop's `summarize` on a model's `window`: a request
 * past `at` of it waits for a summary that keeps about `keep` of it, and no
 * summary is made in the background. pi sets it per model id, not per
 * conversation (harness.ts), so mount refuses two agents on one model id that
 * would get different ones (mount/deployment.ts).
 */

import type { CompactionPolicy } from "@earendil-works/pi-durable";
import type { ResolvedLoop } from "@mku1tra/que-harness";

export const compactionOf = (
  window: number,
  summarize: ResolvedLoop["summarize"],
): Partial<CompactionPolicy> =>
  summarize === false
    ? { enabled: false }
    : {
        enabled: true,
        reserveTokens: Math.round((1 - summarize.at) * window),
        keepRecentTokens: Math.round(summarize.keep * window),
        backgroundTokens: 0,
      };
