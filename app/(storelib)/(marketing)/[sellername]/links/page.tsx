/**
 * ===========================================================================
 *  THE ONEPAGE, UNDER THE CREATOR'S HANDLE
 * ===========================================================================
 * The route storelib.me/{handle} renders from: proxy.ts rewrites it here
 * (lib/onepage/host-route). On storelib.com, `/{handle}/links` itself now
 * answers with a 308 to storelib.me/{handle}, except in the native app,
 * which keeps being served here so it never leaves its own origin.
 *
 * What follows is why this route exists at all, from when it was the
 * address handed out: `storelib.com/{handle}/links`.
 *
 * WHY IT MOVED. The address creators were given to hand out was
 * `{handle}.storelib.com/links`, and that address had stopped working. The
 * subdomain is the WEBSITE a creator builds, so `/links` on it is read as a
 * page of that website, and for anybody who never made a page by that name
 * it is a 404. Measured on production before this existed:
 *
 *     andrewrullz.storelib.com/links  ->  404, x-matched-path /w/[username]/[page]
 *     storelib.com/l/andrewrullz      ->  200, the real page
 *     storelib.com/andrewrullz/links  ->  200, "Product Not Found"
 *
 * The Share card was handing out the first of those.
 *
 * WHY A ROUTE FILE AND NOT A REWRITE. `/{handle}/links` would otherwise be
 * caught by `[sellername]/[productSlug]` and looked up as a product, which is
 * the third line above. A static segment beats a dynamic sibling in Next's
 * own matching, so this file is what makes the address mean the OnePage —
 * no ordering in the proxy to get right, and it holds even for a request the
 * proxy never sees.
 *
 * WHAT IT COSTS. A product whose slug is literally `links` is unreachable at
 * `/{handle}/links`. `links` is reserved for exactly that reason (see
 * lib/commerce/reserved-slugs), and a product that already carries the slug
 * still answers at `/p/{slug}`.
 *
 * NOTHING IS REIMPLEMENTED HERE. The page, its metadata and its view
 * tracking are the ones `/l/{slug}` already runs; this route only says that
 * the handle in the path is the slug to render.
 */
import type { Metadata } from "next"

import PublicOnePageRoute, { generateMetadata as onePageMetadata } from "../../l/[slug]/page"

/* Drawn per request, exactly as /l/{slug} is: a block's schedule is decided by the clock at each draw, and the visitor's query rides on a redirect. Its reads are held (lib/onepage/public-cache). */
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ sellername: string }>
  /* Passed on, so a redirect the page answers with keeps the visitor's utm and ref. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** The handle in the path is the slug the OnePage is stored under. */
const asSlug = async (params: Props["params"]) => ({ slug: (await params).sellername })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return onePageMetadata({ params: asSlug(params) })
}

/*
  CALLED, NOT WRITTEN AS A TAG. `<PublicOnePageRoute />` is TS2786 — an async
  server component is not a JSX component as far as the type checker is
  concerned. next.config.mjs sets `typescript.ignoreBuildErrors`, so the build
  was green and the route really did serve the right page; the error was still
  there, and a type error nobody sees is the one that hides the next one.
  Awaiting it is the same call the renderer makes.
*/
export default async function SellerOnePageRoute({ params, searchParams }: Props) {
  return await PublicOnePageRoute({ params: asSlug(params), searchParams })
}
