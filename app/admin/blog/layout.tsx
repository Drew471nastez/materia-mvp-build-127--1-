import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog Admin | Storelib",
  robots: { index: false, follow: false },
}

export default function AdminBlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f7f8fa]">{children}</div>
}
