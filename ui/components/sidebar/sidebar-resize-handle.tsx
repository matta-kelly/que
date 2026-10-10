"use client";

import type * as React from "react";
import { useSidebar } from "@/components/ui/sidebar";

// Drag the sidebar's right edge to resize it, within limits. The width lives in
// the --sidebar-width variable on the sidebar wrapper and is remembered.
export const SIDEBAR_WIDTH_KEY = "que.sidebarWidth";
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 400;

export function SidebarResizeHandle() {
  const { state, isMobile } = useSidebar();
  if (isMobile || state !== "expanded") return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = e.currentTarget.closest<HTMLElement>(
      '[data-slot="sidebar-wrapper"]',
    );
    if (!wrapper) return;
    e.preventDefault();
    let width = 0;
    wrapper.dataset.resizing = "true";
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => {
      width = Math.min(
        SIDEBAR_WIDTH_MAX,
        Math.max(SIDEBAR_WIDTH_MIN, ev.clientX),
      );
      wrapper.style.setProperty("--sidebar-width", `${width}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      delete wrapper.dataset.resizing;
      document.body.style.cursor = "";
      if (width) {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
        } catch {
          // Storage unavailable: the width just isn't remembered.
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      className="hover:bg-sidebar-border absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize transition-colors"
    />
  );
}
