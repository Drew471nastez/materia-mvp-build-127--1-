"use client"

/**
 * A creator's page and their products: a throw here keeps the shop's own
 * layout (app/(marketing)/[sellername]/layout.tsx) and offers the shop's
 * front page as the way back, rather than Storelib's.
 *
 * The address in the browser is not always /<handle>: on a creator's own
 * domain the proxy rewrites "/" to it, and usePathname reads the browser's
 * address. So the way back is /<handle> only when the address starts with
 * it, else "/" (which is the shop on its own domain).
 */

import { useParams, usePathname } from "next/navigation"
import { ErrorScreen } from "@/components/platform/error-screen"

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams<{ sellername?: string }>()
  const pathname = usePathname() ?? "/"
  const handle = typeof params?.sellername === "string" ? params.sellername : ""
  const home = handle && pathname.startsWith(`/${handle}`) ? `/${handle}` : "/"
  return <ErrorScreen error={error} reset={reset} home={home} homeLabel="Back to the shop" />
}
