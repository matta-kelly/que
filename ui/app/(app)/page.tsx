"use client";

import {
  useAui,
  useAuiState,
  AuiProvider,
  AuiConfig,
  Suggestions,
  Tools,
} from "@assistant-ui/react";
import { MessageSquareText } from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { PageHeader } from "@/components/shell/page-header";
import { CHAT_SUGGESTIONS } from "@/components/chat/suggestions";
import toolkit from "@/components/chat/toolkit";

// The chat. Its header shows the current chat's title.
export default function ChatPage() {
  const aui = useAui();
  const config = AuiConfig({
    tools: Tools({ toolkit }),
    suggestions: Suggestions(CHAT_SUGGESTIONS),
  });
  const title = useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.title,
  );

  return (
    <>
      <PageHeader icon={<MessageSquareText />} title={title || "New chat"} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AuiProvider extends={aui} config={config}>
          <Thread />
        </AuiProvider>
      </div>
    </>
  );
}
