"use client";

// A placeholder page per app area in NAV (Reports, Workflows, Skills): an
// empty state whose buttons say "currently unavailable". Building an area
// means adding its own route (app/(app)/reports/…) and deleting its copy here.

import { notFound, useParams } from "next/navigation";
import { toast } from "sonner";
import { NAV, type NavName } from "@/components/shell/nav";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type Placeholder = {
  emptyTitle: string;
  emptyDescription: string;
  actions: [string, string];
  newAction: string;
};

const PLACEHOLDERS: Partial<Record<NavName, Placeholder>> = {
  Reports: {
    emptyTitle: "No reports yet",
    emptyDescription:
      "Reports turn your data into dashboards and key stats you can share.",
    actions: ["Create report", "Import report"],
    newAction: "New report",
  },
  Workflows: {
    emptyTitle: "No workflows yet",
    emptyDescription:
      "Workflows run multi-step tasks for you, on demand or on a schedule.",
    actions: ["Create workflow", "Browse templates"],
    newAction: "New workflow",
  },
  Skills: {
    emptyTitle: "No custom skills yet",
    emptyDescription: "Skills teach que how to do things your way.",
    actions: ["Create skill", "Import skill"],
    newAction: "New skill",
  },
};

const unavailable = (action: string) =>
  toast(`${action} is currently unavailable`, {
    description: "This is coming soon.",
  });

export default function AreaPage() {
  const { area } = useParams<{ area: string }>();
  const item = NAV.find((n) => n.href === `/${area}`);
  const copy = item && PLACEHOLDERS[item.name];
  if (!item || !copy) notFound();

  return (
    <>
      <PageHeader
        icon={<item.icon />}
        title={item.name}
        actions={
          <Button size="sm" onClick={() => unavailable(copy.newAction)}>
            {copy.newAction}
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <item.icon />
            </EmptyMedia>
            <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
            <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button onClick={() => unavailable(copy.actions[0])}>
                {copy.actions[0]}
              </Button>
              <Button
                variant="outline"
                onClick={() => unavailable(copy.actions[1])}
              >
                {copy.actions[1]}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}
