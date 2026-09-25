"use client";

/**
 * Non-sticky announcement bar for /app pages.
 * Renders inline at the top of the page content area,
 * positioned under the header, scrolling with content.
 */
export function AnnouncementBarMobile({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-[#8b5cf6] text-white select-none" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}>
      {/* 38px on a phone, 40px wider: the same height as Home's (components/app/dashboard-client). */}
      <div className="h-[38px] md:h-[40px] flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  );
}
