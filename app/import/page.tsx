import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { ImportClient } from "./import-client"

/**
 * /import — bring a shop over from another marketplace.
 *
 * Gated on a signed-in account and nowhere else, because the listings it
 * creates hang off the importer's own creator row: there is no "import into
 * somebody else's shop", and an anonymous visitor has no shop to import into.
 * The redirect carries `next` so signing in lands back here rather than on the
 * feed with the pasted URL lost.
 */

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Importă un magazin · Storelib",
  // Not indexable. It is a tool for the person using it, not a page that
  // should turn up in a search for "import vinted".
  robots: { index: false, follow: false },
}

export default async function ImportPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect("/login?next=/import")

  return (
    <main className="min-h-screen bg-neutral-50">
      <ImportClient />
    </main>
  )
}
