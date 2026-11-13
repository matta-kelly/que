import "./globals.css";
import type { Metadata } from "next";
import { bodyFont } from "@/lib/fonts";

import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "landl / que",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(bodyFont.className, "h-dvh")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Suspense>{children}</Suspense>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
