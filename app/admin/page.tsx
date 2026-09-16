import type { Metadata } from "next"

import AdminClient from "./_admin-client"

/**
 * `storelib.com/admin`. `admin` is in lib/routes/reserved-segments, so no
 * creator can hold that handle and shadow this page.
 *
 * Never indexed, and the robots tag is not the protection — the API behind
 * every panel checks the admin cookie for itself. This only keeps it out of
 * search results.
 */
export const metadata: Metadata = {
  title: "Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = "force-dynamic"

export default function AdminPage() {
  return <AdminClient />
}
