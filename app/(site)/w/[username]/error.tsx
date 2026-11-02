"use client"

/**
 * A creator's website (/w/<name>, and the same pages on its subdomain or
 * custom domain, which the proxy rewrites here). Its layout stays mounted
 * and the way back is the website's own home: /w/<name> when that is the
 * address in the browser, else "/" (the website's home on its own domain).
 * ErrorScreen reports the failure with its digest.
 */

import { useParams, usePathname } from "next/navigation"
import { ErrorScreen } from "@/components/platform/error-screen"

export default function WebsiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const params = useParams<{ username?: string }>()
  const pathname = usePathname() ?? "/"
  const name = typeof params?.username === "string" ? params.username : ""
  const home = name && pathname.startsWith(`/w/${name}`) ? `/w/${name}` : "/"
  return <ErrorScreen error={error} reset={reset} home={home} homeLabel="Back to the home page" />
}
