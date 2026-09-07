import "server-only"

/**
 * Fetch a site for a route, turning the three possible answers into three
 * different replies.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `getSite` used to return null for everything that was not a site, so every
 * route wrote the same `if (!site) return 404` and that was correct. Then it
 * started THROWING when the query itself failed — because a read that broke is
 * not a site that is absent, and answering 404 for it tells somebody their
 * site is gone when it is sitting there unreadable.
 *
 * That made four routes able to 500 on a database hiccup: publish, export,
 * cover and run. Each of them would have needed the same try/catch, and the
 * fifth one written next year would not have had it.
 *
 * So the distinction lives here, once:
 *
 *   - absent or not yours  → 404, and deliberately the same answer for both,
 *                            because confirming a stranger's site exists is
 *                            information they should not get
 *   - the read failed      → 503, which says "try again" rather than "it is
 *                            gone"
 *   - it is there          → the site
 */

import { NextResponse } from "next/server"

import { getSite, SitesUnavailableError } from "./projects"
import type { Site } from "./types"

export type ResolvedSite =
  | { ok: true; site: Site }
  | { ok: false; response: NextResponse }

export async function resolveSite(
  siteId: string,
  /** `text` for routes that serve documents rather than JSON. */
  shape: "json" | "text" = "json",
): Promise<ResolvedSite> {
  let site: Site | null
  try {
    site = await getSite(siteId)
  } catch (thrown) {
    if (!(thrown instanceof SitesUnavailableError)) throw thrown
    return {
      ok: false,
      response:
        shape === "text"
          ? new NextResponse("Temporarily unavailable", {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            })
          : NextResponse.json(
              { error: "Could not reach this site just now. Try again in a moment." },
              { status: 503, headers: { "Cache-Control": "no-store" } },
            ),
    }
  }

  if (!site) {
    return {
      ok: false,
      response:
        shape === "text"
          ? new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
          : NextResponse.json(
              { error: "Site not found." },
              { status: 404, headers: { "Cache-Control": "no-store" } },
            ),
    }
  }

  return { ok: true, site }
}
