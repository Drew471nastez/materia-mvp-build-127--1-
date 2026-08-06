import { redirect } from "next/navigation"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import ImageBackfillClient from "./_client"

/**
 * /admin/images — reprocess stored listing photographs.
 *
 * Behind the same session that already gates the rest of /admin, checked on the
 * SERVER before anything is sent: a client-side check would ship the page and
 * then hide it, which is a login screen made of CSS.
 *
 * The route it drives enforces the same check itself — this only decides
 * whether the page is worth rendering. An admin page that is the only thing
 * standing between a stranger and a bulk rewrite of every product image would
 * be one open tab away from a very bad afternoon.
 */
export const dynamic = "force-dynamic"
export const metadata = { robots: { index: false, follow: false } }

export default async function AdminImagesPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/blog")
  return <ImageBackfillClient />
}
