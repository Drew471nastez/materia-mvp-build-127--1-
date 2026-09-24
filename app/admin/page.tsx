import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminConsole } from "./_console/console"
import { AdminLogin } from "./_console/login"
import { parseRoute } from "./_console/nav-state"

/**
 * `storelib.com/admin`. `admin` is in lib/routes/reserved-segments, so no
 * creator can hold that handle and shadow this page.
 *
 * The admin cookie is checked HERE, on the server, before anything of the
 * console is sent: without it the response is the sign in and nothing else.
 * Every read and every change the console makes goes through app/api/admin,
 * which checks the cookie again, because a page is not a lock.
 *
 * Never indexed. The robots tag is not the protection, it only keeps the
 * address out of search results.
 */
export const metadata: Metadata = {
  title: "Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const sp = await searchParams
  const one = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }
  return <AdminConsole initial={parseRoute(one)} />
}
