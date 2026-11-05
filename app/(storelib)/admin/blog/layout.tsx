import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog Admin",
  robots: { index: false, follow: false },
}

/* The console's dark surface behind every blog admin page (app/admin/_console/ui.tsx); the Search and Test sale pages draw their own. */
export default function AdminBlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0b0b0f]">{children}</div>
}
