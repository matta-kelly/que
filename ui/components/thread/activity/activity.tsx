"use client";

// A turn's activity: the thinking and tool steps above the answer, folded into
// one summary row ("Working…" / "N steps"), collapsed by default.

import { ChevronRight, ListTree, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { summaryLabel } from "./summary-label";

export function Activity({
  steps,
  running,
  children,
}: {
  steps: number;
  running: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      data-slot="aui_chain-of-thought"
      className="group/activity my-2"
    >
      <Marker asChild>
        <CollapsibleTrigger
          className="hover:text-foreground cursor-pointer"
          aria-label="Show steps"
        >
          <MarkerIcon>
            {running ? <Loader2 className="animate-spin" /> : <ListTree />}
          </MarkerIcon>
          <MarkerContent className={cn(running && "animate-pulse")}>
            {summaryLabel(steps, running)}
          </MarkerContent>
          <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/activity:rotate-90" />
        </CollapsibleTrigger>
      </Marker>
      <CollapsibleContent>
        <div className="mt-1.5 ms-2 flex flex-col gap-1.5 border-s ps-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
