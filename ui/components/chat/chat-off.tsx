"use client";

// What home shows on a deployment that serves no chat: a plain fact about the deployment, not an error.

import { Eclipse } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ChatOff() {
  return (
    <>
      <PageHeader icon={<Eclipse />} title="Lotus and Luna" />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Eclipse />
            </EmptyMedia>
            <EmptyTitle>
              Chat isn&apos;t enabled for Lotus and Luna&apos;s deployment
            </EmptyTitle>
            <EmptyDescription>
              Connect your own AI to que over MCP. Your account, connections and
              users are in Settings.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </>
  );
}
