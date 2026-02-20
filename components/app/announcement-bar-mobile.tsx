"use client";

import { useEffect } from "react";

/**
 * Sets the --announcement-h CSS variable on mount so the mobile header
 * and content area shift down to make room for the fixed announcement bar.
 * On desktop, the bar sits inside the main content area (right of sidebar).
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
      className="fixed top-0 left-0 right-0 md:left-[220px] z-[60] bg-[#8b5cf6] text-white border-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-[40px] md:h-[42px] flex items-center justify-center py-0 md:py-2 px-4 md:px-4">
        {children}
      </div>
    </div>
  );
}
