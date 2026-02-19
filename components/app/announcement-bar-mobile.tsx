"use client";

import { useEffect } from "react";

/**
 * Sets the --announcement-h CSS variable on mount so the mobile header
 * and content area shift down to make room for the fixed announcement bar.
 * Wrap your announcement bar with this component on any /app page.
 */
export function AnnouncementBarMobile({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--announcement-h",
      "calc(42px + env(safe-area-inset-top))"
    );
    return () => {
      document.documentElement.style.setProperty("--announcement-h", "0px");
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] bg-[#8b5cf6] text-white border-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-[40px] md:h-[42px] flex items-center justify-center py-0 md:py-2 px-4 md:px-4">
        {children}
      </div>
    </div>
  );
}
