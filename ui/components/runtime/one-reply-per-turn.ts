// A turn as one reply, as the live stream joins it. A stub: S6 moves it here from runtime-provider.tsx.

import type { ThreadMessageLike } from "@assistant-ui/react";

/** Each assistant message after another, joined into it under the first one's id. */
export const oneReplyPerTurn: (
  messages: readonly ThreadMessageLike[],
) => ThreadMessageLike[] = () => [];
