import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { readSeoConsole } from "@/lib/admin/seo/console-data"
import { parseListQuery } from "@/lib/admin/seo/store"

import { AdminLogin } from "../_console/login"
import { SeoAdmin } from "./seo-admin"

/**
 * `storelib.com/admin/seo`: every address Storelib's sitemaps list, whether
 * it is in the sitemap now, what Google's URL Inspection API last said
 * about it, and its score from the live page with each check behind it.
 * The admin cookie is checked here, on the server, before anything is
 * read, and again by /api/admin/seo/check for every Check now. One page of
 * rows is read per request, filtered and ordered in SQL. Never indexed.
 */
export const metadata: Metadata = {
  title: "SEO status | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminSeoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const sp = await searchParams
  const query = parseListQuery((k) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  })
  const data = await readSeoConsole(query)
  return <SeoAdmin data={data} />
}
