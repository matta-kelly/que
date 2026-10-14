"use client";

// One activity step: a shadcn Marker row (icon, label) that expands to show
// details. Spinner while running, alert icon on failure.

import { ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";

export function ActivityStep({
  icon,
  label,
  running = false,
  failed = false,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  running?: boolean;
  failed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Collapsible className="group/step">
      <Marker asChild>
        <CollapsibleTrigger
          className="hover:text-foreground cursor-pointer"
          disabled={!children}
        >
          <MarkerIcon>
            {running ? (
              <Loader2 className="animate-spin" />
            ) : failed ? (
              <CircleAlert className="text-destructive" />
            ) : (
              icon
            )}
          </MarkerIcon>
          <MarkerContent className={cn(running && "animate-pulse")}>
            {label}
          </MarkerContent>
          {children && (
            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/step:rotate-90" />
          )}
        </CollapsibleTrigger>
      </Marker>
      {children && (
        <CollapsibleContent>
          <div className="text-muted-foreground mt-1 mb-2 ms-2 border-s ps-4 text-xs">
            {children}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
