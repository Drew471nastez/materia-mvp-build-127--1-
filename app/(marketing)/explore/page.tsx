import { redirect } from "next/navigation"

// /explore is gone. It was the marketplace's second address, and "/" is the
// marketplace now — same component, same content, one URL.
//
// A redirect rather than a delete: the route has to keep resolving. The native
// app treats /explore as its Discover route (lib/isDiscoverMode.ts), inbound
// links exist, and a 404 would be worse than a hop. Query strings are carried
// through so /explore?q=nike still searches.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let qs = ""
  try {
    const params = await searchParams
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params || {})) {
      if (typeof v === "string") usp.set(k, v)
      else if (Array.isArray(v) && v[0]) usp.set(k, v[0])
    }
    qs = usp.toString()
  } catch {
    /* no params */
  }
  redirect(qs ? `/?${qs}` : "/")
}
