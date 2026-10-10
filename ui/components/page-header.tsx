"use client";

// The top bar of every page: icon + title on the left, the page's actions and
// the theme toggle on the right.

import { titleFont } from "@/lib/fonts";
import { ThemeToggle } from "@/components/theme-toggle";

export function PageHeader({
  title,
  icon,
  actions,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      {icon && (
        <span className="text-muted-foreground flex [&_svg]:size-4">
          {icon}
        </span>
      )}
      <h1
        data-slot="page-title"
        className={`${titleFont.className} min-w-0 truncate text-base`}
      >
        {title}
      </h1>
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
