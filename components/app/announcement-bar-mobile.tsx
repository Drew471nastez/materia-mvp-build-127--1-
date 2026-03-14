"use client";

/**
 * Non-sticky announcement bar for /app pages.
 * Renders inline at the top of the page content area,
 * positioned under the header, scrolling with content.
 */
export function AnnouncementBarMobile({ children }: { children: React.ReactNode }) {
  return (
    // native-hidden: hidden on iOS/Android Capacitor via globals.css html.capacitor .native-hidden
    <div className="w-full bg-[#8b5cf6] text-white native-hidden">
      <div className="h-[40px] md:h-[42px] flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  );
}
