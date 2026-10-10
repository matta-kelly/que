import { ChartScatter, Puzzle, Workflow } from "lucide-react";

// App areas: pages in the sidebar and the command palette. Until an area is
// built it renders as a placeholder (app/(app)/[area]/page.tsx).
export const NAV = [
  { name: "Reports", href: "/reports", icon: ChartScatter },
  { name: "Workflows", href: "/workflows", icon: Workflow },
  { name: "Skills", href: "/skills", icon: Puzzle },
] as const;

export type NavName = (typeof NAV)[number]["name"];
